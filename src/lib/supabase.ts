/**
 * Cliente único de Supabase para toda la app (base de datos, Auth, Realtime y Storage).
 *
 * Se tipa con `Database` (generado desde el esquema con `npm run db:types`), así
 * TypeScript conoce las tablas, columnas y funciones RPC, y avisa si una consulta
 * usa un nombre que no existe.
 *
 * Sobre el pooler de conexiones: el navegador habla con Supabase por HTTPS
 * (PostgREST/Auth/Realtime), nunca con Postgres directo. PostgREST ya mantiene su
 * propio pool de conexiones; el pooler Supavisor (puerto 6543) queda reservado para
 * scripts o futuros servicios de servidor (ver DATABASE_URL en .env.example).
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { env } from './env'

export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, // guarda la sesión en localStorage: no hay que volver a entrar al recargar
    autoRefreshToken: true, // renueva el token antes de que venza (dura 1 hora)
    detectSessionInUrl: true, // procesa los enlaces de confirmación de email que traen la sesión en la URL
  },
})
