/**
 * "Resumen" del checkout: productos (con su promoción), cupón y totales.
 *
 * Los montos son estimaciones con las mismas fórmulas del servidor (pricing.ts); el total
 * que vale lo calcula create_order al confirmar. `children` es el lugar del campo de cupón.
 */
import type { ReactNode } from 'react'
import type { ResolvedLine } from '@/features/store/cart'
import type { AppliedCoupon } from '@/features/store/pricing'
import { formatCLP } from '@/lib/format'
import { Card } from './parts'

type OrderSummaryProps = {
  lines: ResolvedLine[]
  subtotal: number
  /** null = retiro (no se muestra la fila de delivery). */
  deliveryFee: number | null
  tip: number
  coupon: AppliedCoupon | null
  discount: number
  total: number
  onRemoveCoupon: () => void
  children?: ReactNode
}

/** Resumen del pedido: líneas, cupón y totales estimados. */
export function OrderSummary({ lines, subtotal, deliveryFee, tip, coupon, discount, total, onRemoveCoupon, children }: OrderSummaryProps) {
  return (
    <Card title="Resumen">
      <ul className="divide-y divide-zinc-100 text-sm">
        {lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="font-medium text-zinc-900">
                {l.quantity}× {l.product.name}
              </span>
              {l.optionsText && <span className="block text-zinc-500">{l.optionsText}</span>}
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {formatCLP(l.lineTotal)}
              {l.discount > 0 && l.product.promo && <span className="block text-xs text-emerald-700">{l.product.promo.name}</span>}
            </span>
          </li>
        ))}
      </ul>
      {children}
      <dl className="space-y-1 border-t border-zinc-200 pt-3 text-sm">
        <Row label="Subtotal" amount={subtotal} />
        {deliveryFee !== null && <Row label="Delivery" amount={deliveryFee} />}
        {tip > 0 && <Row label="Propina" amount={tip} />}
        {coupon && (
          <div className="flex justify-between text-emerald-700">
            <dt>
              Cupón {coupon.code}{' '}
              <button type="button" onClick={onRemoveCoupon} className="text-xs underline">
                quitar
              </button>
            </dt>
            <dd className="tabular-nums">−{formatCLP(discount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-bold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatCLP(total)}</dd>
        </div>
      </dl>
      <p className="text-xs text-zinc-500">El total final lo confirma el restaurante al recibir tu pedido.</p>
    </Card>
  )
}

/** Fila "concepto ... monto" de los totales. */
function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatCLP(amount)}</dd>
    </div>
  )
}
