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

import { createHttp, serviceHeaders, SUPABASE_URL } from '../_shared/http.ts'

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''
const { cors, json } = createHttp()

const MAX_BODY_BYTES = 32 * 1024
/** Códigos de error de create_order con mensajes escritos para el cliente (en español). */
const USER_FACING = new Set(['P0001', 'P0002', '22023'])

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

/** Texto de hasta `max` caracteres. */
const isStr = (v: unknown, max = 600) => typeof v === 'string' && v.length <= max
/** Texto opcional (null/ausente o texto válido). */
const isOptStr = (v: unknown, max = 600) => v === null || v === undefined || isStr(v, max)
/** Entero opcional entre 0 y 1.000.000 (p. ej. la propina). */
const isOptInt = (v: unknown) => v === null || v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000)

/** Forma mínima esperada del pedido (las reglas de negocio las valida create_order). */
function isOrderShape(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const r = o as Record<string, unknown>
  return (
    isStr(r.p_restaurant_slug) && isStr(r.p_customer_name) && isStr(r.p_customer_phone) &&
    isStr(r.p_type) && isStr(r.p_payment_method) && isOptStr(r.p_address) && isOptStr(r.p_notes) &&
    Array.isArray(r.p_items) && r.p_items.length <= 50 &&
    isOptStr(r.p_coupon_code, 40) && isOptStr(r.p_scheduled_for, 40) && isOptInt(r.p_tip)
  )
}

/**
 * Parámetros de create_order que acepta esta función. Se reenvía SOLO esta lista: el
 * navegador no puede agregar parámetros que no le corresponden.
 */
const ORDER_PARAMS = [
  'p_restaurant_slug', 'p_customer_name', 'p_customer_phone', 'p_type', 'p_address', 'p_notes',
  'p_payment_method', 'p_items', 'p_coupon_code', 'p_scheduled_for', 'p_tip',
] as const

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
    headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(
      Object.fromEntries(ORDER_PARAMS.filter((k) => k in (body.order as object)).map((k) => [k, (body.order as Record<string, unknown>)[k]])),
    ),
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
