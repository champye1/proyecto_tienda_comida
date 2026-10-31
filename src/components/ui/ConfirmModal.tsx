/**
 * Confirmación antes de una acción irreversible (eliminar una categoría, un producto…).
 * Muestra el error dentro del mismo modal si la acción falla.
 */
import type { ReactNode } from 'react'
import { Alert } from './Alert'
import { Button } from './Button'
import { Modal } from './Modal'

type ConfirmModalProps = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  loading?: boolean
  error?: string | null
}

export function ConfirmModal({ open, title, children, confirmLabel, onConfirm, onClose, loading, error }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="text-sm text-zinc-600">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          {/* Rojo: deja claro que la acción no se puede deshacer. */}
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
