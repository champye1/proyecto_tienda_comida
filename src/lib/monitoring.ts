/**
 * Monitoreo de errores en producción (Sentry), opcional y respetuoso de la privacidad.
 *
 * - Desactivado por defecto: solo se activa si VITE_SENTRY_DSN está definido. Sin DSN no
 *   se descarga ni una línea de Sentry (import dinámico) ni se envía nada a ningún lado.
 * - Se carga DESPUÉS de mostrar la página, para no demorar la tienda en el celular.
 * - Privacidad (Ley 21.719): antes de enviar cada evento se borran los datos personales y
 *   secretos que podrían aparecer en mensajes, URLs o migas de pan: tokens de seguimiento,
 *   emails, teléfonos y JWT. No se envían cookies, cabeceras, cuerpos de peticiones ni datos
 *   del usuario (dataCollection) y no se graba la sesión (sin Session Replay).
 *   En el proyecto de Sentry hay que activar además "Prevent Storing of IP Addresses".
 */
import type { ErrorEvent, Breadcrumb } from '@sentry/react'
import { env } from './env'

type SentryModule = typeof import('@sentry/react')

/** Promesa del SDK ya inicializado (null si el monitoreo está desactivado). */
let sentry: Promise<SentryModule> | null = null

// Patrones de datos personales o secretos que nunca deben salir del navegador.
const SCRUBBERS: [RegExp, string][] = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]'], // tokens de sesión
  [/\b[0-9a-f]{48}\b/g, '[token]'], // token de seguimiento de pedidos (URL /pedido/:token)
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/\+?\d[\d\s().-]{7,}\d/g, '[tel]'], // teléfonos (8 o más dígitos)
]

/** Reemplaza datos sensibles en un texto. */
export function scrub(text: string): string {
  return SCRUBBERS.reduce((s, [re, label]) => s.replace(re, label), text)
}

/**
 * Aplica scrub a todos los TEXTOS de un objeto (evento o miga de pan), recorriéndolo.
 * Solo toca strings: los números (timestamps, líneas del código) se dejan intactos. No se
 * hace sobre el JSON serializado porque el patrón de teléfonos rompería los números y el
 * evento se descartaría sin aviso.
 */
function scrubDeep<T>(value: T): T {
  if (typeof value === 'string') return scrub(value) as T
  if (Array.isArray(value)) return value.map(scrubDeep) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)])) as T
  }
  return value
}

/** Inicia el monitoreo si está configurado. Se llama una vez al arrancar la app. */
export function initMonitoring() {
  if (!env.VITE_SENTRY_DSN || sentry) return
  const dsn = env.VITE_SENTRY_DSN
  sentry = import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Mínimo de datos: sin usuario, cookies, cabeceras, cuerpos de peticiones, parámetros
      // de URL ni variables locales del código (podrían contener datos del formulario).
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
      tracesSampleRate: 0, // solo errores, sin medición de rendimiento
      beforeSend(event: ErrorEvent) {
        delete event.user
        if (event.request) {
          delete event.request.cookies
          delete event.request.headers
        }
        return scrubDeep(event)
      },
      beforeBreadcrumb(crumb: Breadcrumb) {
        // Los mensajes de consola pueden contener cualquier cosa: no se envían.
        if (crumb.category === 'console') return null
        return scrubDeep(crumb)
      },
    })
    return Sentry
  })
}

/**
 * Reporta un error capturado a mano (p. ej. por la pantalla de error de las rutas, que
 * los atrapa antes de que lleguen al manejador global). Sin monitoreo, no hace nada.
 */
export function reportError(error: unknown) {
  void sentry?.then((Sentry) => Sentry.captureException(error))
}
