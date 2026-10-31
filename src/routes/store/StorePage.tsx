/**
 * Tienda pública de un restaurante (/r/:slug). Diseño mobile-first: la mayoría de los
 * clientes pide desde el celular.
 *
 *   Cabecera     logo, nombre, estado abierto/cerrado, delivery/retiro y pedido mínimo.
 *   Categorías   barra fija con desplazamiento horizontal; se marca la categoría que se
 *                está viendo y al tocar una se salta a ella.
 *   Productos    agrupados por categoría; al tocar uno se abre su hoja con opciones.
 *   Carrito      barra fija abajo con cantidad y total; abre la hoja del carrito.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useDocumentMeta } from '@/features/store/appearance'
import type { PublicProduct } from '@/features/store/menu'
import { formatCLP } from '@/lib/format'
import { CartSheet } from './CartSheet'
import { ProductSheet } from './ProductSheet'
import { useStore } from './StoreRoot'

export default function StorePage() {
  const { menu, cart, subtotal, count } = useStore()
  const { restaurant, categories } = menu
  const [openProduct, setOpenProduct] = useState<PublicProduct | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [added, setAdded] = useState(false)

  useDocumentMeta({
    title: `${restaurant.name} · Pide online`,
    description: restaurant.description ?? `Mira el menú de ${restaurant.name} y haz tu pedido online.`,
  })

  // Aviso breve "Agregado al carrito".
  useEffect(() => {
    if (!added) return
    const id = setTimeout(() => setAdded(false), 1800)
    return () => clearTimeout(id)
  }, [added])

  return (
    <div className="min-h-dvh bg-zinc-50 pb-28">
      <StoreHeader />

      {categories.length === 0 ? (
        <p className="mx-auto max-w-2xl px-4 py-16 text-center text-zinc-600">Este restaurante todavía no publica su menú.</p>
      ) : (
        <>
          <CategoryNav />
          <main className="mx-auto max-w-2xl space-y-8 px-4 pt-6">
            {categories.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} data-category={c.id} className="scroll-mt-20" aria-labelledby={`cat-title-${c.id}`}>
                <h2 id={`cat-title-${c.id}`} className="mb-3 text-xl font-bold text-zinc-900">
                  {c.name}
                </h2>
                <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  {c.products.map((p) => (
                    <li key={p.id}>
                      <ProductRow product={p} onOpen={() => setOpenProduct(p)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </main>
        </>
      )}

      <footer className="mx-auto max-w-2xl px-4 py-10 text-center text-xs text-zinc-500">
        Pedidos online con{' '}
        <Link to="/" className="font-semibold hover:text-zinc-800">
          Pedidos
        </Link>
      </footer>

      {/* Aviso al agregar */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
        {added && <span className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg">Agregado al carrito ✓</span>}
      </div>

      {/* Barra del carrito */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex min-h-12 w-full max-w-2xl items-center justify-between gap-3 rounded-xl bg-brand px-5 font-semibold text-brand-contrast shadow-lg"
          >
            <span className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-white/25 text-sm">{count}</span>
              Ver carrito
            </span>
            <span className="tabular-nums">{formatCLP(subtotal)}</span>
          </button>
        </div>
      )}

      <ProductSheet
        product={openProduct}
        onClose={() => setOpenProduct(null)}
        onAdd={(product, optionIds, quantity) => {
          const ok = cart.add(product.id, optionIds, quantity)
          if (ok) setAdded(true)
          return ok
        }}
      />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}

/** Cabecera con los datos del restaurante. */
function StoreHeader() {
  const { menu } = useStore()
  const r = menu.restaurant
  const modes = [r.pickup_enabled && 'Retiro en local', r.delivery_enabled && `Delivery ${r.delivery_fee > 0 ? formatCLP(r.delivery_fee) : 'gratis'}`].filter(Boolean)

  return (
    <header className="bg-white">
      <div className="h-24 bg-brand" />
      <div className="mx-auto -mt-10 max-w-2xl px-4 pb-5">
        {r.logo_url ? (
          <img src={r.logo_url} alt={`Logo de ${r.name}`} width={80} height={80} className="size-20 rounded-2xl border-4 border-white bg-white object-cover shadow" />
        ) : (
          <span aria-hidden className="flex size-20 items-center justify-center rounded-2xl border-4 border-white bg-zinc-900 text-3xl font-bold text-white shadow">
            {r.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-zinc-900">{r.name}</h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              r.is_open ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            <span className={`size-2 rounded-full ${r.is_open ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
            {r.is_open ? 'Abierto' : 'Cerrado'}
          </span>
        </div>
        {r.description && <p className="mt-1 text-zinc-600">{r.description}</p>}
        <p className="mt-2 text-sm text-zinc-600">
          {modes.join(' · ')}
          {r.min_order > 0 && ` · Mínimo ${formatCLP(r.min_order)}`}
        </p>
        {r.address && <p className="mt-1 text-sm text-zinc-500">{r.address}</p>}
        {!r.is_open && (
          <p className="mt-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
            El local está cerrado y no está recibiendo pedidos. Puedes revisar el menú igual.
          </p>
        )}
      </div>
    </header>
  )
}

/**
 * Barra de categorías fija. Marca la categoría visible usando IntersectionObserver
 * (sin escuchar cada evento de scroll) y la mantiene visible dentro de la barra.
 */
function CategoryNav() {
  const { menu } = useStore()
  const [active, setActive] = useState(menu.categories[0]?.id)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('[data-category]')
    // Una sección es la "activa" cuando cruza una franja cerca del borde superior.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.getAttribute('data-category') ?? undefined)
      },
      { rootMargin: '-80px 0px -70% 0px' },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [menu])

  // Lleva el botón activo a la vista dentro de la barra horizontal.
  useEffect(() => {
    const button = navRef.current?.querySelector<HTMLElement>(`[data-target="${active}"]`)
    button?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [active])

  function goTo(id: string) {
    setActive(id)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav aria-label="Categorías del menú" className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div ref={navRef} className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {menu.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            data-target={c.id}
            onClick={() => goTo(c.id)}
            aria-current={active === c.id ? 'true' : undefined}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
              active === c.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </nav>
  )
}

/** Fila de producto: nombre, descripción, precio y foto. Toda la fila abre la hoja. */
function ProductRow({ product, onOpen }: { product: PublicProduct; onOpen: () => void }) {
  const hasOptions = product.option_groups.length > 0
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-4 p-4 text-left hover:bg-zinc-50">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-zinc-900">{product.name}</h3>
        {product.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{product.description}</p>}
        <p className="mt-2 font-semibold text-zinc-900">
          {hasOptions && <span className="text-sm font-normal text-zinc-500">Desde </span>}
          {formatCLP(product.price)}
        </p>
      </div>
      {product.image_url && (
        <img src={product.image_url} alt="" width={96} height={96} loading="lazy" decoding="async" className="size-24 shrink-0 rounded-xl object-cover" />
      )}
    </button>
  )
}
