/**
 * Reportes (/admin/reportes): ventas del día (o de un rango) y productos más vendidos.
 *
 * - Períodos rápidos (hoy, ayer, 7, 30 y 90 días, este año) o un rango a elección (hasta un año).
 * - Cifras clave arriba (ventas, pedidos, ticket promedio, cancelados), luego el gráfico
 *   de ventas en el tiempo, los productos más vendidos, el desglose por tipo y pago, las
 *   horas y días de más pedidos y los productos que no se vendieron.
 * - Exportar a Excel (CSV) el detalle de los pedidos del período.
 * - "Ventas" = pedidos no cancelados, en la hora del restaurante (migraciones 13 y 16).
 */
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { addDays, formatDay, salesReportQuery, todayIn, type SalesReport } from '@/features/reports/api'
import { exportOrdersCsv } from '@/features/reports/exportOrders'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { DAY_NAMES } from '@/lib/openingHours'
import { SalesChart } from './SalesChart'

type Period = { id: string; label: string; from: string; to: string }

/** Períodos rápidos, calculados con el "hoy" del restaurante. */
function presets(today: string): Period[] {
  return [
    { id: 'today', label: 'Hoy', from: today, to: today },
    { id: 'yesterday', label: 'Ayer', from: addDays(today, -1), to: addDays(today, -1) },
    { id: '7d', label: 'Últimos 7 días', from: addDays(today, -6), to: today },
    { id: '30d', label: 'Últimos 30 días', from: addDays(today, -29), to: today },
    { id: '90d', label: 'Últimos 90 días', from: addDays(today, -89), to: today },
    { id: 'year', label: 'Este año', from: `${today.slice(0, 4)}-01-01`, to: today },
  ]
}

/** Página de reportes de ventas por período. */
export default function ReportsPage() {
  const { restaurant } = useCurrentRestaurant()
  const today = todayIn(restaurant.timezone)
  const periods = presets(today)
  const [period, setPeriod] = useState<Period>(periods[0]!)
  const query = useQuery(salesReportQuery(restaurant.id, period.from, period.to))
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  /** Descarga el detalle de los pedidos del período (una fila por producto pedido). */
  async function exportOrders() {
    setExporting(true)
    setExportError(null)
    try {
      await exportOrdersCsv(restaurant, period.from, period.to)
    } catch (e) {
      setExportError(dbErrorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Reportes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {period.from === period.to ? formatDay(period.from, { weekday: 'long', day: 'numeric', month: 'long' }) : `${formatDay(period.from)} – ${formatDay(period.to)}`}
          {' · '}Ventas = pedidos no cancelados.
        </p>
      </div>
      {exportError && <Alert tone="error">{exportError}</Alert>}

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
        {/* Rango a elección: si "hasta" queda fuera del rango válido, se ajusta. Tope: un año. */}
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <span>Desde</span>
          <input
            type="date"
            max={today}
            value={period.id === 'custom' ? period.from : ''}
            onChange={(e) => {
              const from = e.target.value
              if (!from) return
              const keepTo = period.id === 'custom' && period.to >= from && period.to <= addDays(from, 365)
              setPeriod({ id: 'custom', label: 'Rango', from, to: keepTo ? period.to : from })
            }}
            className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <span>hasta</span>
          <input
            type="date"
            min={period.id === 'custom' ? period.from : undefined}
            max={period.id === 'custom' ? [today, addDays(period.from, 365)].sort()[0] : today}
            disabled={period.id !== 'custom'}
            value={period.id === 'custom' ? period.to : ''}
            onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })}
            className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2 disabled:opacity-50"
          />
        </label>
        <Button variant="secondary" onClick={exportOrders} loading={exporting} className="ml-auto">
          Exportar pedidos a Excel
        </Button>
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
        {report.tips > 0 && <Kpi label="Propinas" value={formatCLP(report.tips)} note="Para el equipo; no suman a las ventas" />}
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
          <div className="grid gap-5 lg:grid-cols-2">
            <MiniBars
              title="Horas con más pedidos"
              values={report.peak_hours}
              label={(i) => `${String(i).padStart(2, '0')}:00`}
              short={(i) => (i % 3 === 0 ? String(i).padStart(2, '0') : '')}
            />
            <MiniBars
              title="Días con más pedidos"
              values={report.by_weekday}
              label={(i) => DAY_NAMES[i] ?? ''}
              short={(i) => (DAY_NAMES[i] ?? '').slice(0, 3)}
            />
          </div>
          {report.unsold_products.length > 0 && (
            <Card title="Productos sin ventas en el período">
              <p className="mb-3 text-sm text-zinc-600">Están publicados pero nadie los pidió: revisa su foto, su precio o si conviene quitarlos.</p>
              <ul className="flex flex-wrap gap-2">
                {report.unsold_products.map((name) => (
                  <li key={name} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
                    {name}
                  </li>
                ))}
              </ul>
            </Card>
          )}
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

/**
 * Barras verticales chicas (horas del día o días de la semana). La más alta se resalta y
 * cada barra lleva su valor como texto para lectores de pantalla (no depende del color).
 */
function MiniBars({ title, values, label, short }: { title: string; values: number[]; label: (i: number) => string; short: (i: number) => string }) {
  const max = Math.max(...values, 1)
  const peak = values.indexOf(Math.max(...values))
  return (
    <Card title={title}>
      <p className="mb-3 text-sm text-zinc-600">
        Más pedidos: <strong>{label(peak)}</strong> ({values[peak]} pedido{values[peak] === 1 ? '' : 's'})
      </p>
      <ol className="flex h-28 items-end gap-1" aria-label={title}>
        {values.map((v, i) => (
          <li key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${label(i)}: ${v} pedidos`}>
            <span className="sr-only">
              {label(i)}: {v} pedidos
            </span>
            <span aria-hidden className={`w-full rounded-t ${i === peak ? 'bg-brand' : 'bg-zinc-300'}`} style={{ height: `${Math.max((v / max) * 100, v > 0 ? 4 : 0)}%` }} />
            <span aria-hidden className="h-4 text-[10px] text-zinc-500">
              {short(i)}
            </span>
          </li>
        ))}
      </ol>
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
