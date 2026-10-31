/**
 * Inicio del panel (/admin): resumen del restaurante activo.
 * Muestra el resumen de hoy (ventas, pedidos, pendientes), el link de la tienda (para
 * compartir), el estado abierto/cerrado, la configuración de delivery y los próximos pasos.
 */
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { useOrdersLive } from '@/features/orders/OrdersLive'
import { salesReportQuery, todayInChile } from '@/features/reports/api'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { formatCLP } from '@/lib/format'

/** Nombre visible de cada rol de miembro. */
const roleLabel = { owner: 'Dueño', staff: 'Personal' } as const

export default function DashboardPage() {
  const { restaurant } = useCurrentRestaurant()
  const location = useLocation()
  // ResetPasswordPage navega aquí con este flag después de guardar la nueva contraseña.
  const passwordChanged = (location.state as { passwordChanged?: boolean } | null)?.passwordChanged === true
  const storeUrl = `${window.location.origin}/r/${restaurant.slug}`
  const [copied, setCopied] = useState(false)
  const today = todayInChile()
  const report = useQuery(salesReportQuery(restaurant.id, today, today))
  const { pendingCount } = useOrdersLive()

  /** Copia el link de la tienda al portapapeles y muestra "Copiado ✓" por 2 segundos. */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(storeUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* el navegador no permite copiar: el link queda visible para copiarlo a mano */
    }
  }

  return (
    <div className="space-y-6">
      {passwordChanged && <Alert tone="success">Tu contraseña fue actualizada.</Alert>}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">{restaurant.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">Tu rol: {roleLabel[restaurant.role]}</p>
      </div>

      {/* Resumen de hoy (hora de Chile). */}
      <section aria-label="Resumen de hoy" className="grid grid-cols-3 gap-3">
        <Link to="/admin/reportes" className="rounded-2xl border border-zinc-200 bg-white p-4 hover:border-zinc-300">
          <span className="block text-sm text-zinc-500">Ventas de hoy</span>
          <span className="mt-1 block text-2xl font-semibold text-zinc-900">{report.data ? formatCLP(report.data.revenue) : '—'}</span>
        </Link>
        <Link to="/admin/reportes" className="rounded-2xl border border-zinc-200 bg-white p-4 hover:border-zinc-300">
          <span className="block text-sm text-zinc-500">Pedidos de hoy</span>
          <span className="mt-1 block text-2xl font-semibold text-zinc-900">{report.data ? report.data.orders : '—'}</span>
        </Link>
        <Link
          to="/admin/pedidos"
          className={`rounded-2xl border p-4 hover:border-zinc-300 ${pendingCount > 0 ? 'border-amber-300 bg-amber-50' : 'border-zinc-200 bg-white'}`}
        >
          <span className="block text-sm text-zinc-500">Sin confirmar</span>
          <span className="mt-1 block text-2xl font-semibold text-zinc-900">{pendingCount}</span>
        </Link>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-500">Link de tu tienda</h2>
          <p className="mt-2 break-all font-medium text-zinc-900">{storeUrl}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={copyLink}
              className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50"
            >
              {copied ? 'Copiado ✓' : 'Copiar link'}
            </button>
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Abrir tienda ↗
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-500">Estado del local</h2>
          <p className="mt-2 flex items-center gap-2 font-medium text-zinc-900">
            <span className={`size-2.5 rounded-full ${restaurant.is_open ? 'bg-green-500' : 'bg-zinc-400'}`} />
            {restaurant.is_open ? 'Abierto: recibiendo pedidos' : 'Cerrado: no recibe pedidos'}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-zinc-500">Delivery</dt>
              <dd className="font-medium">
                {restaurant.delivery_enabled
                  ? `Sí · ${restaurant.delivery_fee > 0 ? formatCLP(restaurant.delivery_fee) : 'sin costo'}`
                  : 'No'}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Retiro en local</dt>
              <dd className="font-medium">{restaurant.pickup_enabled ? 'Sí' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Pedido mínimo</dt>
              <dd className="font-medium">{formatCLP(restaurant.min_order)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5">
        <h2 className="font-semibold text-zinc-900">Próximos pasos</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>
            <Link to="/admin/menu" className="font-semibold text-brand hover:underline">
              Arma tu menú
            </Link>
            : categorías, productos con foto, tamaños y agregados.
          </li>
          <li>Abre el local con el interruptor <strong>Abierto/Cerrado</strong> de arriba.</li>
          <li>
            <Link to="/admin/pedidos" className="font-semibold text-brand hover:underline">
              Recibe pedidos en tiempo real
            </Link>
            : te avisamos con sonido cuando llega uno nuevo.
          </li>
        </ol>
      </section>
    </div>
  )
}
