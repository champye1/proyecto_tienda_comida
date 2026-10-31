/**
 * Acceso a datos de restaurantes desde el panel (consultas y mutaciones de TanStack Query).
 *
 * Las pantallas no llaman a Supabase directamente para estos datos: usan estas
 * funciones, así las query keys y las invalidaciones de caché están en un solo lugar.
 */
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/types/database.types'
import type { z } from 'zod'
import type { createRestaurantSchema } from './schemas'

/** Fila de la tabla restaurants (tipo generado desde el esquema). */
export type Restaurant = Tables<'restaurants'>
/** Rol del usuario en un restaurante: 'owner' (dueño) o 'staff' (personal). */
export type MemberRole = Enums<'member_role'>
/** Restaurante del usuario actual + su rol en él. */
export type MyRestaurant = Restaurant & { role: MemberRole }
/** Respuesta de la RPC is_slug_available. */
export type SlugStatus = 'ok' | 'invalid' | 'reserved' | 'taken'

// Un usuario pertenece a pocos restaurantes; el límite evita traer listas sin tope.
const MY_RESTAURANTS_LIMIT = 50

/** Query keys de restaurantes: identifican cada dato en la caché de TanStack Query. */
export const restaurantKeys = {
  mine: (userId: string) => ['restaurants', 'mine', userId] as const,
  slug: (slug: string) => ['restaurants', 'slug-available', slug] as const,
}

/**
 * Restaurantes a los que pertenece el usuario, con su rol en cada uno.
 * Una sola petición: trae la membresía y los datos del restaurante juntos (join).
 */
export function myRestaurantsQuery(userId: string) {
  return queryOptions({
    queryKey: restaurantKeys.mine(userId),
    queryFn: async (): Promise<MyRestaurant[]> => {
      const { data, error } = await supabase
        .from('restaurant_members')
        .select('role, restaurant:restaurants(*)')
        .eq('user_id', userId)
        .order('created_at')
        .limit(MY_RESTAURANTS_LIMIT)
      if (error) throw error
      return data.flatMap((m) => (m.restaurant ? [{ ...m.restaurant, role: m.role }] : []))
    },
  })
}

/** ¿Está libre esta dirección web? Se usa en vivo en el onboarding. */
export function slugAvailabilityQuery(slug: string) {
  return queryOptions({
    queryKey: restaurantKeys.slug(slug),
    queryFn: async (): Promise<SlugStatus> => {
      const { data, error } = await supabase.rpc('is_slug_available', { p_slug: slug })
      if (error) throw error
      return data as SlugStatus
    },
    staleTime: 10_000,
  })
}

/**
 * Crea un restaurante con la RPC create_restaurant (el usuario queda como dueño).
 * Al terminar, recarga la lista de restaurantes del usuario. Los campos opcionales
 * vacíos se envían como undefined para que la base los guarde como NULL.
 */
export function useCreateRestaurant(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: z.output<typeof createRestaurantSchema>) => {
      const { data, error } = await supabase.rpc('create_restaurant', {
        p_name: values.name,
        p_slug: values.slug,
        p_phone: values.phone || undefined,
        p_address: values.address || undefined,
        p_description: values.description || undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: restaurantKeys.mine(userId) }),
  })
}
