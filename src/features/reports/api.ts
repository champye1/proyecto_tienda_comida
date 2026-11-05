/**
 * Reporte de ventas del panel: consulta (RPC get_sales_report), validación y fechas.
 *
 * Las fechas se manejan como texto "AAAA-MM-DD" en la zona horaria del restaurante, igual
 * que la función de la base. Así "hoy" es el hoy del restaurante aunque el navegador
 * esté en otra zona horaria.
 */
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const amountsSchema = z.object({ orders: z.number().int(), revenue: z.number().int() })

const reportSchema = z.object({
  from: z.string(),
  to: z.string(),
  revenue: z.number().int(),
  /** Propinas del período (no se suman a las ventas). */
  tips: z.number().int(),
  orders: z.number().int(),
  avg_ticket: z.number().int(),
  cancelled: z.number().int(),
  by_type: z.object({ delivery: amountsSchema, pickup: amountsSchema }),
  by_payment: z.object({ cash: amountsSchema, transfer: amountsSchema }),
  series: z.array(z.object({ bucket: z.number().int(), orders: z.number().int(), revenue: z.number().int() })),
  series_unit: z.enum(['hour', 'day', 'month']),
  /** Pedidos por hora del día (24 valores) y por día de la semana (7, lunes primero). */
  peak_hours: z.array(z.number().int()).length(24),
  by_weekday: z.array(z.number().int()).length(7),
  /** Productos publicados que nadie pidió en el período. */
  unsold_products: z.array(z.string()),
  top_products: z.array(z.object({ name: z.string(), quantity: z.number().int(), revenue: z.number().int() })),
})

export type SalesReport = z.infer<typeof reportSchema>

/** Reporte de un rango de días (máx. un año; un día = por hora, hasta 92 días = por día, más = por mes). */
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
// Fechas (texto AAAA-MM-DD en la hora del restaurante)
// -----------------------------------------------------------------------------

/** Hoy en la zona horaria del restaurante: "2026-10-14". */
export function todayIn(timeZone: string): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
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

/** Primer día del mes N meses después del mes de "date" ("2026-01-15", 2 → "2026-03-01"). */
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Etiqueta de cada barra del gráfico: "18:00", "mar 14" u "oct 2026". */
export function bucketLabel(report: SalesReport, bucket: number, long = false): string {
  if (report.series_unit === 'month') {
    return formatDay(addMonths(report.from, bucket), long ? { month: 'long', year: 'numeric' } : { month: 'short' })
  }
  if (report.series_unit === 'hour') {
    const h = String(bucket).padStart(2, '0')
    return long ? `${h}:00 – ${String(bucket + 1).padStart(2, '0')}:00` : h
  }
  const day = addDays(report.from, bucket)
  return long ? formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' }) : formatDay(day, { weekday: 'short', day: 'numeric' })
}

/** Montos compactos para los ejes: 45000 → "$45 mil", 1200000 → "$1,2 M". */
const compact = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 })
/** Montos compactos para los ejes del gráfico: 45000 → "$45 mil", 1200000 → "$1,2 M". */
export function formatCompactCLP(amount: number): string {
  return `$${compact.format(amount)}`
}
