/**
 * Banda horizontal en movimiento continuo con tipos de negocio.
 *
 * La lista se repite dos veces y se desplaza -50% en bucle (animación CSS animate-marquee,
 * solo transform): cuando termina, la segunda copia está justo donde empezó la primera,
 * así el corte no se nota. Se pausa fuera de pantalla y con prefers-reduced-motion.
 */
import { useRef } from 'react'
import { useInView } from 'motion/react'

const BUSINESSES = [
  'Pizzerías',
  'Sushi',
  'Hamburgueserías',
  'Cafeterías',
  'Pastelerías',
  'Dark kitchens',
  'Comida peruana',
  'Sandwicherías',
]

export function Marquee() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)

  return (
    <section aria-label="Tipos de negocio" className="border-y border-zinc-200 bg-zinc-50 py-6">
      {/* Lista para lectores de pantalla (la banda animada es decorativa). */}
      <p className="sr-only">Para {BUSINESSES.join(', ')}.</p>
      <div
        ref={ref}
        aria-hidden
        className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
      >
        <div
          className="flex w-max animate-marquee motion-reduce:animate-none"
          style={{ animationPlayState: inView ? 'running' : 'paused' }}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center">
              {BUSINESSES.map((b) => (
                <li key={b} className="flex items-center px-6 text-lg font-semibold text-zinc-500">
                  {b}
                  <span className="ml-12 size-1.5 rounded-full bg-rose-300" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  )
}
