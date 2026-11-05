/**
 * Partes de la página de seguimiento ligadas a la fidelización (etapa D):
 *
 *   LoyaltyStatus  la tarjeta de sellos del cliente ("3 de 10") y, si completó una, su
 *                  cupón de premio con botón para copiarlo.
 *   ReviewForm     calificar el pedido (1 a 5 estrellas + comentario) una vez entregado.
 *                  A quien pone 5 estrellas se le invita a dejar la reseña en Google si el
 *                  local configuró su link.
 *
 * Todo pasa por el token secreto del pedido (submit_review, get_order_by_token).
 */
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TrackedOrder } from '@/features/store/orders'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { publicRpc } from '@/lib/publicApi'

/** Tarjeta de sellos del cliente y su cupón de premio (si completó una). */
export function LoyaltyStatus({ loyalty }: { loyalty: NonNullable<TrackedOrder['loyalty']> }) {
  const [copied, setCopied] = useState(false)
  const reward = loyalty.reward_kind === 'percent' ? `${loyalty.reward_value}% de descuento` : `${formatCLP(loyalty.reward_value)} de descuento`

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      /* el código queda visible para copiarlo a mano */
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5" aria-labelledby="loyalty-title">
      <h2 id="loyalty-title" className="font-semibold text-zinc-900">
        Tu tarjeta de sellos
      </h2>
      <p className="text-sm text-zinc-600">
        Llevas <strong>{loyalty.stamps}</strong> de {loyalty.required} sellos. Al completarla ganas {reward}.
      </p>
      <ol className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: loyalty.required }, (_, i) => (
          <li
            key={i}
            className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${i < loyalty.stamps ? 'bg-brand text-brand-contrast' : 'bg-zinc-100 text-zinc-400'}`}
          >
            {i < loyalty.stamps ? '★' : i + 1}
          </li>
        ))}
      </ol>
      {loyalty.reward_code && (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
          <p>
            🎉 ¡Completaste tu tarjeta! Usa este código en tu próximo pedido ({reward}, una vez, con este mismo teléfono):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-white px-3 py-2 font-mono text-lg font-bold">{loyalty.reward_code}</span>
            <button type="button" onClick={() => copy(loyalty.reward_code ?? '')} className="min-h-11 rounded-lg border border-emerald-300 px-3 font-semibold hover:bg-emerald-100">
              {copied ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Calificación del pedido entregado (o el agradecimiento si ya calificó). */
export function ReviewForm({ token, order }: { token: string; order: TrackedOrder }) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const review = order.review

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (rating === 0) return setError('Elige de 1 a 5 estrellas.')
    setSending(true)
    setError(null)
    try {
      await publicRpc('submit_review', { p_token: token, p_rating: rating, p_comment: comment })
      await queryClient.invalidateQueries({ queryKey: ['store', 'order', token] })
    } catch (err) {
      setError(dbErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (review) {
    return (
      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 text-center">
        <p className="font-semibold text-zinc-900">¡Gracias por tu opinión!</p>
        <p className="text-2xl text-amber-500" aria-label={`Calificaste con ${review.rating} de 5 estrellas`}>
          <span aria-hidden>{'★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)}</span>
        </p>
        {review.rating === 5 && order.restaurant.google_review_url && (
          <a
            href={order.restaurant.google_review_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Déjanos tu reseña en Google
          </a>
        )}
      </section>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold text-zinc-900">¿Qué te pareció tu pedido?</h2>
      <fieldset>
        <legend className="sr-only">Calificación</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" />
              <span
                aria-hidden
                className={`flex size-11 items-center justify-center rounded-lg text-3xl peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900 ${n <= rating ? 'text-amber-500' : 'text-zinc-300'}`}
              >
                ★
              </span>
              <span className="sr-only">
                {n} estrella{n === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-zinc-800">Comentario (opcional)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className="block w-full rounded-lg border border-zinc-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={sending} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-contrast disabled:opacity-50">
        {sending ? 'Enviando…' : 'Enviar calificación'}
      </button>
    </form>
  )
}
