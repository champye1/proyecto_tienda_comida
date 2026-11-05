/**
 * Comanda de cocina: lo que se imprime para preparar un pedido.
 *
 * Pensada para impresoras térmicas de 80 mm (ancho ~72 mm), pero se lee bien en una hoja
 * normal. Letra grande, en negro y sin colores: las térmicas solo imprimen negro.
 * Incluye lo que necesita la cocina y el despacho: número, hora, tipo, productos con
 * opciones, notas, hora estimada, cliente (nombre, teléfono, dirección) y total a cobrar.
 *
 * Preferencia "imprimir automáticamente al confirmar": se guarda en este dispositivo
 * (la tablet de la cocina), no en la cuenta.
 */
import { formatCLP, formatDateTime, formatTime } from '@/lib/format'
import { optionNames, type AdminOrder } from './api'

export function KitchenTicket({ order, restaurantName, timeZone }: { order: AdminOrder; restaurantName: string; timeZone: string }) {
  return (
    <div className="w-[72mm] font-mono text-[13px] leading-snug text-black">
      <p className="text-center text-sm font-bold">{restaurantName}</p>
      <p className="mt-1 text-center text-3xl font-black">#{order.order_number}</p>
      <p className="text-center text-base font-bold uppercase">{order.type === 'delivery' ? 'Delivery' : 'Retiro en local'}</p>
      <p className="text-center">{formatDateTime(order.created_at, timeZone)}</p>
      {order.estimated_ready_at && <p className="text-center font-bold">Listo aprox.: {formatTime(order.estimated_ready_at, timeZone)}</p>}

      <hr className="my-2 border-t border-dashed border-black" />
      <ul className="space-y-1.5">
        {order.order_items.map((it) => (
          <li key={it.id}>
            <p className="text-base font-bold">
              {it.quantity} × {it.product_name}
            </p>
            {optionNames(it.selected_options) && <p className="pl-4">+ {optionNames(it.selected_options)}</p>}
          </li>
        ))}
      </ul>
      {order.notes && (
        <>
          <hr className="my-2 border-t border-dashed border-black" />
          <p className="font-bold">NOTA: {order.notes}</p>
        </>
      )}

      <hr className="my-2 border-t border-dashed border-black" />
      <p className="font-bold">{order.customer_name}</p>
      <p>{order.customer_phone}</p>
      {order.address && <p>{order.address}</p>}

      <hr className="my-2 border-t border-dashed border-black" />
      {order.delivery_fee > 0 && (
        <p className="flex justify-between">
          <span>Delivery</span>
          <span>{formatCLP(order.delivery_fee)}</span>
        </p>
      )}
      <p className="flex justify-between text-base font-bold">
        <span>TOTAL</span>
        <span>{formatCLP(order.total)}</span>
      </p>
      <p>Pago: {order.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}</p>
    </div>
  )
}

const AUTO_PRINT_KEY = 'pedidos:autoprint:v1'

/** ¿Imprimir la comanda automáticamente al confirmar un pedido? (solo en este dispositivo) */
export function readAutoPrint(): boolean {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveAutoPrint(on: boolean) {
  try {
    localStorage.setItem(AUTO_PRINT_KEY, on ? 'on' : 'off')
  } catch {
    /* almacenamiento no disponible */
  }
}
