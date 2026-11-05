/**
 * Equipo del restaurante: miembros, invitaciones al personal y aceptación.
 *
 * Seguridad (ver migración 16):
 *   - Solo el dueño ve el equipo, invita y revoca. Sumarse a un equipo SIEMPRE requiere
 *     aceptar una invitación con la cuenta del email invitado.
 *   - El link de invitación lleva un token secreto que se muestra una sola vez (en la base
 *     queda solo su hash). Vence a los 7 días.
 */
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Query keys del equipo: miembros, invitaciones pendientes y una invitación por token. */
export const teamKeys = {
  members: (rid: string) => ['team', rid, 'members'] as const,
  invitations: (rid: string) => ['team', rid, 'invitations'] as const,
  invitation: (token: string) => ['team', 'invitation', token] as const,
}

/** Miembros con su email (RPC get_team: solo el dueño). */
export function teamQuery(rid: string) {
  return queryOptions({
    queryKey: teamKeys.members(rid),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team', { p_restaurant_id: rid })
      if (error) throw error
      return data
    },
  })
}

/** Invitaciones pendientes (la RLS solo se las muestra al dueño). */
export function invitationsQuery(rid: string) {
  return queryOptions({
    queryKey: teamKeys.invitations(rid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_invitations')
        .select('id, email, expires_at, created_at')
        .eq('restaurant_id', rid)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
  })
}

/** Link que se comparte con la persona invitada. */
export function invitationLink(token: string): string {
  return `${window.location.origin}/admin/invitacion/${token}`
}

/** Crea (o renueva) una invitación y devuelve su link, que solo se puede ver ahora. */
export function useCreateInvitation(rid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc('create_invitation', { p_restaurant_id: rid, p_email: email })
      if (error) throw error
      const row = data[0]
      if (!row) throw new Error('No se pudo crear la invitación')
      return { email: email.trim().toLowerCase(), link: invitationLink(row.token) }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.invitations(rid) }),
  })
}

/** Revoca una invitación pendiente (su link deja de funcionar). */
export function useRevokeInvitation(rid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('restaurant_invitations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.invitations(rid) }),
  })
}

/** Quita a un miembro del personal (la RLS impide quitarse a uno mismo). */
export function useRemoveMember(rid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error, count } = await supabase.from('restaurant_members').delete({ count: 'exact' }).eq('id', memberId)
      if (error) throw error
      if (count === 0) throw new Error('No se pudo quitar a esta persona')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.members(rid) }),
  })
}

/** Datos de una invitación para la página de aceptación. null si el link no existe. */
export function invitationQuery(token: string) {
  return queryOptions({
    queryKey: teamKeys.invitation(token),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invitation', { p_token: token })
      if (error) throw error
      return data as null | {
        restaurant_name: string
        email_matches: boolean
        email_hint: string
        expired: boolean
        accepted: boolean
      }
    },
  })
}

/** Acepta la invitación; devuelve el id del restaurante al que se unió. */
export async function acceptInvitation(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
  if (error) throw error
  return data
}
