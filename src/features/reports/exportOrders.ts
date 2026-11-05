/**
 * Exportar los pedidos de un período a Excel (CSV): una fila por producto pedido, con los
 * datos del pedido repetidos, para poder filtrar y hacer tablas dinámicas.
 *
 * - Lee la tabla orders con la sesión del usuario: la RLS solo deja ver los pedidos del
 *   propio restaurante. Se pagina de a 1000 (máximo de la API) con un tope de 20.000.
 * - Las fechas usan la zona horaria del restaurante; los montos van como números.
 */
import type { MyRestaurant } from '@/features/restaurants/api'
import { downloadCsv, type CsvCell } from '@/lib/csv'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { optionNames } from '@/features/orders/api'
import { addDays } from './api'

const PAGE = 1000
const MAX_ROWS = 20_000

const STATUS: Record<string, string> = {
  pending: 'Nuevo',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

/** Inicio (inclusive) y fin (exclusivo) del rango en UTC, a partir de días en la zona del restaurante. */
function utcRange(from: string, to: string, timeZone: string): [string, string] {
  // Desfase de la zona en ese día: se calcula con Intl para respetar el horario de verano.
  const offset = (date: string) => {
    const probe = new Date(`${date}T12:00:00Z`)
    const local = new Date(probe.toLocaleString('en-US', { timeZone }))
    const utc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }))
    return local.getTime() - utc.getTime()
  }
  const start = new Date(new Date(`${from}T00:00:00Z`).getTime() - offset(from))
  const endDay = addDays(to, 1)
  const end = new Date(new Date(`${endDay}T00:00:00Z`).getTime() - offset(endDay))
  return [start.toISOString(), end.toISOString()]
}

/** Descarga los pedidos del período como CSV para Excel (una fila por producto pedido). */
export async function exportOrdersCsv(restaurant: Pick<MyRestaurant, 'id' | 'slug' | 'timezone'>, from: string, to: string) {
  const [start, end] = utcRange(from, to, restaurant.timezone)
  const rows: CsvCell[][] = []

  for (let page = 0; page * PAGE < MAX_ROWS; page++) {
    const { data, error } = await supabase
      .from('orders')
      .select('order_number, created_at, status, type, payment_method, customer_name, customer_phone, address, notes, subtotal, delivery_fee, total, order_items(product_name, quantity, unit_price, line_total, selected_options)')
      .eq('restaurant_id', restaurant.id)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw error

    for (const o of data) {
      const base: CsvCell[] = [
        o.order_number,
        formatDateTime(o.created_at, restaurant.timezone),
        STATUS[o.status] ?? o.status,
        o.type === 'delivery' ? 'Delivery' : 'Retiro',
        o.payment_method === 'cash' ? 'Efectivo' : 'Transferencia',
        o.customer_name,
        o.customer_phone,
        o.address,
        o.notes,
      ]
      for (const it of o.order_items) {
        rows.push([...base, it.product_name, optionNames(it.selected_options), it.quantity, it.unit_price, it.line_total, o.subtotal, o.delivery_fee, o.total])
      }
    }
    if (data.length < PAGE) break
  }

  downloadCsv(
    `pedidos-${restaurant.slug}-${from}_${to}.csv`,
    ['N.º pedido', 'Fecha', 'Estado', 'Tipo', 'Pago', 'Cliente', 'Teléfono', 'Dirección', 'Nota', 'Producto', 'Opciones', 'Cantidad', 'Precio unitario', 'Total línea', 'Subtotal pedido', 'Delivery', 'Total pedido'],
    rows,
  )
}
