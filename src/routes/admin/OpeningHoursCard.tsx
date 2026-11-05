/**
 * Horario de atención, zona horaria y tiempo de preparación (sección de "Mi local").
 *
 * - Horario automático opcional: si está activado, el local solo recibe pedidos dentro de
 *   los tramos de cada día, aunque el interruptor quede en "Abierto" (si alguien olvida
 *   cerrar, a la hora de cierre dejan de entrar pedidos solos). La base lo exige igual.
 * - Hasta 3 tramos por día (p. ej. almuerzo y cena). Un tramo que cierra "antes" de abrir
 *   termina al día siguiente: 19:00 a 02:00.
 * - Tiempo de preparación: se muestra en la tienda y es el tiempo por defecto al confirmar.
 * - Se guarda aparte del resto del formulario (su propio botón), y solo el dueño puede.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { useSession } from '@/features/auth/AuthProvider'
import { restaurantKeys, type MyRestaurant } from '@/features/restaurants/api'
import { dbErrorMessage } from '@/lib/errors'
import {
  DAY_NAMES,
  defaultWeekHours,
  MAX_SLOTS_PER_DAY,
  parseWeekHours,
  TIMEZONES,
  type TimeSlot,
  type WeekHours,
} from '@/lib/openingHours'
import { supabase } from '@/lib/supabase'

/** "lunes" → "Lunes". */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function OpeningHoursCard({ restaurant }: { restaurant: MyRestaurant }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const isOwner = restaurant.role === 'owner'
  const initial = parseWeekHours(restaurant.opening_hours)

  const [enabled, setEnabled] = useState(initial !== null)
  const [hours, setHours] = useState<WeekHours>(initial ?? defaultWeekHours())
  const [timezone, setTimezone] = useState(restaurant.timezone)
  const [prep, setPrep] = useState(String(restaurant.prep_time_minutes))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  /** Cambia los tramos de un día (copia inmutable de la semana). */
  const setDay = (day: number, slots: TimeSlot[]) => setHours((w) => w.map((s, i) => (i === day ? slots : s)))

  async function save() {
    setSaved(false)
    setError(null)
    const minutes = Number(prep)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) {
      return setError('El tiempo de preparación debe estar entre 5 y 240 minutos.')
    }
    if (enabled && !parseWeekHours(hours)) {
      return setError('Revisa el horario: cada tramo debe tener hora de apertura y de cierre distintas.')
    }
    setSaving(true)
    const { error: dbError } = await supabase
      .from('restaurants')
      .update({ opening_hours: enabled ? hours : null, timezone, prep_time_minutes: minutes })
      .eq('id', restaurant.id)
    setSaving(false)
    if (dbError) return setError(dbErrorMessage(dbError))
    setSaved(true)
    await queryClient.invalidateQueries({ queryKey: restaurantKeys.mine(session.user.id) })
  }

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6" aria-labelledby="hours-title">
      <h2 id="hours-title" className="font-semibold text-zinc-900">
        Horario y tiempos
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Horario guardado.</Alert>}

      <fieldset disabled={!isOwner} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-800">Zona horaria</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-zinc-800">Tiempo habitual de preparación (min)</span>
            <input
              type="number"
              inputMode="numeric"
              min={5}
              max={240}
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
              className="block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
            />
            <span className="block text-zinc-500">Se muestra en tu tienda y es el tiempo por defecto al confirmar.</span>
          </label>
        </div>

        <div className="space-y-1">
          <Switch checked={enabled} onChange={setEnabled} label="Horario automático" showLabel />
          <p className="text-sm text-zinc-500">
            {enabled
              ? 'Solo recibes pedidos dentro de estos horarios, aunque el interruptor quede en "Abierto".'
              : 'Desactivado: abres y cierras el local solo con el interruptor.'}
          </p>
        </div>

        {enabled && (
          <div className="space-y-3">
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {hours.map((slots, day) => (
                <li key={DAY_NAMES[day]} className="flex flex-wrap items-start gap-3 p-3">
                  <div className="w-32 pt-2">
                    <Switch
                      checked={slots.length > 0}
                      onChange={(open) => setDay(day, open ? [{ open: '12:00', close: '22:00' }] : [])}
                      label={capitalize(DAY_NAMES[day] ?? '')}
                      showLabel
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    {slots.length === 0 && <p className="pt-2.5 text-sm text-zinc-500">Cerrado</p>}
                    {slots.map((slot, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                        <input
                          type="time"
                          step={300}
                          aria-label={`${DAY_NAMES[day]}, tramo ${i + 1}: abre`}
                          value={slot.open}
                          onChange={(e) => setDay(day, slots.map((s, j) => (j === i ? { ...s, open: e.target.value } : s)))}
                          className="min-h-11 rounded-lg border border-zinc-300 px-2"
                        />
                        <span>a</span>
                        <input
                          type="time"
                          step={300}
                          aria-label={`${DAY_NAMES[day]}, tramo ${i + 1}: cierra`}
                          value={slot.close}
                          onChange={(e) => setDay(day, slots.map((s, j) => (j === i ? { ...s, close: e.target.value } : s)))}
                          className="min-h-11 rounded-lg border border-zinc-300 px-2"
                        />
                        {slot.close <= slot.open && slot.close !== slot.open && <span className="text-zinc-500">(hasta el día siguiente)</span>}
                        <button
                          type="button"
                          onClick={() => setDay(day, slots.filter((_, j) => j !== i))}
                          aria-label={`Quitar tramo ${i + 1} del ${DAY_NAMES[day]}`}
                          className="min-h-11 rounded-lg px-3 font-semibold text-zinc-500 hover:bg-zinc-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {slots.length > 0 && slots.length < MAX_SLOTS_PER_DAY && (
                      <button
                        type="button"
                        onClick={() => setDay(day, [...slots, { open: '19:00', close: '23:00' }])}
                        className="text-sm font-semibold text-zinc-700 underline"
                      >
                        + Agregar tramo
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Button type="button" variant="secondary" onClick={() => setHours((w) => w.map(() => w[0] ?? []))}>
              Copiar el lunes a todos los días
            </Button>
          </div>
        )}
      </fieldset>

      {isOwner && (
        <div className="flex justify-end">
          <Button type="button" onClick={save} loading={saving}>
            Guardar horario
          </Button>
        </div>
      )}
    </section>
  )
}
