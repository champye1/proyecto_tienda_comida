/**
 * Ejecuta las pruebas de navegador (npm run test:e2e).
 *
 * Pasos:
 *   1. Build de producción (dist/) y un build aparte con monitoreo apuntando a un Sentry
 *      falso (dist-e2e/) para la suite que verifica que no se envíen datos personales.
 *   2. Sirve ambos con `vite preview` (puertos 5180 y 5181), con las cabeceras reales (CSP).
 *   3. Antes de cada suite: `supabase db reset` (seed limpio) y espera a que las Edge
 *      Functions respondan. Si el contenedor de funciones local se cayó, lo vuelve a levantar.
 *   4. Corre cada suite (*.e2e.mjs) y muestra un resumen. Sale con código 1 si alguna falla.
 *
 * ⚠ BORRA LA BASE LOCAL en cada suite (db reset): no correr con datos locales que quieras
 * conservar. Requiere Supabase local levantado (npm run db:start) y .env.local.
 *
 * Uso: npm run test:e2e                     (todas)
 *      npm run test:e2e -- pagos fidelizacion   (solo esas)
 */
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { API, env, ROOT } from './helpers.mjs'

const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const SUPABASE = join(ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js')
const DIR = join(ROOT, 'tests', 'e2e')
const MAIN_PORT = 5180
const MONITORING_PORT = 5181
// DSN de un Sentry falso: lo levanta la suite captcha-legal-monitoreo en el puerto 5199.
const FAKE_SENTRY_DSN = 'http://e2epublickey@127.0.0.1:5199/1'
const MONITORING_SUITE = 'captcha-legal-monitoreo'

/** Ejecuta un comando de node y corta todo si falla. */
function run(args, extraEnv = {}) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (r.status !== 0) throw new Error(`Falló: ${args.join(' ')}`)
}

/** Espera hasta que una URL responda con el estado esperado (o se acabe el tiempo). */
async function waitFor(url, status, { method = 'GET', seconds = 60 } = {}) {
  for (let i = 0; i < seconds; i++) {
    try {
      const res = await fetch(url, { method })
      if (res.status === status) return true
    } catch {
      /* todavía no responde */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

/** Edge Functions listas. Si el contenedor local se cayó (pasa en Windows), se reinicia una vez. */
async function waitForFunctions() {
  const url = `${API}/functions/v1/place-order`
  if (await waitFor(url, 204, { method: 'OPTIONS', seconds: 30 })) return
  spawnSync(process.env.DOCKER_BIN ?? 'docker', ['start', 'supabase_edge_runtime_pedidos-saas'], { stdio: 'ignore' })
  if (!(await waitFor(url, 204, { method: 'OPTIONS', seconds: 60 }))) throw new Error('Las Edge Functions no responden')
}

if (!env.VITE_SUPABASE_URL) throw new Error('Falta .env.local (copia .env.example y completa las claves locales)')

const wanted = process.argv.slice(2)
const suites = readdirSync(DIR)
  .filter((f) => f.endsWith('.e2e.mjs'))
  .map((f) => f.replace('.e2e.mjs', ''))
  .filter((s) => wanted.length === 0 || wanted.includes(s))
  .sort()

console.log('\n▶ Build de producción')
run([VITE, 'build', '--logLevel', 'warn'])
const servers = [spawn(process.execPath, [VITE, 'preview', '--port', String(MAIN_PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })]
if (suites.includes(MONITORING_SUITE)) {
  console.log('▶ Build con monitoreo (Sentry falso)')
  run([VITE, 'build', '--outDir', 'dist-e2e', '--logLevel', 'warn'], { VITE_SENTRY_DSN: FAKE_SENTRY_DSN })
  servers.push(
    spawn(process.execPath, [VITE, 'preview', '--outDir', 'dist-e2e', '--port', String(MONITORING_PORT), '--strictPort'], {
      cwd: ROOT,
      stdio: 'ignore',
      env: { ...process.env, VITE_SENTRY_DSN: FAKE_SENTRY_DSN },
    }),
  )
}

const results = []
try {
  if (!(await waitFor(`http://localhost:${MAIN_PORT}/`, 200))) throw new Error('vite preview no respondió')
  for (const suite of suites) {
    console.log(`\n▶ ${suite}: reiniciando la base (seed limpio)…`)
    run([SUPABASE, 'db', 'reset'])
    await waitForFunctions()
    const port = suite === MONITORING_SUITE ? MONITORING_PORT : MAIN_PORT
    const r = spawnSync(process.execPath, [join(DIR, `${suite}.e2e.mjs`)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, E2E_BASE_URL: `http://localhost:${port}` },
    })
    results.push([suite, r.status === 0])
  }
} finally {
  // Solo se apagan los servidores que lanzó este script (nunca el `npm run dev` del usuario).
  for (const s of servers) s.kill()
  rmSync(join(ROOT, 'dist-e2e'), { recursive: true, force: true })
}

console.log('\nResumen E2E')
for (const [suite, ok] of results) console.log(`  ${ok ? '✔' : '✘'} ${suite}`)
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
