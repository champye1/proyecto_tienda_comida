/**
 * Pedidos desde la tienda: crear (RPC create_order), seguir (RPC get_order_by_token)
 * y recordar los datos del cliente en este dispositivo (opcional).
 */
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { publicRpc } from '@/lib/publicApi'
import type { Enums } from '@/types/database.types'
import type { CartLine } from './cart'

export type OrderType = Enums<'order_type'>
export type PaymentMethod = Enums<'payment_method'>
export type OrderStatus = Enums<'order_status'>

// -----------------------------------------------------------------------------
// Checkout
// -----------------------------------------------------------------------------

/** Formulario de checkout. Mismas reglas que create_order (que vuelve a validar todo). */
export const checkoutSchema = z
  .object({
    name: z.string().trim().min(2, 'Ingresa tu nombre').max(80, 'Máximo 80 caracteres'),
    phone: z
      .string()
      .transform((s) => s.replace(/[\s().-]/g, ''))
      .refine((s) => /^\+?[0-9]{8,15}$/.test(s), 'Ingresa un teléfono válido, por ejemplo +56 9 1234 5678'),
    type: z.enum(['pickup', 'delivery'], 'Elige retiro o delivery'),
    address: z.string().trim().max(200, 'Máximo 200 caracteres'),
    notes: z.string().trim().max(500, 'Máximo 500 caracteres'),
    payment_method: z.enum(['cash', 'transfer'], 'Elige cómo vas a pagar'),
  })
  .superRefine((d, ctx) => {
    if (d.type === 'delivery' && d.address.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Ingresa la dirección de entrega' })
    }
  })

export type CheckoutValues = z.input<typeof checkoutSchema>

/**
 * Crea el pedido. Solo viajan ids y cantidades: los precios los calcula el servidor.
 * Devuelve el número de pedido y el token secreto para la página de seguimiento.
 */
export async function createOrder(slug: string, values: z.output<typeof checkoutSchema>, lines: CartLine[]) {
  const data = await publicRpc('create_order', {
    p_restaurant_slug: slug,
    p_customer_name: values.name,
    p_customer_phone: values.phone,
    p_type: values.type,
    // create_order acepta NULL (los tipos generados no lo reflejan): sin dirección en retiro.
    p_address: (values.type === 'delivery' ? values.address : null) as string,
    p_notes: (values.notes || null) as string,
    p_payment_method: values.payment_method,
    p_items: lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, option_ids: l.optionIds })),
  })
  const order = data[0]
  if (!order) throw new Error('No se recibió la confirmación del pedido.')
  return order
}

// -----------------------------------------------------------------------------
// Datos del cliente recordados (opcional, solo en este dispositivo)
// -----------------------------------------------------------------------------

const CUSTOMER_KEY = 'pedidos:customer:v1'
const savedCustomerSchema = z.object({
  name: z.string().max(80),
  phone: z.string().max(20),
  address: z.string().max(200),
})
export type SavedCustomer = z.infer<typeof savedCustomerSchema>

/** Datos guardados del cliente (validados: localStorage no es confiable). */
export function readSavedCustomer(): SavedCustomer | null {
  try {
    const parsed = savedCustomerSchema.safeParse(JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? 'null'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Guarda o borra los datos del cliente según su elección ("Recordar mis datos"). */
export function saveCustomer(data: SavedCustomer | null) {
  try {
    if (data) localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data))
    else localStorage.removeItem(CUSTOMER_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

// -----------------------------------------------------------------------------
// Seguimiento
// -----------------------------------------------------------------------------

export const TRACKING_TOKEN = /^[0-9a-f]{48}$/

const trackedOrderSchema = z.object({
  order_number: z.number().int(),
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
  type: z.enum(['delivery', 'pickup']),
  payment_method: z.enum(['cash', 'transfer']),
  subtotal: z.number().int(),
  delivery_fee: z.number().int(),
  total: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  restaurant: z.object({
    name: z.string(),
    slug: z.string(),
    logo_url: z.string().nullable(),
    phone: z.string().nullable(),
    primary_color: z.string(),
  }),
  items: z.array(
    z.object({
      product_name: z.string(),
      quantity: z.number().int(),
      unit_price: z.number().int(),
      line_total: z.number().int(),
      selected_options: z.array(z.object({ name: z.string() }).loose()),
    }),
  ),
})

export type TrackedOrder = z.infer<typeof trackedOrderSchema>

/** Estados en los que el pedido ya no cambia (se deja de consultar). */
export const FINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled']

/** Pedido por su token de seguimiento (null si no existe). */
export function trackedOrderQuery(token: string) {
  return queryOptions({
    queryKey: ['store', 'order', token],
    queryFn: async (): Promise<TrackedOrder | null> => {
      // POST: el token va en el cuerpo, nunca en la URL (no queda en logs ni cachés).
      const data = await publicRpc('get_order_by_token', { p_token: token })
      return data === null ? null : trackedOrderSchema.parse(data)
    },
  })
}

/** Nombre del estado para el cliente (depende de si es retiro o delivery). */
export function statusLabel(status: OrderStatus, type: OrderType): string {
  switch (status) {
    case 'pending':
      return 'Recibido'
    case 'confirmed':
      return 'Confirmado'
    case 'preparing':
      return 'En preparación'
    case 'ready':
      return type === 'delivery' ? 'Listo para despacho' : 'Listo para retirar'
    case 'delivered':
      return type === 'delivery' ? 'Entregado' : 'Retirado'
    case 'cancelled':
      return 'Cancelado'
  }
}
