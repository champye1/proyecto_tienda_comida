/**
 * Onboarding (/admin/onboarding): formulario para registrar un restaurante.
 *
 * - La dirección web (slug) se genera sola a partir del nombre, hasta que el usuario
 *   la edita a mano.
 * - Mientras se escribe, se consulta al servidor si la dirección está libre
 *   (is_slug_available), con una espera de 400 ms para no consultar en cada tecla.
 * - Al enviar se llama a la RPC create_restaurant, que crea el restaurante, deja al
 *   usuario como dueño y crea el contador de pedidos, todo en una transacción.
 * También sirve para agregar un segundo restaurante desde el panel.
 */
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField, TextareaField } from '@/components/ui/Field'
import { useSession } from '@/features/auth/AuthProvider'
import { myRestaurantsQuery, slugAvailabilityQuery, useCreateRestaurant } from '@/features/restaurants/api'
import { rememberRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { createRestaurantSchema, type CreateRestaurantValues } from '@/features/restaurants/schemas'
import { SLUG_PATTERN, slugify } from '@/features/restaurants/slug'
import { dbErrorMessage } from '@/lib/errors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

const EMPTY: CreateRestaurantValues = { name: '', slug: '', phone: '', address: '', description: '' }

export default function OnboardingPage() {
  const session = useSession()
  const navigate = useNavigate()
  const createRestaurant = useCreateRestaurant(session.user.id)
  const myRestaurants = useQuery(myRestaurantsQuery(session.user.id))

  const [values, setValues] = useState<CreateRestaurantValues>(EMPTY)
  // true cuando el usuario editó el slug a mano: desde ahí deja de seguir al nombre.
  const [slugEdited, setSlugEdited] = useState(false)
  const [errors, setErrors] = useState<FieldErrors<CreateRestaurantValues>>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Disponibilidad del slug en vivo (con espera para no consultar en cada tecla).
  const debouncedSlug = useDebouncedValue(values.slug, 400)
  const slugLooksValid = debouncedSlug.length >= 3 && debouncedSlug.length <= 50 && SLUG_PATTERN.test(debouncedSlug)
  const slugCheck = useQuery({ ...slugAvailabilityQuery(debouncedSlug), enabled: slugLooksValid })
  // Solo se confía en el resultado si corresponde a lo que hay escrito ahora mismo.
  const slugSettled = debouncedSlug === values.slug
  const slugStatus = slugLooksValid && slugSettled ? slugCheck.data : undefined

  // Error del slug: primero el de validación al enviar; si no, el de disponibilidad.
  const slugError =
    errors.slug ??
    (slugStatus === 'taken'
      ? 'Esta dirección ya está en uso. Prueba con otra.'
      : slugStatus === 'reserved'
        ? 'Esta dirección está reservada. Prueba con otra.'
        : undefined)

  // Texto de ayuda bajo el slug: "Verificando…", "Disponible: …" o la URL que tendrá la tienda.
  const storeUrl = `${window.location.origin}/r/${values.slug || 'tu-restaurante'}`
  const slugHint =
    slugLooksValid && slugSettled && slugCheck.isFetching ? (
      'Verificando disponibilidad…'
    ) : slugStatus === 'ok' ? (
      <span className="text-green-700">Disponible: {storeUrl}</span>
    ) : (
      <>Tu tienda quedará en {storeUrl}</>
    )

  /** Al escribir el nombre, el slug se actualiza solo (si no fue editado a mano). */
  function onNameChange(e: ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    setValues((v) => ({ ...v, name, slug: slugEdited ? v.slug : slugify(name) }))
  }

  /** Edición manual del slug: se fuerza a minúsculas y los espacios pasan a guiones. */
  function onSlugChange(e: ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true)
    setErrors((errs) => ({ ...errs, slug: undefined }))
    setValues((v) => ({ ...v, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))
  }

  const set = (field: 'phone' | 'address' | 'description') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [field]: e.target.value }))

  /** Valida el formulario y crea el restaurante; al terminar abre su panel. */
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const parsed = createRestaurantSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    if (slugStatus === 'taken' || slugStatus === 'reserved') return
    setErrors({})

    createRestaurant.mutate(parsed.data, {
      onSuccess: (restaurant) => {
        rememberRestaurant(restaurant.id)
        navigate('/admin', { replace: true })
      },
      onError: (error) => {
        const message = dbErrorMessage(error)
        // Slug tomado entre la verificación y el envío, o reservado.
        if ('code' in error && (error.code === '23505' || message.includes('reservada'))) {
          setErrors({ slug: message })
        } else {
          setFormError(message)
        }
      },
    })
  }

  // Si ya tiene restaurantes, la página funciona como "Agregar otro restaurante".
  const hasRestaurants = (myRestaurants.data?.length ?? 0) > 0

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-6">
        {hasRestaurants && (
          <Link to="/admin" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            ← Volver al panel
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">
          {hasRestaurants ? 'Agregar otro restaurante' : 'Registra tu restaurante'}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Podrás cambiar estos datos después. El local queda cerrado hasta que lo abras desde el panel.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        {formError && <Alert tone="error">{formError}</Alert>}

        <InputField
          label="Nombre del restaurante"
          value={values.name}
          onChange={onNameChange}
          error={errors.name}
          autoComplete="organization"
          placeholder="Ej: Pizzería Don Pepe"
        />

        <InputField
          label="Dirección web de tu tienda"
          value={values.slug}
          onChange={onSlugChange}
          error={slugError}
          hint={slugHint}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="pizzeria-don-pepe"
        />

        <InputField
          label="Teléfono (opcional)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={set('phone')}
          error={errors.phone}
          placeholder="+56 9 1234 5678"
        />

        <InputField
          label="Dirección del local (opcional)"
          autoComplete="street-address"
          value={values.address}
          onChange={set('address')}
          error={errors.address}
          placeholder="Av. Providencia 1234, Providencia"
        />

        <TextareaField
          label="Descripción (opcional)"
          rows={3}
          value={values.description}
          onChange={set('description')}
          error={errors.description}
          hint="Aparece al compartir el link de tu tienda por WhatsApp o Instagram."
          placeholder="Pizzas a la piedra hechas al momento."
        />

        <Button type="submit" loading={createRestaurant.isPending} className="w-full">
          Crear restaurante
        </Button>
      </form>
    </main>
  )
}
