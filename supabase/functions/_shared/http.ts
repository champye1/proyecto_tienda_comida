/**
 * Código compartido por las Edge Functions públicas que llama la tienda (place-order,
 * upload-receipt). Las carpetas que empiezan con "_" no se despliegan como funciones.
 *
 *   SUPABASE_URL / SERVICE_KEY  conexión con privilegios de servicio (solo existe en el servidor).
 *   createHttp(...)             cabeceras CORS y respuestas JSON con las mismas reglas para todas.
 *
 * CORS: solo se autoriza el origen del sitio (SITE_URL) y, en desarrollo, localhost
 * (ALLOW_LOCALHOST_ORIGINS=true). CORS no es la barrera de seguridad (lo son el CAPTCHA o el
 * token del pedido): solo evita que otros sitios llamen estas funciones desde un navegador.
 */

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '')
const ALLOW_LOCALHOST = Deno.env.get('ALLOW_LOCALHOST_ORIGINS') === 'true'

/** Cabeceras para llamar a la API de Supabase con la clave de servicio. */
export const serviceHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

/** ¿Este origen puede llamar a la función desde un navegador? */
function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && (origin === SITE_URL || (ALLOW_LOCALHOST && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))
}

/**
 * Crea los helpers HTTP de una función.
 * @param extraAllowHeaders cabeceras propias que el navegador puede enviar (p. ej. x-order-token).
 */
export function createHttp(extraAllowHeaders: string[] = []) {
  const allowHeaders = ['content-type', 'apikey', 'authorization', 'x-client-info', ...extraAllowHeaders].join(', ')

  /** Cabeceras CORS para el origen de la petición (vacías si no está autorizado). */
  function cors(origin: string | null): Record<string, string> {
    return isAllowedOrigin(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': allowHeaders,
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        }
      : { Vary: 'Origin' }
  }

  /** Respuesta JSON sin caché y sin que el navegador "adivine" el tipo de contenido. */
  function json(body: unknown, status: number, origin: string | null): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors(origin), 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
    })
  }

  return { cors, json }
}
