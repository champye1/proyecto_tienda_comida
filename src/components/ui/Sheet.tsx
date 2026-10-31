/**
 * Hoja deslizable: en celular aparece desde abajo (estilo app de delivery); en pantallas
 * más grandes, centrada como un modal. Usa <dialog> nativo (foco atrapado, Escape,
 * fondo inerte) igual que Modal, pero sin cabecera fija: el contenido decide su diseño.
 *
 * Mientras está abierta se bloquea el scroll de la página de fondo.
 */
import { useEffect, useRef, type ReactNode } from 'react'

type SheetProps = {
  open: boolean
  onClose: () => void
  /** Nombre accesible de la hoja (lo anuncian los lectores de pantalla). */
  label: string
  children: ReactNode
}

export function Sheet({ open, onClose, label, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (!open) return
    // Bloquea el scroll del fondo (CSSOM: compatible con la CSP).
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="mb-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl p-0 shadow-2xl backdrop:bg-zinc-900/50 sm:m-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl"
    >
      {open && children}
    </dialog>
  )
}
