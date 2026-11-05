/**
 * Fidelización y reseñas (sección de "Mi local").
 *
 * - Tarjeta de sellos: cada pedido entregado suma un sello al teléfono del cliente; al
 *   completarla, el sistema le genera un cupón personal de un solo uso (lo ve en su
 *   seguimiento). Se elige cuántos sellos y el premio (porcentaje o monto fijo).
 * - Link de reseñas de Google: a quien califica con 5 estrellas se le invita a dejar la
 *   reseña también en Google (solo se aceptan links https://).
 * - Solo el dueño guarda (la RLS de restaurants lo exige).
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField, SelectField } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import { useSession } from '@/features/auth/AuthProvider'
import { restaurantKeys, type MyRestaurant } from '@/features/restaurants/api'
import { dbErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/** Sección "Fidelización y reseñas" de Mi local: tarjeta de sellos y link de Google. */
export function LoyaltyCard({ restaurant }: { restaurant: MyRestaurant }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const isOwner = restaurant.role === 'owner'
  const [enabled, setEnabled] = useState(restaurant.loyalty_enabled)
  const [stamps, setStamps] = useState(String(restaurant.loyalty_stamps))
  const [kind, setKind] = useState(restaurant.loyalty_reward_kind)
  const [value, setValue] = useState(String(restaurant.loyalty_reward_value))
  const [googleUrl, setGoogleUrl] = useState(restaurant.google_review_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    setError(null)
    setSaved(false)
    const nStamps = Number(stamps)
    const nValue = Number(value.replace(/\D/g, ''))
    const url = googleUrl.trim()
    if (!Number.isInteger(nStamps) || nStamps < 3 || nStamps > 20) return setError('La tarjeta debe tener entre 3 y 20 sellos.')
    if (kind === 'percent' ? nValue < 1 || nValue > 100 : nValue < 1 || nValue > 1_000_000) return setError('Revisa el valor del premio.')
    if (url && !/^https:\/\/[^\s<>"]+$/.test(url)) return setError('El link de Google debe empezar con https://')
    setSaving(true)
    const { error: dbError } = await supabase
      .from('restaurants')
      .update({
        loyalty_enabled: enabled,
        loyalty_stamps: nStamps,
        loyalty_reward_kind: kind,
        loyalty_reward_value: nValue,
        google_review_url: url || null,
      })
      .eq('id', restaurant.id)
    setSaving(false)
    if (dbError) return setError(dbErrorMessage(dbError))
    setSaved(true)
    await queryClient.invalidateQueries({ queryKey: restaurantKeys.mine(session.user.id) })
  }

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6" aria-labelledby="loyalty-title">
      <h2 id="loyalty-title" className="font-semibold text-zinc-900">
        Fidelización y reseñas
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Guardado.</Alert>}
      <fieldset disabled={!isOwner} className="space-y-5">
        <div className="space-y-1">
          <Switch checked={enabled} onChange={setEnabled} label="Tarjeta de sellos" showLabel />
          <p className="text-sm text-zinc-500">Cada pedido entregado suma un sello. Al completarla, el cliente recibe un cupón de regalo.</p>
        </div>
        {enabled && (
          <div className="grid gap-5 sm:grid-cols-3">
            <InputField label="Sellos para el premio" type="number" min={3} max={20} value={stamps} onChange={(e) => setStamps(e.target.value)} />
            <SelectField
              label="Premio"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="percent">Porcentaje de descuento</option>
              <option value="fixed">Monto de descuento</option>
            </SelectField>
            <InputField
              label={kind === 'percent' ? 'Descuento (%)' : 'Descuento ($)'}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        )}
        <InputField
          label="Link para dejar reseña en Google (opcional)"
          type="url"
          inputMode="url"
          placeholder="https://g.page/r/…/review"
          value={googleUrl}
          onChange={(e) => setGoogleUrl(e.target.value)}
          hint="Lo encuentras en tu Perfil de Empresa de Google → «Pedir reseñas». Se ofrece a quien te califica con 5 estrellas."
        />
      </fieldset>
      {isOwner && (
        <div className="flex justify-end">
          <Button type="button" onClick={save} loading={saving}>
            Guardar
          </Button>
        </div>
      )}
    </section>
  )
}
