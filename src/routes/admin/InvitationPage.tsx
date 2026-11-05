/**
 * Aceptar una invitación al equipo (/admin/invitacion/:token).
 *
 * Requiere sesión (RequireAuth): quien llega sin sesión va al login con ?next= de vuelta a
 * esta página; desde ahí también puede crear su cuenta. Fuera de AdminShell, porque el
 * invitado normalmente todavía no tiene restaurante.
 *
 * Muestra el nombre del local y, si la sesión no es del email invitado, se lo indica (con
 * el email enmascarado) en vez de dejarlo aceptar. La base lo vuelve a verificar al aceptar.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useSession } from '@/features/auth/AuthProvider'
import { restaurantKeys } from '@/features/restaurants/api'
import { rememberRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { acceptInvitation, invitationQuery } from '@/features/team/api'
import { dbErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { AuthCard } from './AuthCard'

const TOKEN = /^[0-9a-f]{48}$/

/** Página para aceptar una invitación al equipo con el token del link. */
export default function InvitationPage() {
  const { token = '' } = useParams()
  const valid = TOKEN.test(token)
  const session = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const query = useQuery({ ...invitationQuery(token), enabled: valid })
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setAccepting(true)
    setError(null)
    try {
      const restaurantId = await acceptInvitation(token)
      rememberRestaurant(restaurantId) // el panel abre directo en el local al que se unió
      await queryClient.invalidateQueries({ queryKey: restaurantKeys.mine(session.user.id) })
      navigate('/admin/pedidos', { replace: true })
    } catch (e) {
      setError(dbErrorMessage(e))
      setAccepting(false)
    }
  }

  /** Cierra la sesión actual y vuelve al login, regresando aquí después. */
  async function switchAccount() {
    await supabase.auth.signOut()
    navigate(`/admin/login?next=${encodeURIComponent(`/admin/invitacion/${token}`)}`, { replace: true })
  }

  if (valid && query.isPending) return <PageLoader />
  const inv = valid ? query.data : null

  if (!inv || query.isError) {
    return (
      <AuthCard title="Invitación no válida">
        <p className="text-sm text-zinc-700">El link no existe o está incompleto. Pide al dueño del local que te envíe uno nuevo.</p>
        <Link to="/admin" className="mt-4 inline-block font-semibold text-brand hover:underline">
          Ir al panel
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={`Únete a ${inv.restaurant_name}`} subtitle="Podrás ver y gestionar los pedidos del local.">
      <div className="space-y-4 text-sm text-zinc-700">
        {error && <Alert tone="error">{error}</Alert>}
        {inv.accepted ? (
          <Alert tone="info">Esta invitación ya fue usada.</Alert>
        ) : inv.expired ? (
          <Alert tone="error">La invitación venció. Pide al dueño que te envíe una nueva.</Alert>
        ) : !inv.email_matches ? (
          <>
            <Alert tone="info">
              Esta invitación es para <strong>{inv.email_hint}</strong>, pero iniciaste sesión como <strong>{session.user.email}</strong>.
            </Alert>
            <Button className="w-full" onClick={switchAccount}>
              Entrar con otra cuenta
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={accept} loading={accepting}>
            Aceptar invitación
          </Button>
        )}
      </div>
    </AuthCard>
  )
}
