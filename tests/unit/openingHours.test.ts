/**
 * Horario de atención en el navegador (src/lib/openingHours.ts) vs. la regla de la base
 * (public.is_open_at, migración 15). Mismos casos que supabase/tests/015_daily_operations:
 * si las dos reglas se separan, la tienda diría "Abierto" y el servidor rechazaría el pedido.
 */
import { describe, expect, it } from 'vitest'
import { isWithinHours, nextOpeningLabel, parseWeekHours, scheduleSlots, type WeekHours } from '@/lib/openingHours'

const S = 'America/Santiago' // UTC-3 en noviembre (horario de verano)
const slots = [
  { open: '12:00', close: '15:00' },
  { open: '19:00', close: '02:00' },
]
const week = parseWeekHours(Array.from({ length: 7 }, () => slots)) as WeekHours
const friday = parseWeekHours([[], [], [], [], [{ open: '20:00', close: '03:00' }], [], []]) as WeekHours
const at = (iso: string) => new Date(iso)

describe('isWithinHours (= is_open_at)', () => {
  it.each([
    ['2026-11-02T13:00-03:00', true, '13:00 dentro del almuerzo'],
    ['2026-11-02T15:00-03:00', false, '15:00 en punto: cierre exclusivo'],
    ['2026-11-02T17:00-03:00', false, '17:00 entre tramos'],
    ['2026-11-02T23:30-03:00', true, '23:30 tramo nocturno'],
    ['2026-11-03T01:30-03:00', true, '01:30: sigue el tramo que cruzó la medianoche'],
    ['2026-11-03T03:00-03:00', false, '03:00: el tramo nocturno ya terminó'],
  ])('%s → %s (%s)', (iso, expected) => {
    expect(isWithinHours(week, S, at(iso))).toBe(expected)
  })

  it('el tramo del viernes cubre el sábado de madrugada, no el domingo', () => {
    expect(isWithinHours(friday, S, at('2026-11-07T02:00-03:00'))).toBe(true)
    expect(isWithinHours(friday, S, at('2026-11-08T02:00-03:00'))).toBe(false)
  })

  it('evalúa en la zona del restaurante (Isla de Pascua, UTC-5)', () => {
    expect(isWithinHours(week, 'Pacific/Easter', at('2026-11-02T13:00-03:00'))).toBe(false)
  })

  it('sin horario siempre está dentro', () => {
    expect(isWithinHours(null, S)).toBe(true)
  })
})

describe('parseWeekHours', () => {
  it('rechaza formas inválidas (se ignoran, nunca rompen la página)', () => {
    expect(parseWeekHours([[], []])).toBeNull()
    expect(parseWeekHours(Array.from({ length: 7 }, () => [{ open: '25:00', close: '10:00' }]))).toBeNull()
    expect(parseWeekHours(Array.from({ length: 7 }, () => [{ open: '10:00', close: '10:00' }]))).toBeNull()
    expect(parseWeekHours('<script>')).toBeNull()
  })
})

describe('nextOpeningLabel', () => {
  it.each([
    [week, '2026-11-02T16:00-03:00', 'hoy a las 19:00'],
    [week, '2026-11-02T03:00-03:00', 'hoy a las 12:00'],
    [friday, '2026-11-05T10:00-03:00', 'mañana a las 20:00'],
    [friday, '2026-11-07T10:00-03:00', 'el viernes a las 20:00'],
  ])('%#: %s → %s', (hours, iso, label) => {
    expect(nextOpeningLabel(hours, S, at(iso))).toBe(label)
  })

  it('sin ningún tramo en la semana no hay próxima apertura', () => {
    expect(nextOpeningLabel(parseWeekHours([[], [], [], [], [], [], []]), S)).toBeNull()
  })
})

describe('scheduleSlots (pedidos programados)', () => {
  const now = at('2026-11-02T13:00-03:00')
  const list = scheduleSlots(week, S, 25, 1, now)

  it('empieza después del tiempo de preparación, en cuartos de hora', () => {
    expect(list[0]?.time).toBe('13:30')
    expect(list.every((s) => /:(00|15|30|45)$/.test(s.time))).toBe(true)
  })
  it('solo ofrece horarios dentro del horario de atención', () => {
    expect(list.every((s) => isWithinHours(week, S, new Date(s.iso)))).toBe(true)
    expect(list.some((s) => s.time === '16:00')).toBe(false)
  })
  it('no pasa de los días permitidos', () => {
    expect(new Date(list.at(-1)?.iso ?? 0).getTime()).toBeLessThanOrEqual(now.getTime() + 86_400_000)
  })
  it('con 0 días no ofrece horarios', () => {
    expect(scheduleSlots(week, S, 25, 0, now)).toEqual([])
  })
})
