/**
 * Carrito: líneas con cantidad editable, subtotal y aviso de pedido mínimo.
 * "Continuar" lleva al checkout solo si se cumple el mínimo y el local está abierto.
 */
import { useNavigate } from 'react-router'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Sheet } from '@/components/ui/Sheet'
import { formatCLP } from '@/lib/format'
import { useStore } from './StoreRoot'

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { slug, menu, cart, lines, subtotal } = useStore()
  const navigate = useNavigate()
  const { restaurant } = menu
  const missing = Math.max(0, restaurant.min_order - subtotal)

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
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-semibold tabular-nums">{formatCLP(l.lineTotal)}</span>
                    <QuantityStepper value={l.quantity} onChange={(q) => cart.setQuantity(l.key, q)} min={0} itemName={l.product.name} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
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
            {!restaurant.is_open && <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">El local está cerrado: por ahora no recibe pedidos.</p>}
            <button
              type="button"
              disabled={missing > 0 || !restaurant.is_open}
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
