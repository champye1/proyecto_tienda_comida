/**
 * Campo para montos en pesos chilenos.
 *
 * Mientras se escribe muestra el monto formateado ("$8.990") y acepta solo dígitos
 * (el teclado numérico se abre solo en celular/tablet). El valor se guarda como texto;
 * el esquema Zod del formulario lo convierte a entero.
 */
import type { ChangeEvent } from 'react'
import { InputField } from './Field'

type PriceFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  /** Máximo de dígitos permitidos (8 = hasta $99.999.999). */
  maxDigits?: number
}

/** "8990" → "$8.990"; "" → "". */
export function formatPriceInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? '' : `$${Number(digits).toLocaleString('es-CL')}`
}

export function PriceField({ label, value, onChange, error, hint, maxDigits = 8 }: PriceFieldProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, maxDigits)
    onChange(formatPriceInput(digits))
  }

  return (
    <InputField
      label={label}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="$0"
      value={value}
      onChange={handleChange}
      error={error}
      hint={hint}
    />
  )
}
