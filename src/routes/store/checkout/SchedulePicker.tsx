/**
 * "¿Cuándo lo quieres?" del checkout: lo antes posible o programado.
 *
 * - Los horarios (`slots`) los calcula scheduleSlots: cada 15 min, dentro del horario del
 *   local y con su tiempo de preparación de anticipación. El servidor los vuelve a validar.
 * - Si el local está cerrado ahora (`mustSchedule`), solo se ofrece programar.
 * - El selector usa id="slot" para que el checkout pueda llevar el foco ahí si falta la hora.
 */
import type { ScheduleSlot } from '@/lib/openingHours'
import { Card, Choice } from './parts'

type SchedulePickerProps = {
  slots: ScheduleSlot[]
  mustSchedule: boolean
  prepMinutes: number
  when: 'asap' | 'later'
  onWhen: (when: 'asap' | 'later') => void
  slot: string
  onSlot: (iso: string) => void
}

/** Elección entre "lo antes posible" y un horario programado. */
export function SchedulePicker({ slots, mustSchedule, prepMinutes, when, onWhen, slot, onSlot }: SchedulePickerProps) {
  const days = [...new Set(slots.map((s) => s.dayLabel))]
  return (
    <Card title="¿Cuándo lo quieres?">
      {!mustSchedule && (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Cuándo">
          <Choice name="when" checked={when === 'asap'} onChange={() => onWhen('asap')} title="Lo antes posible" detail={`Aprox. ${prepMinutes} min`} />
          <Choice name="when" checked={when === 'later'} onChange={() => onWhen('later')} title="Programar" detail="Elige día y hora" />
        </div>
      )}
      {(mustSchedule || when === 'later') && (
        <div className="space-y-1.5 text-sm">
          <label htmlFor="slot" className="block font-medium text-zinc-800">
            Día y hora
          </label>
          <select
            id="slot"
            required
            value={slot}
            onChange={(e) => onSlot(e.target.value)}
            className="block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3"
          >
            <option value="">Elige un horario…</option>
            {days.map((day) => (
              <optgroup key={day} label={day}>
                {slots
                  .filter((s) => s.dayLabel === day)
                  .map((s) => (
                    <option key={s.iso} value={s.iso}>
                      {day} {s.time}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
    </Card>
  )
}
