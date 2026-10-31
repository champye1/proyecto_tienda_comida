/**
 * Menú público de la tienda: consulta, validación y reglas de opciones.
 *
 * El menú llega en UNA petición GET (RPC get_public_menu, cacheable) y se valida con
 * Zod antes de usarse: la app nunca confía a ciegas en la forma de los datos externos.
 *
 * Las funciones de precio de este archivo son solo para MOSTRAR montos. El precio real
 * lo calcula siempre el servidor en create_order.
 */
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { publicRpc } from '@/lib/publicApi'

const optionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  extra_price: z.number().int().min(0),
})

const groupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  min_select: z.number().int().min(0),
  max_select: z.number().int().min(1),
  options: z.array(optionSchema),
})

const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().int().min(0),
  image_url: z.string().nullable(),
  option_groups: z.array(groupSchema),
})

const restaurantSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
  primary_color: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  is_open: z.boolean(),
  delivery_enabled: z.boolean(),
  pickup_enabled: z.boolean(),
  delivery_fee: z.number().int().min(0),
  min_order: z.number().int().min(0),
})

export const publicMenuSchema = z.object({
  restaurant: restaurantSchema,
  categories: z.array(z.object({ id: z.uuid(), name: z.string(), products: z.array(productSchema) })),
})

export type PublicMenu = z.infer<typeof publicMenuSchema>
export type PublicRestaurant = PublicMenu['restaurant']
export type PublicProduct = z.infer<typeof productSchema>
export type PublicGroup = z.infer<typeof groupSchema>

/** Menú de la tienda (null si el restaurante no existe o está suspendido). */
export function publicMenuQuery(slug: string) {
  return queryOptions({
    queryKey: ['store', slug, 'menu'],
    queryFn: async (): Promise<PublicMenu | null> => {
      // GET: el navegador (o un CDN) puede cachear la respuesta (Cache-Control de la RPC).
      const data = await publicRpc('get_public_menu', { p_slug: slug }, 'GET')
      return data === null ? null : publicMenuSchema.parse(data)
    },
    staleTime: 30_000,
  })
}

/** Índice id → producto, para resolver el carrito rápido. */
export function indexProducts(menu: PublicMenu): Map<string, PublicProduct> {
  return new Map(menu.categories.flatMap((c) => c.products.map((p) => [p.id, p] as const)))
}

/**
 * Valida la selección de opciones contra las reglas del producto (mismas que create_order).
 * @returns mensaje para el cliente si falta o sobra algo, o null si está bien.
 */
export function validateSelection(product: PublicProduct, optionIds: string[]): string | null {
  const known = new Set(product.option_groups.flatMap((g) => g.options.map((o) => o.id)))
  if (optionIds.some((id) => !known.has(id))) return 'Alguna opción ya no está disponible.'
  if (new Set(optionIds).size !== optionIds.length) return 'Hay opciones repetidas.'
  for (const g of product.option_groups) {
    const count = g.options.filter((o) => optionIds.includes(o.id)).length
    if (count < g.min_select) return `Elige ${g.min_select === 1 ? 'una opción' : `${g.min_select} opciones`} en "${g.name}".`
    if (count > g.max_select) return `Puedes elegir como máximo ${g.max_select} en "${g.name}".`
  }
  return null
}

/** Precio unitario mostrado: base + extras de las opciones elegidas. */
export function unitPrice(product: PublicProduct, optionIds: string[]): number {
  const extras = product.option_groups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .reduce((sum, o) => sum + o.extra_price, 0)
  return product.price + extras
}

/** Texto de las opciones elegidas, en el orden del menú: "Familiar · Extra queso". */
export function optionsLabel(product: PublicProduct, optionIds: string[]): string {
  return product.option_groups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .map((o) => o.name)
    .join(' · ')
}

/** Regla del grupo en palabras, para el cliente. */
export function groupRuleText(g: PublicGroup): string {
  if (g.min_select === g.max_select) return g.min_select === 1 ? 'Elige 1 · Obligatorio' : `Elige ${g.min_select} · Obligatorio`
  if (g.min_select === 0) return g.max_select === 1 ? 'Opcional' : `Opcional · hasta ${g.max_select}`
  return `Elige entre ${g.min_select} y ${g.max_select}`
}
