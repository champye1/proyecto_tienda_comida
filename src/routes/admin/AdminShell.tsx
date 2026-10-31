/**
 * Estructura común de las páginas del panel: cabecera (restaurante activo, interruptor
 * Abierto/Cerrado, "Ver tienda", "Cerrar sesión") + pestañas + contenido (<Outlet />).
 *
 * Aquí vive OrdersLiveProvider: la escucha de pedidos en vivo y la alerta sonora funcionan
 * en todas las secciones del panel, no solo en Pedidos.
 *
 * Está pensada para tablet (muchos restaurantes la usarán en cocina): botones de al
 * menos 44 px de alto y cabecera fija al hacer scroll.
 */
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useSession } from '@/features/auth/AuthProvider'
import { OrdersLiveProvider, useOrdersLive } from '@/features/orders/OrdersLive'
import { CurrentRestaurantProvider, useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { supabase } from '@/lib/supabase'
import { StoreOpenToggle } from './StoreOpenToggle'

/** Pestañas del panel. */
const NAV_ITEMS = [
  { to: '/admin', label: 'Inicio', end: true },
  { to: '/admin/pedidos', label: 'Pedidos', end: false },
  { to: '/admin/menu', label: 'Menú', end: false },
  { to: '/admin/reportes', label: 'Reportes', end: false },
  { to: '/admin/local', label: 'Mi local', end: false },
  { to: '/admin/cuenta', label: 'Mi cuenta', end: false },
] as const

/**
 * Punto de entrada del panel con restaurante activo. Si el usuario no tiene
 * restaurantes, CurrentRestaurantProvider lo redirige al onboarding.
 */
export default function AdminShell() {
  return (
    <CurrentRestaurantProvider>
      <OrdersLiveProvider>
        <AdminLayout />
      </OrdersLiveProvider>
    </CurrentRestaurantProvider>
  )
}

/** Cabecera + navegación + contenido. */
function AdminLayout() {
  const session = useSession()
  const navigate = useNavigate()
  const { restaurant, restaurants, selectRestaurant } = useCurrentRestaurant()
  const [signingOut, setSigningOut] = useState(false)
  const { pendingCount, sound } = useOrdersLive()

  /** Cierra la sesión. AuthProvider limpia la caché de datos del usuario al detectarlo. */
  async function signOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          {/* Restaurante activo: selector solo si el usuario pertenece a más de uno. */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img src="/logo.svg" alt="" className="size-8 shrink-0" />
            {restaurants.length > 1 ? (
              <select
                aria-label="Restaurante activo"
                value={restaurant.id}
                onChange={(e) => selectRestaurant(e.target.value)}
                className="min-h-11 min-w-0 max-w-full truncate rounded-lg border border-zinc-300 bg-white px-3 text-base font-semibold sm:text-sm"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-base font-semibold text-zinc-900">{restaurant.name}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <StoreOpenToggle />
            <a
              href={`/r/${restaurant.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Ver tienda ↗
            </a>
            <button
              onClick={signOut}
              disabled={signingOut}
              title={session.user.email}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Pestañas; con overflow-x-auto se pueden deslizar en pantallas angostas. */}
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Secciones del panel">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                  isActive ? 'border-brand text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'
                }`
              }
            >
              {item.label}
              {/* Contador de pedidos nuevos sin confirmar. */}
              {item.to === '/admin/pedidos' && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-brand-contrast">{pendingCount}</span>
              )}
            </NavLink>
          ))}
          <Link
            to="/admin/onboarding"
            className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-800"
          >
            + Nuevo restaurante
          </Link>
        </nav>
      </header>

      {/* El navegador no deja sonar la alerta hasta que la persona toque la pantalla.
          Es flotante a propósito: si estuviera en la cabecera, al desaparecer movería la página
          en medio del primer toque y ese toque caería sobre otro botón. */}
      {sound.blocked && (
        <p
          role="status"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-xl bg-amber-100 px-4 py-3 text-center text-sm font-medium text-amber-900 shadow-lg"
        >
          🔔 Toca cualquier parte de la pantalla para activar el sonido de pedidos nuevos.
        </p>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
