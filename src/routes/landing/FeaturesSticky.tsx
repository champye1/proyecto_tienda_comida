/**
 * Sección de funciones con "scroll fijo" (sticky).
 *
 * Escritorio: a la izquierda, la lista de funciones (cada una ocupa casi una pantalla);
 * a la derecha, un dispositivo que queda fijo mientras se hace scroll y cambia su
 * pantalla, con transición, según la función que está en el centro de la vista.
 *
 * Celular: lista simple (sin sticky ni dispositivo), más liviana.
 */
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { AnimatePresence, motion, useInView } from 'motion/react'
import { formatCLP } from '@/lib/format'
import { IconBolt, IconChart, IconCheck, IconClock, IconMenu, IconPower } from './icons'
import { EASE_OUT, useMediaQuery } from './motion-hooks'
import { Reveal, Stagger, StaggerItem } from './primitives'

type Feature = {
  title: string
  text: string
  points: string[]
  icon: ComponentType<SVGProps<SVGSVGElement>>
  screen: ComponentType
}

const FEATURES: Feature[] = [
  {
    title: 'Menú con fotos y opciones',
    text: 'Tus clientes eligen tamaño, agregados y cantidad. El sistema respeta los mínimos y máximos que definas.',
    points: ['Categorías y productos con foto', 'Tamaños y agregados con precio extra', 'Marca productos agotados con un toque'],
    icon: IconMenu,
    screen: MenuScreen,
  },
  {
    title: 'Pedidos en tiempo real',
    text: 'Cada pedido aparece al instante en el panel de la cocina, con aviso sonoro. Muévelo de estado con un toque.',
    points: ['Vista por estados: pendiente, preparando, listo', 'Aviso sonoro al llegar un pedido', 'Pensado para tablet en la cocina'],
    icon: IconBolt,
    screen: OrdersScreen,
  },
  {
    title: 'Seguimiento para tus clientes',
    text: 'Después de pedir, tu cliente ve el estado de su pedido en vivo. Menos llamadas preguntando "¿cuánto falta?".',
    points: ['Estado actualizado en vivo', 'Sin registrarse ni instalar nada', 'Link privado para cada pedido'],
    icon: IconClock,
    screen: TrackingScreen,
  },
  {
    title: 'Abre y cierra con un toque',
    text: 'Controla cuándo recibes pedidos. Activa delivery o retiro en el local y define el pedido mínimo.',
    points: ['Abrir y cerrar el local al instante', 'Delivery, retiro o ambos', 'Costo de envío y pedido mínimo'],
    icon: IconPower,
    screen: OpenCloseScreen,
  },
  {
    title: 'Ventas del día',
    text: 'Mira cuánto vendiste hoy y cuáles son tus productos estrella, sin planillas.',
    points: ['Total vendido del día', 'Productos más vendidos', 'Historial de pedidos'],
    icon: IconChart,
    screen: ReportScreen,
  },
]

export function FeaturesSticky() {
  const desktop = useMediaQuery('(min-width: 1024px)')
  return (
    <section id="funciones" className="scroll-mt-20 bg-zinc-50 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Funciones</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Todo el flujo del pedido, en un solo lugar
          </h2>
          <p className="mt-4 text-lg text-zinc-600">Desde que tu cliente abre el menú hasta que el pedido sale de la cocina.</p>
        </Reveal>
        {desktop ? <StickyLayout /> : <SimpleList />}
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Escritorio: lista + dispositivo fijo
// -----------------------------------------------------------------------------

function StickyLayout() {
  const [active, setActive] = useState(0)
  const Screen = FEATURES[active]!.screen

  return (
    <div className="mt-8 grid grid-cols-2 gap-16">
      <div>
        {FEATURES.map((f, i) => (
          <FeatureStep key={f.title} feature={f} index={i} active={active === i} onActive={setActive} />
        ))}
      </div>

      {/* Dispositivo fijo: queda centrado verticalmente mientras la lista pasa. */}
      <div className="sticky top-0 flex h-screen items-center justify-center">
        <div className="w-full max-w-[360px] rounded-[30px] border-[9px] border-zinc-900 bg-zinc-900 shadow-2xl shadow-zinc-900/20">
          <div className="relative aspect-[3/4] overflow-hidden rounded-[21px] bg-white">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                className="absolute inset-0"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
              >
                <Screen />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

type FeatureStepProps = {
  feature: Feature
  index: number
  active: boolean
  onActive: (i: number) => void
}

/** Una función de la lista. Se marca activa cuando cruza la línea central de la pantalla. */
function FeatureStep({ feature, index, active, onActive }: FeatureStepProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Margen -50% arriba y abajo: "en vista" = cruza exactamente el centro vertical.
  const inCenter = useInView(ref, { margin: '-50% 0px -50% 0px' })
  useEffect(() => {
    if (inCenter) onActive(index)
  }, [inCenter, index, onActive])

  const Icon = feature.icon
  return (
    <div ref={ref} className="relative flex min-h-[75vh] items-center pl-8">
      {/* Indicador lateral: la barra de color crece en la función activa. */}
      <span aria-hidden className="absolute bottom-[30%] left-0 top-[30%] w-0.5 bg-zinc-200">
        <motion.span
          className="absolute inset-0 origin-top bg-brand"
          initial={false}
          animate={{ scaleY: active ? 1 : 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        />
      </span>
      <div>
        <span
          className={`flex size-11 items-center justify-center rounded-xl transition-colors duration-300 ${
            active ? 'bg-brand text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'
          }`}
        >
          <Icon className="size-5" />
        </span>
        <h3 className={`mt-5 text-2xl font-semibold transition-colors duration-300 ${active ? 'text-zinc-900' : 'text-zinc-500'}`}>
          {feature.title}
        </h3>
        <p className="mt-3 text-lg text-zinc-600">{feature.text}</p>
        <ul className="mt-5 space-y-2">
          {feature.points.map((p) => (
            <li key={p} className="flex items-center gap-2 text-zinc-700">
              <IconCheck className="size-4 shrink-0 text-brand" strokeWidth={2.5} />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Celular: lista simple
// -----------------------------------------------------------------------------

function SimpleList() {
  return (
    <Stagger className="mt-10 space-y-4">
      {FEATURES.map((f) => {
        const Icon = f.icon
        return (
          <StaggerItem key={f.title} className="rounded-2xl border border-zinc-200 bg-white p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rose-50 text-brand">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900">{f.title}</h3>
            <p className="mt-2 text-zinc-600">{f.text}</p>
          </StaggerItem>
        )
      })}
    </Stagger>
  )
}

// -----------------------------------------------------------------------------
// Pantallas del dispositivo (ilustraciones con datos de ejemplo)
// -----------------------------------------------------------------------------

/** Cabecera común de las pantallas. */
function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-zinc-100 px-5 pb-3 pt-5">
      <p className="text-base font-bold text-zinc-900">{title}</p>
      {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
    </div>
  )
}

function MenuScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-32 bg-gradient-to-br from-amber-200 via-orange-300 to-rose-400" />
      <div className="flex-1 space-y-4 p-5">
        <div>
          <p className="text-lg font-bold text-zinc-900">Margarita</p>
          <p className="text-sm text-zinc-500">Salsa de tomate, mozzarella y albahaca.</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tamaño · elige 1</p>
          {[
            ['Mediana', '', true],
            ['Familiar', '+ $4.000', false],
          ].map(([name, extra, on]) => (
            <div key={name as string} className="mt-2 flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={`size-4 rounded-full border-2 ${on ? 'border-[5px] border-brand' : 'border-zinc-300'}`} />
                {name}
              </span>
              <span className="text-zinc-500">{extra}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Agregados · hasta 3</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['Extra queso', 'Champiñones', 'Aceitunas'].map((a, i) => (
              <span key={a} className={`rounded-full px-3 py-1 text-xs ${i === 0 ? 'bg-rose-50 font-semibold text-rose-700 ring-1 ring-rose-200' : 'bg-zinc-100 text-zinc-600'}`}>
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="rounded-xl bg-brand py-3 text-center text-sm font-semibold text-white">Agregar · {formatCLP(9990)}</div>
      </div>
    </div>
  )
}

function OrdersScreen() {
  const cols = [
    { label: 'Pendiente', dot: 'bg-amber-400', items: [['#131', 18990], ['#130', 9990]] },
    { label: 'Preparando', dot: 'bg-sky-500', items: [['#129', 21480]] },
    { label: 'Listo', dot: 'bg-emerald-500', items: [['#128', 13490]] },
  ] as const
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Pedidos de hoy" subtitle="Se actualizan en tiempo real" />
      <div className="flex-1 space-y-3 p-4">
        {cols.map((c) => (
          <div key={c.label} className="rounded-xl bg-zinc-50 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
              <span className={`size-2 rounded-full ${c.dot}`} /> {c.label}
            </p>
            <div className="mt-2 space-y-2">
              {c.items.map(([id, total]) => (
                <div key={id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="font-semibold">{id}</span>
                  <span className="text-zinc-600">{formatCLP(total)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrackingScreen() {
  const steps = ['Recibido', 'Confirmado', 'Preparando', 'Listo para retirar']
  const current = 2
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Pedido #128" subtitle="Pizzería Demo" />
      <div className="flex-1 p-6">
        <p className="text-sm text-zinc-500">Estado de tu pedido</p>
        <p className="mt-1 text-2xl font-bold text-zinc-900">Preparando</p>
        <ol className="mt-6 space-y-5">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span
                className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                  i < current ? 'bg-emerald-500 text-white' : i === current ? 'bg-brand text-white' : 'bg-zinc-100 text-zinc-400'
                }`}
              >
                {i < current ? <IconCheck className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={i <= current ? 'font-semibold text-zinc-900' : 'text-zinc-500'}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function OpenCloseScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Mi local" subtitle="Pizzería Demo" />
      <div className="flex-1 space-y-4 p-5">
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4">
          <div>
            <p className="font-semibold text-emerald-900">Local abierto</p>
            <p className="text-sm text-emerald-700">Recibiendo pedidos</p>
          </div>
          <span className="flex h-7 w-12 items-center justify-end rounded-full bg-emerald-500 p-1">
            <span className="size-5 rounded-full bg-white shadow" />
          </span>
        </div>
        {[
          ['Delivery', `Envío ${formatCLP(2000)}`],
          ['Retiro en local', 'Sin costo'],
          ['Pedido mínimo', formatCLP(8000)],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-sm">
            <span className="font-medium text-zinc-800">{k}</span>
            <span className="text-zinc-500">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportScreen() {
  // Datos de ejemplo para la ilustración (ventas por hora).
  const bars = [30, 45, 38, 70, 95, 80, 55]
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Ventas de hoy" subtitle="Ejemplo ilustrativo" />
      <div className="flex-1 p-5">
        <p className="text-3xl font-bold text-zinc-900">{formatCLP(412380)}</p>
        <p className="text-sm text-zinc-500">32 pedidos</p>
        {/* Barras: crecen con scaleY (transform) al mostrarse la pantalla. */}
        <div className="mt-6 flex h-28 items-end gap-2">
          {bars.map((h, i) => (
            <motion.span
              key={i}
              className="flex-1 origin-bottom rounded-t-md bg-gradient-to-t from-rose-500 to-orange-400"
              style={{ height: `${h}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, delay: 0.05 * i, ease: EASE_OUT }}
            />
          ))}
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Más vendidos</p>
        {[
          ['Margarita', 14],
          ['Pepperoni', 9],
          ['Cuatro Quesos', 6],
        ].map(([n, q]) => (
          <div key={n} className="mt-2 flex justify-between text-sm">
            <span className="text-zinc-800">{n}</span>
            <span className="text-zinc-500">{q} vendidos</span>
          </div>
        ))}
      </div>
    </div>
  )
}
