/**
 * "Mi local" (/admin/local): datos y configuración del restaurante.
 *
 * - Datos que ve el cliente: nombre, descripción, teléfono, dirección, logo y color.
 * - Cómo vende: retiro en local y/o delivery, costo de envío y pedido mínimo.
 * - Solo el dueño puede guardar (la RLS de restaurants también lo exige); el personal
 *   ve los datos en modo lectura.
 * - El logo se procesa igual que las fotos (WebP, sin metadatos, nombre aleatorio) y el
 *   anterior se borra del Storage al reemplazarlo.
 * - La dirección web (slug) no se puede cambiar: rompería los links ya compartidos.
 */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField, TextareaField } from '@/components/ui/Field'
import { formatPriceInput, PriceField } from '@/components/ui/PriceField'
import { Switch } from '@/components/ui/Switch'
import { useSession } from '@/features/auth/AuthProvider'
import { processImage, removeRestaurantImage, uploadRestaurantImage, validateImageFile } from '@/features/menu/images'
import { restaurantKeys } from '@/features/restaurants/api'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { restaurantSettingsSchema, type RestaurantSettingsValues } from '@/features/restaurants/schemas'
import { contrastColor } from '@/features/store/appearance'
import { dbErrorMessage } from '@/lib/errors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'

/** Tamaño máximo del logo (px): se muestra pequeño, no necesita más. */
const LOGO_SIZE = 512

export default function SettingsPage() {
  const { restaurant } = useCurrentRestaurant()
  const session = useSession()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const isOwner = restaurant.role === 'owner'

  const [values, setValues] = useState<RestaurantSettingsValues>({
    name: restaurant.name,
    description: restaurant.description ?? '',
    phone: restaurant.phone ?? '',
    address: restaurant.address ?? '',
    primary_color: restaurant.primary_color,
    pickup_enabled: restaurant.pickup_enabled,
    delivery_enabled: restaurant.delivery_enabled,
    delivery_fee: formatPriceInput(String(restaurant.delivery_fee)),
    min_order: formatPriceInput(String(restaurant.min_order)),
  })
  const [errors, setErrors] = useState<FieldErrors<RestaurantSettingsValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Logo: nuevo (pendiente de subir) o "quitar el actual".
  const [pendingLogo, setPendingLogo] = useState<{ blob: Blob; previewUrl: string } | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  useEffect(() => () => {
    if (pendingLogo) URL.revokeObjectURL(pendingLogo.previewUrl)
  }, [pendingLogo])

  const shownLogo = pendingLogo?.previewUrl ?? (removeLogo ? null : restaurant.logo_url)
  const colorValid = /^#[0-9a-fA-F]{6}$/.test(values.primary_color)

  const set = (field: 'name' | 'description' | 'phone' | 'address') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [field]: e.target.value }))

  async function onPickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) return setLogoError(invalid)
    setLogoError(null)
    try {
      const blob = await processImage(file, LOGO_SIZE)
      setPendingLogo({ blob, previewUrl: URL.createObjectURL(blob) })
      setRemoveLogo(false)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'No se pudo procesar la imagen.')
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaved(false)
    const parsed = restaurantSettingsSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)
    const previousLogo = restaurant.logo_url
    let uploaded: string | null = null
    try {
      if (pendingLogo) uploaded = await uploadRestaurantImage(restaurant.id, pendingLogo.blob)
      const logoUrl = uploaded ?? (removeLogo ? null : previousLogo)
      const d = parsed.data
      const { error } = await supabase
        .from('restaurants')
        .update({
          name: d.name,
          description: d.description || null,
          phone: d.phone || null,
          address: d.address || null,
          primary_color: d.primary_color.toLowerCase(),
          pickup_enabled: d.pickup_enabled,
          delivery_enabled: d.delivery_enabled,
          delivery_fee: d.delivery_fee,
          min_order: d.min_order,
          logo_url: logoUrl,
        })
        .eq('id', restaurant.id)
      if (error) throw error
      if (previousLogo && previousLogo !== logoUrl) void removeRestaurantImage(previousLogo)
      await queryClient.invalidateQueries({ queryKey: restaurantKeys.mine(session.user.id) })
      // La tienda pública vuelve a pedir el menú (con los datos nuevos) en esta misma sesión.
      void queryClient.invalidateQueries({ queryKey: ['store', restaurant.slug, 'menu'] })
      setPendingLogo(null)
      setRemoveLogo(false)
      setSaved(true)
    } catch (err) {
      if (uploaded) void removeRestaurantImage(uploaded)
      setFormError(err instanceof Error && !('code' in err) ? err.message : dbErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Mi local</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Así te ven tus clientes en <span className="font-medium">/r/{restaurant.slug}</span>. La dirección web no se puede cambiar para
          no romper los links que ya compartiste.
        </p>
      </div>

      {!isOwner && <Alert tone="info">Solo el dueño del local puede cambiar esta configuración.</Alert>}

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {formError && <Alert tone="error">{formError}</Alert>}
        {saved && <Alert tone="success">Cambios guardados. Tu tienda ya muestra los datos nuevos.</Alert>}

        <fieldset disabled={!isOwner} className="space-y-6">
          <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="font-semibold text-zinc-900">Datos del local</h2>
            <InputField label="Nombre" value={values.name} onChange={set('name')} error={errors.name} />
            <TextareaField
              label="Descripción (opcional)"
              rows={2}
              value={values.description}
              onChange={set('description')}
              error={errors.description}
              hint="Aparece en tu tienda y al compartir el link por WhatsApp o Instagram."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <InputField label="Teléfono (opcional)" type="tel" inputMode="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
              <InputField label="Dirección (opcional)" value={values.address} onChange={set('address')} error={errors.address} />
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="font-semibold text-zinc-900">Apariencia</h2>
            <div className="flex flex-wrap items-start gap-6">
              <div className="space-y-2">
                <span className="block text-sm font-medium text-zinc-800">Logo</span>
                {shownLogo ? (
                  <img src={shownLogo} alt="Vista previa del logo" className="size-24 rounded-2xl border border-zinc-200 object-cover" />
                ) : (
                  <span className="flex size-24 items-center justify-center rounded-2xl bg-zinc-900 text-3xl font-bold text-white">
                    {values.name.charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPickLogo} aria-label="Elegir logo" />
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
                    {shownLogo ? 'Cambiar' : 'Subir logo'}
                  </Button>
                  {shownLogo && (
                    <Button type="button" variant="ghost" onClick={() => { setPendingLogo(null); setRemoveLogo(true) }}>
                      Quitar
                    </Button>
                  )}
                </div>
                {logoError && <p className="text-sm text-red-600">{logoError}</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="color" className="block text-sm font-medium text-zinc-800">
                  Color de tu tienda
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="color"
                    type="color"
                    value={colorValid ? values.primary_color : '#e11d48'}
                    onChange={(e) => setValues((v) => ({ ...v, primary_color: e.target.value }))}
                    className="h-11 w-16 cursor-pointer rounded-lg border border-zinc-300 bg-white"
                  />
                  <code className="text-sm text-zinc-600">{values.primary_color}</code>
                </div>
                {/* Vista previa: el texto elige blanco o negro según el color, para que siempre se lea. */}
                {colorValid && (
                  <PreviewButton color={values.primary_color} />
                )}
                {errors.primary_color && <p className="text-sm text-red-600">{errors.primary_color}</p>}
              </div>
            </div>
          </section>

          <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="font-semibold text-zinc-900">Cómo vendes</h2>
            <div className="flex flex-wrap gap-6">
              <Switch checked={values.pickup_enabled} onChange={(pickup_enabled) => setValues((v) => ({ ...v, pickup_enabled }))} label="Retiro en local" showLabel />
              <Switch checked={values.delivery_enabled} onChange={(delivery_enabled) => setValues((v) => ({ ...v, delivery_enabled }))} label="Delivery" showLabel />
            </div>
            {errors.delivery_enabled && <p className="text-sm text-red-600">{errors.delivery_enabled}</p>}
            <div className="grid gap-5 sm:grid-cols-2">
              {values.delivery_enabled && (
                <PriceField
                  label="Costo de envío"
                  value={values.delivery_fee}
                  onChange={(delivery_fee) => setValues((v) => ({ ...v, delivery_fee }))}
                  error={errors.delivery_fee}
                  hint="Déjalo vacío para delivery gratis."
                  maxDigits={7}
                />
              )}
              <PriceField
                label="Pedido mínimo"
                value={values.min_order}
                onChange={(min_order) => setValues((v) => ({ ...v, min_order }))}
                error={errors.min_order}
                hint="Déjalo vacío si no hay mínimo."
              />
            </div>
          </section>
        </fieldset>

        {isOwner && (
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Guardar cambios
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}

/** Botón de muestra con el color elegido (texto blanco o negro según el contraste). */
function PreviewButton({ color }: { color: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  // Colores aplicados por CSSOM (compatible con la CSP sin estilos inline en el HTML).
  useEffect(() => {
    ref.current?.style.setProperty('background-color', color)
    ref.current?.style.setProperty('color', contrastColor(color))
  }, [color])
  return (
    <span ref={ref} className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold">
      Así se ven tus botones
    </span>
  )
}
