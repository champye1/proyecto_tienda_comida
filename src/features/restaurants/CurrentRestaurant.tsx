/**
 * "Restaurante activo" del panel.
 *
 * Un usuario puede pertenecer a varios restaurantes; todas las pantallas del panel
 * trabajan sobre uno a la vez. Este módulo carga la lista, elige el activo (el último
 * que se usó, guardado en localStorage, o el primero) y lo comparte por contexto:
 *   const { restaurant } = useCurrentRestaurant()
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useSession } from '@/features/auth/AuthProvider'
import { dbErrorMessage } from '@/lib/errors'
import { myRestaurantsQuery, type MyRestaurant } from './api'

/** Clave de localStorage donde se recuerda el último restaurante usado en este dispositivo. */
const STORAGE_KEY = 'admin:restaurant-id'

// localStorage puede fallar (modo privado, almacenamiento bloqueado): es solo una
// preferencia, así que los errores se ignoran.

/** Recuerda el restaurante elegido para la próxima vez que se abra el panel. */
export function rememberRestaurant(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* sin preferencia guardada */
  }
}

/** Lee el último restaurante usado (o null si no hay o no se puede leer). */
function readRememberedRestaurant(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

type CurrentRestaurantState = {
  /** Restaurante sobre el que trabaja el panel. */
  restaurant: MyRestaurant
  /** Todos los restaurantes del usuario (para el selector de la cabecera). */
  restaurants: MyRestaurant[]
  /** Cambia el restaurante activo y lo recuerda. */
  selectRestaurant: (id: string) => void
}

const CurrentRestaurantContext = createContext<CurrentRestaurantState | null>(null)

/**
 * Carga los restaurantes del usuario y fija el restaurante activo del panel.
 * Sin restaurantes → onboarding.
 */
export function CurrentRestaurantProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const query = useQuery(myRestaurantsQuery(session.user.id))
  const [selectedId, setSelectedId] = useState(readRememberedRestaurant)

  if (query.isPending) return <PageLoader />

  if (query.isError) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <Alert tone="error">{dbErrorMessage(query.error)}</Alert>
        <Button variant="secondary" onClick={() => query.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  const restaurants = query.data
  // Si el recordado ya no existe (o no pertenece a este usuario), se usa el primero.
  const restaurant = restaurants.find((r) => r.id === selectedId) ?? restaurants[0]
  if (!restaurant) return <Navigate to="/admin/onboarding" replace />

  const selectRestaurant = (id: string) => {
    rememberRestaurant(id)
    setSelectedId(id)
  }

  return (
    <CurrentRestaurantContext.Provider value={{ restaurant, restaurants, selectRestaurant }}>
      {children}
    </CurrentRestaurantContext.Provider>
  )
}

/** Restaurante activo del panel. Solo funciona dentro de <CurrentRestaurantProvider>. */
export function useCurrentRestaurant(): CurrentRestaurantState {
  const ctx = useContext(CurrentRestaurantContext)
  if (!ctx) throw new Error('useCurrentRestaurant debe usarse dentro de <CurrentRestaurantProvider>')
  return ctx
}
