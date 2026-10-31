/**
 * Landing de la plataforma (/): presenta el servicio a dueños de restaurantes.
 *
 * Orden de secciones: cabecera fija → hero animado → banda de tipos de negocio →
 * funciones (scroll fijo) → cómo funciona → beneficios → preguntas → llamado final → pie.
 *
 * Rendimiento: esta página es un archivo JS aparte (lazy en router.tsx), así la librería
 * de animaciones (Motion) solo la descarga quien visita la landing; la tienda pública y el
 * panel no la cargan. MotionConfig reducedMotion="user" hace que Motion respete la
 * preferencia del sistema "reducir movimiento".
 */
import { MotionConfig } from 'motion/react'
import { Link } from 'react-router'
import { Faq } from './Faq'
import { FeatureGrid } from './FeatureGrid'
import { FeaturesSticky } from './FeaturesSticky'
import { Header } from './Header'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { IconArrowRight } from './icons'
import { Marquee } from './Marquee'
import { CtaLink, Reveal } from './primitives'

export default function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-white text-zinc-900">
        <Header />
        <main>
          <Hero />
          <Marquee />
          <FeaturesSticky />
          <HowItWorks />
          <FeatureGrid />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  )
}

/** Llamado a la acción final, sobre un degradado de marca. */
function FinalCta() {
  return (
    <section className="px-4 py-24">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-rose-500 to-orange-500 px-6 py-16 text-center text-white shadow-2xl shadow-rose-600/25 sm:px-12">
        {/* Grilla de puntos decorativa */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.18)_1px,transparent_1.2px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]"
        />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Empieza a recibir pedidos hoy</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
            Crea tu tienda, arma tu menú y comparte tu link. Tus clientes pueden pedir hoy mismo.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaLink to="/admin/registro" variant="light">
              Registra tu restaurante <IconArrowRight className="ml-1 inline size-4" strokeWidth={2.5} />
            </CtaLink>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-zinc-200">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="" width={24} height={24} className="size-6" />
          <span className="font-semibold text-zinc-700">Pedidos</span>
          <span>· Hecho en Chile</span>
        </div>
        <nav aria-label="Pie de página" className="flex gap-5">
          <a href="#funciones" className="hover:text-zinc-900">
            Funciones
          </a>
          <a href="#preguntas" className="hover:text-zinc-900">
            Preguntas
          </a>
          <Link to="/admin/login" className="hover:text-zinc-900">
            Iniciar sesión
          </Link>
        </nav>
      </div>
    </footer>
  )
}
