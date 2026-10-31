/**
 * Pedidos en vivo para TODO el panel.
 *
 * Vive en AdminShell (no solo en la página de pedidos) para que la alerta suene aunque el
 * restaurante esté editando el menú o en otra sección.
 *
 * - Escucha la tabla orders con Supabase Realtime (postgres_changes) filtrando por
 *   restaurant_id. La RLS de orders se aplica a cada suscriptor: solo llegan los pedidos
 *   de este restaurante.
 * - Pedido nuevo (INSERT): trae el pedido con sus ítems, lo suma al tablero, lo marca como
 *   "nuevo" unos segundos y suena la alerta.
 * - Cambio de estado (UPDATE): actualiza o saca la tarjeta del tablero.
 * - Resistente a cortes: al (re)conectarse, al volver a la pestaña y cada 60 s se recarga
 *   la lista, así no se pierde un pedido si la tablet se suspendió o perdió la conexión.
 * - Mientras haya pedidos sin confirmar, la alerta se repite cada 30 s y el título de la
 *   pestaña muestra cuántos hay.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import { ACTIVE_STATUSES, activeOrdersQuery, fetchOrder, orderKeys, type AdminOrder } from './api'
import { useSoundAlerts, type SoundAlerts } from './sound'

/** Estado de la conexión en vivo, para mostrar "En vivo" / "Reconectando…". */
export type LiveStatus = 'connecting' | 'live' | 'offline'

type OrdersLiveState = {
  orders: AdminOrder[] | undefined
  isLoading: boolean
  error: unknown
  live: LiveStatus
  /** Pedidos que acaban de llegar (se resaltan unos segundos). */
  freshIds: Set<string>
  pendingCount: number
  sound: SoundAlerts
}

const OrdersLiveContext = createContext<OrdersLiveState | null>(null)

const FRESH_MS = 15_000 // tiempo que una tarjeta nueva queda resaltada
const REMINDER_MS = 30_000 // repetición de la alerta mientras haya pedidos sin confirmar

export function OrdersLiveProvider({ children }: { children: ReactNode }) {
  const { restaurant } = useCurrentRestaurant()
  const rid = restaurant.id
  const queryClient = useQueryClient()
  const query = useQuery(activeOrdersQuery(rid))
  const sound = useSoundAlerts()
  const [live, setLive] = useState<LiveStatus>('connecting')
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())

  // Ref a la función de sonido más reciente: la suscripción no se rehace al cambiar la preferencia.
  const playRef = useRef(sound.play)
  useEffect(() => {
    playRef.current = sound.play
  }, [sound.play])

  // --- Suscripción Realtime ---
  useEffect(() => {
    const activeKey = orderKeys.active(rid)
    const historyKey = orderKeys.history(rid)

    const markFresh = (id: string) => {
      setFreshIds((s) => new Set(s).add(id))
      setTimeout(() => setFreshIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      }), FRESH_MS)
    }

    const channel = supabase
      .channel(`orders:${rid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, async (payload) => {
        const id = (payload.new as Tables<'orders'>).id
        // El evento no trae los ítems: se pide el pedido completo.
        const order = await fetchOrder(rid, id).catch(() => null)
        if (!order) return void queryClient.invalidateQueries({ queryKey: activeKey })
        queryClient.setQueryData<AdminOrder[]>(activeKey, (old) => (old && !old.some((o) => o.id === id) ? [...old, order] : old))
        void queryClient.invalidateQueries({ queryKey: historyKey })
        markFresh(id)
        playRef.current()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, (payload) => {
        const row = payload.new as Tables<'orders'>
        queryClient.setQueryData<AdminOrder[]>(activeKey, (old) => {
          if (!old) return old
          if (!ACTIVE_STATUSES.includes(row.status)) return old.filter((o) => o.id !== row.id)
          return old.map((o) => (o.id === row.id ? { ...o, ...row } : o))
        })
        void queryClient.invalidateQueries({ queryKey: historyKey })
      })
      // Realtime confirma en dos pasos: primero "unido al canal" (SUBSCRIBED) y un instante
      // después "Subscribed to PostgreSQL". Recién desde el segundo llegan los cambios de la
      // tabla: por eso "En vivo" y la recarga de seguridad se hacen aquí. Si se hicieran en
      // SUBSCRIBED, un pedido que entrara en ese intervalo se perdería hasta la recarga de 60 s.
      .on('system', {}, (message: { extension?: string; status?: string }) => {
        if (message.extension === 'postgres_changes' && message.status === 'ok') {
          setLive('live')
          void queryClient.invalidateQueries({ queryKey: activeKey })
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Unido al canal; todavía falta la confirmación de PostgreSQL (ver arriba).
          // Igual se recarga ya: pudo llegar algo mientras estábamos desconectados.
          void queryClient.invalidateQueries({ queryKey: activeKey })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLive('offline')
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [rid, queryClient])

  // Al volver a la pestaña (tablet que se "durmió"), recarga.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void queryClient.invalidateQueries({ queryKey: orderKeys.active(rid) })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [rid, queryClient])

  const pendingCount = query.data?.filter((o) => o.status === 'pending').length ?? 0

  // Recordatorio sonoro mientras haya pedidos sin confirmar.
  useEffect(() => {
    if (pendingCount === 0) return
    const id = setInterval(() => playRef.current(), REMINDER_MS)
    return () => clearInterval(id)
  }, [pendingCount])

  // Título de la pestaña: "(2) Pedidos nuevos · Pizzería Demo".
  useEffect(() => {
    const previous = document.title
    document.title = pendingCount > 0 ? `(${pendingCount}) Pedidos nuevos · ${restaurant.name}` : `Panel · ${restaurant.name}`
    return () => {
      document.title = previous
    }
  }, [pendingCount, restaurant.name])

  const value = useMemo(
    () => ({ orders: query.data, isLoading: query.isPending, error: query.error, live, freshIds, pendingCount, sound }),
    [query.data, query.isPending, query.error, live, freshIds, pendingCount, sound],
  )

  return <OrdersLiveContext.Provider value={value}>{children}</OrdersLiveContext.Provider>
}

/** Pedidos en vivo del restaurante activo. Solo dentro de AdminShell. */
export function useOrdersLive(): OrdersLiveState {
  const ctx = useContext(OrdersLiveContext)
  if (!ctx) throw new Error('useOrdersLive debe usarse dentro de <OrdersLiveProvider>')
  return ctx
}
