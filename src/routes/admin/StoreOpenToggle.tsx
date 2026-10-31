/**
 * Interruptor "Abierto / Cerrado" del local, en la cabecera del panel.
 *
 * - Solo el dueño puede cambiarlo (la RLS de restaurants también lo exige); el personal
 *   ve el estado pero no puede tocarlo.
 * - Al cerrar se pide confirmación: dejarlo cerrado por error significa perder pedidos.
 * - La tienda pública se entera en hasta ~30 s (caché del menú), pero create_order lo
 *   valida siempre en el servidor: con el local cerrado no entra ningún pedido.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useSession } from '@/features/auth/AuthProvider'
import { restaurantKeys } from '@/features/restaurants/api'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export function StoreOpenToggle() {
  const { restaurant } = useCurrentRestaurant()
  const session = useSession()
  const queryClient = useQueryClient()
  const [confirmClose, setConfirmClose] = useState(false)
  const isOwner = restaurant.role === 'owner'

  const toggle = useMutation({
    mutationFn: async (isOpen: boolean) => {
      const { error } = await supabase.from('restaurants').update({ is_open: isOpen }).eq('id', restaurant.id)
      if (error) throw error
    },
    onSuccess: () => {
      setConfirmClose(false)
      return queryClient.invalidateQueries({ queryKey: restaurantKeys.mine(session.user.id) })
    },
  })

  const open = restaurant.is_open
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label={open ? 'Local abierto. Tocar para cerrar' : 'Local cerrado. Tocar para abrir'}
        disabled={!isOwner || toggle.isPending}
        title={isOwner ? undefined : 'Solo el dueño puede abrir o cerrar el local'}
        onClick={() => (open ? setConfirmClose(true) : toggle.mutate(true))}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
          open ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200' : 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300'
        } ${!isOwner ? 'opacity-80' : ''}`}
      >
        <span className={`relative inline-flex h-5 w-9 items-center rounded-full ${open ? 'bg-emerald-500' : 'bg-zinc-400'}`}>
          <span className={`size-4 rounded-full bg-white shadow transition-transform ${open ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
        </span>
        {open ? 'Abierto' : 'Cerrado'}
      </button>

      {toggle.isError && !confirmClose && (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-md">
          <Alert tone="error">{dbErrorMessage(toggle.error)}</Alert>
        </div>
      )}

      <ConfirmModal
        open={confirmClose}
        title="Cerrar el local"
        confirmLabel="Cerrar local"
        loading={toggle.isPending}
        error={toggle.isError ? dbErrorMessage(toggle.error) : null}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => toggle.mutate(false)}
      >
        <p>Mientras esté cerrado, tus clientes podrán ver el menú pero no hacer pedidos. Los pedidos en curso no se ven afectados.</p>
      </ConfirmModal>
    </>
  )
}
