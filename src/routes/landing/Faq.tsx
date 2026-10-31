/**
 * Preguntas frecuentes en acordeón.
 *
 * Al abrir, la respuesta se despliega con una animación suave de altura y el ícono "+"
 * gira hasta formar una "×". Es la única animación de altura de la landing: se usa en un
 * bloque pequeño y solo al hacer clic, así que no afecta la fluidez.
 * Accesible: cada pregunta es un <button> con aria-expanded y aria-controls.
 */
import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { IconPlus } from './icons'
import { EASE_OUT } from './motion-hooks'
import { Reveal, Stagger, StaggerItem } from './primitives'

const QUESTIONS = [
  {
    q: '¿Mis clientes tienen que descargar una app?',
    a: 'No. Tus clientes abren el link de tu tienda en el navegador del celular y piden ahí mismo, sin registrarse.',
  },
  {
    q: '¿Necesito instalar algo en el restaurante?',
    a: 'Solo un navegador. El panel funciona en tablet, celular o computador, y se puede instalar como app en la tablet de la cocina.',
  },
  {
    q: '¿Cómo me pagan mis clientes?',
    a: 'Por ahora, en efectivo o por transferencia: tu cliente elige al hacer el pedido. Los pagos online llegarán más adelante.',
  },
  {
    q: '¿Puedo cambiar precios o marcar productos agotados?',
    a: 'Sí, cuando quieras. Los cambios se ven al instante en tu tienda, y los pedidos ya hechos conservan el precio con que se compraron.',
  },
  {
    q: '¿Puedo tener más de un local?',
    a: 'Sí. Desde la misma cuenta puedes crear y administrar varios restaurantes, cada uno con su propio menú y sus pedidos.',
  },
  {
    q: '¿Mis datos y los de mis clientes están seguros?',
    a: 'Sí. Cada restaurante solo puede ver su propia información, y la seguridad se aplica directamente en la base de datos.',
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="preguntas" className="scroll-mt-20 bg-zinc-50 py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-4">
        <Reveal className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Preguntas frecuentes</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">¿Tienes dudas?</h2>
        </Reveal>
        <Stagger className="mt-12 space-y-3">
          {QUESTIONS.map((item, i) => (
            <StaggerItem key={item.q}>
              <FaqItem
                question={item.q}
                answer={item.a}
                isOpen={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

type FaqItemProps = { question: string; answer: string; isOpen: boolean; onToggle: () => void }

function FaqItem({ question, answer, isOpen, onToggle }: FaqItemProps) {
  const id = useId()
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`${id}-answer`}
          className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-base font-semibold text-zinc-900 focus-visible:outline-2 focus-visible:outline-brand"
        >
          {question}
          <motion.span
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isOpen ? 'bg-brand text-white' : 'bg-zinc-100 text-zinc-700'}`}
          >
            <IconPlus className="size-4" strokeWidth={2.5} />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={`${id}-answer`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-zinc-600">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
