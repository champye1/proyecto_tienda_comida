/**
 * Estado de atención del local para el panel: el interruptor manual y el horario juntos.
 *
 *   manual      el interruptor "Abierto/Cerrado" (is_open).
 *   inHours     si ahora está dentro del horario (sin horario configurado = siempre).
 *   accepting   lo que ve el cliente: recibe pedidos solo si las dos cosas se cumplen.
 *   opensAt     cuándo vuelve a abrir según el horario ("hoy a las 19:00").
 */
import { isWithinHours, nextOpeningLabel, parseWeekHours } from '@/lib/openingHours'
import { useNow } from '@/lib/useNow'
import type { Restaurant } from './api'

export type OpenState = { manual: boolean; inHours: boolean; accepting: boolean; opensAt: string | null; hasSchedule: boolean }

export function useOpenState(restaurant: Pick<Restaurant, 'is_open' | 'opening_hours' | 'timezone'>): OpenState {
  const now = new Date(useNow(60_000))
  const hours = parseWeekHours(restaurant.opening_hours)
  const inHours = isWithinHours(hours, restaurant.timezone, now)
  return {
    manual: restaurant.is_open,
    inHours,
    accepting: restaurant.is_open && inHours,
    opensAt: inHours ? null : nextOpeningLabel(hours, restaurant.timezone, now),
    hasSchedule: hours !== null,
  }
}
