/**
 * Checkout (/r/:slug/checkout): datos del cliente, retiro o delivery, pago y resumen.
 *
 * - Al confirmar se envía el pedido (SOLO ids y cantidades) a la Edge Function place-order
 *   junto con el token del CAPTCHA; el servidor verifica que no sea un bot, calcula precios,
 *   valida todo y devuelve el número de pedido y el token de seguimiento.
 * - Si el servidor rechaza el pedido (local cerrado, producto agotado, límite de pedidos…)
 *   se muestra su mensaje y se recarga el menú, por si cambió algo.
 * - Secciones en checkout/: cupón (CouponField), "¿Cuándo lo quieres?" (SchedulePicker),
 *   propina (TipPicker) y resumen con totales (OrderSummary). Esta página guarda el estado
 *   del formulario y arma el pedido.
 * - Transferencia: si el local cargó sus datos bancarios, se muestran aquí mismo.
 * - "Recordar mis datos" es opcional y viene desmarcado (privacidad: el dispositivo puede
 *   ser compartido). Si se desmarca, se borran los datos guardados.
 */
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Captcha, type CaptchaHandle } from '@/components/Captcha'
import { Alert } from '@/components/ui/Alert'
import { InputField, TextareaField } from '@/components/ui/Field'
import { useDocumentMeta } from '@/features/store/appearance'
import { checkoutSchema, createOrder, readSavedCustomer, saveCustomer, type CheckoutValues } from '@/features/store/orders'
import { couponDiscount, tipAmount, type AppliedCoupon } from '@/features/store/pricing'
import { useStoreOpen } from '@/features/store/useStoreOpen'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { scheduleSlots } from '@/lib/openingHours'
import { CouponField } from './checkout/CouponField'
import { OrderSummary } from './checkout/OrderSummary'
import { Card, Choice } from './checkout/parts'
import { SchedulePicker } from './checkout/SchedulePicker'
import { TipPicker } from './checkout/TipPicker'
import { useStore } from './StoreRoot'
import { TransferDetails } from './TransferDetails'

/** Página de checkout: arma y envía el pedido. */
export default function CheckoutPage() {
  const { slug, menu, cart, lines, subtotal } = useStore()
  const { restaurant } = menu
  const { open } = useStoreOpen(restaurant)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useDocumentMeta({ title: `Finalizar pedido · ${restaurant.name}` })

  // Datos del cliente (recordados en este dispositivo si lo pidió).
  const saved = readSavedCustomer()
  const [values, setValues] = useState<CheckoutValues>({
    name: saved?.name ?? '',
    phone: saved?.phone ?? '+56 9 ',
    // Si solo hay una modalidad, viene elegida.
    type: restaurant.pickup_enabled ? 'pickup' : 'delivery',
    address: saved?.address ?? '',
    notes: '',
    payment_method: 'cash',
  })
  const [remember, setRemember] = useState(saved !== null)
  const [errors, setErrors] = useState<FieldErrors<CheckoutValues>>({})

  // Pedidos programados: horarios disponibles (solo si el local los acepta y su interruptor está encendido).
  const slots = restaurant.is_open_manual
    ? scheduleSlots(restaurant.opening_hours, restaurant.timezone, restaurant.prep_time_minutes, restaurant.scheduling_days)
    : []
  const [when, setWhen] = useState<'asap' | 'later'>(open ? 'asap' : 'later')
  const [slot, setSlot] = useState('')
  const mustSchedule = !open && slots.length > 0
  const scheduled = (mustSchedule || when === 'later') && slot ? slot : null

  // Cupón aplicado (validado por el servidor) y propina.
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)
  const [tipPercent, setTipPercent] = useState(0)

  // CAPTCHA: el servidor (place-order) rechaza pedidos sin token válido, lo que frena
  // a los bots que inundan al restaurante con pedidos falsos.
  const captcha = useRef<CaptchaHandle>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  // Totales estimados (mismas fórmulas que el servidor: ver pricing.ts).
  const deliveryFee = values.type === 'delivery' ? restaurant.delivery_fee : 0
  const discount = couponDiscount(coupon, subtotal, deliveryFee)
  const tip = restaurant.tips_enabled ? tipAmount(subtotal, tipPercent) : 0
  const total = subtotal + deliveryFee - discount + tip
  const belowMinimum = subtotal < restaurant.min_order

  const order = useMutation({
    mutationFn: ({ data, token }: { data: Parameters<typeof createOrder>[1]; token: string }) =>
      createOrder(slug, data, cart.lines, token, { couponCode: coupon?.code ?? null, scheduledFor: scheduled, tip }),
    onSuccess: (result, { data }) => {
      saveCustomer(remember ? { name: data.name, phone: data.phone, address: data.address } : null)
      cart.clear()
      navigate(`/r/${slug}/pedido/${result.tracking_token}`, { replace: true })
    },
    // Puede que el menú haya cambiado (producto agotado, local cerrado): se recarga.
    // El token del CAPTCHA es de un solo uso: se pide uno nuevo para reintentar.
    onError: () => {
      captcha.current?.reset()
      return queryClient.invalidateQueries({ queryKey: ['store', slug, 'menu'] })
    },
  })

  /** Valida el formulario y envía el pedido. */
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = checkoutSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    if (!captchaToken) return
    // Si hay que programar (o se eligió programar), se exige elegir la hora.
    if ((mustSchedule || when === 'later') && !slot) {
      setErrors({})
      document.getElementById('slot')?.focus()
      return
    }
    setErrors({})
    order.mutate({ data: parsed.data, token: captchaToken })
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Tu carrito está vacío</h1>
        <Link to={`/r/${slug}`} className="font-semibold text-brand hover:underline">
          Ver el menú
        </Link>
      </main>
    )
  }

  /** Crea el onChange de un campo de texto del formulario. */
  const set = (field: 'name' | 'phone' | 'address' | 'notes') => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  return (
    <div className="min-h-dvh bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link to={`/r/${slug}`} aria-label="Volver al menú" className="flex size-10 items-center justify-center rounded-full hover:bg-zinc-100">
            ←
          </Link>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Finalizar pedido</h1>
            <p className="text-sm text-zinc-500">{restaurant.name}</p>
          </div>
        </div>
      </header>

      <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {!open &&
          (mustSchedule ? (
            <Alert tone="info">El local está cerrado ahora, pero puedes programar tu pedido para más tarde.</Alert>
          ) : (
            <Alert tone="error">El local está cerrado y no está recibiendo pedidos en este momento.</Alert>
          ))}
        {order.isError && <Alert tone="error">{dbErrorMessage(order.error)}</Alert>}

        <Card title="Tus datos">
          <InputField label="Nombre" autoComplete="name" value={values.name} onChange={set('name')} error={errors.name} />
          <InputField
            label="Teléfono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={set('phone')}
            error={errors.phone}
            hint="El restaurante te contactará a este número si es necesario."
          />
        </Card>

        <Card title="¿Cómo lo recibes?">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Retiro o delivery">
            {restaurant.pickup_enabled && (
              <Choice
                name="type"
                checked={values.type === 'pickup'}
                onChange={() => setValues((v) => ({ ...v, type: 'pickup' }))}
                title="Retiro en el local"
                detail={restaurant.address ?? 'Sin costo'}
              />
            )}
            {restaurant.delivery_enabled && (
              <Choice
                name="type"
                checked={values.type === 'delivery'}
                onChange={() => setValues((v) => ({ ...v, type: 'delivery' }))}
                title="Delivery"
                detail={restaurant.delivery_fee > 0 ? `Envío ${formatCLP(restaurant.delivery_fee)}` : 'Envío gratis'}
              />
            )}
          </div>
          {values.type === 'delivery' && (
            <TextareaField
              label="Dirección de entrega"
              rows={2}
              autoComplete="street-address"
              value={values.address}
              onChange={set('address')}
              error={errors.address}
              placeholder="Calle, número, depto, comuna"
            />
          )}
        </Card>

        <Card title="Pago">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Método de pago">
            <Choice
              name="payment"
              checked={values.payment_method === 'cash'}
              onChange={() => setValues((v) => ({ ...v, payment_method: 'cash' }))}
              title="Efectivo"
              detail="Pagas al recibir o retirar"
            />
            <Choice
              name="payment"
              checked={values.payment_method === 'transfer'}
              onChange={() => setValues((v) => ({ ...v, payment_method: 'transfer' }))}
              title="Transferencia"
              detail={restaurant.transfer ? 'Te mostramos los datos aquí' : 'El restaurante te indicará sus datos'}
            />
          </div>
          {values.payment_method === 'transfer' && restaurant.transfer && <TransferDetails info={restaurant.transfer} />}
          <TextareaField
            label="Notas para el restaurante (opcional)"
            rows={2}
            value={values.notes}
            onChange={set('notes')}
            error={errors.notes}
            placeholder="Ej: sin cebolla, timbre no funciona"
          />
        </Card>

        {slots.length > 0 && (
          <SchedulePicker
            slots={slots}
            mustSchedule={mustSchedule}
            prepMinutes={restaurant.prep_time_minutes}
            when={when}
            onWhen={setWhen}
            slot={slot}
            onSlot={setSlot}
          />
        )}

        <OrderSummary
          lines={lines}
          subtotal={subtotal}
          deliveryFee={values.type === 'delivery' ? deliveryFee : null}
          tip={tip}
          coupon={coupon}
          discount={discount}
          total={total}
          onRemoveCoupon={() => setCoupon(null)}
        >
          <CouponField slug={slug} subtotal={subtotal} deliveryFee={deliveryFee} phone={values.phone} onApplied={setCoupon} />
        </OrderSummary>

        {restaurant.tips_enabled && <TipPicker percent={tipPercent} onChange={setTipPercent} />}

        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-5 accent-[var(--brand)]" />
          Recordar mis datos en este dispositivo
        </label>

        {belowMinimum && (
          <Alert tone="info">
            El pedido mínimo es {formatCLP(restaurant.min_order)}.{' '}
            <Link to={`/r/${slug}`} className="font-semibold underline">
              Agregar más productos
            </Link>
          </Alert>
        )}

        <Captcha ref={captcha} onToken={setCaptchaToken} />

        {/* Aviso de privacidad: qué pasa con los datos al confirmar (Ley 21.719). */}
        <p className="text-xs text-zinc-500">
          Al confirmar, tus datos se comparten con {restaurant.name} solo para preparar y entregar tu pedido. Ver{' '}
          <Link to="/legal/privacidad" target="_blank" className="underline">
            Política de privacidad
          </Link>{' '}
          y{' '}
          <Link to="/legal/terminos" target="_blank" className="underline">
            Términos
          </Link>
          .
        </p>

        <button
          type="submit"
          disabled={order.isPending || (!open && !mustSchedule) || belowMinimum || !captchaToken}
          className="flex min-h-14 w-full items-center justify-between rounded-xl bg-brand px-6 text-lg font-semibold text-brand-contrast disabled:opacity-50"
        >
          <span>{order.isPending ? 'Enviando pedido…' : captchaToken ? 'Confirmar pedido' : 'Verificando…'}</span>
          <span className="tabular-nums">{formatCLP(total)}</span>
        </button>
      </form>
    </div>
  )
}
