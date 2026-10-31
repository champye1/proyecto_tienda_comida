/**
 * Utilidades para el "slug": la parte de la URL que identifica a un restaurante
 * (/r/pizzeria-demo). Solo admite minúsculas, números y guiones simples.
 */

/** Genera un slug a partir de un nombre: "Pizzería Don Ñoño" → "pizzeria-don-nono" */
export function slugify(text: string): string {
  return text
    .normalize('NFD') // separa letras y tildes: "í" → "i" + tilde
    .replace(/[̀-ͯ]/g, '') // elimina las tildes (la ñ queda como n)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // todo lo demás (espacios, símbolos) pasa a guion
    .replace(/^-+|-+$/g, '') // sin guiones al inicio ni al final
    .slice(0, 50) // máximo permitido por la base
    .replace(/-+$/g, '') // por si el corte dejó un guion al final
}

/** Formato válido de slug; es la misma regla que el CHECK restaurants_slug_format de la base. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
