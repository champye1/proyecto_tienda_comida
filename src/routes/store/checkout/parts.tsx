/**
 * Piezas visuales básicas del checkout, compartidas por sus secciones.
 *
 *   Card    tarjeta blanca con título (cada sección del formulario).
 *   Choice  opción grande tipo radio, fácil de tocar en el celular (retiro/delivery, pago…).
 */
import type { ReactNode } from 'react'

/** Tarjeta de sección del formulario. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}

/** Opción tipo tarjeta (radio grande). Agrupar varias dentro de un role="radiogroup". */
export function Choice({ name, checked, onChange, title, detail }: { name: string; checked: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label
      className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${
        checked ? 'border-brand bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 size-5 accent-[var(--brand)]" />
      <span>
        <span className="block font-semibold text-zinc-900">{title}</span>
        <span className="block text-sm text-zinc-500">{detail}</span>
      </span>
    </label>
  )
}
