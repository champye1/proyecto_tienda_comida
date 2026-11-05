/**
 * Promociones (/admin/promociones): cupones de descuento y promociones por horario.
 *
 * - Cupones: códigos para compartir en Instagram o WhatsApp ("BIENVENIDA10"): porcentaje,
 *   monto fijo o envío gratis, con mínimo de compra, vencimiento, usos máximos y la opción
 *   "solo primera compra".
 * - Promociones por horario: descuento o 2x1 automático (sin código) en un producto, una
 *   categoría o todo el menú, ciertos días y en una franja horaria ("Martes 2x1", "happy hour").
 * - Solo el dueño crea, pausa o borra; el personal las ve. El descuento lo calcula siempre
 *   el servidor al crear el pedido.
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField, SelectField } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import {
  couponFormSchema,
  couponLabel,
  couponsQuery,
  promoTargetsQuery,
  promotionFormSchema,
  promotionsQuery,
  useCouponMutations,
  usePromotionMutations,
  type CouponFormValues,
  type Promotion,
  type PromotionFormValues,
} from '@/features/promotions/api'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { DAY_NAMES } from '@/lib/openingHours'
import { useNow } from '@/lib/useNow'

/** Página de promociones: cupones y promociones por día y horario. */
export default function PromotionsPage() {
  const { restaurant } = useCurrentRestaurant()
  const isOwner = restaurant.role === 'owner'
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Promociones</h1>
        <p className="mt-1 text-sm text-zinc-600">Cupones para compartir y descuentos automáticos por día y horario.</p>
      </div>
      {!isOwner && <Alert tone="info">Solo el dueño del local puede crear o cambiar promociones.</Alert>}
      <Coupons rid={restaurant.id} isOwner={isOwner} />
      <Promotions rid={restaurant.id} isOwner={isOwner} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Cupones
// -----------------------------------------------------------------------------

const EMPTY_COUPON: CouponFormValues = {
  code: '',
  kind: 'percent',
  value: '10',
  min_subtotal: '',
  ends_at: '',
  max_uses: '',
  first_order_only: false,
}

function Coupons({ rid, isOwner }: { rid: string; isOwner: boolean }) {
  const query = useQuery(couponsQuery(rid))
  const now = useNow(60_000) // para marcar los cupones vencidos
  const { create, toggle, remove } = useCouponMutations(rid)
  const [values, setValues] = useState<CouponFormValues>(EMPTY_COUPON)
  const [errors, setErrors] = useState<FieldErrors<CouponFormValues>>({})
  const set = (field: keyof CouponFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = couponFormSchema.safeParse(values)
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    create.mutate(parsed.data, { onSuccess: () => setValues(EMPTY_COUPON) })
  }

  const error = create.error ?? toggle.error ?? remove.error
  return (
    <Section title="Cupones de descuento">
      {error && <Alert tone="error">{dbErrorMessage(error)}</Alert>}
      {isOwner && (
        <form onSubmit={submit} noValidate className="grid gap-4 rounded-xl bg-zinc-50 p-4 sm:grid-cols-2">
          <InputField
            label="Código"
            value={values.code}
            onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
            error={errors.code}
            hint="Ej: BIENVENIDA10"
          />
          <SelectField label="Tipo" value={values.kind} onChange={set('kind')}>
            <option value="percent">Porcentaje</option>
            <option value="fixed">Monto fijo</option>
            <option value="free_delivery">Envío gratis</option>
          </SelectField>
          {values.kind !== 'free_delivery' && (
            <InputField
              label={values.kind === 'percent' ? 'Descuento (%)' : 'Descuento ($)'}
              inputMode="numeric"
              value={values.value}
              onChange={set('value')}
              error={errors.value}
            />
          )}
          <InputField
            label="Compra mínima ($, opcional)"
            inputMode="numeric"
            value={values.min_subtotal}
            onChange={set('min_subtotal')}
            error={errors.min_subtotal}
          />
          <InputField label="Vence el (opcional)" type="date" value={values.ends_at} onChange={set('ends_at')} error={errors.ends_at} />
          <InputField
            label="Usos máximos (opcional)"
            inputMode="numeric"
            value={values.max_uses}
            onChange={set('max_uses')}
            error={errors.max_uses}
          />
          <div className="flex items-center sm:col-span-2">
            <Switch
              checked={values.first_order_only}
              onChange={(first_order_only) => setValues((v) => ({ ...v, first_order_only }))}
              label="Solo para la primera compra"
              showLabel
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={create.isPending}>
              Crear cupón
            </Button>
          </div>
        </form>
      )}
      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Alert tone="error">{dbErrorMessage(query.error)}</Alert>
      ) : query.data.length === 0 ? (
        <p className="text-sm text-zinc-500">Todavía no tienes cupones.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {query.data.map((c) => {
            const expired = c.ends_at !== null && new Date(c.ends_at).getTime() < now
            const exhausted = c.max_uses !== null && c.uses >= c.max_uses
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="rounded-lg bg-zinc-900 px-2.5 py-1 font-mono font-bold text-white">{c.code}</span>
                <span className="min-w-[10rem] flex-1 text-zinc-700">
                  {couponLabel(c, formatCLP)}
                  {c.min_subtotal > 0 && ` · desde ${formatCLP(c.min_subtotal)}`}
                  {c.first_order_only && ' · primera compra'}
                  <span className="block text-xs text-zinc-500">
                    {c.uses} uso{c.uses === 1 ? '' : 's'}
                    {c.max_uses !== null && ` de ${c.max_uses}`}
                    {c.ends_at && ` · ${expired ? 'venció' : 'vence'} el ${new Date(c.ends_at).toLocaleDateString('es-CL')}`}
                  </span>
                </span>
                {(expired || exhausted) && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{expired ? 'Vencido' : 'Agotado'}</span>
                )}
                <Switch
                  checked={c.is_active}
                  disabled={!isOwner}
                  onChange={(is_active) => toggle.mutate({ id: c.id, is_active })}
                  label={`Cupón ${c.code} activo`}
                />
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(c.id)}
                    className="min-h-10 rounded-lg px-3 font-semibold text-red-700 hover:bg-red-50"
                  >
                    Borrar
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

// -----------------------------------------------------------------------------
// Promociones por horario
// -----------------------------------------------------------------------------

const EMPTY_PROMO: PromotionFormValues = {
  name: '',
  kind: 'percent',
  percent: '20',
  target: 'all',
  days: [0, 1, 2, 3, 4, 5, 6],
  start_time: '12:00',
  end_time: '23:00',
}

function Promotions({ rid, isOwner }: { rid: string; isOwner: boolean }) {
  const query = useQuery(promotionsQuery(rid))
  const targets = useQuery(promoTargetsQuery(rid))
  const { create, toggle, remove } = usePromotionMutations(rid)
  const [values, setValues] = useState<PromotionFormValues>(EMPTY_PROMO)
  const [errors, setErrors] = useState<FieldErrors<PromotionFormValues>>({})

  function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = promotionFormSchema.safeParse(values)
    if (!parsed.success) return setErrors(fieldErrors(parsed.error))
    setErrors({})
    create.mutate(parsed.data, { onSuccess: () => setValues(EMPTY_PROMO) })
  }

  /** A qué se aplica, en palabras. */
  function targetLabel(p: Promotion): string {
    if (p.product_id) return targets.data?.products.find((x) => x.id === p.product_id)?.name ?? 'Un producto'
    if (p.category_id) return `Categoría ${targets.data?.categories.find((x) => x.id === p.category_id)?.name ?? ''}`
    return 'Todo el menú'
  }

  const days = values.days ?? []
  const error = create.error ?? toggle.error ?? remove.error
  return (
    <Section title="Promociones por día y horario">
      <p className="text-sm text-zinc-600">Se aplican solas, sin código. Si a un producto le sirven varias, se usa la de mayor descuento.</p>
      {error && <Alert tone="error">{dbErrorMessage(error)}</Alert>}
      {isOwner && (
        <form onSubmit={submit} noValidate className="grid gap-4 rounded-xl bg-zinc-50 p-4 sm:grid-cols-2">
          <InputField
            label="Nombre (lo ve el cliente)"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            error={errors.name}
            hint='Ej: "Martes 2x1" o "Happy hour"'
          />
          <SelectField
            label="Tipo"
            value={values.kind}
            onChange={(e) => setValues((v) => ({ ...v, kind: e.target.value as PromotionFormValues['kind'] }))}
          >
            <option value="percent">Porcentaje de descuento</option>
            <option value="two_for_one">2x1 (lleva 2, paga 1)</option>
          </SelectField>
          {values.kind === 'percent' && (
            <InputField
              label="Descuento (%)"
              inputMode="numeric"
              value={values.percent}
              onChange={(e) => setValues((v) => ({ ...v, percent: e.target.value }))}
              error={errors.percent}
            />
          )}
          <SelectField
            label="Se aplica a"
            value={values.target}
            onChange={(e) => setValues((v) => ({ ...v, target: e.target.value }))}
          >
            <option value="all">Todo el menú</option>
            <optgroup label="Categoría">
              {targets.data?.categories.map((c) => (
                <option key={c.id} value={`cat:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Producto">
              {targets.data?.products.map((p) => (
                <option key={p.id} value={`prod:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </SelectField>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium text-zinc-800">Días</legend>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((name, i) => (
                <label
                  key={name}
                  className={`flex min-h-10 cursor-pointer items-center rounded-full px-3 text-sm font-semibold ring-1 ${days.includes(i) ? 'bg-zinc-900 text-white ring-zinc-900' : 'bg-white text-zinc-700 ring-zinc-300'}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={days.includes(i)}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        days: e.target.checked ? [...(v.days ?? []), i] : (v.days ?? []).filter((d) => d !== i),
                      }))
                    }
                  />
                  {name.slice(0, 3)}
                </label>
              ))}
            </div>
            {errors.days && <p className="mt-1 text-sm text-red-600">{errors.days}</p>}
          </fieldset>
          <InputField
            label="Desde"
            type="time"
            step={300}
            value={values.start_time}
            onChange={(e) => setValues((v) => ({ ...v, start_time: e.target.value }))}
            error={errors.start_time}
          />
          <InputField
            label="Hasta"
            type="time"
            step={300}
            value={values.end_time}
            onChange={(e) => setValues((v) => ({ ...v, end_time: e.target.value }))}
            error={errors.end_time}
            hint="Si es menor que «desde», termina al día siguiente."
          />
          <div className="sm:col-span-2">
            <Button type="submit" loading={create.isPending}>
              Crear promoción
            </Button>
          </div>
        </form>
      )}
      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Alert tone="error">{dbErrorMessage(query.error)}</Alert>
      ) : query.data.length === 0 ? (
        <p className="text-sm text-zinc-500">Todavía no tienes promociones.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {query.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-brand-contrast">
                {p.kind === 'percent' ? `-${p.percent}%` : '2x1'}
              </span>
              <span className="min-w-[10rem] flex-1">
                <span className="font-medium text-zinc-900">{p.name}</span>
                <span className="block text-xs text-zinc-500">
                  {targetLabel(p)} · {p.days.length === 7 ? 'todos los días' : p.days.map((d) => DAY_NAMES[d]?.slice(0, 3)).join(', ')} ·{' '}
                  {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}
                </span>
              </span>
              <Switch
                checked={p.is_active}
                disabled={!isOwner}
                onChange={(is_active) => toggle.mutate({ id: p.id, is_active })}
                label={`Promoción ${p.name} activa`}
              />
              {isOwner && (
                <button
                  type="button"
                  onClick={() => remove.mutate(p.id)}
                  className="min-h-10 rounded-lg px-3 font-semibold text-red-700 hover:bg-red-50"
                >
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}
