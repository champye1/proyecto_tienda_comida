/**
 * Campo "Cupón de descuento" del checkout.
 *
 * Valida el código contra el servidor (RPC pública check_coupon) con el carrito y el teléfono
 * actuales, y avisa al checkout el cupón aplicado (o null). Es solo una vista previa: el
 * descuento real lo vuelve a calcular create_order al confirmar el pedido.
 */
import { useState } from 'react'
import { checkCoupon, type AppliedCoupon } from '@/features/store/orders'
import { dbErrorMessage } from '@/lib/errors'

type CouponFieldProps = {
  slug: string
  subtotal: number
  deliveryFee: number
  phone: string
  onApplied: (coupon: AppliedCoupon | null) => void
}

/** Campo para escribir y aplicar un cupón (vista previa validada por el servidor). */
export function CouponField({ slug, subtotal, deliveryFee, phone, onApplied }: CouponFieldProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  /** Pregunta al servidor si el código sirve para este carrito y teléfono. */
  async function apply() {
    setError(null)
    setChecking(true)
    try {
      onApplied(await checkCoupon(slug, code, subtotal, deliveryFee, phone))
    } catch (e) {
      onApplied(null)
      setError(dbErrorMessage(e))
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-2 border-t border-zinc-200 pt-3">
        <label className="min-w-[10rem] flex-1 space-y-1 text-sm">
          <span className="font-medium text-zinc-800">Cupón de descuento</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={20}
            autoCapitalize="characters"
            className="block min-h-11 w-full rounded-lg border border-zinc-300 px-3 uppercase"
          />
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={code.trim().length < 3 || checking}
          className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
        >
          {checking ? 'Revisando…' : 'Aplicar'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  )
}
