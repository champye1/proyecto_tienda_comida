/**
 * Formato de valores para mostrar en pantalla.
 * Los montos se guardan en la base como enteros en pesos chilenos (sin decimales).
 */

// Se crea una sola vez: construir un Intl.NumberFormat en cada llamada es lento.
const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

/** Formatea un monto entero en pesos chilenos: 12990 → "$12.990". */
export function formatCLP(amount: number): string {
  return clp.format(amount)
}
