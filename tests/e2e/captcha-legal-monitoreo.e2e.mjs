// E2E: CAPTCHA (login, registro, recuperar, checkout), páginas legales y monitoreo sin PII.
// Se ejecuta con `npm run test:e2e` (ver run.mjs), sobre un build con VITE_SENTRY_DSN apuntando al
// servidor Sentry falso de esta prueba (:5199).
import http from 'node:http'
import { BASE, check, launchBrowser, finish } from './helpers.mjs'

// --- Servidor falso de Sentry: guarda todo lo que el navegador intenta enviar.
const envelopes = []
const sentry = http
  .createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (req.method === 'POST') envelopes.push(body)
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
      res.end('{}')
    })
  })
  .listen(5199)

// El iframe de Turnstile vive dentro de un shadow DOM cerrado: se busca entre los frames.
async function waitTurnstileFrame(pg) {
  for (let i = 0; i < 40; i++) {
    if (pg.frames().some((f) => f.url().includes('challenges.cloudflare.com'))) return true
    await pg.waitForTimeout(500)
  }
  return false
}

const browser = await launchBrowser()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const cspViolations = []
page.on('console', (m) => {
  if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text())
})

// -----------------------------------------------------------------------------
console.log('1. Login con CAPTCHA')
await page.goto(`${BASE}/admin/login`)
const loginBtn = page.getByRole('button', { name: 'Entrar' })
check(await loginBtn.isDisabled(), 'El botón Entrar está deshabilitado hasta que el CAPTCHA responde')
check(await waitTurnstileFrame(page), 'El widget de Turnstile se carga (CSP permite su script e iframe)')
await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled, null, { timeout: 20000 })
check(true, 'Con la clave de prueba el CAPTCHA se resuelve solo y habilita el botón')
await page.getByLabel('Email').fill('owner-a@test.cl')
await page.getByLabel('Contraseña').fill('password123')
await loginBtn.click()
await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 })
check(true, 'Login correcto con token de CAPTCHA → entra al panel')

// -----------------------------------------------------------------------------
console.log('\n2. Registro: checkbox de términos obligatorio')
const guest = await browser.newContext({ viewport: { width: 390, height: 844 } })
const g = await guest.newPage()
g.on('console', (m) => {
  if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text())
})
await g.goto(`${BASE}/admin/registro`)
await g.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled, null, { timeout: 20000 })
await g.getByLabel('Email').fill(`nuevo${Date.now()}@test.cl`)
await g.getByLabel('Contraseña', { exact: true }).fill('clave12345')
await g.getByLabel('Repite la contraseña').fill('clave12345')
await g.getByRole('button', { name: 'Crear cuenta' }).click()
check(await g.getByText('Debes aceptar los Términos').isVisible(), 'Sin aceptar los términos no se puede registrar')
const terms = g.getByRole('link', { name: 'Términos y condiciones' })
check((await terms.getAttribute('href')) === '/legal/terminos', 'El checkbox enlaza a /legal/terminos')
check(await g.getByRole('link', { name: 'Privacidad', exact: true }).isVisible(), 'Pie de las pantallas de acceso con enlace a Privacidad')

// Recuperar contraseña también lleva CAPTCHA.
await g.goto(`${BASE}/admin/recuperar`)
check(await g.getByRole('button', { name: 'Enviar enlace' }).isDisabled(), 'Recuperar contraseña espera el CAPTCHA')
check(await waitTurnstileFrame(g), 'Recuperar contraseña muestra el widget de Turnstile')

// -----------------------------------------------------------------------------
console.log('\n3. Páginas legales')
for (const [path, title] of [
  ['/legal/terminos', 'Términos y condiciones'],
  ['/legal/privacidad', 'Política de privacidad'],
]) {
  await g.goto(`${BASE}${path}`)
  check(await g.getByRole('heading', { level: 1, name: title }).isVisible(), `${path} muestra "${title}"`)
  check(await g.getByText('Borrador.').isVisible(), `${path} muestra el aviso de borrador pendiente de revisión legal`)
  const overflow = await g.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  check(!overflow, `${path} sin scroll horizontal en celular`)
}
await g.locator('nav[aria-label="Índice"] a').nth(7).click()
check(await g.evaluate(() => location.hash === '#derechos'), 'El índice salta a la sección "Tus derechos"')
await g.goto(`${BASE}/`)
check(await g.getByRole('contentinfo').getByRole('link', { name: 'Términos', exact: true }).waitFor().then(() => true, () => false), 'La landing enlaza a Términos en el pie')

// -----------------------------------------------------------------------------
console.log('\n4. Checkout con CAPTCHA (Edge Function place-order)')
await g.goto(`${BASE}/r/pizzeria-demo`)
check(await g.getByRole('contentinfo').getByRole('link', { name: 'Privacidad', exact: true }).waitFor().then(() => true, () => false), 'La tienda enlaza a Privacidad en el pie')
await g.evaluate(() =>
  localStorage.setItem(
    'pedidos:cart:v1:pizzeria-demo',
    JSON.stringify({ version: 1, lines: [{ productId: 'aaaaaaaa-0000-4000-8000-0000000000d3', optionIds: [], quantity: 1 }] }),
  ),
)
await g.goto(`${BASE}/r/pizzeria-demo/checkout`)
const confirm = g.getByRole('button', { name: /Confirmar pedido|Verificando/ })
check(await g.getByText(/tus datos se comparten con/).waitFor().then(() => true, () => false), 'Aviso de privacidad visible antes de confirmar')
await g.getByLabel('Nombre').fill('Cliente E2E')
await g.getByLabel('Teléfono').fill('+56 9 5555 1234')
await g.getByRole('radio', { name: /Retiro/ }).check().catch(() => {})
await g.waitForFunction(() => /Confirmar pedido/.test(document.querySelector('button[type=submit]')?.textContent ?? ''), null, { timeout: 20000 })
check(true, 'El botón pasa de "Verificando…" a "Confirmar pedido" cuando el CAPTCHA responde')
const placed = g.waitForResponse((r) => r.url().includes('/functions/v1/place-order'))
await confirm.click()
const res = await placed
check(res.status() === 200, `place-order responde 200 (recibido ${res.status()})`)
await g.waitForURL(/\/pedido\/[0-9a-f]{48}$/, { timeout: 15000 })
check(true, 'Tras confirmar, lleva a la página de seguimiento del pedido')
const trackingUrl = g.url()

// -----------------------------------------------------------------------------
console.log('\n5. Monitoreo de errores sin datos personales')
// Error con datos personales en el mensaje, estando en una URL con token de seguimiento.
await g.evaluate(() => {
  console.log('dato sensible en consola: juan@correo.cl')
  setTimeout(() => {
    throw new Error(`Fallo de prueba juan@correo.cl +56 9 8765 4321 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123 ${'f'.repeat(48)}`)
  })
})
await g.waitForTimeout(4000)
const all = envelopes.join('\n')
check(envelopes.length > 0, `El error llegó al servidor de monitoreo (${envelopes.length} envío/s)`)
check(all.includes('Fallo de prueba'), 'El reporte contiene el mensaje del error')
check(!all.includes('juan@correo.cl'), 'Sin emails en el reporte')
check(!/8765\s?4321/.test(all), 'Sin teléfonos en el reporte')
check(!all.includes('eyJhbGciOiJIUzI1NiJ9'), 'Sin JWT en el reporte')
const token = trackingUrl.split('/').pop()
check(!all.includes(token) && !all.includes('f'.repeat(48)), 'Sin el token de seguimiento (ni de la URL ni del mensaje)')
check(!all.includes('dato sensible en consola'), 'Los mensajes de consola no se envían')
check(!all.includes('Cliente E2E') && !all.includes('5555'), 'Sin el nombre ni el teléfono del formulario de checkout')

check(cspViolations.length === 0, `Sin violaciones de CSP (${cspViolations.length})`)
if (cspViolations.length) console.log(cspViolations.slice(0, 3))

await browser.close()
sentry.close()
finish()
