/**
 * Equipo (/admin/equipo): quién tiene acceso al panel del restaurante.
 *
 * - El dueño invita al personal por email: se genera un link de un solo uso para enviarlo
 *   por WhatsApp o copiarlo. La persona entra (o crea su cuenta) con ESE email y acepta.
 * - El personal ve y gestiona pedidos, pero no cambia la configuración del local, el menú
 *   ni el equipo (lo exige la RLS de la base).
 * - El dueño puede revocar invitaciones pendientes y quitar a miembros del personal.
 * - El personal solo ve un aviso: la lista con emails es información del dueño.
 */
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InputField } from '@/components/ui/Field'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import {
  invitationsQuery,
  teamQuery,
  useCreateInvitation,
  useRemoveMember,
  useRevokeInvitation,
} from '@/features/team/api'
import { dbErrorMessage } from '@/lib/errors'
import { useNow } from '@/lib/useNow'

/** Página del equipo: el dueño invita y gestiona; el personal solo ve un aviso. */
export default function TeamPage() {
  const { restaurant } = useCurrentRestaurant()
  if (restaurant.role !== 'owner') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900">Equipo</h1>
        <Alert tone="info">Solo el dueño del local puede ver y gestionar el equipo.</Alert>
      </div>
    )
  }
  return <OwnerTeam rid={restaurant.id} restaurantName={restaurant.name} />
}

function OwnerTeam({ rid, restaurantName }: { rid: string; restaurantName: string }) {
  const team = useQuery(teamQuery(rid))
  const invitations = useQuery(invitationsQuery(rid))
  const create = useCreateInvitation(rid)
  const revoke = useRevokeInvitation(rid)
  const remove = useRemoveMember(rid)
  const [email, setEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const [toRemove, setToRemove] = useState<{ id: string; email: string } | null>(null)
  const now = useNow(60_000) // para marcar las invitaciones vencidas

  function invite(e: FormEvent) {
    e.preventDefault()
    setCopied(false)
    create.mutate(email, { onSuccess: () => setEmail('') })
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      /* el link queda visible para copiarlo a mano */
    }
  }

  const created = create.data
  const whatsappText = created
    ? `Te invito a gestionar los pedidos de ${restaurantName}. Entra con tu email ${created.email}: ${created.link}`
    : ''

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Equipo</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Invita a tu personal para que vea y gestione los pedidos. No podrán cambiar el menú, la configuración del local ni el equipo.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="font-semibold text-zinc-900">Invitar a una persona</h2>
        <form onSubmit={invite} noValidate className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <InputField label="Email de la persona" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" loading={create.isPending} disabled={email.trim() === ''}>
            Crear invitación
          </Button>
        </form>
        {create.isError && <Alert tone="error">{dbErrorMessage(create.error)}</Alert>}
        {created && (
          <div className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
            <p>
              Invitación lista para <strong>{created.email}</strong>. Envíale este link: vence en 7 días y sirve una sola vez.
              <strong> Guárdalo ahora:</strong> por seguridad no se vuelve a mostrar.
            </p>
            <p className="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-zinc-800">{created.link}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => copy(created.link)}>
                {copied ? 'Copiado ✓' : 'Copiar link'}
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Enviar por WhatsApp
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 font-semibold text-zinc-900">Personas con acceso</h2>
        {remove.isError && <Alert tone="error">{dbErrorMessage(remove.error)}</Alert>}
        {team.isPending ? (
          <PageLoader />
        ) : team.isError ? (
          <Alert tone="error">{dbErrorMessage(team.error)}</Alert>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {team.data.map((m) => (
              <li key={m.member_id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
                  {m.email}
                  {m.is_me && <span className="text-zinc-500"> (tú)</span>}
                </span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                  {m.role === 'owner' ? 'Dueño' : 'Personal'}
                </span>
                {m.role === 'staff' && (
                  <button
                    type="button"
                    onClick={() => setToRemove({ id: m.member_id, email: m.email })}
                    className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 font-semibold text-zinc-900">Invitaciones pendientes</h2>
        {revoke.isError && <Alert tone="error">{dbErrorMessage(revoke.error)}</Alert>}
        {invitations.isPending ? (
          <PageLoader />
        ) : invitations.isError ? (
          <Alert tone="error">{dbErrorMessage(invitations.error)}</Alert>
        ) : invitations.data.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay invitaciones pendientes.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {invitations.data.map((inv) => {
              const expired = new Date(inv.expires_at).getTime() < now
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{inv.email}</span>
                  <span className={expired ? 'text-red-700' : 'text-zinc-500'}>
                    {expired ? 'Vencida' : `Vence el ${new Date(inv.expires_at).toLocaleDateString('es-CL')}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => revoke.mutate(inv.id)}
                    disabled={revoke.isPending}
                    className="min-h-11 rounded-lg px-3 font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    Revocar
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={toRemove !== null}
        title="Quitar del equipo"
        confirmLabel="Quitar acceso"
        loading={remove.isPending}
        error={remove.isError ? dbErrorMessage(remove.error) : null}
        onClose={() => setToRemove(null)}
        onConfirm={() => toRemove && remove.mutate(toRemove.id, { onSuccess: () => setToRemove(null) })}
      >
        <p>
          <strong>{toRemove?.email}</strong> dejará de ver los pedidos de este local de inmediato.
        </p>
      </ConfirmModal>
    </div>
  )
}
