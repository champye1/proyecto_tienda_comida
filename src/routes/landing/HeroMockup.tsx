/**
 * Maqueta animada del hero: simula el producto funcionando, en bucle.
 *
 *   Tablet  → panel de pedidos tipo kanban. Cada pocos segundos entra un pedido nuevo en
 *             "Pendiente" (con destello) y otros avanzan Pendiente → Preparando → Listo
 *             con animación de layout (Motion mueve las tarjetas con transform).
 *   Celular → tienda: se agrega un producto, el contador del carrito rebota y el total sube.
 *   Toast   → "Nuevo pedido #128 · $18.990" aparece y desaparece con cada pedido nuevo.
 *   Chips   → etiquetas flotantes alrededor ("Pedido confirmado ✓", "+ Agregado: extra queso").
 *   Tilt 3D → en escritorio, la maqueta se inclina suavemente siguiendo el mouse.
 *
 * Todo se detiene si la maqueta sale de la pantalla o si el usuario pidió menos movimiento.
 * Es decorativa: para lectores de pantalla es una sola imagen con descripción (role="img").
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { formatCLP } from '@/lib/format'
import { IconCheck, IconPlus } from './icons'
import { useMotionLevel, useVisibleInterval } from './motion-hooks'

// -----------------------------------------------------------------------------
// Datos de la simulación
// -----------------------------------------------------------------------------

type Status = 'pending' | 'preparing' | 'ready'

type MockOrder = {
  id: number
  status: Status
  items: string
  total: number
  /** true durante el tick en que el pedido acaba de llegar (para el destello). */
  isNew: boolean
}

const COLUMNS: { status: Status; label: string; dot: string }[] = [
  { status: 'pending', label: 'Pendiente', dot: 'bg-amber-400' },
  { status: 'preparing', label: 'Preparando', dot: 'bg-sky-500' },
  { status: 'ready', label: 'Listo', dot: 'bg-emerald-500' },
]

const INITIAL_ORDERS: MockOrder[] = [
  { id: 127, status: 'pending', items: '1× Cuatro Quesos', total: 10990, isNew: false },
  { id: 126, status: 'preparing', items: '2× Pepperoni', total: 19980, isNew: false },
  { id: 125, status: 'ready', items: 'Margarita + Coca-Cola', total: 13490, isNew: false },
]

/** Pedidos que van "llegando" en la simulación (se recorren en ciclo). */
const INCOMING = [
  { items: '2× Margarita familiar', total: 18990 },
  { items: 'Pepperoni + Tiramisú', total: 13980 },
  { items: '3× Coca-Cola + Calzone', total: 16990 },
  { items: '1× Cuatro Quesos', total: 10990 },
]

/** Productos de la tienda en el celular. */
const MENU = [
  { name: 'Margarita', price: 8990 },
  { name: 'Pepperoni', price: 9990 },
  { name: 'Cuatro Quesos', price: 10990 },
]

/** Cada cuánto avanza la simulación. */
const TICK_MS = 2600

/**
 * Un paso del tablero: el pedido "Preparando" más antiguo pasa a "Listo"
 * (si hay cola) o el "Pendiente" más antiguo pasa a "Preparando".
 * La columna "Listo" muestra como máximo 2 pedidos (los entregados salen del tablero).
 */
function advanceBoard(prev: MockOrder[]): MockOrder[] {
  const next = prev.map((o) => ({ ...o, isNew: false }))
  const oldestPreparing = next.findLastIndex((o) => o.status === 'preparing')
  const oldestPending = next.findLastIndex((o) => o.status === 'pending')
  const preparingCount = next.filter((o) => o.status === 'preparing').length

  if (oldestPreparing !== -1 && (oldestPending === -1 || preparingCount >= 2)) {
    next[oldestPreparing] = { ...next[oldestPreparing]!, status: 'ready' }
  } else if (oldestPending !== -1) {
    next[oldestPending] = { ...next[oldestPending]!, status: 'preparing' }
  }

  const readyIdx = next.flatMap((o, i) => (o.status === 'ready' ? [i] : []))
  if (readyIdx.length > 2) next.splice(readyIdx.at(-1)!, 1)
  return next
}

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

type HeroMockupProps = {
  /** Desplazamiento vertical por parallax (lo calcula Hero según el scroll). */
  parallaxY?: MotionValue<number>
}

export function HeroMockup({ parallaxY }: HeroMockupProps) {
  const { rich } = useMotionLevel()
  const ref = useRef<HTMLDivElement>(null)

  const [orders, setOrders] = useState(INITIAL_ORDERS)
  const [toast, setToast] = useState<MockOrder | null>(null)
  const [cart, setCart] = useState({ count: 0, total: 0, lastAdded: -1 })
  const tickRef = useRef(0)
  const nextIdRef = useRef(128)

  /** Un paso de la simulación: celular y tablet avanzan juntos. */
  const onTick = useCallback(() => {
    const t = tickRef.current++

    // Celular: agrega el siguiente producto; después de 4 vuelve a empezar.
    setCart((c) => {
      if (c.count >= 4) return { count: 0, total: 0, lastAdded: -1 }
      const i = c.count % MENU.length
      return { count: c.count + 1, total: c.total + MENU[i]!.price, lastAdded: i }
    })

    // Tablet: cada 3 pasos llega un pedido nuevo; los demás pasos, los pedidos avanzan.
    if (t % 3 === 0) {
      const template = INCOMING[nextIdRef.current % INCOMING.length]!
      const order: MockOrder = { id: nextIdRef.current++, status: 'pending', isNew: true, ...template }
      setOrders((prev) => [order, ...prev.map((o) => ({ ...o, isNew: false }))])
      setToast(order)
    } else {
      setOrders(advanceBoard)
    }
  }, [])

  const running = useVisibleInterval(ref, onTick, TICK_MS)

  // La notificación desaparece sola a los 2,2 s.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  // --- Tilt 3D (solo escritorio con mouse) ---
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rotateY = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 120, damping: 18 })
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 120, damping: 18 })

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - rect.left) / rect.width)
    py.set((e.clientY - rect.top) / rect.height)
  }

  function resetTilt() {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <motion.div
      ref={ref}
      style={{ y: parallaxY }}
      className="relative mx-auto w-full max-w-[580px] pb-24 [perspective:1400px]"
      onPointerMove={rich ? onPointerMove : undefined}
      onPointerLeave={rich ? resetTilt : undefined}
      role="img"
      aria-label="Vista previa animada: los pedidos llegan al panel del restaurante mientras un cliente arma su carrito en el celular."
      data-running={running}
      data-orders={orders.map((o) => `${o.id}:${o.status}`).join(',')}
    >
      <motion.div style={rich ? { rotateX, rotateY, transformStyle: 'preserve-3d' } : undefined} className="relative">
        <Tablet orders={orders} toast={toast} />
        <Phone cart={cart} />
        <FloatingChips running={running} />
      </motion.div>
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Tablet: panel de pedidos
// -----------------------------------------------------------------------------

function Tablet({ orders, toast }: { orders: MockOrder[]; toast: MockOrder | null }) {
  return (
    <div className="relative rounded-[26px] border-[9px] border-zinc-900 bg-zinc-900 shadow-2xl shadow-rose-950/20">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[17px] bg-zinc-50">
        {/* Barra superior del panel */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="size-4 rounded bg-brand" />
            <span className="text-[10px] font-bold text-zinc-900">Pizzería Demo</span>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Abierto
          </span>
        </div>

        {/* Kanban */}
        <LayoutGroup>
          <div className="grid h-full grid-cols-3 gap-2 p-2">
            {COLUMNS.map((col) => {
              const list = orders.filter((o) => o.status === col.status)
              return (
                <div key={col.status} className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-zinc-100/80 p-1.5">
                  <div className="flex items-center gap-1 px-0.5 text-[9px] font-semibold text-zinc-600">
                    <span className={`size-1.5 rounded-full ${col.dot}`} />
                    {col.label}
                    <span className="ml-auto text-zinc-500">{list.length}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {list.map((o) => (
                      <OrderCard key={o.id} order={o} />
                    ))}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </LayoutGroup>

        {/* Notificación de pedido nuevo */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -14, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className="absolute right-2 top-9 z-10 flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-[10px] font-semibold text-white shadow-xl"
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-brand">🔔</span>
              Nuevo pedido #{toast.id} · {formatCLP(toast.total)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Tarjeta de pedido. `layoutId` permite que Motion la anime al cambiar de columna. */
function OrderCard({ order }: { order: MockOrder }) {
  return (
    <motion.div
      layout
      layoutId={`order-${order.id}`}
      initial={{ opacity: 0, scale: 0.9, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="relative overflow-hidden rounded-md border border-zinc-200 bg-white p-1.5 shadow-sm"
    >
      {/* Destello de pedido nuevo */}
      {order.isNew && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-md bg-rose-400/30 ring-2 ring-brand"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0, 0.8, 0] }}
          transition={{ duration: 1.6 }}
        />
      )}
      <div className="relative flex items-center justify-between">
        <span className="text-[10px] font-bold text-zinc-900">#{order.id}</span>
        <span className="text-[9px] font-semibold text-zinc-700">{formatCLP(order.total)}</span>
      </div>
      <p className="relative mt-0.5 truncate text-[9px] text-zinc-600">{order.items}</p>
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Celular: tienda con carrito
// -----------------------------------------------------------------------------

function Phone({ cart }: { cart: { count: number; total: number; lastAdded: number } }) {
  return (
    // Abajo a la derecha y más bajo que la tablet: solo cubre la parte vacía de la columna
    // "Listo" (máx. 2 tarjetas). La columna "Pendiente", donde entran los pedidos, queda a la vista.
    <div className="absolute -bottom-20 -right-2 w-[27%] min-w-[104px] max-w-[150px] [transform:translateZ(60px)] sm:-right-6">
      <div className="rounded-[24px] border-[6px] border-zinc-900 bg-zinc-900 shadow-2xl shadow-zinc-900/30">
        <div className="relative flex aspect-[9/18] flex-col overflow-hidden rounded-[18px] bg-white">
          {/* Cabecera de la tienda */}
          <div className="bg-brand px-2.5 pb-2.5 pt-3 text-white">
            <p className="text-[9px]">Tienda online</p>
            <p className="text-[11px] font-bold leading-tight">Pizzería Demo</p>
          </div>
          <div className="flex gap-1 px-2 py-1.5">
            <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[8px] font-semibold text-white">Pizzas</span>
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[8px] text-zinc-600">Bebidas</span>
          </div>

          {/* Productos */}
          <div className="flex-1 space-y-1.5 px-2">
            {MENU.map((p, i) => (
              <div key={p.name} className="flex items-center gap-1.5 rounded-lg border border-zinc-100 p-1">
                <span className="size-6 shrink-0 rounded-md bg-gradient-to-br from-amber-200 to-rose-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[8.5px] font-semibold text-zinc-900">{p.name}</p>
                  <p className="text-[8px] text-zinc-500">{formatCLP(p.price)}</p>
                </div>
                {/* El botón del producto recién agregado hace un "pulso". */}
                <motion.span
                  key={cart.lastAdded === i ? `added-${cart.count}` : 'idle'}
                  animate={cart.lastAdded === i ? { scale: [1, 0.8, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 0.45 }}
                  className={`flex size-4 items-center justify-center rounded-full ${
                    cart.lastAdded === i ? 'bg-brand text-white' : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  <IconPlus className="size-2.5" strokeWidth={3} />
                </motion.span>
              </div>
            ))}
          </div>

          {/* Barra del carrito: el contador rebota y el total se actualiza. */}
          <div className="m-2 flex items-center justify-between rounded-lg bg-zinc-900 px-2 py-1.5 text-white">
            <span className="flex items-center gap-1 text-[8.5px] font-semibold">
              Ver carrito
              <motion.span
                key={cart.count}
                initial={{ scale: 1.7 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 12 }}
                className="flex size-3.5 items-center justify-center rounded-full bg-brand text-[8px]"
              >
                {cart.count}
              </motion.span>
            </span>
            <span className="text-[8.5px] font-bold tabular-nums">{formatCLP(cart.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Chips flotantes
// -----------------------------------------------------------------------------

/** Etiquetas que "flotan" (suben y bajan suavemente) alrededor de la maqueta. */
function FloatingChips({ running }: { running: boolean }) {
  const float = (distance: number, duration: number) =>
    running
      ? { y: [0, -distance, 0], transition: { duration, repeat: Infinity, ease: 'easeInOut' as const } }
      : { y: 0 }

  return (
    <>
      <motion.div
        animate={float(8, 4.2)}
        className="absolute -left-3 -top-5 hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-lg sm:flex lg:-left-8"
      >
        <IconCheck className="size-3.5" strokeWidth={3} /> Pedido confirmado
      </motion.div>
      <motion.div
        animate={float(10, 5.1)}
        className="absolute -left-4 bottom-10 hidden items-center gap-1.5 rounded-full border border-rose-100 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-lg sm:flex lg:-left-10"
      >
        <IconPlus className="size-3.5" strokeWidth={3} /> Agregado: extra queso
      </motion.div>
    </>
  )
}
