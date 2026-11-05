/**
 * ¿La tienda recibe pedidos ahora? Combina el interruptor del local (is_open_manual)
 * con el horario, recalculado cada minuto en la hora del restaurante: al llegar el cierre,
 * el carrito y el checkout se bloquean solos sin recargar la página.
 * El servidor lo vuelve a validar al crear el pedido (trigger a_orders_opening_hours).
 */
import { isWithinHours, nextOpeningLabel } from '@/lib/openingHours'
import { useNow } from '@/lib/useNow'
import type { PublicRestaurant } from './menu'

export function useStoreOpen(r: PublicRestaurant): { open: boolean; opensAt: string | null } {
  const now = new Date(useNow(60_000))
  const open = r.is_open_manual && isWithinHours(r.opening_hours, r.timezone, now)
  // "Abre a las…" solo si está cerrado por horario; si lo cerraron a mano no se sabe cuándo abre.
  return { open, opensAt: open || !r.is_open_manual ? null : nextOpeningLabel(r.opening_hours, r.timezone, now) }
}
