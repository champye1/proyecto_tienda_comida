/**
 * Ventana modal accesible basada en el elemento nativo <dialog>.
 *
 * Usar <dialog> + showModal() da gratis lo que más cuesta hacer bien a mano:
 * foco atrapado dentro del modal, cierre con Escape, fondo inerte (no se puede
 * tocar lo de atrás) y anuncio correcto para lectores de pantalla.
 *
 * Uso:
 *   <Modal open={open} onClose={() => setOpen(false)} title="Nueva categoría">…</Modal>
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Ancho máximo del modal (clase de Tailwind). */
  size?: 'sm' | 'md'
}

export function Modal({ open, onClose, title, children, size = 'sm' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // Sincroniza la prop `open` con el estado del <dialog>.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape o dialog.close(): avisa al padre para que actualice su estado.
      onClose={onClose}
      // Clic en el fondo oscuro (fuera del contenido) cierra el modal.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-2xl backdrop:bg-zinc-900/50 ${size === 'md' ? 'max-w-lg' : 'max-w-md'}`}
    >
      {/* Se renderiza solo abierto: así los formularios internos parten limpios cada vez. */}
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold text-zinc-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-m-2 flex size-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
