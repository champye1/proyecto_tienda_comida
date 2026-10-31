/**
 * Cabeceras de seguridad HTTP de la web app: fuente única de verdad.
 *
 * Las usa vite.config.ts para:
 *   - inyectar la CSP como <meta> en el index.html del build (funciona en cualquier hosting),
 *   - enviar todas las cabeceras en `vite preview`.
 * Al publicar, el hosting debe enviar estas mismas cabeceras HTTP (ver SECURITY.md).
 *
 * Qué protege cada una:
 *   Content-Security-Policy  Solo se ejecuta JS de nuestro propio dominio y solo se habla con
 *                            nuestro Supabase. Si alguien lograra inyectar HTML (XSS), el
 *                            navegador bloquearía sus scripts y el envío de datos a otro servidor.
 *   X-Frame-Options / frame-ancestors
 *                            Nadie puede meter la app en un <iframe> (clickjacking: engañar al
 *                            dueño para que haga clic en botones del panel sin saberlo).
 *   X-Content-Type-Options   El navegador no "adivina" tipos de archivo (un .png no se ejecuta como JS).
 *   Referrer-Policy          Al salir a otro sitio solo se envía el dominio, nunca la ruta completa
 *                            (protege el token de seguimiento de pedidos que va en la URL).
 *   Permissions-Policy       Desactiva APIs del navegador que la app no usa (cámara, micrófono...).
 *   Cross-Origin-Opener-Policy
 *                            Aísla la pestaña de ventanas abiertas por otros sitios.
 *   Strict-Transport-Security (solo producción con HTTPS)
 *                            Obliga a usar siempre HTTPS, incluso si alguien escribe http://.
 */

type Directives = Record<string, string[]>

/**
 * Construye la Content-Security-Policy.
 * @param supabaseUrl URL de la API de Supabase (VITE_SUPABASE_URL).
 * @param options.meta true si va en <meta>: ahí el navegador ignora frame-ancestors.
 */
export function buildCsp(supabaseUrl: string, { meta = false } = {}): string {
  const api = new URL(supabaseUrl)
  const isHttps = api.protocol === 'https:'
  // Realtime usa WebSocket: wss:// en producción, ws:// en local.
  const realtime = `${isHttps ? 'wss:' : 'ws:'}//${api.host}`

  const directives: Directives = {
    'default-src': ["'self'"], // todo lo no listado: solo nuestro dominio
    'script-src': ["'self'"], // sin scripts inline ni de terceros
    'style-src': ["'self'"], // sin estilos inline (el color de marca se aplica por CSSOM, que está permitido)
    'img-src': ["'self'", 'data:', 'blob:', api.origin], // blob: = vista previa de fotos antes de subirlas
    'font-src': ["'self'"],
    'connect-src': ["'self'", api.origin, realtime], // fetch/XHR/WebSocket solo a Supabase
    'manifest-src': ["'self'"],
    'worker-src': ["'self'"], // service worker de la PWA
    'object-src': ["'none'"], // sin plugins (<object>, <embed>)
    'base-uri': ["'self'"], // evita que un <base> inyectado redirija rutas relativas
    'form-action': ["'self'"], // los formularios no pueden enviarse a otro dominio
  }
  if (!meta) directives['frame-ancestors'] = ["'none'"]
  // En producción (HTTPS) cualquier recurso http:// se pide por https://.
  if (isHttps) directives['upgrade-insecure-requests'] = []

  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(' '))
    .join('; ')
}

/** Todas las cabeceras de seguridad HTTP (para el hosting y `vite preview`). */
export function securityHeaders(supabaseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildCsp(supabaseUrl),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
  if (supabaseUrl.startsWith('https://')) {
    // 2 años. Solo con HTTPS: en http://localhost rompería el desarrollo.
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
  }
  return headers
}

/** Cabeceras para el servidor de desarrollo: sin CSP, porque Vite usa scripts inline para la recarga en caliente. */
export function devSecurityHeaders(): Record<string, string> {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
}
