/**
 * Raíz de la tienda (/r/:slug y sus subpáginas: checkout y pedido).
 *
 * Carga el menú UNA vez, aplica el color del restaurante y mantiene el carrito, y los
 * comparte con las páginas hijas por contexto (useStore). Si el carrito guardado tenía
 * productos que ya no están disponibles, los quita y avisa.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { resolveCart, useCart, type Cart, type ResolvedLine } from '@/features/store/cart'
import { publicMenuQuery, type PublicMenu } from '@/features/store/menu'
import { useBrandColor } from '@/features/store/appearance'
import { dbErrorMessage } from '@/lib/errors'

type StoreState = {
  slug: string
  menu: PublicMenu
  cart: Cart
  /** Carrito resuelto con el menú actual (precios para mostrar). */
  lines: ResolvedLine[]
  subtotal: number
  /** Cantidad total de unidades en el carrito. */
  count: number
}

const StoreContext = createContext<StoreState | null>(null)

/** Datos de la tienda actual. Solo dentro de las páginas de /r/:slug. */
export function useStore(): StoreState {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de StoreRoot')
  return ctx
}

export default function StoreRoot() {
  const { slug = '' } = useParams()
  const query = useQuery(publicMenuQuery(slug))
  useBrandColor(query.data?.restaurant.primary_color)

  if (query.isPending) return <PageLoader />
  if (query.isError) {
    return (
      <Centered>
        <Alert tone="error">{dbErrorMessage(query.error)}</Alert>
      </Centered>
    )
  }
  if (!query.data) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold text-zinc-900">Tienda no encontrada</h1>
        <p className="text-zinc-600">Revisa que el link esté bien escrito.</p>
      </Centered>
    )
  }

  // key: cada restaurante con su propio carrito si se navega de una tienda a otra.
  return <StoreProvider key={slug} slug={slug} menu={query.data} />
}

function StoreProvider({ slug, menu }: { slug: string; menu: PublicMenu }) {
  const cart = useCart(slug)
  const { resolved, dropped, subtotal, count } = useMemo(() => resolveCart(cart.lines, menu), [cart.lines, menu])
  const [droppedNotice, setDroppedNotice] = useState(false)

  // Quita del carrito guardado lo que ya no se puede pedir (y avisa una vez).
  useEffect(() => {
    if (dropped === 0) return
    cart.keepOnly(new Set(resolved.map((l) => l.key)))
    setDroppedNotice(true)
  }, [dropped, resolved, cart])

  const value = useMemo(() => ({ slug, menu, cart, lines: resolved, subtotal, count }), [slug, menu, cart, resolved, subtotal, count])

  return (
    <StoreContext.Provider value={value}>
      {droppedNotice && (
        <div className="fixed inset-x-4 top-4 z-40 mx-auto max-w-md" role="status">
          <Alert tone="info">
            Algunos productos de tu carrito ya no están disponibles y se quitaron.{' '}
            <button className="font-semibold underline" onClick={() => setDroppedNotice(false)}>
              Entendido
            </button>
          </Alert>
        </div>
      )}
      <Outlet />
    </StoreContext.Provider>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
      <Link to="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
        Ir al inicio
      </Link>
    </main>
  )
}
