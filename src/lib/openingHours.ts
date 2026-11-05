/**
 * Horario de atención de un restaurante: tipos, validación y cálculos de "¿está abierto?"
 * y "¿cuándo abre?". Lo usan la tienda (cartel "Abre hoy a las 19:00") y el panel
 * (editor del horario y estado del interruptor).
 *
 * La regla es LA MISMA que la función SQL public.is_open_at (migración 15); la base es
 * la que manda (rechaza pedidos fuera de horario), esto es solo para mostrarlo bien.
 *   - 7 días, lunes primero; cada día con hasta 3 tramos { open, close } en "HH:MM".
 *   - Si close <= open, el tramo cruza la medianoche (19:00–02:00).
 *   - La hora se evalúa en la zona horaria del restaurante, no la del navegador.
 *
 * Sin dependencias (no importa Zod) para no sumar peso a la tienda.
 */

export type TimeSlot = { open: string; close: string }
/** Arreglo de 7 días (0 = lunes … 6 = domingo). */
export type WeekHours = TimeSlot[][]

/** Zonas horarias admitidas (las de Chile), con su nombre para mostrar. */
export const TIMEZONES = [
  { id: 'America/Santiago', label: 'Chile continental' },
  { id: 'America/Punta_Arenas', label: 'Magallanes' },
  { id: 'Pacific/Easter', label: 'Isla de Pascua' },
] as const

export const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const
export const MAX_SLOTS_PER_DAY = 3

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const WEEK_MINUTES = 7 * 24 * 60

/** "19:30" → 1170 (minutos desde la medianoche). */
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * Valida un horario que viene de la base o del formulario. Devuelve el horario tipado o
 * null si no tiene la forma esperada (en ese caso se ignora, nunca se rompe la página).
 */
export function parseWeekHours(value: unknown): WeekHours | null {
  if (!Array.isArray(value) || value.length !== 7) return null
  for (const day of value) {
    if (!Array.isArray(day) || day.length > MAX_SLOTS_PER_DAY) return null
    for (const slot of day) {
      if (!slot || typeof slot !== 'object') return null
      const { open, close } = slot as Record<string, unknown>
      if (typeof open !== 'string' || typeof close !== 'string' || !TIME.test(open) || !TIME.test(close) || open === close) return null
    }
  }
  return value as WeekHours
}

/** Día de la semana (0 = lunes) y minutos del día de un instante, en la zona del restaurante. */
function localParts(at: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

/** ¿Está dentro del horario en este instante? (sin horario = siempre). */
export function isWithinHours(hours: WeekHours | null, timeZone: string, at: Date = new Date()): boolean {
  if (!hours) return true
  const { day, minutes } = localParts(at, timeZone)
  for (const slot of hours[day] ?? []) {
    const open = toMinutes(slot.open)
    const close = toMinutes(slot.close)
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true
  }
  // Tramos de ayer que cruzan la medianoche.
  for (const slot of hours[(day + 6) % 7] ?? []) {
    if (toMinutes(slot.close) <= toMinutes(slot.open) && minutes < toMinutes(slot.close)) return true
  }
  return false
}

/**
 * Próxima apertura según el horario: "hoy a las 19:00", "mañana a las 12:00",
 * "el martes a las 12:00". null si no hay ningún tramo en la semana.
 */
export function nextOpeningLabel(hours: WeekHours | null, timeZone: string, at: Date = new Date()): string | null {
  if (!hours) return null
  const { day, minutes } = localParts(at, timeZone)
  const now = day * 1440 + minutes
  let best: { delta: number; day: number; time: string } | null = null
  hours.forEach((slots, d) => {
    for (const slot of slots) {
      const delta = (d * 1440 + toMinutes(slot.open) - now + WEEK_MINUTES) % WEEK_MINUTES
      if (delta > 0 && (!best || delta < best.delta)) best = { delta, day: d, time: slot.open }
    }
  })
  if (!best) return null
  const { day: openDay, time, delta } = best as { delta: number; day: number; time: string }
  const daysAhead = (openDay - day + 7) % 7
  if (daysAhead === 0 && delta < 1440) return `hoy a las ${time}`
  if (daysAhead === 1) return `mañana a las ${time}`
  return `el ${DAY_NAMES[openDay]} a las ${time}`
}

/** Texto corto de un día: "12:00–15:00 y 19:00–02:00" o "Cerrado". */
export function formatDaySlots(slots: TimeSlot[]): string {
  if (slots.length === 0) return 'Cerrado'
  return slots.map((s) => `${s.open}–${s.close}`).join(' y ')
}

/** Horario por defecto al activarlo por primera vez: todos los días 12:00–22:00. */
export function defaultWeekHours(): WeekHours {
  return Array.from({ length: 7 }, () => [{ open: '12:00', close: '22:00' }])
}

/** Un horario disponible para programar un pedido. */
export type ScheduleSlot = { iso: string; day: string; dayLabel: string; time: string }

/**
 * Horarios para programar un pedido: cada 15 minutos, desde ahora + el tiempo de
 * preparación hasta `days` días, solo dentro del horario de atención (en la hora del
 * restaurante). El servidor vuelve a validar todo al crear el pedido.
 */
export function scheduleSlots(hours: WeekHours | null, timeZone: string, prepMinutes: number, days: number, now = new Date()): ScheduleSlot[] {
  if (days <= 0) return []
  const step = 15 * 60_000
  // Primer horario: redondeado hacia arriba al siguiente cuarto de hora (+1 min de margen).
  const first = Math.ceil((now.getTime() + (prepMinutes + 1) * 60_000) / step) * step
  const last = now.getTime() + days * 86_400_000
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone })
  const timeFmt = new Intl.DateTimeFormat('es-CL', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const labelFmt = new Intl.DateTimeFormat('es-CL', { timeZone, weekday: 'long', day: 'numeric', month: 'long' })
  const today = dayFmt.format(now)
  const tomorrow = dayFmt.format(new Date(now.getTime() + 86_400_000))

  const slots: ScheduleSlot[] = []
  for (let t = first; t <= last; t += step) {
    const at = new Date(t)
    if (!isWithinHours(hours, timeZone, at)) continue
    const day = dayFmt.format(at)
    slots.push({
      iso: at.toISOString(),
      day,
      dayLabel: day === today ? 'Hoy' : day === tomorrow ? 'Mañana' : labelFmt.format(at),
      time: timeFmt.format(at),
    })
  }
  return slots
}
