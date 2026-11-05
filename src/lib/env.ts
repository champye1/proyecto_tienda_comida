/**
 * Variables de entorno del frontend, validadas con Zod al arrancar.
 *
 * Vite solo expone al navegador las variables con prefijo VITE_ (definidas en
 * .env.local; ver .env.example). Si falta alguna o tiene mal formato, la app falla
 * de inmediato con un mensaje claro, en vez de fallar más tarde de forma confusa.
 *
 * Importante: todo lo que está aquí es PÚBLICO (queda dentro del JS que se descarga).
 * Nunca poner claves secretas como la service_role key.
 */
import { z } from 'zod'

// Zod 4 intenta usar new Function() (eval) para validar más rápido. Nuestra CSP prohíbe eval
// (protección contra XSS): Zod igual funciona sin él, pero cada intento generaba un aviso de
// violación de CSP. jitless lo desactiva. Este archivo se carga primero, antes de validar nada.
z.config({ jitless: true })

const envSchema = z.object({
  /** URL de la API de Supabase (local: http://127.0.0.1:55321). */
  VITE_SUPABASE_URL: z.url(),
  /** Clave publicable de Supabase. Es pública por diseño: la seguridad la da RLS. */
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** Clave PÚBLICA (site key) de Cloudflare Turnstile para el CAPTCHA. En desarrollo, la de prueba. */
  VITE_TURNSTILE_SITE_KEY: z.string().min(10),
  /** DSN de Sentry para el monitoreo de errores. Opcional: vacío = monitoreo desactivado. */
  VITE_SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
})

const parsed = envSchema.safeParse(import.meta.env)

if (!parsed.success) {
  throw new Error(
    `Variables de entorno inválidas. Copia .env.example a .env.local y complétalo.\n${z.prettifyError(parsed.error)}`,
  )
}

/** Variables de entorno ya validadas y tipadas. */
export const env = parsed.data
