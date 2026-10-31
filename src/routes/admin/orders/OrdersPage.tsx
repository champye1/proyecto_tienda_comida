/**
 * Pedidos (/admin/pedidos): tablero en vivo y historial.
 *
 * Tablero: columnas Nuevos → Confirmados → En preparación → Listos. En tablet horizontal
 * se ven las 4; en pantallas angostas se desplazan de lado. Los datos y el sonido vienen
 * de OrdersLive (siempre activo en el panel).
 * Historial: todos los pedidos, del más nuevo al más antiguo, paginados.
 */
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import {
  BOARD_COLUMNS,
  orderHistoryQuery,
  STATUS_BADGE,
  STATUS_LABEL,
  useUpdateOrderStatus,
  type AdminOrder,
} from '@/features/orders/api'
import { useOrdersLive } from '@/features/orders/OrdersLive'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { OrderCard } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'

export default function OrdersPage() {
  const { restaurant } = useCurrentRestaurant()
  const { orders, isLoading, error, live, sound } = useOrdersLive()
  const [tab, setTab] = useState<'board' | 'history'>('board')
  const [detail, setDetail] = useState<AdminOrder | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-900">Pedidos</h1>
          <LiveBadge status={live} />
        </div>
        <Button variant="secondary" onClick={sound.toggle} aria-pressed={sound.enabled}>
          {sound.enabled ? '🔔 Sonido activado' : '🔕 Sonido desactivado'}
        </Button>
      </div>

      {!restaurant.is_open && (
        <Alert tone="info">Tu local está <strong>cerrado</strong>: los clientes no pueden hacer pedidos. Ábrelo con el interruptor de arriba.</Alert>
      )}

      <div role="tablist" aria-label="Vista de pedidos" className="flex gap-1 border-b border-zinc-200">
        {(
          [
            ['board', `En curso${orders ? ` (${orders.length})` : ''}`],
            ['history', 'Historial'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${
              tab === id ? 'border-brand text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        isLoading ? (
          <PageLoader />
        ) : error ? (
          <Alert tone="error">{dbErrorMessage(error)}</Alert>
        ) : (
          <Board orders={orders ?? []} onOpen={setDetail} />
        )
      ) : (
        <History onOpen={setDetail} />
      )}

      <OrderDetailModal rid={restaurant.id} order={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

/** Indicador de la conexión en vivo. */
function LiveBadge({ status }: { status: 'connecting' | 'live' | 'offline' }) {
  const map = {
    live: ['bg-emerald-500', 'En vivo', 'text-emerald-800 bg-emerald-50'],
    connecting: ['bg-zinc-400', 'Conectando…', 'text-zinc-700 bg-zinc-100'],
    offline: ['bg-amber-500', 'Reconectando…', 'text-amber-900 bg-amber-50'],
  } as const
  const [dot, text, pill] = map[status]
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${pill}`}>
      <span className={`size-2 rounded-full ${dot} ${status === 'live' ? 'motion-safe:animate-pulse' : ''}`} />
      {text}
    </span>
  )
}

/** Tablero por estado. */
function Board({ orders, onOpen }: { orders: AdminOrder[]; onOpen: (o: AdminOrder) => void }) {
  const { restaurant } = useCurrentRestaurant()
  const { freshIds } = useOrdersLive()
  const update = useUpdateOrderStatus(restaurant.id)
  const now = useNow()

  return (
    <div className="space-y-3">
      {update.isError && <Alert tone="error">{dbErrorMessage(update.error)}</Alert>}
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {BOARD_COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status)
          return (
            <section
              key={col.status}
              aria-label={`${col.title}: ${list.length}`}
              className="flex w-[80vw] max-w-xs shrink-0 snap-start flex-col gap-3 rounded-2xl bg-zinc-100 p-3 lg:w-auto lg:max-w-none"
            >
              <h2 className="flex items-center gap-2 px-1 text-sm font-semibold text-zinc-700">
                <span className={`size-2.5 rounded-full ${col.dot}`} />
                {col.title}
                <span className="ml-auto rounded-full bg-white px-2 text-xs text-zinc-600">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-zinc-500">Sin pedidos</p>
              ) : (
                list.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    now={now}
                    fresh={freshIds.has(o.id)}
                    busy={update.isPending && update.variables?.id === o.id}
                    onAdvance={(status) => update.mutate({ id: o.id, status })}
                    onOpen={() => onOpen(o)}
                  />
                ))
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Historial paginado. */
function History({ onOpen }: { onOpen: (o: AdminOrder) => void }) {
  const { restaurant } = useCurrentRestaurant()
  const query = useInfiniteQuery(orderHistoryQuery(restaurant.id))

  if (query.isPending) return <PageLoader />
  if (query.isError) return <Alert tone="error">{dbErrorMessage(query.error)}</Alert>
  const orders = query.data.pages.flat()
  if (orders.length === 0) return <p className="py-10 text-center text-zinc-500">Todavía no hay pedidos.</p>

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {orders.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => onOpen(o)} className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-zinc-50">
              <span className="w-14 font-bold text-zinc-900">#{o.order_number}</span>
              <span className="min-w-[8rem] flex-1">
                <span className="block truncate font-medium text-zinc-900">{o.customer_name}</span>
                <span className="block text-xs text-zinc-500">
                  {new Date(o.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                  {o.type === 'delivery' ? 'Delivery' : 'Retiro'}
                </span>
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
              <span className="w-20 text-right font-semibold tabular-nums">{formatCLP(o.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
            Cargar más pedidos
          </Button>
        </div>
      )}
    </div>
  )
}
