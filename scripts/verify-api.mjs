// Verificaciones por la API pública (lo que pgTAP no puede probar desde dentro de Postgres):
//   1. Realtime respeta RLS: cada restaurante solo recibe eventos de sus pedidos.
//   2. Concurrencia real: pedidos simultáneos reciben correlativos únicos y consecutivos.
//   3. Storage por la API: carpeta propia, tipo de archivo, tamaño máximo y borrado.
//
// Uso: npm run verify:api   (requiere Supabase local con el seed recién cargado)

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env.local)')

const A_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const B_ID = 'bbbbbbbb-0000-4000-8000-000000000001'
const ITEMS_A = [{ product_id: 'aaaaaaaa-0000-4000-8000-0000000000d3', quantity: 1 }]
const ITEMS_B = [{ product_id: 'bbbbbbbb-0000-4000-8000-0000000000d2', quantity: 2 }]
// PNG de 1x1 px.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let failures = 0
function check(ok, msg) {
  console.log(`${ok ? '  ✔' : '  ✘'} ${msg}`)
  if (!ok) failures++
}

const newClient = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function login(email) {
  const c = newClient()
  const { error } = await c.auth.signInWithPassword({ email, password: 'password123' })
  if (error) throw new Error(`Login ${email}: ${error.message}`)
  await c.realtime.setAuth()
  return c
}

// Cada pedido de prueba puede usar un teléfono distinto: la base limita a 3 pedidos
// por teléfono y restaurante cada 10 minutos (migración 9).
const orderArgs = (slug, items, name, phone = '+56911112222') => ({
  p_restaurant_slug: slug,
  p_customer_name: name,
  p_customer_phone: phone,
  p_type: 'pickup',
  p_address: null,
  p_notes: null,
  p_payment_method: 'cash',
  p_items: items,
})

function listen(client, filter) {
  const events = []
  return new Promise((resolve, reject) => {
    const channel = client
      .channel(`test-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', ...(filter ? { filter } : {}) },
        (payload) => events.push({ ...payload.new, _errors: payload.errors }),
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve({ events, channel })
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status))
      })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const anon = newClient()
const ownerA = await login('owner-a@test.cl')
const ownerB = await login('owner-b@test.cl')
console.log('Login con owner-a@test.cl y owner-b@test.cl: OK\n')

// -----------------------------------------------------------------------------
console.log('1. Realtime respeta RLS')
const subA = await listen(ownerA, `restaurant_id=eq.${A_ID}`)
const subAUnfiltered = await listen(ownerA, null)
const subASpyingB = await listen(ownerA, `restaurant_id=eq.${B_ID}`)
const subB = await listen(ownerB, `restaurant_id=eq.${B_ID}`)
const subAnon = await listen(anon, null)
// Realtime tarda un momento en activar cada suscripción después de SUBSCRIBED.
await sleep(3000)

const { data: newA, error: errA } = await anon.rpc('create_order', orderArgs('pizzeria-demo', ITEMS_A, 'Realtime A'))
const { data: newB, error: errB } = await anon.rpc('create_order', orderArgs('sushi-demo', ITEMS_B, 'Realtime B'))
if (errA || errB) throw errA ?? errB
await sleep(3000)

const ids = (s) => s.events.map((e) => e.id).filter(Boolean)
check(ids(subA).includes(newA[0].order_id) && !ids(subA).includes(newB[0].order_id),
  'A (filtrado por su restaurant_id) recibe su pedido y no el de B')
check(ids(subAUnfiltered).length === 1 && ids(subAUnfiltered)[0] === newA[0].order_id,
  'A suscrito SIN filtro solo recibe su propio pedido')
check(subASpyingB.events.length === 0, 'A suscrito con el restaurant_id de B no recibe nada')
check(ids(subB).includes(newB[0].order_id) && !ids(subB).includes(newA[0].order_id),
  'B recibe su pedido y no el de A')
// Realtime le avisa al suscriptor sin permiso con un evento vacío marcado 401: nunca con datos.
check(subAnon.events.every((e) => e.id === undefined && Object.keys(e).length === 1),
  'Un cliente anónimo no recibe datos de pedidos (Realtime solo le envía un aviso 401 vacío)')
for (const c of [anon, ownerA, ownerB]) await c.removeAllChannels()

// -----------------------------------------------------------------------------
console.log('\n2. Concurrencia del correlativo')
const N = 30
const results = await Promise.all(
  Array.from({ length: N }, (_, i) => anon.rpc('create_order', orderArgs('pizzeria-demo', ITEMS_A, `Concurrente ${i}`, `+569700000${String(i).padStart(2, '0')}`))),
)
const errors = results.filter((r) => r.error)
const numbers = results.filter((r) => !r.error).map((r) => r.data[0].order_number).sort((x, y) => x - y)
check(errors.length === 0, `${N} pedidos simultáneos creados sin errores`)
check(new Set(numbers).size === numbers.length, 'Ningún número de pedido se repite')
check(numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1),
  `Los números son consecutivos (${numbers[0]}…${numbers.at(-1)})`)

// -----------------------------------------------------------------------------
console.log('\n3. Storage por la API')
const bucketA = ownerA.storage.from('restaurant-images')
const bucketB = ownerB.storage.from('restaurant-images')

let r = await bucketA.upload(`${A_ID}/verify.png`, PNG, { contentType: 'image/png', upsert: true })
check(!r.error, 'A sube una imagen a su carpeta')

r = await bucketA.upload(`${B_ID}/intruso.png`, PNG, { contentType: 'image/png' })
check(!!r.error, 'A no puede subir a la carpeta de B')

r = await bucketA.upload(`${A_ID}/documento.pdf`, Buffer.from('%PDF-1.4'), { contentType: 'application/pdf' })
check(!!r.error, 'Se rechazan archivos que no son jpeg/png/webp')

r = await bucketA.upload(`${A_ID}/grande.png`, Buffer.alloc(5 * 1024 * 1024 + 1), { contentType: 'image/png' })
check(!!r.error, 'Se rechazan archivos de más de 5 MB')

const publicUrl = bucketA.getPublicUrl(`${A_ID}/verify.png`).data.publicUrl
const res = await fetch(publicUrl)
check(res.ok, 'Cualquiera puede ver la imagen por su URL pública')

r = await bucketB.upload(`${B_ID}/verify-b.png`, PNG, { contentType: 'image/png', upsert: true })
if (r.error) throw r.error
await bucketA.remove([`${B_ID}/verify-b.png`])
const { data: listB } = await bucketB.list(B_ID)
check(listB?.some((f) => f.name === 'verify-b.png'), 'A no puede borrar archivos de B')

const { data: listAsA } = await bucketA.list(B_ID)
check((listAsA ?? []).length === 0, 'A no puede listar la carpeta de B')

r = await bucketA.remove([`${A_ID}/verify.png`])
check(!r.error && r.data?.length === 1, 'A puede borrar sus propios archivos')
await bucketB.remove([`${B_ID}/verify-b.png`])

// -----------------------------------------------------------------------------
console.log(failures === 0 ? '\nTodas las verificaciones pasaron.' : `\n${failures} verificación(es) fallaron.`)
process.exit(failures === 0 ? 0 : 1)
