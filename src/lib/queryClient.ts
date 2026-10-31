/**
 * Configuración global de TanStack Query: la caché de datos que vienen de Supabase.
 *
 * TanStack Query guarda el resultado de cada consulta bajo una "query key"; si otra
 * pantalla pide lo mismo, lo reutiliza en vez de volver a consultar. Las mutaciones
 * (crear/editar) invalidan las keys afectadas para que se recarguen.
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Durante 30 s un dato se considera fresco y no se vuelve a pedir.
      staleTime: 30_000,
      // Datos que ninguna pantalla usa se borran de memoria a los 5 minutos.
      gcTime: 5 * 60_000,
      // Un solo reintento ante error (evita esperas largas con mala conexión).
      retry: 1,
      // No recargar al volver a la pestaña: los pedidos se actualizarán por Realtime.
      refetchOnWindowFocus: false,
    },
  },
})
