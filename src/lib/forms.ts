/**
 * Utilidades para formularios validados con Zod.
 *
 * Patrón usado en todas las pantallas: al enviar se ejecuta `schema.safeParse(values)`;
 * si falla, `fieldErrors()` convierte los errores en `{ campo: mensaje }` y cada input
 * muestra el suyo.
 */
import type { z } from 'zod'

/** Mensaje de error por campo del formulario (solo los campos con error). */
export type FieldErrors<T> = Partial<Record<keyof T, string>>

/** Primer mensaje de error de Zod por campo, para mostrar bajo cada input. */
export function fieldErrors<T>(error: z.ZodError<T>): FieldErrors<T> {
  const result: FieldErrors<T> = {}
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof T | undefined
    if (key !== undefined && result[key] === undefined) result[key] = issue.message
  }
  return result
}
