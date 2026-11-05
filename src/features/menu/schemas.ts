/**
 * Esquemas Zod de los formularios del menú (categorías, productos, grupos de opciones
 * y opciones). Mismas reglas que los CHECK de la base, que vuelve a validar todo.
 */
import { z } from 'zod'

/** Nombre de categoría, grupo u opción (1 a 60 caracteres). */
const shortName = (label: string) =>
  z.string().trim().min(1, `Ingresa el nombre ${label}`).max(60, 'Máximo 60 caracteres')

/**
 * Monto en pesos chilenos escrito por el usuario ("8.990", "$8990"): se quitan
 * símbolos y puntos y queda un entero. Vacío = 0.
 */
const clpAmount = (max: number, label: string) =>
  z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .transform((s) => (s === '' ? 0 : Number(s)))
    .pipe(z.number().int().min(0).max(max, `${label} no puede superar ${max.toLocaleString('es-CL')}`))

/** Formulario de categoría del menú (nombre y si está visible). */
export const categorySchema = z.object({
  name: shortName('de la categoría'),
  is_active: z.boolean(),
})

/** Formulario de producto: nombre, descripción, precio, categoría, disponibilidad, destacado y sugerido. */
export const productSchema = z.object({
  name: z.string().trim().min(1, 'Ingresa el nombre del producto').max(100, 'Máximo 100 caracteres'),
  description: z.string().trim().max(500, 'Máximo 500 caracteres'),
  price: z
    .string()
    .refine((s) => s.replace(/\D/g, '') !== '', 'Ingresa el precio')
    .pipe(clpAmount(10_000_000, 'El precio')),
  category_id: z.uuid('Elige una categoría'),
  is_available: z.boolean(),
  /** Aparece en la fila "Destacados" al inicio de la tienda. */
  is_featured: z.boolean(),
  /** Se sugiere en el carrito ("¿Agregas algo más?"). */
  is_upsell: z.boolean(),
})

/** Grupo de opciones (ej. "Tamaño": elegir exactamente 1; "Agregados": hasta 3). */
export const optionGroupSchema = z
  .object({
    name: shortName('del grupo'),
    min_select: z.coerce.number().int('Debe ser un número entero').min(0, 'Mínimo 0').max(20, 'Máximo 20'),
    max_select: z.coerce.number().int('Debe ser un número entero').min(1, 'Debe ser al menos 1').max(20, 'Máximo 20'),
  })
  .refine((g) => g.max_select >= g.min_select, {
    message: 'El máximo no puede ser menor que el mínimo',
    path: ['max_select'],
  })

/** Formulario de una opción dentro de un grupo (nombre, precio extra y disponibilidad). */
export const optionSchema = z.object({
  name: shortName('de la opción'),
  extra_price: clpAmount(1_000_000, 'El precio extra'),
})

export type CategoryValues = z.input<typeof categorySchema>
export type ProductValues = z.input<typeof productSchema>
export type OptionGroupValues = z.input<typeof optionGroupSchema>
export type OptionValues = z.input<typeof optionSchema>
