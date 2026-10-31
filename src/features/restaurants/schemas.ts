/**
 * Esquemas Zod de los formularios de restaurantes.
 * Usan las mismas reglas que los CHECK de la base y la RPC create_restaurant(); el
 * servidor vuelve a validar, esto es para dar mensajes claros antes de enviar.
 */
import { z } from 'zod'
import { SLUG_PATTERN } from './slug'

/** Formulario de onboarding. Los campos opcionales llegan como '' si están vacíos. */
export const createRestaurantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar los 100 caracteres'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'La dirección debe tener al menos 3 caracteres')
    .max(50, 'La dirección no puede superar los 50 caracteres')
    .regex(SLUG_PATTERN, 'Solo letras minúsculas, números y guiones (sin espacios ni tildes)'),
  // Se quitan espacios, guiones y paréntesis: "+56 9 1234-5678" → "+56912345678".
  phone: z
    .string()
    .transform((s) => s.replace(/[\s().-]/g, ''))
    .refine((s) => s === '' || /^\+?[0-9]{8,15}$/.test(s), 'Ingresa un teléfono válido, por ejemplo +56 9 1234 5678'),
  address: z.string().trim().max(200, 'La dirección no puede superar los 200 caracteres'),
  description: z.string().trim().max(500, 'La descripción no puede superar los 500 caracteres'),
})

/** Valores del formulario tal como se escriben (antes de transformar). */
export type CreateRestaurantValues = z.input<typeof createRestaurantSchema>

/** Monto en pesos escrito con formato ("$2.000") → entero. Vacío = 0. */
const clpAmount = (max: number, label: string) =>
  z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .transform((s) => (s === '' ? 0 : Number(s)))
    .pipe(z.number().int().min(0).max(max, `${label} no puede superar $${max.toLocaleString('es-CL')}`))

/**
 * Configuración del local ("Mi local"). El slug no se edita aquí: cambiarlo rompería los
 * links ya compartidos por WhatsApp e Instagram.
 */
export const restaurantSettingsSchema = createRestaurantSchema
  .omit({ slug: true })
  .extend({
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Elige un color válido'),
    pickup_enabled: z.boolean(),
    delivery_enabled: z.boolean(),
    delivery_fee: clpAmount(1_000_000, 'El costo de envío'),
    min_order: clpAmount(10_000_000, 'El pedido mínimo'),
  })
  .refine((d) => d.pickup_enabled || d.delivery_enabled, {
    message: 'Activa al menos retiro en local o delivery',
    path: ['delivery_enabled'],
  })

export type RestaurantSettingsValues = z.input<typeof restaurantSettingsSchema>
