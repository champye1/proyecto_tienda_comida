/**
 * Menú del restaurante (/admin/menu): categorías y sus productos.
 *
 * Diseño para tablet: categorías a la izquierda y productos de la categoría elegida a
 * la derecha. En celular, las categorías se eligen con un selector.
 * La categoría elegida queda en la URL (?categoria=…) para volver a ella después de
 * editar un producto.
 *
 * Los productos se cargan paginados ("Cargar más"). Reordenar actualiza la pantalla al
 * instante (optimista) y guarda el nuevo orden con la RPC reorder_menu_items.
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Switch } from '@/components/ui/Switch'
import {
  categoriesQuery,
  menuApi,
  menuKeys,
  moveItem,
  PRODUCTS_PAGE_SIZE,
  productsInfiniteQuery,
  useMenuMutation,
  type Category,
  type Product,
  type ReorderKind,
} from '@/features/menu/api'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { CategoryFormModal } from './CategoryFormModal'
import { ReorderButtons } from './ReorderButtons'

export default function MenuPage() {
  const { restaurant } = useCurrentRestaurant()
  const rid = restaurant.id
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const categories = useQuery(categoriesQuery(rid))

  // Modales: crear/editar categoría y confirmar eliminación.
  const [categoryModal, setCategoryModal] = useState<{ category?: Category } | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)

  const deleteCategory = useMenuMutation(rid, (id: string) => menuApi.deleteCategory(rid, id))
  const reorder = useMenuMutation(rid, ({ kind, ids }: { kind: ReorderKind; ids: string[] }) => menuApi.reorder(kind, ids))

  if (categories.isPending) return <PageLoader />
  if (categories.isError) return <Alert tone="error">{dbErrorMessage(categories.error)}</Alert>

  const list = categories.data
  const selectedIndex = Math.max(0, list.findIndex((c) => c.id === params.get('categoria')))
  const selected = list[selectedIndex]

  /** Elige una categoría (queda en la URL). */
  const select = (id: string) => setParams({ categoria: id }, { replace: true })

  /** Mueve la categoría elegida una posición: pantalla al instante + guardado en la base. */
  function moveCategory(direction: -1 | 1) {
    const next = moveItem(list, selectedIndex, direction)
    queryClient.setQueryData(menuKeys.categories(rid), next)
    reorder.mutate({ kind: 'categories', ids: next.map((c) => c.id) })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Menú</h1>
          <p className="mt-1 text-sm text-zinc-600">Organiza tus categorías y productos. Los cambios se ven al instante en tu tienda.</p>
        </div>
        <Button onClick={() => setCategoryModal({})}>+ Nueva categoría</Button>
      </div>

      {reorder.isError && <Alert tone="error">No se pudo guardar el nuevo orden. {dbErrorMessage(reorder.error)}</Alert>}

      {list.length === 0 || !selected ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-zinc-900">Tu menú está vacío</h2>
          <p className="mt-2 text-sm text-zinc-600">Empieza creando una categoría, por ejemplo "Pizzas" o "Bebidas".</p>
          <Button className="mt-5" onClick={() => setCategoryModal({})}>
            Crear la primera categoría
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          {/* Categorías: lista en tablet/escritorio, selector en celular. */}
          <aside>
            <label className="md:hidden">
              <span className="sr-only">Categoría</span>
              <select
                value={selected.id}
                onChange={(e) => select(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base"
              >
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.product_count})
                  </option>
                ))}
              </select>
            </label>
            <nav aria-label="Categorías" className="hidden md:block">
              <ul className="space-y-1">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => select(c.id)}
                      aria-current={c.id === selected.id ? 'true' : undefined}
                      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm ${
                        c.id === selected.id ? 'bg-zinc-900 font-semibold text-white' : 'text-zinc-700 hover:bg-white'
                      }`}
                    >
                      <span className="truncate">
                        {c.name}
                        {!c.is_active && <span className="ml-1 text-xs opacity-70">(oculta)</span>}
                      </span>
                      <span className={`text-xs ${c.id === selected.id ? 'text-zinc-300' : 'text-zinc-500'}`}>{c.product_count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <section aria-label={`Productos de ${selected.name}`} className="min-w-0 space-y-4">
            {/* Cabecera de la categoría elegida */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-zinc-900">{selected.name}</h2>
                <p className="text-sm text-zinc-500">
                  {selected.product_count} producto{selected.product_count === 1 ? '' : 's'}
                  {!selected.is_active && ' · Oculta en la tienda'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <ReorderButtons
                  label={`la categoría ${selected.name}`}
                  onUp={() => moveCategory(-1)}
                  onDown={() => moveCategory(1)}
                  isFirst={selectedIndex === 0}
                  isLast={selectedIndex === list.length - 1}
                  disabled={reorder.isPending}
                />
                <Button variant="ghost" onClick={() => setCategoryModal({ category: selected })}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => setToDelete(selected)}>
                  Eliminar
                </Button>
                <Link
                  to={`/admin/menu/productos/nuevo?categoria=${selected.id}`}
                  className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast"
                >
                  + Nuevo producto
                </Link>
              </div>
            </div>

            {/* key: al cambiar de categoría se reinicia la lista (y su paginación). */}
            <ProductList key={selected.id} rid={rid} category={selected} />
          </section>
        </div>
      )}

      <CategoryFormModal
        rid={rid}
        open={categoryModal !== null}
        category={categoryModal?.category}
        onClose={() => setCategoryModal(null)}
      />

      {/* Eliminar categoría: solo si está vacía (la base también lo impide). */}
      <ConfirmModal
        open={toDelete !== null}
        title="Eliminar categoría"
        confirmLabel={toDelete && toDelete.product_count > 0 ? 'Entendido' : 'Eliminar'}
        loading={deleteCategory.isPending}
        error={deleteCategory.isError ? dbErrorMessage(deleteCategory.error) : null}
        onClose={() => {
          setToDelete(null)
          deleteCategory.reset()
        }}
        onConfirm={() => {
          if (!toDelete) return
          if (toDelete.product_count > 0) {
            setToDelete(null)
            return
          }
          deleteCategory.mutate(toDelete.id, {
            onSuccess: () => {
              setToDelete(null)
              setParams({}, { replace: true })
            },
          })
        }}
      >
        {toDelete && toDelete.product_count > 0 ? (
          <p>
            <strong>{toDelete.name}</strong> tiene {toDelete.product_count} producto
            {toDelete.product_count === 1 ? '' : 's'}. Muévelos a otra categoría o elimínalos antes de borrarla. Si solo
            quieres que no se vea, usa <em>Editar → Visible en la tienda</em>.
          </p>
        ) : (
          <p>
            ¿Eliminar <strong>{toDelete?.name}</strong>? Esta acción no se puede deshacer.
          </p>
        )}
      </ConfirmModal>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Productos de una categoría (paginados)
// -----------------------------------------------------------------------------

function ProductList({ rid, category }: { rid: string; category: Category }) {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery(productsInfiniteQuery(rid, category.id))
  const toggle = useMenuMutation(rid, (p: { id: string; is_available: boolean }) => menuApi.updateProduct(rid, p))
  const reorder = useMenuMutation(rid, (ids: string[]) => menuApi.reorder('products', ids))

  if (query.isPending) return <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
  if (query.isError) return <Alert tone="error">{dbErrorMessage(query.error)}</Alert>

  const products = query.data.pages.flat()

  /**
   * Mueve un producto y guarda el orden de los productos cargados. Como las páginas se
   * cargan en orden, los cargados son siempre los primeros: los demás mantienen su
   * posición (mayor) y el orden total sigue siendo consistente.
   */
  function move(index: number, direction: -1 | 1) {
    const next = moveItem(products, index, direction)
    queryClient.setQueryData<InfiniteData<Product[], number>>(menuKeys.products(rid, category.id), (old) =>
      old && {
        ...old,
        pages: old.pages.map((_, i) => next.slice(i * PRODUCTS_PAGE_SIZE, (i + 1) * PRODUCTS_PAGE_SIZE)),
      },
    )
    reorder.mutate(next.map((p) => p.id))
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
        Esta categoría no tiene productos todavía.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {toggle.isError && <Alert tone="error">{dbErrorMessage(toggle.error)}</Alert>}
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {products.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
            {p.image_url ? (
              <img src={p.image_url} alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
            ) : (
              <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg font-semibold text-zinc-400">
                {p.name.charAt(0).toUpperCase()}
              </span>
            )}
            {/* min-w-[9rem]: si no cabe junto a los controles, estos bajan a otra línea (celular). */}
            <div className="min-w-[9rem] flex-1">
              <p className={`truncate font-medium ${p.is_available ? 'text-zinc-900' : 'text-zinc-500 line-through'}`}>{p.name}</p>
              <p className="text-sm text-zinc-600">{formatCLP(p.price)}</p>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                checked={p.is_available}
                onChange={(is_available) => toggle.mutate({ id: p.id, is_available })}
                label={`${p.name} disponible`}
                disabled={toggle.isPending}
              />
              <ReorderButtons
                label={p.name}
                onUp={() => move(i, -1)}
                onDown={() => move(i, 1)}
                isFirst={i === 0}
                isLast={i === products.length - 1}
                disabled={reorder.isPending}
              />
              <Link
                to={`/admin/menu/productos/${p.id}`}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Editar
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
            Cargar más productos
          </Button>
        </div>
      )}
      <p className="text-center text-xs text-zinc-500">El interruptor marca si el producto está disponible (apagado = agotado).</p>
    </div>
  )
}
