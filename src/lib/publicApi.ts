/**
 * Cliente mínimo para las funciones RPC PÚBLICAS de la tienda (sin supabase-js).
 *
 * Por qué: la tienda solo necesita 3 llamadas (menú, crear pedido, ver pedido). Cargar el
 * cliente completo de Supabase (Auth, Realtime, Storage…) sumaba ~80 KB de JavaScript en
 * el celular del cliente antes de poder mostrar el menú. Con fetch directo la tienda carga
 * más rápido. El panel sigue usando supabase-js (lo necesita para la sesión).
 *
 * Seguridad: usa solo la clave publicable (pública por diseño) y no envía cookies ni
 * sesión: el cliente de la tienda es siempre anónimo y la RLS decide qué puede ver.
 */
import type { Database } from '@/types/database.types'
import { env } from './env'

type Functions = Database['public']['Functions']

/** Error de PostgREST/RPC: misma forma ({ code, message }) que entiende dbErrorMessage. */
export class PublicApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'PublicApiError'
  }
}

/**
 * Llama a una función RPC pública.
 * - GET: para lecturas cacheables (los parámetros van en la URL).
 * - POST: para escrituras, y para lecturas con datos sensibles (p. ej. el token de
 *   seguimiento), que así no quedan en URLs, logs ni cachés intermedias.
 */
export async function publicRpc<F extends keyof Functions>(
  fn: F,
  args: Functions[F]['Args'],
  method: 'GET' | 'POST' = 'POST',
): Promise<Functions[F]['Returns']> {
  const url = new URL(`/rest/v1/rpc/${fn}`, env.VITE_SUPABASE_URL)
  const init: RequestInit = {
    method,
    credentials: 'omit',
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
  }
  if (method === 'GET') {
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) url.searchParams.set(k, String(v))
  } else {
    init.body = JSON.stringify(args)
  }

  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new PublicApiError('Failed to fetch')
  }
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const err = (body ?? {}) as { code?: string; message?: string }
    throw new PublicApiError(err.message ?? `Error ${res.status}`, err.code)
  }
  return body as Functions[F]['Returns']
}
