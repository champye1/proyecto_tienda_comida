/**
 * Botones ↑ ↓ para cambiar el orden de un elemento en su lista.
 * Se eligieron en vez de arrastrar y soltar porque funcionan igual de bien con el dedo
 * en una tablet, con mouse y con teclado (accesibles para lectores de pantalla).
 */
type ReorderButtonsProps = {
  /** Nombre del elemento, para el texto accesible ("Subir Pizzas"). */
  label: string
  onUp: () => void
  onDown: () => void
  isFirst: boolean
  isLast: boolean
  disabled?: boolean
}

const buttonClass =
  'flex size-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-30'

export function ReorderButtons({ label, onUp, onDown, isFirst, isLast, disabled }: ReorderButtonsProps) {
  return (
    <div className="flex shrink-0">
      <button type="button" className={buttonClass} onClick={onUp} disabled={disabled || isFirst} aria-label={`Subir ${label}`}>
        ↑
      </button>
      <button type="button" className={buttonClass} onClick={onDown} disabled={disabled || isLast} aria-label={`Bajar ${label}`}>
        ↓
      </button>
    </div>
  )
}
