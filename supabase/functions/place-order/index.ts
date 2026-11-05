/**
 * Edge Function "place-order": crea un pedido de la tienda SOLO si el CAPTCHA es válido.
 *
 * Flujo:
 *   1. El checkout envía { captchaToken, order } (order = los parámetros de create_order).
 *   2. Se verifica el token con Cloudflare Turnstile (siteverify) usando la clave secreta.
 *   3. Si es válido, se llama a la RPC create_order con la clave de servicio. create_order
 *      ya no es ejecutable por anon (migración 14): este es el ÚNICO camino público.
 *   4. Se responde el resultado (número de pedido y token de seguimiento) o el error.
 *
 * Seguridad:
 *   - La clave de servicio y la clave secreta de Turnstile solo existen aquí (servidor).
 *   - Todas las reglas de negocio (precios, stock, horarios, límite por teléfono) siguen
 *     validándose en create_order: esta función no confía en nada del navegador.
 *   - Cuerpo limitado a 32 KB y forma básica validada antes de usar nada.
 *   - Errores inesperados no se reenvían con detalle (no se filtran internos de la base).
 *   - CORS solo para el sitio propio (y localhost en desarrollo). CORS no es la barrera de
 *     seguridad (el CAPTCHA sí): solo evita que otros sitios usen esto desde un navegador.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''
const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '')
const ALLOW_LOCALHOST = Deno.env.get('ALLOW_LOCALHOST_ORIGINS') === 'true'

const MAX_BODY_BYTES = 32 * 1024
/** Códigos de error de create_order con mensajes escritos para el cliente (en español). */
const USER_FACING = new Set(['P0001', 'P0002', '22023'])

/** Cabeceras CORS: solo se autoriza el origen del sitio (y localhost si está habilitado). */
function cors(origin: string | null): Record<string, string> {
  const allowed =
    origin !== null &&
    (origin === SITE_URL || (ALLOW_LOCALHOST && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))
  return allowed
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
  })
}

/** Verifica el token de Turnstile con Cloudflare. */
async function verifyCaptcha(token: string, ip: string | null): Promise<boolean> {
  const form = new FormData()
  form.append('secret', TURNSTILE_SECRET)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  if (!res.ok) return false
  const result = (await res.json()) as { success?: boolean }
  return result.success === true
}

/** Forma mínima esperada del pedido (las reglas de negocio las valida create_order). */
function isOrderShape(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const r = o as Record<string, unknown>
  const isStr = (v: unknown) => typeof v === 'string' && v.length <= 600
  const isOptStr = (v: unknown) => v === null || v === undefined || isStr(v)
  return (
    isStr(r.p_restaurant_slug) && isStr(r.p_customer_name) && isStr(r.p_customer_phone) &&
    isStr(r.p_type) && isStr(r.p_payment_method) && isOptStr(r.p_address) && isOptStr(r.p_notes) &&
    Array.isArray(r.p_items) && r.p_items.length <= 50
  )
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ code: 'method', message: 'Método no permitido' }, 405, origin)

  // 1. Leer y validar el cuerpo.
  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return json({ code: '22023', message: 'El pedido es demasiado grande.' }, 413, origin)
  let body: { captchaToken?: unknown; order?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ code: '22023', message: 'Solicitud inválida.' }, 400, origin)
  }
  if (typeof body.captchaToken !== 'string' || body.captchaToken.length === 0 || body.captchaToken.length > 2048 || !isOrderShape(body.order)) {
    return json({ code: '22023', message: 'Solicitud inválida.' }, 400, origin)
  }

  // 2. CAPTCHA.
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  let human = false
  try {
    human = await verifyCaptcha(body.captchaToken, ip)
  } catch (err) {
    console.error('place-order: siteverify falló', err)
  }
  if (!human) {
    return json({ code: 'captcha_failed', message: 'No pudimos verificar que eres una persona. Intenta de nuevo.' }, 403, origin)
  }

  // 3. Crear el pedido (create_order valida todo lo demás).
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_order`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body.order),
  })
  const result = (await res.json().catch(() => null)) as unknown

  if (!res.ok) {
    const err = (result ?? {}) as { code?: string; message?: string }
    if (err.code && USER_FACING.has(err.code)) return json({ code: err.code, message: err.message }, 400, origin)
    console.error('place-order: error inesperado de create_order', res.status, err)
    return json({ code: 'unexpected', message: 'No pudimos crear el pedido. Intenta de nuevo.' }, 500, origin)
  }

  // 4. Pedido creado: número + token de seguimiento.
  const order = Array.isArray(result) ? result[0] : null
  return order ? json(order, 200, origin) : json({ code: 'unexpected', message: 'No pudimos crear el pedido.' }, 500, origin)
})
