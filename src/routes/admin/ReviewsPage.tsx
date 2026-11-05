/**
 * Reseñas (/admin/resenas): lo que opinan los clientes de sus pedidos entregados.
 *
 * - Promedio, cantidad y distribución por estrellas (en texto, accesible sin colores).
 * - Lista de las últimas 200 con número de pedido, cliente y comentario.
 * - Las reseñas solo llegan de pedidos entregados y una por pedido (submit_review).
 *   Los comentarios se muestran como texto: React los escapa (sin riesgo de HTML inyectado).
 */
import { queryOptions, useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'

function reviewsQuery(rid: string) {
  return queryOptions({
    queryKey: ['reviews', rid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_reviews')
        .select('id, rating, comment, created_at, order:orders(order_number, customer_name)')
        .eq('restaurant_id', rid)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data
    },
  })
}

/** "★★★★☆" con el número como texto para lectores de pantalla. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} de 5 estrellas`}>
      <span aria-hidden>{'★'.repeat(rating) + '☆'.repeat(5 - rating)}</span>
    </span>
  )
}

/** Página de reseñas: promedio, distribución por estrellas y comentarios. */
export default function ReviewsPage() {
  const { restaurant } = useCurrentRestaurant()
  const query = useQuery(reviewsQuery(restaurant.id))

  if (query.isPending) return <PageLoader />
  if (query.isError) return <Alert tone="error">{dbErrorMessage(query.error)}</Alert>

  const reviews = query.data
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
  const byStars = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }))

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Reseñas</h1>
        <p className="mt-1 text-sm text-zinc-600">Tus clientes califican su pedido desde la página de seguimiento, una vez entregado.</p>
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-600">Todavía no hay reseñas.</p>
      ) : (
        <>
          <section className="grid gap-5 rounded-2xl border border-zinc-200 bg-white p-6 sm:grid-cols-[auto_1fr]">
            <div className="text-center">
              <p className="text-5xl font-black text-zinc-900">{avg.toFixed(1).replace('.', ',')}</p>
              <Stars rating={Math.round(avg)} />
              <p className="text-sm text-zinc-500">
                {reviews.length} reseña{reviews.length === 1 ? '' : 's'}
              </p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {byStars.map(({ n, count }) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="w-10 text-zinc-600">{n} ★</span>
                  <span aria-hidden className="h-2 flex-1 rounded-full bg-zinc-100">
                    <span className="block h-2 rounded-full bg-amber-400" style={{ width: `${(count / reviews.length) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-zinc-700">{count}</span>
                </li>
              ))}
            </ul>
          </section>

          <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            {reviews.map((r) => (
              <li key={r.id} className="space-y-1 p-4">
                <div className="flex flex-wrap items-center gap-x-3 text-sm">
                  <Stars rating={r.rating} />
                  <span className="font-medium text-zinc-900">{r.order?.customer_name}</span>
                  <span className="text-zinc-500">
                    Pedido #{r.order?.order_number} · {formatDateTime(r.created_at, restaurant.timezone)}
                  </span>
                </div>
                {r.comment && <p className="whitespace-pre-line text-zinc-700">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
