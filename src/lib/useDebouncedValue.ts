/**
 * Hook de "espera antes de reaccionar" (debounce).
 *
 * Uso típico: verificar en el servidor mientras el usuario escribe (por ejemplo,
 * si una dirección web está disponible) sin hacer una consulta por cada tecla.
 */
import { useEffect, useState } from 'react'

/** Devuelve `value` solo cuando dejó de cambiar durante `delayMs` milisegundos. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    // Si el valor cambia antes de que pase el tiempo, se cancela el temporizador anterior.
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
