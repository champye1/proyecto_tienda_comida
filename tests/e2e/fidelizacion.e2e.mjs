// E2E etapa D: tarjeta de sellos, premio, reseñas y recuperar clientes inactivos.
// Se ejecuta con `npm run test:e2e` (ver run.mjs): build + vite preview + seed recién cargado.
import { BASE, check, visible, captchaReady, sql, sqlAdmin, launchBrowser, placeOrder as placeStoreOrder, finish } from './helpers.mjs'

/** Pedido del mismo cliente fiel (devuelve número y token de seguimiento). */
const placeOrder = async (phone) => (await placeStoreOrder({ p_customer_name: 'Cliente Fiel', p_customer_phone: phone })).body

const browser = await launchBrowser()
const csp = []
const newPage = async (viewport = { width: 1280, height: 900 }) => {
  const p = await (await browser.newContext({ viewport })).newPage()
  p.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && csp.push(m.text()))
  return p
}

const owner = await newPage()
await owner.goto(`${BASE}/admin/login`)
await owner.getByLabel('Email').fill('owner-a@test.cl')
await owner.getByLabel('Contraseña').fill('password123')
await captchaReady(owner)
await owner.getByRole('button', { name: 'Entrar' }).click()
await owner.waitForURL(/\/admin$/)

// -----------------------------------------------------------------------------
console.log('1. Configurar fidelización')
await owner.goto(`${BASE}/admin/local`)
await owner.getByRole('switch', { name: 'Tarjeta de sellos' }).click()
await owner.getByLabel('Sellos para el premio').fill('3')
await owner.getByLabel('Premio', { exact: true }).selectOption('fixed')
await owner.getByLabel('Descuento ($)').fill('2000')
await owner.getByLabel(/Link para dejar reseña en Google/).fill('javascript:alert(1)')
await owner.getByRole('region', { name: 'Fidelización y reseñas' }).getByRole('button', { name: 'Guardar' }).click()
check(await visible(owner.getByText('El link de Google debe empezar con https://')), 'Rechaza un link que no es https:// (p. ej. javascript:)')
await owner.getByLabel(/Link para dejar reseña en Google/).fill('https://g.page/r/pizzeria-demo/review')
await owner.getByRole('region', { name: 'Fidelización y reseñas' }).getByRole('button', { name: 'Guardar' }).click()
check(await visible(owner.getByText('Guardado.')), 'Activa la tarjeta de 3 sellos con premio de $2.000')

const shop = await newPage({ width: 390, height: 844 })
await shop.goto(`${BASE}/r/pizzeria-demo`)
check(await visible(shop.getByText(/Junta 3 sellos y gana \$2\.000 de descuento/)), 'La tienda anuncia la tarjeta de sellos')

// -----------------------------------------------------------------------------
console.log('\n2. Tres pedidos entregados → premio')
const phone = '+56966660001'
const placed = []
for (let i = 0; i < 3; i++) placed.push(await placeOrder(phone))
check(placed.every((p) => p.tracking_token), 'Se crean 3 pedidos del mismo cliente')
for (const p of placed) {
  for (const s of ['confirmed', 'preparing', 'ready', 'delivered']) sql(`update orders set status = '${s}' where tracking_token = '${p.tracking_token}'`)
}
await shop.goto(`${BASE}/r/pizzeria-demo/pedido/${placed[2].tracking_token}`)
check(await visible(shop.getByText(/Completaste tu tarjeta/)), 'El seguimiento celebra la tarjeta completa')
const code = (await shop.getByText(/^PREMIO-[A-Z2-9]{6}$/).first().textContent())?.trim()
check((code ?? '').startsWith('PREMIO-'), `Muestra el código del premio (${code})`)
check(sql(`select customer_phone || '|' || max_uses || '|' || value from coupons where code = '${code}'`) === `${phone}|1|2000`, 'El premio es personal, de un uso y de $2.000')

console.log('\n3. Reseña')
await shop.locator('label', { has: shop.getByRole('radio', { name: '5 estrellas' }) }).click()
await shop.getByLabel('Comentario (opcional)').fill('¡Excelente! <b>sin HTML</b>')
await shop.getByRole('button', { name: 'Enviar calificación' }).click()
check(await visible(shop.getByText('¡Gracias por tu opinión!')), 'El cliente califica el pedido entregado')
const google = shop.getByRole('link', { name: 'Déjanos tu reseña en Google' })
check(await visible(google) && (await google.getAttribute('href')) === 'https://g.page/r/pizzeria-demo/review', 'Con 5 estrellas lo invita a dejar la reseña en Google')

await owner.goto(`${BASE}/admin/resenas`)
check(await visible(owner.getByText('5,0')), 'El panel muestra el promedio (5,0)')
check(await visible(owner.getByText('¡Excelente! <b>sin HTML</b>')), 'El comentario se muestra como texto (sin interpretar HTML)')

// -----------------------------------------------------------------------------
console.log('\n4. Invitar a volver a un cliente inactivo')
// Se simula que Camila pidió hace 40 días (created_at es inmutable por trigger: se desactiva solo para esto).
sqlAdmin(`begin;
   set local session_replication_role = replica; -- solo en esta transacción: sin triggers ni FKs mientras se mueven ambas tablas
   update order_items set order_created_at = order_created_at - interval '40 days', created_at = created_at - interval '40 days'
     where order_id in (select id from orders where customer_phone = '+56987654321');
   update orders set created_at = created_at - interval '40 days' where customer_phone = '+56987654321';
   commit;`)
await owner.goto(`${BASE}/admin/clientes`)
await owner.getByRole('button', { name: /Inactivos/ }).click()
const camila = owner.getByRole('listitem').filter({ hasText: 'Camila Rojas' })
check(await visible(camila), 'Camila aparece como inactiva (+30 días)')
await camila.getByRole('button', { name: 'Invitar a volver' }).click()
const dialog = owner.getByRole('dialog')
await dialog.getByLabel('Descuento', { exact: true }).selectOption('20')
await dialog.getByRole('button', { name: 'Crear cupón' }).click()
const wa = dialog.getByRole('link', { name: 'Enviar por WhatsApp' })
check(await visible(wa), 'Crea el cupón y ofrece enviarlo por WhatsApp')
const href = decodeURIComponent((await wa.getAttribute('href')) ?? '')
check(/^https:\/\/wa\.me\/56987654321\?text=¡Hola Camila! .*VUELVE-[A-Z2-9]{6}.*20% .*\/r\/pizzeria-demo$/.test(href), 'El mensaje lleva nombre, código VUELVE, descuento y link de la tienda')

check(csp.length === 0, `Sin violaciones de CSP (${csp.length})`)
if (csp.length) console.log(csp.slice(0, 3))
await browser.close()
finish()
