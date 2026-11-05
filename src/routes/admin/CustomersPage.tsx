/**
 * Clientes (/admin/clientes): quién te compra, cuánto y cuándo fue la última vez.
 *
 * - Los clientes se identifican por su teléfono (no necesitan cuenta para pedir).
 * - Filtros: todos, frecuentes (3 o más pedidos) e inactivos (más de 30 días sin pedir,
 *   para invitarlos a volver). Búsqueda por nombre o teléfono.
 * - Botón de WhatsApp por cliente y exportación a Excel (CSV) de la lista filtrada.
 * - Sellos de la tarjeta de fidelización de cada cliente.
 * - "Invitar a volver" (dueño): genera un cupón personal de un solo uso (14 días) y abre
 *   WhatsApp con el mensaje listo, con el link de la tienda y el código.
 * - Datos de la RPC get_customers (solo miembros del restaurante, ver migración 16).
 *   Son datos personales: se muestran solo en el panel y no se envían a terceros.
 */
import { useMemo, useState } from 'react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useCurrentRestaurant } from '@/features/restaurants/CurrentRestaurant'
import { downloadCsv } from '@/lib/csv'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP, formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useNow } from '@/lib/useNow'

/** Días sin pedir para considerar a un cliente "inactivo". */
export const INACTIVE_DAYS = 30
const FREQUENT_ORDERS = 3

type Filter = 'all' | 'frequent' | 'inactive'
type Sort = 'last_order' | 'orders' | 'total_spent'

function customersQuery(rid: string) {
  return queryOptions({
    queryKey: ['customers', rid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customers', { p_restaurant_id: rid })
      if (error) throw error
      return data
    },
    staleTime: 60_000,
  })
}

/** Página de clientes: lista filtrable, WhatsApp, exportación e "invitar a volver". */
export default function CustomersPage() {
  const { restaurant } = useCurrentRestaurant()
  const [winback, setWinback] = useState<{ phone: string; name: string } | null>(null)
  const query = useQuery(customersQuery(restaurant.id))
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('last_order')
  const [search, setSearch] = useState('')
  // Hora actual (se actualiza cada minuto): define quién está "inactivo".
  const now = useNow(60_000)
  const isInactive = (lastOrder: string) => now - new Date(lastOrder).getTime() >= INACTIVE_DAYS * 86_400_000

  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return (query.data ?? [])
      .filter((c) => {
        if (filter === 'frequent' && c.orders < FREQUENT_ORDERS) return false
        if (filter === 'inactive' && now - new Date(c.last_order).getTime() < INACTIVE_DAYS * 86_400_000) return false
        if (!term) return true
        return c.name.toLowerCase().includes(term) || (digits.length >= 3 && c.phone.includes(digits))
      })
      .sort((a, b) => (sort === 'last_order' ? b.last_order.localeCompare(a.last_order) : Number(b[sort]) - Number(a[sort])))
  }, [query.data, filter, sort, search, now])

  function exportCsv() {
    downloadCsv(
      `clientes-${restaurant.slug}.csv`,
      ['Nombre', 'Teléfono', 'Pedidos', 'Total gastado', 'Primer pedido', 'Último pedido'],
      list.map((c) => [
        c.name,
        c.phone,
        c.orders,
        Number(c.total_spent),
        formatDateTime(c.first_order, restaurant.timezone),
        formatDateTime(c.last_order, restaurant.timezone),
      ]),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-600">Quién te compra, cuánto y cuándo fue la última vez (por teléfono).</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={list.length === 0}>
          Exportar a Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'Todos'],
            ['frequent', `Frecuentes (${FREQUENT_ORDERS}+ pedidos)`],
            ['inactive', `Inactivos (+${INACTIVE_DAYS} días)`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
              filter === id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50'
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Buscar nombre o teléfono"
          aria-label="Buscar cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-10 min-w-[12rem] flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
        />
        <select
          aria-label="Ordenar por"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm"
        >
          <option value="last_order">Más recientes</option>
          <option value="orders">Más pedidos</option>
          <option value="total_spent">Más gasto</option>
        </select>
      </div>

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Alert tone="error">{dbErrorMessage(query.error)}</Alert>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-600">
          {query.data.length === 0 ? 'Todavía no hay clientes: aparecerán con el primer pedido.' : 'Ningún cliente coincide con el filtro.'}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {list.map((c) => (
            <li key={c.phone} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
              <div className="min-w-[10rem] flex-1">
                <p className="truncate font-medium text-zinc-900">{c.name}</p>
                <p className="text-xs text-zinc-500">
                  {c.phone} · último pedido {formatDateTime(c.last_order, restaurant.timezone)}
                </p>
              </div>
              <p className="text-sm text-zinc-700">
                <span className="font-semibold tabular-nums">{c.orders}</span> pedido
                {c.orders === 1 ? '' : 's'}
                {restaurant.loyalty_enabled && c.stamps > 0 && (
                  <span className="block text-xs text-zinc-500">
                    ★ {c.stamps} sello{c.stamps === 1 ? '' : 's'}
                  </span>
                )}
              </p>
              <p className="w-24 text-right text-sm font-semibold tabular-nums">{formatCLP(Number(c.total_spent))}</p>
              <a
                href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                WhatsApp
              </a>
              {restaurant.role === 'owner' && isInactive(c.last_order) && (
                <button
                  type="button"
                  onClick={() => setWinback({ phone: c.phone, name: c.name })}
                  className="inline-flex min-h-10 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-brand-contrast"
                >
                  Invitar a volver
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <WinbackModal customer={winback} onClose={() => setWinback(null)} />
    </div>
  )
}

/**
 * Crea el cupón de regreso (RPC create_winback_coupon) y abre WhatsApp con el mensaje.
 * El dueño elige el descuento; el cupón sirve una vez, solo con el teléfono del cliente.
 */
function WinbackModal({ customer, onClose }: { customer: { phone: string; name: string } | null; onClose: () => void }) {
  const { restaurant } = useCurrentRestaurant()
  const [percent, setPercent] = useState(15)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function close() {
    setCode(null)
    setError(null)
    onClose()
  }

  async function create() {
    if (!customer) return
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('create_winback_coupon', {
      p_restaurant_id: restaurant.id,
      p_phone: customer.phone,
      p_percent: percent,
    })
    setLoading(false)
    if (rpcError) return setError(dbErrorMessage(rpcError))
    setCode(data)
  }

  const firstName = customer?.name.split(' ')[0] ?? ''
  const message = code
    ? `¡Hola ${firstName}! Te extrañamos en ${restaurant.name}. Usa el código ${code} y obtén ${percent}% de descuento en tu próximo pedido (válido 14 días): ${window.location.origin}/r/${restaurant.slug}`
    : ''

  return (
    <Modal open={customer !== null} onClose={close} title="Invitar a volver">
      <div className="space-y-4 text-sm">
        {error && <Alert tone="error">{error}</Alert>}
        {!code ? (
          <>
            <p>
              Se creará un cupón para <strong>{customer?.name}</strong>: sirve una vez, solo con su teléfono, y vence en 14 días.
            </p>
            <SelectField
              label="Descuento"
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
            >
              {[10, 15, 20, 25, 30].map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </SelectField>
            <Button onClick={create} loading={loading} className="w-full">
              Crear cupón
            </Button>
          </>
        ) : (
          <>
            <p>
              Cupón <strong className="font-mono">{code}</strong> creado. Envíalo por WhatsApp:
            </p>
            <a
              href={`https://wa.me/${customer?.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
            >
              Enviar por WhatsApp
            </a>
          </>
        )}
      </div>
    </Modal>
  )
}
