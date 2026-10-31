/**
 * Selector de cantidad "− 2 +" con botones grandes para el dedo.
 * `min` 0 permite que "−" quite el producto (en el carrito); `min` 1 no (al agregar).
 */
type QuantityStepperProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Para el texto accesible: "Quitar una unidad de Margarita". */
  itemName: string
  size?: 'sm' | 'md'
}

export function QuantityStepper({ value, onChange, min = 1, max = 99, itemName, size = 'md' }: QuantityStepperProps) {
  const button = `flex items-center justify-center rounded-full border border-zinc-300 text-lg font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-40 ${
    size === 'sm' ? 'size-9' : 'size-11'
  }`
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        className={button}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={value === 1 && min === 0 ? `Quitar ${itemName}` : `Una unidad menos de ${itemName}`}
      >
        −
      </button>
      <span className="min-w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Una unidad más de ${itemName}`}
      >
        +
      </button>
    </div>
  )
}
