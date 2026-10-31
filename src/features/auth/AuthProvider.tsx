/**
 * Estado de la sesión de Supabase Auth, disponible para todo el panel (/admin).
 *
 * - <AuthProvider> escucha los cambios de sesión (login, logout, renovación de token,
 *   recuperación de contraseña) y los comparte por contexto.
 * - useAuth(): sesión actual + `loading` mientras Supabase lee la sesión guardada.
 * - useSession(): atajo para páginas protegidas, donde la sesión siempre existe.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthState = {
  session: Session | null
  /** true hasta que Supabase informa la sesión inicial. */
  loading: boolean
}

const AuthContext = createContext<AuthState | null>(null)

/** Proveedor de la sesión. Se monta una sola vez, en AdminRoot. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ session: null, loading: true })
  // Último usuario visto, para detectar cambios de usuario (logout o login de otra cuenta).
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    // onAuthStateChange emite INITIAL_SESSION al suscribirse, así que no hace falta getSession().
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      // Tablet compartida en cocina: al cambiar de usuario (o cerrar sesión) no debe quedar
      // en caché nada del usuario anterior.
      if (userIdRef.current !== null && userIdRef.current !== userId) {
        queryClient.clear()
      }
      userIdRef.current = userId
      setState({ session, loading: false })
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

/** Sesión actual (puede ser null) y si todavía se está cargando. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/** Sesión garantizada: usar solo bajo <RequireAuth>. */
export function useSession(): Session {
  const { session } = useAuth()
  if (!session) throw new Error('useSession requiere una sesión activa (usar bajo <RequireAuth>)')
  return session
}
