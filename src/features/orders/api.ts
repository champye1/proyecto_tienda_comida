/**
 * Pedidos del restaurante en el panel: consultas, cambio de estado y textos.
 *
 * - Pedidos "en curso" (pendiente → listo): se cargan juntos (máx. 200) y Realtime los
 *   mantiene al día (ver OrdersLive.tsx).
 * - Historial: paginado de a 20, del más nuevo al más antiguo.
 * - Cambiar estado: solo por la RPC update_order_status, que valida pertenencia y
 *   transiciones (la tabla orders no admite UPDATE directo).
 */
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums, Json, Tables } from '@/types/database.types'

export type OrderStatus = Enums<'order_status'>
export type OrderItem = Pick<Tables<'order_items'>, 'id' | 'product_name' | 'quantity' | 'unit_price' | 'line_total' | 'selected_options'>
export type AdminOrder = Tables<'orders'> & { order_items: OrderItem[] }

/** Estados que se muestran en el tablero (los demás ya terminaron). */
export const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready']
const ACTIVE_LIMIT = 200
export const HISTORY_PAGE_SIZE = 20

/** Pedido + sus ítems en una sola consulta (join de PostgREST). */
const ORDER_SELECT = '*, order_items(id, product_name, quantity, unit_price, line_total, selected_options)'

export const orderKeys = {
  all: (rid: string) => ['orders', rid] as const,
  active: (rid: string) => ['orders', rid, 'active'] as const,
  history: (rid: string) => ['orders', rid, 'history'] as const,
}

/** Pedidos en curso, del más antiguo al más nuevo (la cocina atiende en orden de llegada). */
export function activeOrdersQuery(rid: string) {
  return queryOptions({
    queryKey: orderKeys.active(rid),
    queryFn: async (): Promise<AdminOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', rid)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: true })
        .limit(ACTIVE_LIMIT)
      if (error) throw error
      return data
    },
    // Respaldo por si se pierde algún evento de Realtime: recarga cada 60 s.
    refetchInterval: 60_000,
    staleTime: 10_000,
  })
}

/** Historial completo, paginado. */
export function orderHistoryQuery(rid: string) {
  return infiniteQueryOptions({
    queryKey: orderKeys.history(rid),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<AdminOrder[]> => {
      const from = pageParam * HISTORY_PAGE_SIZE
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', rid)
        .order('created_at', { ascending: false })
        .range(from, from + HISTORY_PAGE_SIZE - 1)
      if (error) throw error
      return data
    },
    getNextPageParam: (last, all) => (last.length < HISTORY_PAGE_SIZE ? undefined : all.length),
  })
}

/** Un pedido con sus ítems (lo usa Realtime al llegar un pedido nuevo). */
export async function fetchOrder(rid: string, id: string): Promise<AdminOrder | null> {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('restaurant_id', rid).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/**
 * Cambia el estado de un pedido. Actualiza el tablero al instante (optimista) y, si el
 * servidor lo rechaza (transición inválida, otro usuario ya lo cambió), lo recarga.
 */
export function useUpdateOrderStatus(rid: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.rpc('update_order_status', { p_order_id: id, p_status: status })
      if (error) throw error
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: orderKeys.active(rid) })
      queryClient.setQueryData<AdminOrder[]>(orderKeys.active(rid), (old) =>
        old && (ACTIVE_STATUSES.includes(status) ? old.map((o) => (o.id === id ? { ...o, status } : o)) : old.filter((o) => o.id !== id)),
      )
    },
    onError: () => queryClient.invalidateQueries({ queryKey: orderKeys.active(rid) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: orderKeys.history(rid) }),
  })
}

// -----------------------------------------------------------------------------
// Textos y acciones por estado
// -----------------------------------------------------------------------------

/** Columnas del tablero, en orden. */
export const BOARD_COLUMNS: { status: OrderStatus; title: string; dot: string }[] = [
  { status: 'pending', title: 'Nuevos', dot: 'bg-amber-400' },
  { status: 'confirmed', title: 'Confirmados', dot: 'bg-sky-500' },
  { status: 'preparing', title: 'En preparación', dot: 'bg-violet-500' },
  { status: 'ready', title: 'Listos', dot: 'bg-emerald-500' },
]

/** Acción principal de cada estado (el botón grande de la tarjeta). */
export function nextAction(order: Pick<AdminOrder, 'status' | 'type'>): { label: string; to: OrderStatus } | null {
  switch (order.status) {
    case 'pending':
      return { label: 'Confirmar', to: 'confirmed' }
    case 'confirmed':
      return { label: 'Empezar a preparar', to: 'preparing' }
    case 'preparing':
      return { label: 'Marcar listo', to: 'ready' }
    case 'ready':
      return { label: order.type === 'delivery' ? 'Entregado' : 'Retirado', to: 'delivered' }
    default:
      return null
  }
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Nuevo',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-sky-100 text-sky-900',
  preparing: 'bg-violet-100 text-violet-900',
  ready: 'bg-emerald-100 text-emerald-900',
  delivered: 'bg-zinc-100 text-zinc-700',
  cancelled: 'bg-red-100 text-red-800',
}

/** Nombres de las opciones guardadas en el ítem (copia del momento de la compra). */
export function optionNames(selected: Json): string {
  if (!Array.isArray(selected)) return ''
  return selected
    .map((o) => (o && typeof o === 'object' && !Array.isArray(o) && typeof o.name === 'string' ? o.name : null))
    .filter(Boolean)
    .join(', ')
}

/** "hace 3 min", "hace 1 h"… */
const relative = new Intl.RelativeTimeFormat('es-CL', { numeric: 'auto' })
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'recién'
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}
