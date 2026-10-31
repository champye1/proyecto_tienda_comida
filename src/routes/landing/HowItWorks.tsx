/**
 * Sección "Cómo funciona": 3 pasos unidos por una línea.
 *
 * La línea se "dibuja" según el avance del scroll (escala de 0 a 1 con transform:
 * horizontal en escritorio, vertical en celular) y cada número se activa cuando la
 * línea lo alcanza. Con prefers-reduced-motion se muestra completa y todo activo.
 */
import { useRef, useState } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { Reveal } from './primitives'

const STEPS = [
  {
    title: 'Crea tu cuenta y tu tienda',
    text: 'Regístrate con tu email, elige el nombre y la dirección web de tu restaurante. Toma un par de minutos.',
  },
  {
    title: 'Arma tu menú',
    text: 'Agrega categorías, productos con foto, tamaños y agregados. Ordénalos como quieras.',
  },
  {
    title: 'Comparte el link y recibe pedidos',
    text: 'Publica tu link en WhatsApp e Instagram. Los pedidos llegan al panel al instante, con aviso sonoro.',
  },
]

export function HowItWorks() {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  // 0 cuando la lista entra por abajo de la pantalla, 1 cuando su final pasa el 60% de la altura.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 60%'] })
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 })

  // Cuántos pasos alcanzó la línea (posiciones 0, 0.5 y 1 a lo largo de la línea).
  const [reached, setReached] = useState(reduced ? STEPS.length : 0)
  useMotionValueEvent(progress, 'change', (p) => {
    if (reduced) return
    setReached(STEPS.filter((_, i) => p >= (i / (STEPS.length - 1)) * 0.97).length)
  })

  const lineScale = reduced ? 1 : progress

  return (
    <section id="como-funciona" className="scroll-mt-20 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Cómo funciona</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            De cero a recibir pedidos en tres pasos
          </h2>
        </Reveal>

        <div ref={ref} className="relative mt-16">
          {/* Línea: base gris + parte de color que crece con el scroll. */}
          <div aria-hidden className="absolute left-5 top-0 h-full w-0.5 bg-zinc-200 md:left-0 md:top-5 md:h-0.5 md:w-full">
            <motion.div
              style={{ scaleY: lineScale }}
              className="h-full w-full origin-top bg-gradient-to-b from-rose-500 to-orange-400 md:hidden"
            />
            <motion.div
              style={{ scaleX: lineScale }}
              className="hidden h-full w-full origin-left bg-gradient-to-r from-rose-500 to-orange-400 md:block"
            />
          </div>

          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => {
              const active = i < reached
              return (
                <li key={step.title} className="relative pl-16 md:pl-0 md:pt-16">
                  {/* Número: capa gris + capa de color que aparece al activarse. */}
                  <div className="absolute left-0 top-0 flex size-11 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border-2 border-zinc-200 bg-white" />
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-brand shadow-lg shadow-rose-500/30"
                      initial={false}
                      animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.6 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    />
                    <span className={`relative text-sm font-bold transition-colors ${active ? 'text-white' : 'text-zinc-400'}`}>
                      {i + 1}
                    </span>
                  </div>
                  {/* El texto siempre tiene contraste completo (accesibilidad); solo el número se activa. */}
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">{step.title}</h3>
                    <p className="mt-2 text-zinc-600">{step.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
