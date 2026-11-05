// E2E etapa A: horario automático, tiempo estimado, comanda impresa y código QR.
// Se ejecuta con `npm run test:e2e` (ver run.mjs): build + vite preview + seed recién cargado.
import { readFileSync } from 'node:fs'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { BASE, check, visible, sql, launchBrowser, placeOrder as placeStoreOrder, finish } from './helpers.mjs'

/** Pedido de 2 unidades con nota (para revisar la comanda impresa). */
const placeOrder = (name, phone) =>
  placeStoreOrder({
    p_customer_name: name,
    p_customer_phone: phone,
    p_notes: 'Sin cebolla',
    p_items: [{ product_id: 'aaaaaaaa-0000-4000-8000-0000000000d3', quantity: 2 }],
  })

// "HH:MM" en Chile, desplazado N minutos desde ahora.
const chileTime = (offsetMin) =>
  new Date(Date.now() + offsetMin * 60000).toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const browser = await launchBrowser()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
// window.print se reemplaza: registra lo que se iba a imprimir (no abre el diálogo).
await ctx.addInitScript(() => {
  window.e2ePrints = []
  window.print = () => {
    window.e2ePrints.push(document.querySelector('.print-root')?.textContent ?? '')
    setTimeout(() => window.dispatchEvent(new Event('afterprint')), 50)
  }
})
const page = await ctx.newPage()
const csp = []
page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && csp.push(m.text()))
const prints = () => page.evaluate(() => window.e2ePrints)

// --- Login
await page.goto(`${BASE}/admin/login`)
await page.getByLabel('Email').fill('owner-a@test.cl')
await page.getByLabel('Contraseña').fill('password123')
await page.waitForFunction(() => !document.querySelector('button[type=submit]')?.disabled, null, { timeout: 20000 })
await page.getByRole('button', { name: 'Entrar' }).click()
await page.waitForURL(/\/admin$/, { timeout: 15000 })

// -----------------------------------------------------------------------------
console.log('1. Horario automático')
await page.goto(`${BASE}/admin/local`)
await page.getByRole('switch', { name: 'Horario automático' }).click()
const open = chileTime(120)
const close = chileTime(180)
await page.getByLabel('lunes, tramo 1: abre').fill(open)
await page.getByLabel('lunes, tramo 1: cierra').fill(close)
await page.getByRole('button', { name: 'Copiar el lunes a todos los días' }).click()
await page.getByRole('button', { name: 'Guardar horario' }).click()
check(await visible(page.getByText('Horario guardado.')), `Se guarda un horario que excluye la hora actual (${open}–${close} todos los días)`)
const saved = JSON.parse(sql("select opening_hours from restaurants where slug = 'pizzeria-demo'"))
check(saved.length === 7 && saved.every((d) => d[0]?.open === open && d[0]?.close === close), 'En la base quedan los 7 días con el tramo copiado del lunes')
check(await visible(page.getByRole('switch', { name: /fuera de horario/i })), 'El interruptor del panel muestra "Fuera de horario"')
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
check(!overflow, 'Mi local sin scroll horizontal')

const rejected = await placeOrder('Fuera de horario', '+56977770001')
check(rejected.status === 400 && /fuera de su horario/.test(rejected.body.message), `El servidor rechaza pedidos fuera de horario: "${rejected.body.message}"`)

const store = await ctx.newPage()
await store.goto(`${BASE}/r/pizzeria-demo`)
check(await visible(store.getByText(new RegExp(`El local está cerrado y abre (hoy|mañana) a las ${open}`))), `La tienda muestra "Cerrado" y cuándo abre (${open})`)
check(await visible(store.getByText('Ver horario')), 'La tienda ofrece ver el horario semanal')

// Volver a sin horario.
await page.getByRole('switch', { name: 'Horario automático' }).click()
await page.getByRole('button', { name: 'Guardar horario' }).click()
await visible(page.getByText('Horario guardado.'))
check(sql("select opening_hours is null from restaurants where slug = 'pizzeria-demo'") === 't', 'Al desactivarlo, el horario queda vacío (solo el interruptor)')
// Contexto nuevo: el menú queda 30 s en la caché del navegador (Cache-Control), a propósito.
const fresh = await (await browser.newContext()).newPage()
await fresh.goto(`${BASE}/r/pizzeria-demo`)
check(await visible(fresh.getByText(/Listo en aprox\. 25 min/)), 'La tienda abierta muestra el tiempo de preparación (25 min)')

// -----------------------------------------------------------------------------
console.log('\n2. Confirmar con tiempo estimado')
await page.goto(`${BASE}/admin/pedidos`)
const card = page.getByRole('article', { name: 'Pedido 1', exact: true })
await card.getByRole('button', { name: 'Confirmar · 25 min' }).click()
check(await visible(page.getByRole('region', { name: /^Confirmados/ }).getByRole('article', { name: 'Pedido 1', exact: true })), 'Un toque en "Confirmar · 25 min" lo pasa a Confirmados')
check(await visible(card.getByText(/Listo aprox\. \d\d:\d\d · en 2[4-6] min/)), 'La tarjeta muestra la hora estimada y los minutos que faltan')
const eta = sql("select round(extract(epoch from estimated_ready_at - now()) / 60) from orders where order_number = 1 and restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001'")
check(Math.abs(Number(eta) - 25) <= 1, `En la base: estimated_ready_at ≈ ahora + 25 min (${eta})`)

await card.getByRole('button', { name: 'Ver detalle del pedido 1' }).click()
const dialog = page.getByRole('dialog')
check(await visible(dialog.getByText(/Listo aprox\. a las \d\d:\d\d/)), 'El detalle muestra la hora estimada')
await dialog.getByRole('button', { name: '+10 min' }).click()
check(await visible(card.getByText(/en 3[4-6] min/)), '"+10 min" ajusta el tiempo (ahora ~35 min)')

console.log('\n3. Comanda impresa')
await dialog.getByRole('button', { name: 'Imprimir comanda' }).click()
await page.waitForFunction(() => window.e2ePrints.length > 0)
const ticket = (await prints()).at(-1)
check(/#1/.test(ticket) && /TOTAL/.test(ticket) && /Camila Rojas/.test(ticket) && /Listo aprox/.test(ticket), 'La comanda trae número, cliente, total y hora estimada')
check(/Timbre no funciona/.test(ticket) && /Los Leones 456/.test(ticket), 'Incluye la nota y la dirección de entrega')
await dialog.getByLabel(/Imprimir automáticamente al confirmar/).check()
await page.keyboard.press('Escape')

const placed = await placeOrder('Auto Print', '+56977770002')
check(placed.status === 200, 'Llega un pedido nuevo')
const newCard = page.getByRole('article', { name: `Pedido ${placed.body.order_number}`, exact: true })
await newCard.waitFor({ timeout: 15000 })
const before = (await prints()).length
await newCard.getByRole('button', { name: /Confirmar/ }).click()
await page.waitForFunction((n) => window.e2ePrints.length > n, before, { timeout: 10000 }).catch(() => {})
const auto = (await prints()).at(-1)
check((await prints()).length > before && auto.includes('Auto Print') && auto.includes('Sin cebolla'), 'Con la impresión automática activada, confirmar imprime la comanda sola')

console.log('\n4. Seguimiento del cliente')
const token = sql("select tracking_token from orders where order_number = 1 and restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001'")
await store.goto(`${BASE}/r/pizzeria-demo/pedido/${token}`)
check(await visible(store.getByText(/Sale a despacho aprox\. a las \d\d:\d\d/)), 'El cliente ve la hora estimada en su seguimiento (delivery: "Sale a despacho")')

// -----------------------------------------------------------------------------
console.log('\n5. Código QR')
await page.goto(`${BASE}/admin`)
await page.getByRole('button', { name: 'Código QR' }).click()
const qr = page.getByRole('dialog')
check(await visible(qr.getByRole('img', { name: /Código QR de/ })), 'Se muestra el QR de la tienda')
const [download] = await Promise.all([page.waitForEvent('download'), qr.getByRole('button', { name: 'Descargar PNG' }).click()])
const png = PNG.sync.read(readFileSync(await download.path()))
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
check(decoded?.data === `${BASE}/r/pizzeria-demo`, `El PNG descargado se escanea y lleva a la tienda (${decoded?.data})`)
check(download.suggestedFilename() === 'qr-pizzeria-demo.png', 'Nombre del archivo: qr-pizzeria-demo.png')
await qr.getByRole('button', { name: 'Imprimir cartel' }).click()
await page.waitForFunction(() => window.e2ePrints.at(-1)?.includes('Escanea'))
check((await prints()).at(-1).includes('Escanea y haz tu pedido'), 'El cartel para imprimir lleva el nombre, el QR y "Escanea y haz tu pedido"')

check(csp.length === 0, `Sin violaciones de CSP (${csp.length})`)
if (csp.length) console.log(csp.slice(0, 3))

await browser.close()
finish()
