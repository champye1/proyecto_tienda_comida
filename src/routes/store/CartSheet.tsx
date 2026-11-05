/**
 * Carrito: líneas con cantidad editable (y su promoción, si tiene), subtotal y aviso de
 * pedido mínimo. Debajo, "¿Agregas algo más?": los productos que el local marcó para
 * sugerir (sin opciones obligatorias, se agregan con un toque).
 * "Continuar" lleva al checkout si se cumple el mínimo y el local está abierto, o si está
 * cerrado por horario pero acepta pedidos programados.
 */
import { useNavigate } from 'react-router'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Sheet } from '@/components/ui/Sheet'
import { useStoreOpen } from '@/features/store/useStoreOpen'
import { formatCLP } from '@/lib/format'
import { useStore } from './StoreRoot'

/** Hoja del carrito de la tienda. */
export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug, menu, cart, lines, subtotal } = useStore()
  const navigate = useNavigate()
  const { restaurant } = menu
  const { open: storeOpen, opensAt } = useStoreOpen(restaurant)
  const missing = Math.max(0, restaurant.min_order - subtotal)
  // Cerrado por horario pero acepta programados: se puede continuar y elegir la hora.
  const canSchedule = restaurant.is_open_manual && restaurant.scheduling_days > 0
  const inCart = new Set(lines.map((l) => l.productId))
  const suggestions = menu.categories
    .flatMap((c) => c.products)
    .filter((p) => p.is_upsell && !inCart.has(p.id) && p.option_groups.every((g) => g.min_select === 0))
    .slice(0, 4)

  return (
    <Sheet open={open} onClose={onClose} label="Tu carrito">
      <div className="flex max-h-[92dvh] flex-col sm:max-h-[85dvh]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-bold text-zinc-900">Tu pedido</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-10 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-zinc-500">Tu carrito está vacío.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {lines.map((l) => (
                <li key={l.key} className="flex items-start gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900">{l.product.name}</p>
                    {l.optionsText && <p className="text-sm text-zinc-500">{l.optionsText}</p>}
                    <p className="mt-1 text-sm text-zinc-600">{formatCLP(l.unitPrice)} c/u</p>
                    {l.discount > 0 && l.product.promo && (
                      <p className="text-sm font-medium text-emerald-700">
                        {l.product.promo.name}: −{formatCLP(l.discount)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-semibold tabular-nums">{formatCLP(l.lineTotal)}</span>
                    <QuantityStepper value={l.quantity} onChange={(q) => cart.setQuantity(l.key, q)} min={0} itemName={l.product.name} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 && suggestions.length > 0 && (
            <section aria-labelledby="upsell-title" className="border-t border-zinc-100 py-4">
              <h3 id="upsell-title" className="mb-2 text-sm font-semibold text-zinc-700">
                ¿Agregas algo más?
              </h3>
              <ul className="space-y-2">
                {suggestions.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{p.name}</span>
                    <span className="text-sm tabular-nums text-zinc-600">{formatCLP(p.price)}</span>
                    <button
                      type="button"
                      onClick={() => cart.add(p.id, [], 1)}
                      aria-label={`Agregar ${p.name}`}
                      className="min-h-10 rounded-lg border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50"
                    >
                      + Agregar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {lines.length > 0 && (
          <div className="space-y-3 border-t border-zinc-200 bg-white px-5 py-4">
            <div className="flex justify-between font-semibold">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCLP(subtotal)}</span>
            </div>
            {restaurant.delivery_enabled && restaurant.delivery_fee > 0 && (
              <p className="text-sm text-zinc-500">El delivery suma {formatCLP(restaurant.delivery_fee)}. Retiro en el local sin costo.</p>
            )}
            {missing > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Agrega {formatCLP(missing)} más para alcanzar el pedido mínimo de {formatCLP(restaurant.min_order)}.
              </p>
            )}
            {!storeOpen && (
              <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
                El local está cerrado{opensAt ? ` y abre ${opensAt}` : ''}
                {canSchedule ? ': puedes programar tu pedido para más tarde.' : ': por ahora no recibe pedidos.'}
              </p>
            )}
            <button
              type="button"
              disabled={missing > 0 || (!storeOpen && !canSchedule)}
              onClick={() => {
                onClose()
                navigate(`/r/${slug}/checkout`)
              }}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand font-semibold text-brand-contrast disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
