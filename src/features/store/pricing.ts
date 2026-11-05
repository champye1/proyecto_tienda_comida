/**
 * Fórmulas de precios de la tienda: promociones, cupones y propina.
 *
 * Son COPIA de las que usa el servidor en create_order / coupon_discount (migraciones 17 y
 * 19): aquí solo sirven para mostrarle al cliente el total estimado antes de confirmar. El
 * monto que vale es siempre el que calcula la base. Si se cambia una fórmula en SQL, hay que
 * cambiarla aquí también: las pruebas de tests/unit/pricing.test.ts usan los mismos casos
 * que las pruebas pgTAP (supabase/tests/017 y 019) para detectar diferencias.
 *
 * Módulo puro (sin red, sin variables de entorno): se puede probar de forma aislada.
 */

/** Promoción vigente de un producto, tal como la publica get_public_menu. */
export type Promo = { name: string; kind: 'percent' | 'two_for_one'; percent: number | null }

/** Cupón validado por el servidor (vista previa; create_order lo vuelve a validar). */
export type AppliedCoupon = { code: string; kind: 'percent' | 'fixed' | 'free_delivery'; value: number }

/**
 * Descuento de una promoción sobre una línea del carrito.
 * - Porcentaje: redondeado al peso (SQL: round(unit * qty * percent / 100)).
 * - 2x1: se descuenta una unidad por cada dos (SQL: unit * floor(qty / 2)).
 */
export function promoDiscount(promo: Promo | null, unit: number, quantity: number): number {
  if (!promo) return 0
  return promo.kind === 'percent' ? Math.round((unit * quantity * (promo.percent ?? 0)) / 100) : unit * Math.floor(quantity / 2)
}

/**
 * Descuento de un cupón sobre el pedido (SQL: coupon_discount).
 * - Porcentaje del subtotal (ya con promociones), nunca más que el subtotal.
 * - Monto fijo, nunca más que el subtotal.
 * - Envío gratis: descuenta el costo de despacho.
 */
export function couponDiscount(c: AppliedCoupon | null, subtotal: number, deliveryFee: number): number {
  if (!c) return 0
  if (c.kind === 'percent') return Math.min(Math.round((subtotal * c.value) / 100), subtotal)
  if (c.kind === 'fixed') return Math.min(c.value, subtotal)
  return deliveryFee
}

/** Propina sugerida: porcentaje del subtotal, redondeado a la centena ($1.099 → $1.100). */
export function tipAmount(subtotal: number, percent: number): number {
  return Math.round((subtotal * percent) / 100 / 100) * 100
}
