/**
 * Hero de la landing: lo primero que se ve.
 *
 * - Entrada escalonada al cargar: etiqueta → título (palabra por palabra) → subtítulo →
 *   botones → maqueta, cada uno con fade + desplazamiento corto.
 * - Fondo "aurora": manchas de color difuminadas (tonos suaves del rojo de marca) que se
 *   mueven lentamente + una grilla de puntos que se desvanece hacia los bordes.
 * - Parallax suave de la maqueta y de las manchas al hacer scroll (solo escritorio).
 */
import { useRef } from 'react'
import { motion, useInView, useScroll, useTransform, type MotionValue, type Variants } from 'motion/react'
import { HeroMockup } from './HeroMockup'
import { EASE_OUT, useMotionLevel } from './motion-hooks'
import { CtaLink } from './primitives'

/** Título dividido en palabras; las marcadas con `accent` van con el degradado de marca. */
const TITLE: { text: string; accent?: boolean }[] = [
  { text: 'Recibe' },
  { text: 'pedidos', accent: true },
  { text: 'online', accent: true },
  { text: 'en' },
  { text: 'tu' },
  { text: 'restaurante' },
]

// Secuencia de entrada: el contenedor escalona a sus hijos.
const sequence: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
}
// El título escalona sus palabras.
const titleSequence: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const word: Variants = {
  hidden: { opacity: 0, y: '0.45em' },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
}

export function Hero() {
  const { reduced, rich } = useMotionLevel()
  const sectionRef = useRef<HTMLElement>(null)
  const inView = useInView(sectionRef, { amount: 0.1 })

  // Parallax: a medida que el hero sale por arriba, la maqueta y las manchas se desplazan
  // a distinta velocidad (sensación de profundidad).
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] })
  const mockupY = useTransform(scrollYProgress, [0, 1], [0, rich ? 90 : 0])
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, rich ? 160 : 0])

  // Con reduced motion, `initial={false}` muestra todo en su estado final, sin animar.
  const initial = reduced ? false : 'hidden'

  return (
    <section ref={sectionRef} className="relative overflow-hidden pb-20 pt-28 lg:pb-28 lg:pt-36">
      <Aurora y={auroraY} animate={inView && !reduced} />

      <motion.div
        className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 lg:grid-cols-[1.05fr_1fr]"
        variants={sequence}
        initial={initial}
        animate="show"
      >
        <div>
          <motion.p
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/70 px-3 py-1 text-sm font-medium text-rose-700 backdrop-blur"
          >
            <span className="relative flex size-2">
              {!reduced && <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-75" />}
              <span className="relative size-2 rounded-full bg-brand" />
            </span>
            Pedidos online para restaurantes en Chile
          </motion.p>

          <motion.h1
            variants={titleSequence}
            className="mt-6 text-[2.6rem] font-bold leading-[1.05] tracking-tight text-zinc-900 sm:text-6xl"
          >
            {TITLE.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                <motion.span
                  variants={word}
                  className={`inline-block ${
                    w.accent ? 'bg-gradient-to-r from-rose-600 to-orange-500 bg-clip-text text-transparent' : ''
                  }`}
                >
                  {w.text}
                </motion.span>
                {i < TITLE.length - 1 && ' '}
              </span>
            ))}
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600">
            Crea tu tienda en minutos, comparte el link por WhatsApp o Instagram y gestiona los pedidos en tiempo real
            desde una tablet en la cocina.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-wrap gap-3">
            <CtaLink to="/admin/registro">Registra tu restaurante</CtaLink>
            <CtaLink to="/admin/login" variant="secondary">
              Ya tengo cuenta
            </CtaLink>
          </motion.div>

          <motion.p variants={fadeUp} className="mt-5 text-sm text-zinc-500">
            Sin apps que instalar · Tus clientes piden desde el navegador
          </motion.p>
        </div>

        <motion.div variants={fadeUp}>
          <HeroMockup parallaxY={mockupY} />
        </motion.div>
      </motion.div>
    </section>
  )
}

/**
 * Fondo del hero: manchas de color con degradado radial (no usan filtro blur, que es
 * costoso) que derivan lentamente, más una grilla de puntos con máscara hacia los bordes.
 */
function Aurora({ y, animate }: { y: MotionValue<number>; animate: boolean }) {
  const drift = (dx: number, dy: number, duration: number) =>
    animate
      ? {
          x: [0, dx, 0],
          y: [0, dy, 0],
          transition: { duration, repeat: Infinity, ease: 'easeInOut' as const },
        }
      : { x: 0, y: 0 }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div style={{ y }} className="absolute inset-0">
        <motion.div
          animate={drift(60, 40, 18)}
          className="absolute -left-40 -top-32 size-[38rem] rounded-full bg-[radial-gradient(circle,rgb(251_113_133/0.28),transparent_65%)]"
        />
        <motion.div
          animate={drift(-70, 50, 22)}
          className="absolute -right-32 top-10 size-[34rem] rounded-full bg-[radial-gradient(circle,rgb(251_146_60/0.22),transparent_65%)]"
        />
        <motion.div
          animate={drift(40, -60, 26)}
          className="absolute left-1/3 top-1/2 size-[30rem] rounded-full bg-[radial-gradient(circle,rgb(244_114_182/0.18),transparent_65%)]"
        />
      </motion.div>
      {/* Grilla de puntos que se desvanece hacia los bordes */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgb(24_24_27/0.13)_1px,transparent_1.2px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black_20%,transparent_75%)]" />
    </div>
  )
}
