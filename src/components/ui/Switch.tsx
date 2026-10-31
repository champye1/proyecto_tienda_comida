/**
 * Interruptor encendido/apagado (por ejemplo "Disponible" en un producto).
 *
 * Es un <button role="switch" aria-checked>: se activa con clic, Enter o Espacio, y
 * los lectores de pantalla anuncian su estado. Zona táctil de 44 px para tablet.
 */
type SwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Texto accesible (y visible si `showLabel`). */
  label: string
  showLabel?: boolean
  disabled?: boolean
}

export function Switch({ checked, onChange, label, showLabel = false, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-zinc-700 disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-zinc-300'
        }`}
      >
        <span
          className={`size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`}
        />
      </span>
      {showLabel && label}
    </button>
  )
}
