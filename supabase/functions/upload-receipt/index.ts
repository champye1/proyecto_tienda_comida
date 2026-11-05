/**
 * Edge Function "upload-receipt": el cliente sube la foto de su comprobante de
 * transferencia desde la página de seguimiento.
 *
 * Flujo:
 *   1. La tienda re-codifica la foto en el navegador (WebP, sin metadatos) y la envía como
 *      cuerpo binario, con el token secreto del pedido en la cabecera x-order-token.
 *   2. Se valida el token, el tamaño (máx. 2 MB) y el TIPO REAL del archivo por sus primeros
 *      bytes (no se confía en el Content-Type que manda el navegador).
 *   3. Se busca el pedido con la clave de servicio: debe ser por transferencia, no estar
 *      cancelado y no tener el pago ya verificado.
 *   4. Se guarda en el bucket PRIVADO payment-receipts, en {restaurant_id}/{order_id}/{uuid}.
 *      Ningún usuario puede escribir ahí directo: solo esta función.
 *   5. Se registra con la RPC report_payment (que vuelve a validar la carpeta del pedido).
 *      Si falla, se borra el archivo recién subido. Si había un comprobante anterior, se
 *      borra (queda solo el último).
 *
 * Seguridad: sin el token de 192 bits del pedido no se puede subir nada. Los errores
 * inesperados no se reenvían con detalle. CORS solo para el sitio propio (como place-order).
 */

import { createHttp, serviceHeaders, SUPABASE_URL } from '../_shared/http.ts'

const { cors, json } = createHttp(['x-order-token'])

const BUCKET = 'payment-receipts'
const MAX_BYTES = 2 * 1024 * 1024
const TOKEN = /^[0-9a-f]{48}$/

/** Tipo real de la imagen según sus primeros bytes ("firma"). null si no es WebP/JPEG/PNG. */
function sniff(bytes: Uint8Array): { ext: string; mime: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (bytes.length > 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' }
  return null
}

/** Borra un objeto del bucket (mejor esfuerzo: un fallo aquí no rompe la respuesta). */
async function removeObject(path: string) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ code: 'method', message: 'Método no permitido' }, 405, origin)

  // 1-2. Token, tamaño y tipo real.
  const token = req.headers.get('x-order-token') ?? ''
  if (!TOKEN.test(token)) return json({ code: '22023', message: 'Solicitud inválida.' }, 400, origin)
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) return json({ code: '22023', message: 'La imagen no puede pesar más de 2 MB.' }, 413, origin)
  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return json({ code: '22023', message: 'La imagen no puede pesar más de 2 MB.' }, 413, origin)
  const kind = sniff(bytes)
  if (!kind) return json({ code: '22023', message: 'El comprobante debe ser una imagen (foto o captura de pantalla).' }, 415, origin)

  // 3. Pedido.
  const lookup = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?tracking_token=eq.${token}&select=id,restaurant_id,payment_method,status,payment_status,payment_receipt_path`,
    { headers: serviceHeaders },
  )
  const rows = (await lookup.json().catch(() => [])) as Array<{
    id: string
    restaurant_id: string
    payment_method: string
    status: string
    payment_status: string
    payment_receipt_path: string | null
  }>
  const order = Array.isArray(rows) ? rows[0] : undefined
  if (!order) return json({ code: 'P0002', message: 'Pedido no encontrado' }, 404, origin)
  if (order.payment_method !== 'transfer' || order.status === 'cancelled' || order.payment_status === 'verified') {
    return json({ code: 'P0001', message: 'Este pedido no admite comprobantes de pago.' }, 400, origin)
  }

  // 4. Subir al bucket privado.
  const path = `${order.restaurant_id}/${order.id}/${crypto.randomUUID()}.${kind.ext}`
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'Content-Type': kind.mime, 'x-upsert': 'false' },
    body: bytes,
  })
  if (!upload.ok) {
    console.error('upload-receipt: falló la subida', upload.status, await upload.text().catch(() => ''))
    return json({ code: 'unexpected', message: 'No pudimos guardar el comprobante. Intenta de nuevo.' }, 500, origin)
  }

  // 5. Registrar (la RPC valida otra vez que la ruta sea de este pedido).
  const report = await fetch(`${SUPABASE_URL}/rest/v1/rpc/report_payment`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token, p_receipt_path: path }),
  })
  if (!report.ok) {
    await removeObject(path)
    const err = (await report.json().catch(() => ({}))) as { code?: string; message?: string }
    if (err.code === 'P0001' || err.code === 'P0002') return json({ code: err.code, message: err.message }, 400, origin)
    console.error('upload-receipt: report_payment falló', report.status, err)
    return json({ code: 'unexpected', message: 'No pudimos registrar el comprobante.' }, 500, origin)
  }

  if (order.payment_receipt_path) await removeObject(order.payment_receipt_path)
  return json({ ok: true }, 200, origin)
})
