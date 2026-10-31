/**
 * Detalle completo de un pedido: cliente (con botones para llamar o escribir por WhatsApp),
 * dirección, notas, productos con sus opciones, totales y acciones de estado.
 * Cancelar pide confirmación porque no se puede deshacer.
 */
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  nextAction,
  optionNames,
  STATUS_BADGE,
  STATUS_LABEL,
  useUpdateOrderStatus,
  type AdminOrder,
} from '@/features/orders/api'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'

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
  const update = useUpdateOrderStatus(rid)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const action = nextAction(order)
  const final = order.status === 'delivered' || order.status === 'cancelled'
  const phoneDigits = order.customer_phone.replace(/\D/g, '')

  function change(status: AdminOrder['status']) {
    update.mutate({ id: order.id, status }, { onSuccess: onClose })
  }

  return (
    <div className="max-h-[70dvh] space-y-5 overflow-y-auto">
      {update.isError && <Alert tone="error">{dbErrorMessage(update.error)}</Alert>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${STATUS_BADGE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">
          {order.type === 'delivery' ? 'Delivery' : 'Retiro en local'}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">
          {order.payment_method === 'cash' ? 'Efectivo' : 'Transferencia'}
        </span>
        <span className="text-zinc-500">{new Date(order.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>

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

      {!final && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          {action && (
            <Button onClick={() => change(action.to)} loading={update.isPending}>
              {action.label}
            </Button>
          )}
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
