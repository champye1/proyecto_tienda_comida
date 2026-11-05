/**
 * Detalle completo de un pedido: cliente (con botones para llamar o escribir por WhatsApp),
 * dirección, notas, productos con sus opciones, totales y acciones de estado.
 * - Pedido nuevo: se elige en cuánto estará listo (por defecto, el tiempo habitual del local)
 *   y se confirma; el cliente ve esa hora en su seguimiento.
 * - En cocina: se ve la hora estimada y se puede ajustar (+5, +10, +15 min).
 * - "Imprimir comanda" y la opción de imprimirla automáticamente al confirmar (por dispositivo).
 * Cancelar pide confirmación porque no se puede deshacer.
 */
import { useState } from 'react'
import { usePrint } from '@/components/Print'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  etaChoices,
  etaMinutesLeft,
  nextAction,
  optionNames,
  STATUS_BADGE,
  STATUS_LABEL,
  useConfirmOrder,
  useSetOrderEstimate,
  useUpdateOrderStatus,
  type AdminOrder,
} from '@/features/orders/api'
import { KitchenTicket, readAutoPrint, saveAutoPrint } from '@/features/orders/KitchenTicket'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP, formatDateTime, formatTime } from '@/lib/format'
import { useNow } from '@/lib/useNow'

type OrderDetailModalProps = {
  rid: string
  order: AdminOrder | null
  onClose: () => void
}

export function OrderDetailModal({ rid, order, onClose }: OrderDetailModalProps) {
  return (
    <Modal open={order !== null} onClose={onClose} title={order ? `Pedido #${order.order_number}` : 'Pedido'} size="md">
      {order && <OrderDetail key={order.id} rid={rid} order={order} onClose={onClose} />}
    </Modal>
  )
}

function OrderDetail({ rid, order, onClose }: { rid: string; order: AdminOrder; onClose: () => void }) {
  const { restaurant } = useCurrentRestaurant()
  const update = useUpdateOrderStatus(rid)
  const confirm = useConfirmOrder(rid)
  const estimate = useSetOrderEstimate(rid)
  const { print, portal } = usePrint()
  const now = useNow()
  const [minutes, setMinutes] = useState(restaurant.prep_time_minutes)
  const [autoPrint, setAutoPrint] = useState(readAutoPrint)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const left = etaMinutesLeft(order, now)
  const error = update.error ?? confirm.error ?? estimate.error

  const printTicket = (o: AdminOrder) =>
    print(<KitchenTicket order={o} restaurantName={restaurant.name} timeZone={restaurant.timezone} />)

  /** Confirma con el tiempo elegido; imprime la comanda si está activada la impresión automática. */
  function confirmWithEta() {
    confirm.mutate(
      { id: order.id, minutes },
      {
        onSuccess: (updated) => {
          if (autoPrint) printTicket({ ...order, ...updated })
          onClose()
        },
      },
    )
  }
  const action = nextAction(order)
  const final = order.status === 'delivered' || order.status === 'cancelled'
  const phoneDigits = order.customer_phone.replace(/\D/g, '')

  function change(status: AdminOrder['status']) {
    update.mutate({ id: order.id, status }, { onSuccess: onClose })
  }

  return (
    <div className="max-h-[70dvh] space-y-5 overflow-y-auto">
      {error && <Alert tone="error">{dbErrorMessage(error)}</Alert>}
      {portal}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${STATUS_BADGE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">
          {order.type === 'delivery' ? 'Delivery' : 'Retiro en local'}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">
          {order.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}
        </span>
        <span className="text-zinc-500">{formatDateTime(order.created_at, restaurant.timezone)}</span>
      </div>

      {left !== null && order.estimated_ready_at && (
        <section className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-3 text-sm">
          <span className={left < 0 ? 'font-semibold text-red-700' : 'font-semibold text-zinc-800'}>
            {left < 0 ? `Atrasado ${-left} min` : `Listo aprox. a las ${formatTime(order.estimated_ready_at, restaurant.timezone)}`}
          </span>
          <span className="ml-auto flex gap-1" aria-label="Ajustar el tiempo estimado">
            {[5, 10, 15].map((extra) => (
              <button
                key={extra}
                type="button"
                disabled={estimate.isPending}
                onClick={() => estimate.mutate({ id: order.id, minutes: Math.max(left, 0) + extra })}
                className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 font-semibold hover:bg-zinc-100 disabled:opacity-50"
              >
                +{extra} min
              </button>
            ))}
          </span>
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Cliente</h3>
        <p className="font-semibold text-zinc-900">{order.customer_name}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href={`tel:${order.customer_phone}`} className="font-medium text-zinc-800 underline">
            {order.customer_phone}
          </a>
          <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline">
            WhatsApp
          </a>
        </div>
        {order.address && (
          <p className="text-sm text-zinc-700">
            {order.address}{' '}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              Ver mapa
            </a>
          </p>
        )}
        {order.notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Nota: {order.notes}</p>}
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Productos</h3>
        <ul className="mt-2 divide-y divide-zinc-100 text-sm">
          {order.order_items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3 py-2">
              <span>
                <span className="font-semibold">{it.quantity}×</span> {it.product_name}
                {optionNames(it.selected_options) && <span className="block text-zinc-500">{optionNames(it.selected_options)}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatCLP(it.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-zinc-200 pt-2 text-sm">
          {order.delivery_fee > 0 && (
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd className="tabular-nums">{formatCLP(order.delivery_fee)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCLP(order.total)}</dd>
          </div>
        </dl>
      </section>

      {order.status === 'pending' && (
        <fieldset className="space-y-2 border-t border-zinc-100 pt-4">
          <legend className="text-sm font-semibold text-zinc-700">¿En cuánto estará listo?</legend>
          <div className="flex flex-wrap gap-2">
            {etaChoices(restaurant.prep_time_minutes).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minutes === m}
                onClick={() => setMinutes(m)}
                className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${
                  minutes === m ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-100 pt-4 text-sm">
        <Button variant="secondary" onClick={() => printTicket(order)}>
          Imprimir comanda
        </Button>
        <label className="flex min-h-11 items-center gap-2 text-zinc-700">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => {
              setAutoPrint(e.target.checked)
              saveAutoPrint(e.target.checked)
            }}
            className="size-5"
          />
          Imprimir automáticamente al confirmar (en este dispositivo)
        </label>
      </div>

      {!final && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          {action &&
            (order.status === 'pending' ? (
              <Button onClick={confirmWithEta} loading={confirm.isPending}>
                Confirmar · listo en {minutes} min
              </Button>
            ) : (
              <Button onClick={() => change(action.to)} loading={update.isPending}>
                {action.label}
              </Button>
            ))}
          {confirmCancel ? (
            <>
              <Button variant="danger" onClick={() => change('cancelled')} loading={update.isPending}>
                Sí, cancelar pedido
              </Button>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                No
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              {order.status === 'pending' ? 'Rechazar' : 'Cancelar pedido'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
