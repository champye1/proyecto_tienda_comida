/**
 * Utilidades compartidas por las pruebas de navegador (tests/e2e/*.e2e.mjs).
 *
 * Cada suite es un script que abre un navegador real (Playwright) contra el build de
 * producción servido con `vite preview`, usando Supabase local con el seed recién cargado.
 * Se ejecutan todas con `npm run test:e2e` (ver run.mjs, que prepara todo).
 *
 * Variables de entorno (opcionales):
 *   E2E_BASE_URL         URL de la app (por defecto http://localhost:5180).
 *   E2E_BROWSER_CHANNEL  Navegador instalado a usar ("msedge", "chrome"); vacío = el Chromium
 *                        de Playwright (el que usa el CI).
 *   E2E_DB_CONTAINER     Contenedor de Postgres local (por defecto supabase_db_pedidos-saas).
 *   DOCKER_BIN           Ruta de docker si no está en el PATH.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

/** Raíz del proyecto (para leer .env.local sin depender de la carpeta actual). */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** URL de la app bajo prueba. */
export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5180'

/** Variables VITE_ de .env.local (URL y clave publicable de Supabase local). */
export const env = (() => {
  const file = `${ROOT}.env.local`
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
})()

/** URL de la API de Supabase local. */
export const API = env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321'
const DOCKER = process.env.DOCKER_BIN ?? 'docker'
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? 'supabase_db_pedidos-saas'

let failures = 0

/** Registra una verificación (✔/✘) y cuenta las que fallan. */
export function check(ok, msg) {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`)
  if (!ok) failures++
}

/** true si el elemento aparece antes del tiempo límite (sin lanzar error). */
export const visible = (loc, timeout = 10000) =>
  loc
    .first()
    .waitFor({ timeout })
    .then(
      () => true,
      () => false,
    )

/** Espera a que el CAPTCHA (Turnstile de prueba) habilite el botón de enviar del formulario. */
export const captchaReady = (page) =>
  page.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled, null, { timeout: 20000 })

/** Consulta SQL en la base local como postgres (para preparar datos o verificar resultados). */
export function sql(query) {
  return execFileSync(DOCKER, ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim()
}

/** SQL como superusuario (solo para preparar escenarios que la app no permite, p. ej. fechas pasadas). */
export function sqlAdmin(query) {
  return execFileSync(DOCKER, ['exec', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  })
}

/** Abre el navegador (Chromium de Playwright o el canal indicado en E2E_BROWSER_CHANNEL). */
export function launchBrowser() {
  return chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined })
}

/** Inicia sesión en el panel con un usuario del seed (pasa por el CAPTCHA de prueba). */
export async function loginAs(page, email) {
  await page.goto(`${BASE}/admin/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill('password123')
  await captchaReady(page)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/admin$/, { timeout: 15000 })
}

/**
 * Crea un pedido como la tienda: POST a la Edge Function place-order con el token ficticio
 * que acepta el secreto de PRUEBA de Turnstile. `order` sobrescribe los valores por defecto.
 */
export async function placeOrder(order) {
  const res = await fetch(`${API}/functions/v1/place-order`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      captchaToken: 'XXXX.DUMMY.TOKEN.XXXX',
      order: {
        p_restaurant_slug: 'pizzeria-demo',
        p_customer_name: 'Cliente E2E',
        p_customer_phone: '+56911112222',
        p_type: 'pickup',
        p_address: null,
        p_notes: null,
        p_payment_method: 'cash',
        p_items: [{ product_id: 'aaaaaaaa-0000-4000-8000-0000000000d3', quantity: 1 }],
        ...order,
      },
    }),
  })
  return { status: res.status, body: await res.json() }
}

/** Escucha la consola de una página y guarda las violaciones de CSP en `list`. */
export function collectCsp(page, list) {
  page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && list.push(m.text()))
}

/** Termina la suite: resumen y código de salida (1 si alguna verificación falló). */
export function finish() {
  console.log(failures === 0 ? '\nTodo OK' : `\n${failures} fallo(s)`)
  process.exit(failures ? 1 : 0)
}
