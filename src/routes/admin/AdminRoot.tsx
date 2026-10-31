import { Outlet } from 'react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'

/** Raíz de /admin. La sesión solo se maneja aquí: la tienda pública no la necesita. */
export default function AdminRoot() {
  return (
    <AuthProvider>
      <div className="min-h-dvh bg-zinc-50">
        <Outlet />
      </div>
    </AuthProvider>
  )
}
