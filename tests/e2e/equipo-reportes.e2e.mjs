// E2E etapa B: invitaciones al personal, permisos del staff, clientes, reportes y exportación.
// Se ejecuta con `npm run test:e2e` (ver run.mjs): build + vite preview + seed recién cargado.
import { readFileSync } from 'node:fs'
import { BASE, check, visible, captchaReady, launchBrowser, loginAs, finish } from './helpers.mjs'

/** Lee un CSV descargado (sin el BOM) como texto. */
async function readDownload(p, trigger) {
  const [d] = await Promise.all([p.waitForEvent('download'), trigger()])
  const raw = readFileSync(await d.path(), 'utf8')
  return { name: d.suggestedFilename(), bom: raw.charCodeAt(0) === 0xfeff, text: raw.replace(/^﻿/, '') }
}

const browser = await launchBrowser()
const csp = []
const newPage = async (viewport = { width: 1280, height: 900 }) => {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true })
  const p = await ctx.newPage()
  p.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && csp.push(m.text()))
  return p
}

// -----------------------------------------------------------------------------
console.log('1. Invitar personal')
const owner = await newPage()
await loginAs(owner, 'owner-a@test.cl')
await owner.goto(`${BASE}/admin/equipo`)
const staffEmail = `garzon${Date.now()}@test.cl`
await owner.getByLabel('Email de la persona').fill(staffEmail)
await owner.getByRole('button', { name: 'Crear invitación' }).click()
const linkEl = owner.getByText(/\/admin\/invitacion\/[0-9a-f]{48}/)
check(await visible(linkEl), 'Se genera el link de invitación (se muestra una sola vez)')
const link = (await linkEl.textContent()).trim()
check(await visible(owner.getByRole('link', { name: 'Enviar por WhatsApp' })), 'Ofrece enviarlo por WhatsApp')
check(await visible(owner.getByRole('listitem').filter({ hasText: staffEmail })), 'Aparece en invitaciones pendientes')

// Otra cuenta con el link: no puede aceptarla.
const other = await newPage()
await loginAs(other, 'owner-b@test.cl')
await other.goto(link)
check(await visible(other.getByText(/Esta invitación es para ga\*\*\*@test\.cl/)), 'Con otra cuenta: avisa que es para otro email (enmascarado) y no deja aceptar')
check((await other.getByRole('button', { name: 'Aceptar invitación' }).count()) === 0, 'No aparece el botón de aceptar para la cuenta equivocada')

// -----------------------------------------------------------------------------
console.log('\n2. El invitado crea su cuenta desde el link y acepta')
const staff = await newPage({ width: 390, height: 844 })
await staff.goto(link)
await staff.waitForURL(/\/admin\/login\?next=/)
check(true, 'Sin sesión, el link lleva al login recordando la invitación')
await staff.getByRole('link', { name: 'Regístrate' }).click()
await staff.waitForURL(/\/admin\/registro\?next=/)
check(true, '"Regístrate" conserva la invitación (?next=)')
await staff.getByLabel('Email').fill(staffEmail)
await staff.getByLabel('Contraseña', { exact: true }).fill('clave12345')
await staff.getByLabel('Repite la contraseña').fill('clave12345')
await staff.getByRole('checkbox').check()
await captchaReady(staff)
await staff.getByRole('button', { name: 'Crear cuenta' }).click()
await staff.waitForURL(/\/admin\/invitacion\//, { timeout: 15000 })
check(await visible(staff.getByRole('heading', { name: 'Únete a Pizzería Demo' })), 'Después de registrarse vuelve a la invitación (no al onboarding)')
await staff.getByRole('button', { name: 'Aceptar invitación' }).click()
await staff.waitForURL(/\/admin\/pedidos$/, { timeout: 15000 })
check(await visible(staff.getByRole('heading', { name: 'Pedidos' })), 'Al aceptar entra directo a los pedidos del local')

console.log('\n3. Permisos del personal')
check(await staff.getByRole('switch', { name: /Tocar para/ }).isDisabled(), 'El personal no puede abrir/cerrar el local')
await staff.goto(`${BASE}/admin/equipo`)
check(await visible(staff.getByText('Solo el dueño del local puede ver y gestionar el equipo.')), 'El personal no ve la lista del equipo')
await staff.goto(link)
check(await visible(staff.getByText('Esta invitación ya fue usada.')), 'El link ya no sirve una segunda vez')

await owner.goto(`${BASE}/admin/equipo`)
const memberRow = owner.getByRole('listitem').filter({ hasText: staffEmail })
check(await visible(memberRow.getByText('Personal')), 'El dueño ve al nuevo miembro como "Personal"')

// -----------------------------------------------------------------------------
console.log('\n4. Clientes')
await owner.goto(`${BASE}/admin/clientes`)
check(await visible(owner.getByText('Camila Rojas')), 'Lista de clientes con nombre')
await owner.getByLabel('Buscar cliente').fill('diego')
check(await visible(owner.getByText('Diego Muñoz')) && (await owner.getByText('Camila Rojas').count()) === 0, 'La búsqueda filtra por nombre')
await owner.getByLabel('Buscar cliente').fill('')
await owner.getByRole('button', { name: /Inactivos/ }).click()
check(await visible(owner.getByText('Ningún cliente coincide con el filtro.')), 'Filtro de inactivos (+30 días): ninguno en el seed')
await owner.getByRole('button', { name: 'Todos' }).click()
const customersCsv = await readDownload(owner, () => owner.getByRole('button', { name: 'Exportar a Excel' }).click())
check(customersCsv.bom && customersCsv.text.startsWith('Nombre;Teléfono;Pedidos'), 'Exporta clientes en CSV para Excel (BOM + ";")')
check(customersCsv.text.includes("Camila Rojas;'+56987654321"), 'El CSV trae los datos (el teléfono con "+" va como texto, protegido contra fórmulas)')

// -----------------------------------------------------------------------------
console.log('\n5. Reportes ampliados y exportación')
await owner.goto(`${BASE}/admin/reportes`)
await owner.getByRole('button', { name: 'Este año' }).click()
check(await visible(owner.getByRole('heading', { name: 'Ventas por mes' })), '"Este año": gráfico por mes')
check(await visible(owner.getByRole('heading', { name: 'Horas con más pedidos' })), 'Muestra las horas con más pedidos')
check(await visible(owner.getByRole('heading', { name: 'Días con más pedidos' })), 'Muestra los días con más pedidos')
check(await visible(owner.getByRole('heading', { name: 'Productos sin ventas en el período' })), 'Muestra productos sin ventas')
const ordersCsv = await readDownload(owner, () => owner.getByRole('button', { name: 'Exportar pedidos a Excel' }).click())
const lines = ordersCsv.text.trim().split('\r\n')
check(ordersCsv.name.startsWith('pedidos-pizzeria-demo-'), `Archivo: ${ordersCsv.name}`)
check(lines[0].startsWith('N.º pedido;Fecha;Estado') && lines.length >= 5, `Exporta el detalle de pedidos (${lines.length - 1} líneas de productos)`)
check(ordersCsv.text.includes('Margarita') && ordersCsv.text.includes('Familiar, Extra queso'), 'Incluye productos con sus opciones')

// Rango personalizado de varios días.
await owner.getByLabel('Desde').fill('2026-10-01')
await owner.getByLabel('hasta').fill('2026-11-05')
check(await visible(owner.getByRole('heading', { name: 'Ventas por día' })) || await visible(owner.getByText('No hay ventas en este período.')), 'Rango a elección (más de 31 días) funciona')

// -----------------------------------------------------------------------------
console.log('\n6. Quitar al personal')
await owner.goto(`${BASE}/admin/equipo`)
await owner.getByRole('listitem').filter({ hasText: staffEmail }).getByRole('button', { name: 'Quitar' }).click()
await owner.getByRole('dialog').getByRole('button', { name: 'Quitar acceso' }).click()
check(await owner.getByRole('listitem').filter({ hasText: staffEmail }).waitFor({ state: 'detached', timeout: 10000 }).then(() => true, () => false), 'El dueño quita al miembro')
await staff.goto(`${BASE}/admin`)
await staff.waitForURL(/\/admin\/onboarding/, { timeout: 15000 }).catch(() => {})
check(staff.url().includes('/admin/onboarding'), 'El exmiembro pierde el acceso de inmediato (sin restaurante → onboarding)')

const overflow = await staff.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
check(!overflow, 'Sin scroll horizontal en celular')
check(csp.length === 0, `Sin violaciones de CSP (${csp.length})`)
if (csp.length) console.log(csp.slice(0, 3))

await browser.close()
finish()
