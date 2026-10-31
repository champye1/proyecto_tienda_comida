/**
 * "Guardias" de rutas: componentes que deciden si una página se puede mostrar según
 * haya o no sesión, y si no, redirigen. Se usan como rutas padre en router.tsx.
 *
 * Ojo: esto es solo experiencia de usuario. La seguridad real está en la base de
 * datos (RLS): aunque alguien se saltara estas guardias, no podría leer ni modificar
 * datos ajenos.
 */
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { PageLoader } from '@/components/PageLoader'
import { useAuth } from './AuthProvider'

/** Acepta solo rutas internas del panel, para evitar redirecciones abiertas (?next=https://...). */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin'
}

/** Rutas que requieren sesión. Sin sesión → login, recordando a dónde volver. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/admin/login?next=${next}`} replace />
  }
  return <Outlet />
}

/** Login y registro: si ya hay sesión, no tiene sentido mostrarlos. */
export function GuestOnly() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()

  if (loading) return <PageLoader />
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}
