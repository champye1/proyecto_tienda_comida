/**
 * Cabecera fija de la landing.
 *
 * - Arriba de todo es transparente. Al bajar, aparece un fondo blanco translúcido con
 *   sombra y la barra se "compacta" (sube unos píxeles). Todo con transform/opacity.
 * - En celular, los enlaces se esconden en un menú hamburguesa con animación de apertura.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { CtaLink } from './primitives'

/** Enlaces a las secciones de la página (anclas). */
const NAV_LINKS = [
  { href: '#funciones', label: 'Funciones' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#preguntas', label: 'Preguntas' },
] as const

export function Header() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Solo cambia el estado al cruzar el umbral (no en cada píxel de scroll).
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 16))

  // El menú de celular se cierra con Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Fondo que aparece al bajar. Mide 80 px y sube 16 px: la barra visible queda en 64 px. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-20 border-b border-zinc-200/70 bg-white/80 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.15)] backdrop-blur-md transition duration-300 ${
          scrolled || menuOpen ? 'opacity-100' : 'opacity-0'
        } ${scrolled ? '-translate-y-4' : 'translate-y-0'}`}
      />

      <div
        className={`relative mx-auto flex h-20 max-w-6xl items-center justify-between px-4 transition-transform duration-300 ${
          scrolled ? '-translate-y-2' : 'translate-y-0'
        }`}
      >
        <Link to="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
          <img src="/logo.svg" alt="" width={32} height={32} className="size-8" />
          <span className="text-lg font-bold text-zinc-900">Pedidos</span>
        </Link>

        {/* Escritorio */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
              {l.label}
            </a>
          ))}
          <Link to="/admin/login" className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Iniciar sesión
          </Link>
          <CtaLink to="/admin/registro" className="ml-2 min-h-10 px-4 text-sm">
            Crear mi tienda
          </CtaLink>
        </nav>

        {/* Botón hamburguesa (celular): las tres barras se transforman en una X. */}
        <button
          type="button"
          className="relative flex size-11 items-center justify-center rounded-lg md:hidden"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          aria-controls="menu-movil"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span
            className={`absolute h-0.5 w-5 rounded bg-zinc-900 transition-transform duration-300 ${menuOpen ? 'rotate-45' : '-translate-y-1.5'}`}
          />
          <span className={`absolute h-0.5 w-5 rounded bg-zinc-900 transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <span
            className={`absolute h-0.5 w-5 rounded bg-zinc-900 transition-transform duration-300 ${menuOpen ? '-rotate-45' : 'translate-y-1.5'}`}
          />
        </button>
      </div>

      {/* Menú de celular */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="menu-movil"
            aria-label="Principal"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="relative mx-4 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl md:hidden"
          >
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-4 py-3 text-base font-medium text-zinc-800 hover:bg-zinc-50"
              >
                {l.label}
              </a>
            ))}
            <Link to="/admin/login" className="block rounded-lg px-4 py-3 text-base font-medium text-zinc-800 hover:bg-zinc-50">
              Iniciar sesión
            </Link>
            <Link
              to="/admin/registro"
              className="mt-1 block rounded-lg bg-brand px-4 py-3 text-center text-base font-semibold text-white"
            >
              Crear mi tienda
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
