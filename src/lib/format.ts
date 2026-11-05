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

/**
 * Hora "20:35" de un instante, en la zona horaria del restaurante (no la del navegador):
 * así la cocina y el cliente ven la misma hora aunque uno esté de viaje.
 */
export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
}

/** Fecha y hora cortas "02-11-26 20:35" en la zona horaria del restaurante. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23', timeZone })
}
