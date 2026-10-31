/**
 * Gráfico de columnas de ventas (por hora en un día, o por día en un rango).
 *
 * Reglas de diseño (guía de visualización del proyecto):
 *   - Una sola serie → un solo color (el de la marca) y sin leyenda: el título dice qué se mide.
 *   - Columnas de máx. 24 px, esquina superior redondeada de 4 px y base recta.
 *   - Grilla y eje en gris claro de 1 px (no compiten con los datos).
 *   - Tooltip por columna al pasar el mouse o con el teclado (Tab): cada columna es un
 *     elemento enfocable con su valor en el texto accesible. La zona activa es la columna
 *     completa, más grande que la barra.
 *   - "Ver como tabla": los mismos datos en una tabla (accesibilidad, lectura exacta).
 * Las alturas se aplican con style (CSSOM), compatible con la CSP del proyecto.
 */
import { useId, useState } from 'react'
import { bucketLabel, formatCompactCLP, type SalesReport } from '@/features/reports/api'
import { formatCLP } from '@/lib/format'

/** Valor "redondo" para el máximo del eje (1, 2, 5 × 10ⁿ), así las marcas quedan limpias. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((m) => m * power >= value) ?? 10
  return step * power
}

export function SalesChart({ report }: { report: SalesReport }) {
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const titleId = useId()
  const series = report.series
  const max = niceMax(Math.max(...series.map((s) => s.revenue)))
  const ticks = [max, max / 2, 0]
  // En vista por hora se rotula cada 3 horas; por día, todos si son pocos.
  const labelEvery = report.series_unit === 'hour' ? 3 : series.length > 14 ? 3 : 1
  const title = report.series_unit === 'hour' ? 'Ventas por hora' : 'Ventas por día'

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="font-semibold text-zinc-900">
          {title}
        </h2>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="min-h-10 rounded-lg px-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
          {asTable ? 'Ver gráfico' : 'Ver como tabla'}
        </button>
      </div>

      {asTable ? (
        <div className="mt-4 max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-2 font-medium">{report.series_unit === 'hour' ? 'Hora' : 'Día'}</th>
                <th className="py-2 text-right font-medium">Pedidos</th>
                <th className="py-2 text-right font-medium">Ventas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums">
              {series.map((s) => (
                <tr key={s.bucket}>
                  <td className="py-1.5">{bucketLabel(report, s.bucket, true)}</td>
                  <td className="py-1.5 text-right">{s.orders}</td>
                  <td className="py-1.5 text-right">{formatCLP(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          {/* Eje Y: montos compactos en marcas redondas. */}
          <div aria-hidden className="flex h-48 w-14 shrink-0 flex-col justify-between text-right text-xs tabular-nums text-zinc-500">
            {ticks.map((t) => (
              <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
                {formatCompactCLP(t)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-48">
              {/* Grilla: líneas de 1 px en el máximo y la mitad; el eje (0) abajo. */}
              <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-zinc-100" />
              <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-zinc-100" />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-zinc-300" />

              <ol className="absolute inset-0 flex items-end" onMouseLeave={() => setActive(null)}>
                {series.map((s, i) => {
                  const pct = (s.revenue / max) * 100
                  const label = bucketLabel(report, s.bucket, true)
                  return (
                    <li key={s.bucket} className="relative flex h-full flex-1 justify-center">
                      {/* Zona activa: toda la columna (más fácil de apuntar que la barra). */}
                      <button
                        type="button"
                        className="flex h-full w-full items-end justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-brand"
                        aria-label={`${label}: ${formatCLP(s.revenue)} en ${s.orders} pedido${s.orders === 1 ? '' : 's'}`}
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive(null)}
                      >
                        {s.revenue > 0 && (
                          <span
                            className={`w-full max-w-6 rounded-t-[4px] transition-opacity ${active === null || active === i ? 'bg-brand' : 'bg-brand opacity-40'}`}
                            style={{ height: `${Math.max(pct, 1.5)}%` }}
                          />
                        )}
                      </button>

                      {active === i && (
                        <div
                          role="tooltip"
                          // En los extremos se alinea hacia adentro para no salirse de la pantalla (celular).
                          className={`pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-48 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg ${
                            i < 2 ? 'left-0' : i > series.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                          }`}
                        >
                          <p className="font-semibold">{label}</p>
                          <p className="tabular-nums">{formatCLP(s.revenue)}</p>
                          <p className="text-zinc-300">
                            {s.orders} pedido{s.orders === 1 ? '' : 's'}
                          </p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>

            {/* Eje X */}
            <div aria-hidden className="mt-1.5 flex text-xs text-zinc-500">
              {series.map((s, i) => (
                <span key={s.bucket} className="flex-1 truncate text-center">
                  {i % labelEvery === 0 ? bucketLabel(report, s.bucket) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
