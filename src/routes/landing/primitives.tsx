/**
 * Componentes reutilizables de animación para la landing.
 *
 *   Reveal       Aparece con fade + desplazamiento al entrar en pantalla.
 *   Stagger      Contenedor cuyos hijos <StaggerItem> aparecen uno tras otro.
 *   CtaLink      Botón-enlace con brillo al pasar el mouse y efecto "magnético".
 *   SpotlightCard Tarjeta con halo de luz que sigue al cursor y leve elevación.
 *
 * Todos animan solo transform y opacity (60 fps) y quedan estáticos con
 * prefers-reduced-motion.
 */
import { useRef, type PointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { motion, useMotionValue, useReducedMotion, useSpring, type Variants } from 'motion/react'
import { EASE_OUT, useMotionLevel } from './motion-hooks'

// -----------------------------------------------------------------------------
// Aparición al hacer scroll
// -----------------------------------------------------------------------------

type RevealProps = { children: ReactNode; className?: string; delay?: number }

/** Fade + slide hacia arriba la primera vez que el bloque entra en pantalla. */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  )
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
}

/** Contenedor: sus <StaggerItem> aparecen en secuencia al entrar en pantalla. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </motion.div>
  )
}

/** Elemento hijo de <Stagger>. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Botón principal: brillo + efecto magnético
// -----------------------------------------------------------------------------

type CtaLinkProps = {
  to: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'light'
  className?: string
}

const ctaVariants = {
  primary: 'bg-brand text-white shadow-lg shadow-rose-600/25',
  secondary: 'border border-zinc-300 bg-white/80 text-zinc-900 backdrop-blur hover:bg-white',
  light: 'bg-white text-zinc-900 shadow-lg',
} as const

/**
 * Enlace con forma de botón.
 * - Brillo: una franja de luz recorre el botón al pasar el mouse (CSS transform).
 * - Magnético: en escritorio, el botón se desplaza levemente hacia el cursor.
 */
export function CtaLink({ to, children, variant = 'primary', className = '' }: CtaLinkProps) {
  const { rich } = useMotionLevel()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  // Resorte: el movimiento sigue al cursor con suavidad y vuelve al soltar.
  const springX = useSpring(x, { stiffness: 250, damping: 18, mass: 0.4 })
  const springY = useSpring(y, { stiffness: 250, damping: 18, mass: 0.4 })

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!rich) return
    const rect = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - (rect.left + rect.width / 2)) * 0.2)
    y.set((e.clientY - (rect.top + rect.height / 2)) * 0.3)
  }

  function reset() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      className="inline-flex"
      style={{ x: springX, y: springY }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
    >
      <Link
        to={to}
        className={`group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-6 text-base font-semibold transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${ctaVariants[variant]} ${className}`}
      >
        {/* Franja de brillo: parte fuera del botón a la izquierda y cruza al pasar el mouse. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[150%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[400%] motion-reduce:hidden"
        />
        <span className="relative">{children}</span>
      </Link>
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Tarjeta con spotlight
// -----------------------------------------------------------------------------

/**
 * Tarjeta con un halo de luz que sigue al cursor dentro de ella y una leve elevación.
 * El halo es un círculo con degradado movido con transform (no se repinta el fondo).
 */
export function SpotlightCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { rich } = useMotionLevel()
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    x.set(e.clientX - rect.left)
    y.set(e.clientY - rect.top)
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={rich ? onPointerMove : undefined}
      whileHover={rich ? { y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-xl hover:shadow-zinc-900/5 ${className}`}
    >
      {rich && (
        <motion.div
          aria-hidden
          style={{ x, y }}
          className="pointer-events-none absolute -left-40 -top-40 size-80 rounded-full bg-[radial-gradient(circle,rgb(225_29_72/0.14),transparent_62%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  )
}
