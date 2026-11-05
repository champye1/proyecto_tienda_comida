// E2E etapa E: datos de transferencia, propina, "ya transferí", comprobante y verificación.
// Se ejecuta con `npm run test:e2e` (ver run.mjs): build + vite preview + seed recién cargado.
import { BASE, check, visible, captchaReady, sql, launchBrowser, finish } from './helpers.mjs'

const browser = await launchBrowser()
const csp = []
const newCtx = async (viewport = { width: 1280, height: 900 }) => {
  const ctx = await browser.newContext({ viewport })
  ctx.on('page', (p) => p.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && csp.push(m.text())))
  return ctx
}

const ownerCtx = await newCtx()
const owner = await ownerCtx.newPage()
await owner.goto(`${BASE}/admin/login`)
await owner.getByLabel('Email').fill('owner-a@test.cl')
await owner.getByLabel('Contraseña').fill('password123')
await captchaReady(owner)
await owner.getByRole('button', { name: 'Entrar' }).click()
await owner.waitForURL(/\/admin$/)

// -----------------------------------------------------------------------------
console.log('1. Configurar pagos')
await owner.goto(`${BASE}/admin/local`)
const pay = owner.getByRole('region', { name: 'Pagos' })
await pay.getByLabel('Titular de la cuenta').fill('Pizzería Demo SpA')
await pay.getByLabel('RUT del titular').fill('76123456')
await pay.getByLabel('Banco').fill('Banco Estado')
await pay.getByLabel('Número de cuenta').fill('12345678')
await pay.getByRole('switch', { name: 'Aceptar propina en línea' }).click()
await pay.getByRole('button', { name: 'Guardar pagos' }).click()
check(await visible(pay.getByText('Ingresa el RUT con guion, por ejemplo 76.123.456-7')), 'Valida el formato del RUT')
await pay.getByLabel('RUT del titular').fill('76.123.456-7')
await pay.getByRole('button', { name: 'Guardar pagos' }).click()
check(await visible(pay.getByText('Datos de pago guardados.')), 'Guarda los datos de transferencia y activa la propina')

// -----------------------------------------------------------------------------
console.log('\n2. Checkout con transferencia y propina')
const shopCtx = await newCtx({ width: 390, height: 844 })
const shop = await shopCtx.newPage()
await shop.goto(`${BASE}/r/pizzeria-demo`)
await shop.evaluate(() =>
  localStorage.setItem('pedidos:cart:v1:pizzeria-demo', JSON.stringify({ version: 1, lines: [{ productId: 'aaaaaaaa-0000-4000-8000-0000000000d3', optionIds: [], quantity: 1 }] })),
)
await shop.goto(`${BASE}/r/pizzeria-demo/checkout`)
await shop.getByLabel('Nombre').fill('Cliente Transfer')
await shop.getByLabel('Teléfono').fill('+56 9 3333 1234')
await shop.getByRole('radio', { name: /Retiro/ }).check()
await shop.getByRole('radio', { name: /Transferencia/ }).check()
check(await visible(shop.getByText('12345678')), 'Muestra los datos de transferencia en el checkout')
await shop.getByRole('radio', { name: '10%' }).click()
check(await visible(shop.getByText('$1.100')), 'Propina del 10% (redondeada): $1.100')
await shop.waitForFunction(() => /Confirmar pedido/.test(document.querySelector('button[type=submit]')?.textContent ?? ''), null, { timeout: 20000 })
await shop.getByRole('button', { name: /Confirmar pedido/ }).click()
await shop.waitForURL(/\/pedido\/([0-9a-f]{48})$/, { timeout: 15000 })
const token = shop.url().split('/').pop()
check(sql(`select tip || '|' || total from orders where tracking_token = '${token}'`) === '1100|12090', 'En la base: propina 1.100 y total 12.090')

console.log('\n3. Aviso y comprobante')
check(await visible(shop.getByRole('region', { name: 'Pago por transferencia' })), 'El seguimiento muestra la sección de pago')
await shop.getByRole('button', { name: 'Ya transferí' }).click()
check(await visible(shop.getByText(/Avisaste que transferiste/)), 'El cliente avisa "Ya transferí"')
// Foto del comprobante: un PNG real de 40x40 generado en el navegador.
const png = await shop.evaluate(async () => {
  const c = document.createElement('canvas')
  c.width = c.height = 40
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0a0'
  ctx.fillRect(0, 0, 40, 40)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
})
await shop.getByLabel('Elegir foto del comprobante').setInputFiles({ name: 'comprobante.png', mimeType: 'image/png', buffer: Buffer.from(png) })
check(await visible(shop.getByText(/y enviaste el comprobante/), 15000), 'Sube la foto del comprobante (re-codificada a WebP)')
check(sql(`select payment_receipt_path from orders where tracking_token = '${token}'`).endsWith('.webp'), 'El comprobante quedó guardado como WebP en la carpeta del pedido')

console.log('\n4. El local verifica')
await owner.goto(`${BASE}/admin/pedidos`)
const num = sql(`select order_number from orders where tracking_token = '${token}'`)
const card = owner.getByRole('article', { name: `Pedido ${num}`, exact: true })
check(await visible(card.getByText('Transferencia informada')), 'La tarjeta avisa "Transferencia informada"')
await card.getByRole('button', { name: `Ver detalle del pedido ${num}` }).click()
const dialog = owner.getByRole('dialog')
const [popup] = await Promise.all([ownerCtx.waitForEvent('page'), dialog.getByRole('button', { name: 'Ver comprobante' }).click()])
await popup.waitForLoadState().catch(() => {})
check(/\/storage\/v1\/object\/sign\/payment-receipts\/.+\?token=/.test(popup.url()), 'Abre el comprobante con una URL firmada (bucket privado)')
await popup.close()
await dialog.getByRole('button', { name: 'Marcar pago verificado' }).click()
check(await visible(dialog.getByText('Pago verificado')), 'El local marca el pago como verificado')
await shop.reload()
check(await visible(shop.getByText('✓ El local confirmó tu pago.')), 'El cliente ve el pago confirmado')

await owner.goto(`${BASE}/admin/reportes`)
check(await visible(owner.getByText('Propinas')), 'El reporte muestra las propinas aparte')

check(csp.length === 0, `Sin violaciones de CSP (${csp.length})`)
if (csp.length) console.log(csp.slice(0, 3))
await browser.close()
finish()
