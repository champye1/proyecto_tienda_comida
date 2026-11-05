// E2E etapa C: cupones, promociones 2x1, destacados, venta sugerida y pedidos programados.
// Se ejecuta con `npm run test:e2e` (ver run.mjs): build + vite preview + seed recién cargado.
import { BASE, check, visible, captchaReady, sql, launchBrowser, finish } from './helpers.mjs'

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
console.log('1. El dueño configura')
await owner.goto(`${BASE}/admin/promociones`)
await owner.getByLabel('Código').fill('prueba15')
await owner.getByLabel('Descuento (%)').first().fill('15')
await owner.getByRole('button', { name: 'Crear cupón' }).click()
check(await visible(owner.getByText('PRUEBA15', { exact: true })), 'Crea el cupón PRUEBA15 (código en mayúsculas)')

await owner.getByLabel('Nombre (lo ve el cliente)').fill('2x1 Cuatro Quesos')
await owner.getByLabel('Tipo', { exact: true }).nth(1).selectOption('two_for_one')
await owner.getByLabel('Se aplica a').selectOption({ label: 'Cuatro Quesos' })
await owner.getByLabel('Desde').fill('00:00')
await owner.getByLabel('Hasta').fill('23:55')
await owner.getByRole('button', { name: 'Crear promoción' }).click()
check(await visible(owner.getByText('2x1 Cuatro Quesos')), 'Crea la promoción 2x1 para un producto')

await owner.goto(`${BASE}/admin/menu/productos/aaaaaaaa-0000-4000-8000-0000000000d5`)
await owner.getByRole('switch', { name: 'Destacado' }).click()
await owner.getByRole('switch', { name: 'Sugerir en el carrito' }).click()
await owner.getByRole('button', { name: /Guardar/ }).first().click()
await owner.waitForTimeout(1500)
check(sql("select is_featured and is_upsell from products where id = 'aaaaaaaa-0000-4000-8000-0000000000d5'") === 't', 'Marca la Coca-Cola como destacada y sugerida')

await owner.goto(`${BASE}/admin/local`)
await owner.getByLabel('Pedidos programados').selectOption('2')
await owner.getByRole('button', { name: 'Guardar horario' }).click()
check(await visible(owner.getByText('Horario guardado.')), 'Activa pedidos programados (hasta 2 días)')

// -----------------------------------------------------------------------------
console.log('\n2. La tienda')
const shop = await newPage({ width: 390, height: 844 })
await shop.goto(`${BASE}/r/pizzeria-demo`)
check(await visible(shop.getByRole('heading', { name: 'Destacados' })), 'Muestra la fila de destacados')
check(await visible(shop.getByRole('region', { name: 'Destacados' }).getByText('Coca-Cola 1,5 L')), 'La Coca-Cola aparece destacada')
check(await visible(shop.getByRole('button', { name: /Cuatro Quesos.*2x1/ })), 'Cuatro Quesos muestra la etiqueta 2x1')

await shop.evaluate(() =>
  localStorage.setItem('pedidos:cart:v1:pizzeria-demo', JSON.stringify({ version: 1, lines: [{ productId: 'aaaaaaaa-0000-4000-8000-0000000000d3', optionIds: [], quantity: 2 }] })),
)
await shop.reload()
await shop.getByRole('button', { name: /Ver carrito|carrito/i }).last().click()
check(await visible(shop.getByText(/2x1 Cuatro Quesos: −\$10\.990/)), 'El carrito muestra el descuento 2x1 (−$10.990)')
check(await visible(shop.getByRole('heading', { name: '¿Agregas algo más?' })), 'Sugiere productos en el carrito')
await shop.getByRole('button', { name: 'Agregar Coca-Cola 1,5 L' }).click()
check(await visible(shop.getByRole('dialog').getByText('Coca-Cola 1,5 L').first()), 'Agrega la sugerencia con un toque')
await shop.getByRole('button', { name: 'Continuar' }).click()
await shop.waitForURL(/checkout$/)

console.log('\n3. Checkout: cupón y programado')
await shop.getByLabel('Nombre').fill('Cliente Promo')
await shop.getByLabel('Teléfono').fill('+56 9 4444 1234')
await shop.getByRole('radio', { name: /Retiro/ }).check()
await shop.getByLabel('Cupón de descuento').fill('NOEXISTE')
await shop.getByRole('button', { name: 'Aplicar' }).click()
check(await visible(shop.getByText('Cupón no válido')), 'Un cupón inexistente muestra "Cupón no válido"')
await shop.getByLabel('Cupón de descuento').fill('prueba15')
await shop.getByRole('button', { name: 'Aplicar' }).click()
// Subtotal: 2×10.990 − 10.990 (2x1) + 2.500 = 13.490 → 15% = 2.024
check(await visible(shop.getByText('−$2.024')), 'Aplica PRUEBA15: −$2.024 (15% del subtotal con la promo)')
await shop.getByRole('radio', { name: /Programar/ }).check()
const slotSelect = shop.getByLabel('Día y hora', { exact: true })
const firstSlot = await slotSelect.locator('option').nth(1).getAttribute('value')
await slotSelect.selectOption(firstSlot)
check(Boolean(firstSlot), `Elige un horario programado (${firstSlot})`)
await shop.waitForFunction(() => /Confirmar pedido/.test(document.querySelector('button[type=submit]')?.textContent ?? ''), null, { timeout: 20000 })
await shop.getByRole('button', { name: /Confirmar pedido/ }).click()
await shop.waitForURL(/\/pedido\/[0-9a-f]{48}$/, { timeout: 15000 })
check(await visible(shop.getByText(/Programado para el/)), 'El seguimiento muestra la hora programada')
check(await visible(shop.getByText('Cupón PRUEBA15')), 'El seguimiento muestra el cupón aplicado')

const row = sql("select subtotal || '|' || discount || '|' || total || '|' || coupon_code || '|' || (scheduled_for is not null) from orders where customer_name = 'Cliente Promo'")
check(row === '13490|2024|11466|PRUEBA15|true', `En la base: subtotal 13.490, cupón 2.024, total 11.466, programado (${row})`)
check(sql("select i.promotion_name || '|' || i.discount from order_items i join orders o on o.id = i.order_id where o.customer_name = 'Cliente Promo' and i.promotion_name is not null") === '2x1 Cuatro Quesos|10990',
  'La promoción quedó guardada en la línea del pedido')
check(sql("select uses from coupons where code = 'PRUEBA15'") === '1', 'Se contó el uso del cupón')

console.log('\n4. Panel')
await owner.goto(`${BASE}/admin/pedidos`)
check(await visible(owner.getByText(/^Programado: /)), 'La tarjeta del pedido muestra "Programado"')

check(csp.length === 0, `Sin violaciones de CSP (${csp.length})`)
if (csp.length) console.log(csp.slice(0, 3))
await browser.close()
finish()
