/**
 * Crear o editar un producto (/admin/menu/productos/nuevo y /admin/menu/productos/:productId).
 *
 * - Datos: nombre, descripción, precio en CLP, categoría y disponibilidad.
 * - Foto: se procesa en el navegador antes de subirla (ver features/menu/images.ts).
 * - Opciones (tamaños, agregados): se gestionan abajo, una vez que el producto existe.
 *   Por eso, al crear un producto, se pasa directo a su página de edición.
 *
 * Orden al guardar: 1) subir la foto nueva (si hay) 2) guardar el producto
 * 3) borrar la foto anterior. Si el paso 2 falla, se borra la foto recién subida para
 * no dejar archivos huérfanos.
 */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InputField, TextareaField } from '@/components/ui/Field'
import { formatPriceInput, PriceField } from '@/components/ui/PriceField'
import { Switch } from '@/components/ui/Switch'
import { categoriesQuery, menuApi, menuKeys, productQuery, type Category, type Product } from '@/features/menu/api'
import { processImage, removeRestaurantImage, uploadRestaurantImage, validateImageFile } from '@/features/menu/images'
import { productSchema, type ProductValues } from '@/features/menu/schemas'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { OptionGroupsEditor } from './OptionGroupsEditor'

export default function ProductEditorPage() {
  const { restaurant } = useCurrentRestaurant()
  const rid = restaurant.id
  const { productId } = useParams()
  const isNew = !productId
  const categories = useQuery(categoriesQuery(rid))
  const product = useQuery({ ...productQuery(rid, productId ?? ''), enabled: !isNew })

  if (categories.isPending || (!isNew && product.isPending)) return <PageLoader />
  if (categories.isError) return <Alert tone="error">{dbErrorMessage(categories.error)}</Alert>
  if (!isNew && (product.isError || !product.data)) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Producto no encontrado</h1>
        <p className="text-sm text-zinc-600">Puede que haya sido eliminado.</p>
        <Link to="/admin/menu" className="font-semibold text-brand hover:underline">
          Volver al menú
        </Link>
      </div>
    )
  }

  // key: al pasar de "nuevo" a "editar" (o de un producto a otro) el formulario se reinicia.
  return (
    <ProductForm
      key={productId ?? 'nuevo'}
      rid={rid}
      categories={categories.data}
      product={isNew ? null : product.data!}
    />
  )
}

type ProductFormProps = { rid: string; categories: Category[]; product: Product | null }

/** Foto elegida y procesada, aún no subida. */
type PendingImage = { blob: Blob; previewUrl: string }

function ProductForm({ rid, categories, product }: ProductFormProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [values, setValues] = useState<ProductValues>({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product ? formatPriceInput(String(product.price)) : '',
    category_id: product?.category_id ?? params.get('categoria') ?? categories[0]?.id ?? '',
    is_available: product?.is_available ?? true,
  })
  const [errors, setErrors] = useState<FieldErrors<ProductValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Foto: la actual (guardada), una nueva pendiente, o "quitar la actual".
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Libera la vista previa (URL blob:) cuando cambia o al salir de la página.
  useEffect(() => () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl)
  }, [pendingImage])

  const justCreated = (location.state as { created?: boolean } | null)?.created === true
  const shownImage = pendingImage?.previewUrl ?? (removeImage ? null : product?.image_url ?? null)
  const backTo = `/admin/menu?categoria=${values.category_id}`

  /** Al elegir una foto: validar, procesar (reducir + WebP sin metadatos) y mostrar vista previa. */
  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setImageError(invalid)
      return
    }
    setImageError(null)
    setProcessing(true)
    try {
      const blob = await processImage(file)
      setPendingImage({ blob, previewUrl: URL.createObjectURL(blob) })
      setRemoveImage(false)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'No se pudo procesar la foto.')
    } finally {
      setProcessing(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaved(false)
    const parsed = productSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)

    const previousUrl = product?.image_url ?? null
    let uploadedUrl: string | null = null
    try {
      // 1) Subir la foto nueva.
      if (pendingImage) uploadedUrl = await uploadRestaurantImage(rid, pendingImage.blob)
      const imageUrl = uploadedUrl ?? (removeImage ? null : previousUrl)
      const data = { ...parsed.data, description: parsed.data.description || null, image_url: imageUrl }

      // 2) Guardar el producto.
      if (product) {
        await menuApi.updateProduct(rid, { id: product.id, ...data })
      } else {
        const id = await menuApi.createProduct(rid, data)
        await queryClient.invalidateQueries({ queryKey: menuKeys.all(rid) })
        navigate(`/admin/menu/productos/${id}`, { replace: true, state: { created: true } })
        return
      }

      // 3) Borrar la foto anterior si se reemplazó o se quitó.
      if (previousUrl && previousUrl !== imageUrl) void removeRestaurantImage(previousUrl)
      await queryClient.invalidateQueries({ queryKey: menuKeys.all(rid) })
      setPendingImage(null)
      setRemoveImage(false)
      setSaved(true)
    } catch (err) {
      // El producto no se guardó: la foto recién subida queda sin uso, se borra.
      if (uploadedUrl) void removeRestaurantImage(uploadedUrl)
      // Errores propios (Error sin `code`) ya vienen en español; los de la base se traducen.
      setFormError(err instanceof Error && !('code' in err) ? err.message : dbErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!product) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await menuApi.deleteProduct(rid, product.id)
      void removeRestaurantImage(product.image_url)
      await queryClient.invalidateQueries({ queryKey: menuKeys.all(rid) })
      navigate(backTo, { replace: true })
    } catch (err) {
      setDeleteError(dbErrorMessage(err))
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to={backTo} className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
          ← Volver al menú
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">{product ? 'Editar producto' : 'Nuevo producto'}</h1>
      </div>

      {justCreated && <Alert tone="success">Producto creado. Si tiene tamaños o agregados, configúralos abajo en "Opciones".</Alert>}

      <form onSubmit={onSubmit} noValidate className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          {formError && <Alert tone="error">{formError}</Alert>}
          {saved && <Alert tone="success">Cambios guardados.</Alert>}
          <InputField
            label="Nombre"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            error={errors.name}
            placeholder="Ej: Pizza Margarita"
          />
          <TextareaField
            label="Descripción (opcional)"
            rows={3}
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            error={errors.description}
            placeholder="Ingredientes, tamaño, para cuántas personas…"
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <PriceField
              label="Precio"
              value={values.price}
              onChange={(price) => setValues((v) => ({ ...v, price }))}
              error={errors.price}
              hint="Precio base, sin agregados."
            />
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-zinc-800">Categoría</span>
              <select
                value={values.category_id}
                onChange={(e) => setValues((v) => ({ ...v, category_id: e.target.value }))}
                className="block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base sm:text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category_id && <span className="block text-sm text-red-600">{errors.category_id}</span>}
            </label>
          </div>
          <Switch
            checked={values.is_available}
            onChange={(is_available) => setValues((v) => ({ ...v, is_available }))}
            label="Disponible para pedir"
            showLabel
          />
        </div>

        {/* Foto */}
        <div className="space-y-3">
          <span className="block text-sm font-medium text-zinc-800">Foto (opcional)</span>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50">
            {processing ? (
              <span className="text-sm text-zinc-500">Procesando foto…</span>
            ) : shownImage ? (
              <img src={shownImage} alt="Vista previa de la foto del producto" className="size-full object-cover" />
            ) : (
              <span className="px-4 text-center text-sm text-zinc-500">Sin foto. Los productos con foto se venden más.</span>
            )}
          </div>
          {imageError && <p className="text-sm text-red-600">{imageError}</p>}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={onPickImage}
            aria-label="Elegir foto del producto"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()} disabled={processing}>
              {shownImage ? 'Cambiar foto' : 'Subir foto'}
            </Button>
            {shownImage && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPendingImage(null)
                  setRemoveImage(true)
                }}
              >
                Quitar
              </Button>
            )}
          </div>
          <p className="text-xs text-zinc-500">JPG, PNG o WebP, hasta 10 MB. Se optimiza automáticamente.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-5 lg:col-span-2">
          {product ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Eliminar producto
            </button>
          ) : (
            <span className="text-sm text-zinc-500">Después de guardar podrás agregar tamaños y agregados.</span>
          )}
          <Button type="submit" loading={saving} disabled={processing}>
            {product ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </form>

      {product && <OptionGroupsEditor rid={rid} productId={product.id} />}

      <ConfirmModal
        open={confirmDelete}
        title="Eliminar producto"
        confirmLabel="Eliminar"
        loading={deleting}
        error={deleteError}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
      >
        <p>
          ¿Eliminar <strong>{product?.name}</strong>? También se borran sus opciones. Los pedidos anteriores conservan el nombre
          y el precio. Si solo está agotado, mejor apaga "Disponible".
        </p>
      </ConfirmModal>
    </div>
  )
}
