/**
 * Pedido confirmado y seguimiento (/r/:slug/pedido/:token).
 *
 * El token de 48 caracteres es la "llave" del pedido: quien tiene el link puede ver el
 * estado, sin iniciar sesión. Por eso:
 *   - Se valida su formato antes de consultar.
 *   - get_order_by_token nunca devuelve teléfono, nombre ni dirección del cliente.
 *   - La página es noindex (no aparece en buscadores).
 * El estado se actualiza en vivo (Realtime, ver features/store/orderLive.ts) y, como
 * respaldo, se consulta cada 60 s y al volver a la pestaña.
 */
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { useDocumentMeta } from '@/features/store/appearance'
import { useOrderLiveUpdates } from '@/features/store/orderLive'
import { FINAL_STATUSES, statusLabel, TRACKING_TOKEN, trackedOrderQuery, type OrderStatus, type TrackedOrder } from '@/features/store/orders'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'

/** Pasos del pedido en orden (cancelado se muestra aparte). */
const STEPS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered']

export default function OrderPage() {
  const { slug = '', token = '' } = useParams()
  const validToken = TRACKING_TOKEN.test(token)
  const query = useQuery({
    ...trackedOrderQuery(token),
    enabled: validToken,
    // Respaldo por si se pierde un aviso en vivo: consulta cada 60 s hasta que el pedido termine.
    refetchInterval: (q) => (q.state.data && FINAL_STATUSES.includes(q.state.data.status) ? false : 60_000),
    refetchOnWindowFocus: true,
  })
  const queryClient = useQueryClient()
  const finished = query.data ? FINAL_STATUSES.includes(query.data.status) : false
  // En vivo: cada aviso del restaurante vuelve a pedir el estado real al servidor.
  useOrderLiveUpdates(token, validToken && !finished, () => {
    void queryClient.invalidateQueries({ queryKey: trackedOrderQuery(token).queryKey })
  })
  useDocumentMeta({ title: 'Tu pedido', noindex: true })

  if (validToken && query.isPending) return <PageLoader />
  if (query.isError) return <Shell slug={slug}><Alert tone="error">{dbErrorMessage(query.error)}</Alert></Shell>
  if (!validToken || !query.data) {
    return (
      <Shell slug={slug}>
        <h1 className="text-xl font-bold text-zinc-900">Pedido no encontrado</h1>
        <p className="text-zinc-600">Revisa que el link esté completo.</p>
      </Shell>
    )
  }
  return <OrderDetail order={query.data} />
}

function OrderDetail({ order }: { order: TrackedOrder }) {
  const [copied, setCopied] = useState(false)
  const cancelled = order.status === 'cancelled'
  const currentStep = STEPS.indexOf(order.status)
  const phoneDigits = order.restaurant.phone?.replace(/\D/g, '') ?? ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      /* el link se puede copiar desde la barra del navegador */
    }
  }

  return (
    <Shell slug={order.restaurant.slug}>
      <div className="w-full space-y-5 text-left">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-zinc-500">{order.restaurant.name}</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">
            {cancelled ? 'Pedido cancelado' : order.status === 'pending' ? '¡Pedido recibido!' : statusLabel(order.status, order.type)}
          </h1>
          <p className="mt-1 text-4xl font-black tracking-tight text-brand">#{order.order_number}</p>
          <p className="mt-2 text-sm text-zinc-600">
            {order.type === 'delivery' ? 'Delivery' : 'Retiro en el local'} · {order.payment_method === 'cash' ? 'Pago en efectivo' : 'Pago por transferencia'}
          </p>
        </div>

        {!cancelled && (
          <ol className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5" aria-label="Estado del pedido">
            {STEPS.map((s, i) => {
              const done = i < currentStep
              const now = i === currentStep
              return (
                <li key={s} className="flex items-center gap-3" aria-current={now ? 'step' : undefined}>
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      done ? 'bg-emerald-500 text-white' : now ? 'bg-brand text-brand-contrast' : 'bg-zinc-100 text-zinc-400'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={now ? 'font-semibold text-zinc-900' : done ? 'text-zinc-700' : 'text-zinc-500'}>
                    {statusLabel(s, order.type)}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Detalle</h2>
          <ul className="mt-3 divide-y divide-zinc-100 text-sm">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  {it.quantity}× {it.product_name}
                  {it.selected_options.length > 0 && (
                    <span className="block text-zinc-500">{it.selected_options.map((o) => o.name).join(' · ')}</span>
                  )}
                </span>
                <span className="tabular-nums">{formatCLP(it.line_total)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1 border-t border-zinc-200 pt-3 text-sm">
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

        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          <p>Guarda este link para revisar el estado de tu pedido. El estado se actualiza solo.</p>
          <button type="button" onClick={copyLink} className="min-h-11 rounded-lg border border-zinc-300 px-4 font-semibold text-zinc-800 hover:bg-zinc-50">
            {copied ? 'Link copiado ✓' : 'Copiar link del pedido'}
          </button>
          {phoneDigits && (
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={`tel:+${phoneDigits}`} className="min-h-11 rounded-lg px-1 py-2.5 font-semibold text-zinc-800 hover:underline">
                Llamar al restaurante
              </a>
              <a
                href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hola, consulto por mi pedido #${order.order_number}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-11 rounded-lg px-1 py-2.5 font-semibold text-emerald-700 hover:underline"
              >
                Escribir por WhatsApp
              </a>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

/** Marco común de la página del pedido. */
function Shell({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 px-4 py-8 text-center">
      {children}
      <Link to={`/r/${slug}`} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">
        Volver a la tienda
      </Link>
    </main>
  )
}
