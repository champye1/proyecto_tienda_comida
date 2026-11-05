/**
 * Pagos (sección de "Mi local"): datos para recibir transferencias y propina en línea.
 *
 * - Datos de transferencia: se muestran al cliente que elige pagar por transferencia (en el
 *   checkout y en el seguimiento, con botón para copiarlos). Son públicos a propósito, como
 *   los que el local ya publica en Instagram; nunca se piden claves ni datos de tarjetas.
 * - Propina: si se activa, el cliente puede agregar 5, 10 o 15 % en el checkout. Los
 *   reportes la muestran aparte de las ventas.
 * - Solo el dueño guarda (RLS). Formatos validados aquí y en la base (CHECK).
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

const ACCOUNT_TYPES = ['Cuenta corriente', 'Cuenta vista', 'Cuenta RUT', 'Cuenta de ahorro']
const RUT = /^[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9kK]$/

/** Texto sin espacios a los lados; vacío = null (la base lo guarda como "sin dato"). */
const clean = (s: string) => s.trim() || null

/** Sección "Pagos" de Mi local: datos de transferencia y propina en línea. */
export function PaymentsCard({ restaurant }: { restaurant: MyRestaurant }) {
  const session = useSession()
  const queryClient = useQueryClient()
  const isOwner = restaurant.role === 'owner'
  const [tips, setTips] = useState(restaurant.tips_enabled)
  const [v, setV] = useState({
    holder: restaurant.transfer_holder ?? '',
    rut: restaurant.transfer_rut ?? '',
    bank: restaurant.transfer_bank ?? '',
    type: restaurant.transfer_account_type ?? ACCOUNT_TYPES[0],
    number: restaurant.transfer_account_number ?? '',
    email: restaurant.transfer_email ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))

  async function save() {
    setError(null)
    setSaved(false)
    const filled = v.holder.trim() || v.bank.trim() || v.number.trim()
    if (filled && (!v.holder.trim() || !v.bank.trim() || !v.number.trim())) return setError('Para transferencias completa al menos titular, banco y número de cuenta.')
    if (v.rut.trim() && !RUT.test(v.rut.trim())) return setError('Ingresa el RUT con guion, por ejemplo 76.123.456-7')
    if (v.number.trim() && !/^[0-9-]{4,30}$/.test(v.number.trim())) return setError('El número de cuenta solo puede tener números y guiones.')
    if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return setError('Ingresa un email válido.')
    setSaving(true)
    const { error: dbError } = await supabase
      .from('restaurants')
      .update({
        tips_enabled: tips,
        transfer_holder: clean(v.holder),
        transfer_rut: clean(v.rut),
        transfer_bank: clean(v.bank),
        transfer_account_type: filled ? v.type : null,
        transfer_account_number: clean(v.number),
        transfer_email: clean(v.email),
      })
      .eq('id', restaurant.id)
    setSaving(false)
    if (dbError) return setError(dbErrorMessage(dbError))
    setSaved(true)
    await queryClient.invalidateQueries({ queryKey: restaurantKeys.mine(session.user.id) })
  }

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6" aria-labelledby="payments-title">
      <h2 id="payments-title" className="font-semibold text-zinc-900">
        Pagos
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Datos de pago guardados.</Alert>}
      <fieldset disabled={!isOwner} className="space-y-5">
        <p className="text-sm text-zinc-600">Datos para que tus clientes te transfieran. Se muestran solo a quien elige pagar por transferencia.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField label="Titular de la cuenta" value={v.holder} onChange={set('holder')} />
          <InputField label="RUT del titular" value={v.rut} onChange={set('rut')} placeholder="76.123.456-7" />
          <InputField label="Banco" value={v.bank} onChange={set('bank')} placeholder="Banco Estado" />
          <SelectField label="Tipo de cuenta" value={v.type} onChange={set('type')}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </SelectField>
          <InputField label="Número de cuenta" inputMode="numeric" value={v.number} onChange={set('number')} />
          <InputField label="Email para avisos (opcional)" type="email" value={v.email} onChange={set('email')} />
        </div>
        <div className="space-y-1">
          <Switch checked={tips} onChange={setTips} label="Aceptar propina en línea" showLabel />
          <p className="text-sm text-zinc-500">El cliente puede agregar 5, 10 o 15 % al pagar. En los reportes aparece aparte de las ventas.</p>
        </div>
      </fieldset>
      {isOwner && (
        <div className="flex justify-end">
          <Button type="button" onClick={save} loading={saving}>
            Guardar pagos
          </Button>
        </div>
      )}
    </section>
  )
}
