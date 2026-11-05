/**
 * Tarjeta de pedido del tablero: número, hace cuánto llegó, tipo, cliente, resumen de
 * productos, notas y el botón grande de la siguiente acción (pensado para tablet).
 * - Pedido recién llegado: borde de color que pulsa unos segundos.
 * - Pedido "Nuevo" con más de 5 minutos sin confirmar: el tiempo se marca en ámbar.
 * - "Confirmar" usa el tiempo habitual del local (un toque); otro tiempo se elige en el detalle.
 * - En cocina muestra la hora estimada y, si ya pasó, cuántos minutos va atrasado (en rojo).
 * - Pedido programado: etiqueta violeta con el día y la hora para la que lo pidieron.
 */
import { etaMinutesLeft, nextAction, optionNames, timeAgo, type AdminOrder, type OrderStatus } from '@/features/orders/api'
import { formatCLP, formatDateTime, formatTime } from '@/lib/format'

type OrderCardProps = {
  order: AdminOrder
  now: number
  fresh: boolean
  busy: boolean
  /** Tiempo habitual de preparación del local (para el botón Confirmar). */
  prepMinutes: number
  timeZone: string
  onAdvance: (status: OrderStatus) => void
  onConfirm: () => void
  onOpen: () => void
}

/** Cuántas líneas de productos se muestran en la tarjeta antes de "y N más". */
const MAX_LINES = 3

/** Tarjeta de un pedido en el tablero, con su acción principal. */
export function OrderCard({ order, now, fresh, busy, prepMinutes, timeZone, onAdvance, onConfirm, onOpen }: OrderCardProps) {
  const action = nextAction(order)
  const minutes = (now - new Date(order.created_at).getTime()) / 60_000
  const late = order.status === 'pending' && minutes > 5
  const extra = order.order_items.length - MAX_LINES
  const left = etaMinutesLeft(order, now)

  return (
    <article
      aria-label={`Pedido ${order.order_number}`}
      className={`rounded-xl border bg-white shadow-sm ${
        fresh ? 'border-brand ring-2 ring-brand/40 motion-safe:animate-pulse' : 'border-zinc-200'
      }`}
    >
      <button type="button" onClick={onOpen} className="block w-full p-3 text-left" aria-label={`Ver detalle del pedido ${order.order_number}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold text-zinc-900">#{order.order_number}</p>
            <p className={`text-xs font-medium ${late ? 'text-amber-700' : 'text-zinc-500'}`}>{timeAgo(order.created_at, now)}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{formatCLP(order.total)}</p>
            <p className="text-xs text-zinc-500">
              {order.type === 'delivery' ? 'Delivery' : 'Retiro'} · {order.payment_method === 'cash' ? 'Efectivo' : 'Transf.'}
            </p>
          </div>
        </div>
        {left !== null && order.estimated_ready_at && (
          <p className={`mt-2 text-xs font-semibold ${left < 0 ? 'text-red-700' : 'text-zinc-600'}`}>
            {left < 0
              ? `Atrasado ${-left} min (era ${formatTime(order.estimated_ready_at, timeZone)})`
              : `Listo aprox. ${formatTime(order.estimated_ready_at, timeZone)} · en ${left} min`}
          </p>
        )}
        {order.payment_method === 'transfer' && order.payment_status !== 'verified' && order.status !== 'cancelled' && (
          <p className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${order.payment_status === 'reported' ? 'bg-sky-100 text-sky-900' : 'bg-zinc-100 text-zinc-700'}`}>
            {order.payment_status === 'reported' ? 'Transferencia informada' : 'Transferencia pendiente'}
          </p>
        )}
        {order.scheduled_for && (
          <p className="mt-2 inline-block rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
            Programado: {formatDateTime(order.scheduled_for, timeZone)}
          </p>
        )}
        <p className="mt-2 truncate text-sm font-medium text-zinc-800">{order.customer_name}</p>
        <ul className="mt-1 space-y-0.5 text-sm text-zinc-700">
          {order.order_items.slice(0, MAX_LINES).map((it) => (
            <li key={it.id} className="truncate">
              <span className="font-semibold">{it.quantity}×</span> {it.product_name}
              {optionNames(it.selected_options) && <span className="text-zinc-500"> ({optionNames(it.selected_options)})</span>}
            </li>
          ))}
          {extra > 0 && <li className="text-zinc-500">y {extra} más…</li>}
        </ul>
        {order.notes && <p className="mt-2 line-clamp-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">Nota: {order.notes}</p>}
      </button>
      {action && (
        <div className="border-t border-zinc-100 p-2">
          <button
            type="button"
            onClick={() => (order.status === 'pending' ? onConfirm() : onAdvance(action.to))}
            disabled={busy}
            className="flex min-h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {order.status === 'pending' ? `${action.label} · ${prepMinutes} min` : action.label}
          </button>
        </div>
      )}
    </article>
  )
}
