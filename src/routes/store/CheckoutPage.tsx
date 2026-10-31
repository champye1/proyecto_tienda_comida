/**
 * Checkout (/r/:slug/checkout): datos del cliente, retiro o delivery, pago y resumen.
 *
 * - Al confirmar se llama a create_order con SOLO ids y cantidades; el servidor calcula
 *   precios, valida todo y devuelve el número de pedido y el token de seguimiento.
 * - Si el servidor rechaza el pedido (local cerrado, producto agotado, límite de pedidos…)
 *   se muestra su mensaje y se recarga el menú, por si cambió algo.
 * - "Recordar mis datos" es opcional y viene desmarcado (privacidad: el dispositivo puede
 *   ser compartido). Si se desmarca, se borran los datos guardados.
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { InputField, TextareaField } from '@/components/ui/Field'
import { useDocumentMeta } from '@/features/store/appearance'
import { checkoutSchema, createOrder, readSavedCustomer, saveCustomer, type CheckoutValues } from '@/features/store/orders'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { useStore } from './StoreRoot'

export default function CheckoutPage() {
  const { slug, menu, cart, lines, subtotal } = useStore()
  const { restaurant } = menu
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useDocumentMeta({ title: `Finalizar pedido · ${restaurant.name}` })

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

  const order = useMutation({
    mutationFn: (data: Parameters<typeof createOrder>[1]) => createOrder(slug, data, cart.lines),
    onSuccess: (result, data) => {
      saveCustomer(remember ? { name: data.name, phone: data.phone, address: data.address } : null)
      cart.clear()
      navigate(`/r/${slug}/pedido/${result.tracking_token}`, { replace: true })
    },
    // Puede que el menú haya cambiado (producto agotado, local cerrado): se recarga.
    onError: () => queryClient.invalidateQueries({ queryKey: ['store', slug, 'menu'] }),
  })

  const deliveryFee = values.type === 'delivery' ? restaurant.delivery_fee : 0
  const total = subtotal + deliveryFee
  const belowMinimum = subtotal < restaurant.min_order

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = checkoutSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    order.mutate(parsed.data)
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
        {!restaurant.is_open && <Alert tone="error">El local está cerrado y no está recibiendo pedidos en este momento.</Alert>}
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
              detail="El restaurante te indicará sus datos"
            />
          </div>
          <TextareaField
            label="Notas para el restaurante (opcional)"
            rows={2}
            value={values.notes}
            onChange={set('notes')}
            error={errors.notes}
            placeholder="Ej: sin cebolla, timbre no funciona"
          />
        </Card>

        <Card title="Resumen">
          <ul className="divide-y divide-zinc-100 text-sm">
            {lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-zinc-900">
                    {l.quantity}× {l.product.name}
                  </span>
                  {l.optionsText && <span className="block text-zinc-500">{l.optionsText}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{formatCLP(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-zinc-200 pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatCLP(subtotal)}</dd>
            </div>
            {values.type === 'delivery' && (
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd className="tabular-nums">{formatCLP(deliveryFee)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCLP(total)}</dd>
            </div>
          </dl>
          <p className="text-xs text-zinc-500">El total final lo confirma el restaurante al recibir tu pedido.</p>
        </Card>

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

        <button
          type="submit"
          disabled={order.isPending || !restaurant.is_open || belowMinimum}
          className="flex min-h-14 w-full items-center justify-between rounded-xl bg-brand px-6 text-lg font-semibold text-brand-contrast disabled:opacity-50"
        >
          <span>{order.isPending ? 'Enviando pedido…' : 'Confirmar pedido'}</span>
          <span className="tabular-nums">{formatCLP(total)}</span>
        </button>
      </form>
    </div>
  )
}

/** Tarjeta de sección del formulario. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}

/** Opción tipo tarjeta (radio grande, fácil de tocar). */
function Choice({ name, checked, onChange, title, detail }: { name: string; checked: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label
      className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${
        checked ? 'border-brand bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 size-5 accent-[var(--brand)]" />
      <span>
        <span className="block font-semibold text-zinc-900">{title}</span>
        <span className="block text-sm text-zinc-500">{detail}</span>
      </span>
    </label>
  )
}
