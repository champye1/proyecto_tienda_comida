/**
 * Marco común de las páginas legales (/legal/terminos y /legal/privacidad).
 *
 * - Muestra el título, la versión vigente (LEGAL_VERSION, la misma que se guarda cuando
 *   un usuario acepta al registrarse) y un índice para saltar a cada sección.
 * - Mientras LEGAL_DRAFT sea true, muestra un aviso de "borrador": estos textos son una
 *   base técnica y DEBEN ser revisados por un abogado antes de publicar el producto.
 *   Los datos entre [CORCHETES] son los que faltan completar (razón social, RUT, etc.).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { LegalLinks } from '@/components/LegalLinks'
import { LEGAL_VERSION } from '@/features/auth/schemas'

/** Cambiar a false cuando un abogado haya revisado y aprobado los textos. */
export const LEGAL_DRAFT = true

/** Datos del titular de la plataforma. Completar antes de publicar. */
export const PLATFORM = {
  name: 'Pedidos',
  legalName: '[RAZÓN SOCIAL]',
  rut: '[RUT]',
  address: '[DOMICILIO]',
  email: '[EMAIL DE CONTACTO]',
}

export type LegalSection = { id: string; title: string; body: ReactNode }

/** Página legal con índice y secciones numeradas. */
export function LegalLayout({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-zinc-800">
            <img src="/logo.svg" alt="" width={24} height={24} className="size-6" />
            {PLATFORM.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {LEGAL_DRAFT && (
          <p role="note" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Borrador.</strong> Este texto está pendiente de revisión legal y puede cambiar.
          </p>
        )}
        <h1 className="text-3xl font-bold text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">Versión vigente: {LEGAL_VERSION}</p>
        <div className="mt-6 space-y-3 text-zinc-700">{intro}</div>

        {/* Índice: enlaces a cada sección (útil en celular, donde el texto es largo). */}
        <nav aria-label="Índice" className="mt-8 rounded-xl bg-zinc-50 p-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-zinc-700 underline-offset-2 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-6">
            <h2 className="text-xl font-semibold text-zinc-900">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-3 space-y-3 leading-relaxed text-zinc-700 [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
              {s.body}
            </div>
          </section>
        ))}
      </main>

      <LegalFooter />
    </div>
  )
}

function LegalFooter() {
  return (
    <footer className="border-t border-zinc-200">
      <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-3 px-4 py-6 text-sm text-zinc-500">
        <span>
          {PLATFORM.legalName} · RUT {PLATFORM.rut}
        </span>
        <LegalLinks />
      </div>
    </footer>
  )
}
