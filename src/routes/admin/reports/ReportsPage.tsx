/**
 * Reportes (/admin/reportes): ventas del día (o de un rango) y productos más vendidos.
 *
 * - Períodos rápidos: Hoy, Ayer, Últimos 7 días, Últimos 30 días; o un día puntual.
 * - Cifras clave arriba (ventas, pedidos, ticket promedio, cancelados), luego el gráfico
 *   de ventas en el tiempo, los productos más vendidos y el desglose por tipo y pago.
 * - "Ventas" = pedidos no cancelados, en hora de Chile (ver migración 13).
 */
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { addDays, formatDay, salesReportQuery, todayInChile, type SalesReport } from '@/features/reports/api'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { SalesChart } from './SalesChart'

type Period = { id: string; label: string; from: string; to: string }

/** Períodos rápidos, calculados con el "hoy" de Chile. */
function presets(today: string): Period[] {
  return [
    { id: 'today', label: 'Hoy', from: today, to: today },
    { id: 'yesterday', label: 'Ayer', from: addDays(today, -1), to: addDays(today, -1) },
    { id: '7d', label: 'Últimos 7 días', from: addDays(today, -6), to: today },
    { id: '30d', label: 'Últimos 30 días', from: addDays(today, -29), to: today },
  ]
}

export default function ReportsPage() {
  const { restaurant } = useCurrentRestaurant()
  const today = todayInChile()
  const periods = presets(today)
  const [period, setPeriod] = useState<Period>(periods[0]!)
  const query = useQuery(salesReportQuery(restaurant.id, period.from, period.to))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Reportes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {period.from === period.to ? formatDay(period.from, { weekday: 'long', day: 'numeric', month: 'long' }) : `${formatDay(period.from)} – ${formatDay(period.to)}`}
          {' · '}Ventas = pedidos no cancelados, en hora de Chile.
        </p>
      </div>

      {/* Filtros en una sola fila: períodos rápidos + día puntual. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período del reporte">
        {periods.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={period.id === p.id}
            onClick={() => setPeriod(p)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
              period.id === p.id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <span>Día:</span>
          <input
            type="date"
            max={today}
            value={period.id === 'custom' ? period.from : ''}
            onChange={(e) => e.target.value && setPeriod({ id: 'custom', label: 'Día', from: e.target.value, to: e.target.value })}
            className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2"
          />
        </label>
      </div>

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Alert tone="error">{dbErrorMessage(query.error)}</Alert>
      ) : (
        <ReportBody report={query.data} />
      )}
    </div>
  )
}

function ReportBody({ report }: { report: SalesReport }) {
  return (
    <div className="space-y-5">
      {/* Cifras clave */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ventas" value={formatCLP(report.revenue)} />
        <Kpi label="Pedidos" value={String(report.orders)} />
        <Kpi label="Ticket promedio" value={report.orders > 0 ? formatCLP(report.avg_ticket) : '—'} />
        <Kpi label="Cancelados" value={String(report.cancelled)} note="No suman a las ventas" />
      </dl>

      {report.orders === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-600">
          No hay ventas en este período.
        </p>
      ) : (
        <>
          <SalesChart report={report} />
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <TopProducts report={report} />
            <div className="space-y-5">
              <Breakdown
                title="Cómo lo recibieron"
                rows={[
                  ['Retiro en local', report.by_type.pickup],
                  ['Delivery', report.by_type.delivery],
                ]}
              />
              <Breakdown
                title="Cómo pagaron"
                rows={[
                  ['Efectivo', report.by_payment.cash],
                  ['Transferencia', report.by_payment.transfer],
                ]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Tarjeta de cifra clave (etiqueta + valor). */
function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-zinc-900">{value}</dd>
      {note && <dd className="text-xs text-zinc-500">{note}</dd>}
    </div>
  )
}

/** Productos más vendidos: barras horizontales; los valores van en texto (no en color). */
function TopProducts({ report }: { report: SalesReport }) {
  const max = Math.max(...report.top_products.map((p) => p.quantity), 1)
  return (
    <Card title="Productos más vendidos">
      <ol className="space-y-3">
        {report.top_products.map((p, i) => (
          <li key={p.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-zinc-900">
                <span className="mr-2 text-zinc-500">{i + 1}.</span>
                {p.name}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-600">
                {p.quantity} vendido{p.quantity === 1 ? '' : 's'} · {formatCLP(p.revenue)}
              </span>
            </div>
            {/* Barra: proporcional a las unidades, fondo del mismo tono más claro. */}
            <div aria-hidden className="mt-1.5 h-2 rounded-full bg-zinc-100">
              <div className="h-2 rounded-full bg-brand" style={{ width: `${(p.quantity / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** Desglose de dos categorías (cifras en texto: con dos valores no hace falta un gráfico). */
function Breakdown({ title, rows }: { title: string; rows: [string, { orders: number; revenue: number }][] }) {
  return (
    <Card title={title}>
      <dl className="divide-y divide-zinc-100 text-sm">
        {rows.map(([label, v]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-zinc-700">{label}</dt>
            <dd className="tabular-nums text-zinc-900">
              <span className="font-semibold">{formatCLP(v.revenue)}</span>
              <span className="text-zinc-500">
                {' '}
                · {v.orders} pedido{v.orders === 1 ? '' : 's'}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="mb-4 font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}
