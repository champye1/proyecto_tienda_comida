/**
 * Caja de mensaje para avisos dentro de un formulario o una página.
 * `tone` define el color: error (rojo), success (verde) o info (azul).
 * Los errores usan role="alert" para que los lectores de pantalla los anuncien de inmediato.
 */
import type { ReactNode } from 'react'

type Tone = 'error' | 'success' | 'info'

const tones: Record<Tone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-green-200 bg-green-50 text-green-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
}

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}
