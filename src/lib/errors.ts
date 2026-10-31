/**
 * Traducción de errores técnicos (PostgREST/RPC, red) a mensajes en
 * español aptos para mostrar al usuario. Así ninguna pantalla muestra textos en
 * inglés ni detalles internos de la base.
 */
/** Mensaje genérico cuando el error no es de negocio (no se muestran detalles técnicos). */
export const GENERIC_ERROR = 'Ocurrió un error inesperado. Intenta de nuevo.'
/** Mensaje cuando no hay conexión. */
export const NETWORK_ERROR = 'No pudimos conectarnos. Revisa tu conexión a internet e intenta de nuevo.'

// Los errores de Supabase Auth se traducen en src/features/auth/authErrors.ts (depende de
// supabase-js; este archivo no, para que la tienda pública cargue liviana).

/** Forma mínima de un error de PostgREST/RPC (evita depender de su clase concreta). */
type PostgrestLikeError = { code?: string; message?: string }

/**
 * Códigos que nuestras funciones RPC lanzan con mensajes escritos para el usuario
 * (ver encabezado de supabase/migrations/20261011000500_rpc_functions.sql).
 */
const USER_FACING_CODES = new Set(['P0001', 'P0002', '22023', '23505', '42501'])

/**
 * Mensaje para errores de PostgREST/RPC: si es un error de negocio usa el texto en
 * español que viene de la base; cualquier otro (bug, constraint interna) se oculta
 * tras un mensaje genérico para no filtrar detalles técnicos.
 */
export function dbErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as PostgrestLikeError
    if (code && message && USER_FACING_CODES.has(code)) return message
    // Errores de integridad de Postgres: su texto es técnico y en inglés, se traduce por código.
    if (code === '23503') return 'No se puede eliminar porque todavía tiene elementos asociados.'
    if (code === '23514') return 'Algún dato no es válido. Revisa el formulario.'
    if (message?.includes('Failed to fetch')) return NETWORK_ERROR
  }
  return GENERIC_ERROR
}
