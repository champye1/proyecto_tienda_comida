/**
 * Seguimiento en vivo del pedido para el cliente (página /r/:slug/pedido/:token).
 *
 * Escucha el canal Realtime "order:{token}", donde la base publica un aviso cada vez que
 * el restaurante cambia el estado (migración 12). Usa solo @supabase/realtime-js (no el
 * cliente completo) para que la tienda siga liviana.
 *
 * Seguridad: el aviso se trata SOLO como una señal de "algo cambió". El estado que se
 * muestra siempre se vuelve a pedir al servidor (get_order_by_token): aunque alguien que
 * conozca el token enviara un aviso falso al canal, no podría mostrar un estado falso.
 */
import { useEffect, useRef } from 'react'
import { RealtimeClient } from '@supabase/realtime-js'
import { env } from '@/lib/env'

/** Llama a `onChange` cada vez que llega un aviso para este pedido. */
export function useOrderLiveUpdates(token: string, enabled: boolean, onChange: () => void) {
  // Ref al callback más reciente: la conexión no se rehace en cada render.
  const callback = useRef(onChange)
  useEffect(() => {
    callback.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled) return
    const endpoint = new URL('/realtime/v1', env.VITE_SUPABASE_URL)
    endpoint.protocol = endpoint.protocol.replace('http', 'ws')
    const client = new RealtimeClient(endpoint.toString(), {
      params: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY },
    })
    const channel = client
      .channel(`order:${token}`)
      .on('broadcast', { event: 'status' }, () => callback.current())
      .subscribe((status) => {
        // Al (re)conectarse se consulta: pudo cambiar algo mientras no había conexión.
        if (status === 'SUBSCRIBED') callback.current()
      })

    return () => {
      void client.removeChannel(channel)
      client.disconnect()
    }
  }, [token, enabled])
}
