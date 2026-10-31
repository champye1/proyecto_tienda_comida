/**
 * Reporte de ventas del panel: consulta (RPC get_sales_report), validación y fechas.
 *
 * Las fechas se manejan como texto "AAAA-MM-DD" en hora de Chile (America/Santiago), igual
 * que la función de la base. Así "hoy" es el hoy del restaurante aunque el navegador
 * esté en otra zona horaria.
 */
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const TIMEZONE = 'America/Santiago'

const amountsSchema = z.object({ orders: z.number().int(), revenue: z.number().int() })

const reportSchema = z.object({
  from: z.string(),
  to: z.string(),
  revenue: z.number().int(),
  orders: z.number().int(),
  avg_ticket: z.number().int(),
  cancelled: z.number().int(),
  by_type: z.object({ delivery: amountsSchema, pickup: amountsSchema }),
  by_payment: z.object({ cash: amountsSchema, transfer: amountsSchema }),
  series: z.array(z.object({ bucket: z.number().int(), orders: z.number().int(), revenue: z.number().int() })),
  series_unit: z.enum(['hour', 'day']),
  top_products: z.array(z.object({ name: z.string(), quantity: z.number().int(), revenue: z.number().int() })),
})

export type SalesReport = z.infer<typeof reportSchema>

/** Reporte de un rango de días (máx. 31; un solo día = detalle por hora). */
export function salesReportQuery(rid: string, from: string, to: string) {
  return queryOptions({
    queryKey: ['reports', rid, from, to],
    queryFn: async (): Promise<SalesReport> => {
      const { data, error } = await supabase.rpc('get_sales_report', { p_restaurant_id: rid, p_from: from, p_to: to })
      if (error) throw error
      return reportSchema.parse(data)
    },
    staleTime: 30_000,
  })
}

// -----------------------------------------------------------------------------
// Fechas (texto AAAA-MM-DD en hora de Chile)
// -----------------------------------------------------------------------------

/** Hoy en Chile: "2026-10-14". */
export function todayInChile(): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}

/** Suma (o resta) días a una fecha "AAAA-MM-DD". Se calcula en UTC para evitar saltos por horario de verano. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "2026-10-14" → "mar 14 oct". */
export function formatDay(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-CL', { ...options, timeZone: 'UTC' })
}

/** Etiqueta de cada barra del gráfico: "18:00" o "mar 14". */
export function bucketLabel(report: SalesReport, bucket: number, long = false): string {
  if (report.series_unit === 'hour') {
    const h = String(bucket).padStart(2, '0')
    return long ? `${h}:00 – ${String(bucket + 1).padStart(2, '0')}:00` : h
  }
  const day = addDays(report.from, bucket)
  return long ? formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' }) : formatDay(day, { weekday: 'short', day: 'numeric' })
}

/** Montos compactos para los ejes: 45000 → "$45 mil", 1200000 → "$1,2 M". */
const compact = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 })
export function formatCompactCLP(amount: number): string {
  return `$${compact.format(amount)}`
}
