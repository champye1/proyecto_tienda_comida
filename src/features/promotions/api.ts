/**
 * Cupones y promociones por horario del restaurante (panel).
 *
 * - Los ven todos los miembros; solo el dueño los crea, edita o borra (RLS, migración 17).
 * - Los descuentos SIEMPRE los calcula el servidor al crear el pedido: aquí solo se
 *   configuran las reglas.
 * - El contador de usos de un cupón no es editable (solo create_order lo incrementa).
 */
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export type Coupon = Tables<'coupons'>
export type Promotion = Tables<'promotions'>

/** Query keys de cupones, promociones y opciones de destino por restaurante. */
export const promoKeys = {
  coupons: (rid: string) => ['promotions', rid, 'coupons'] as const,
  promotions: (rid: string) => ['promotions', rid, 'promotions'] as const,
  targets: (rid: string) => ['promotions', rid, 'targets'] as const,
}

/** Cupones de campaña del restaurante (los personales de fidelización no se listan aquí). */
export function couponsQuery(rid: string) {
  return queryOptions({
    queryKey: promoKeys.coupons(rid),
    queryFn: async () => {
      // Los cupones personales (premios de fidelización) se ven en Clientes, no aquí.
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('restaurant_id', rid)
        .is('customer_phone', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data
    },
  })
}

/** Promociones por día y horario del restaurante. */
export function promotionsQuery(rid: string) {
  return queryOptions({
    queryKey: promoKeys.promotions(rid),
    queryFn: async () => {
      const { data, error } = await supabase.from('promotions').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data
    },
  })
}

/** Categorías y productos para elegir a qué se aplica una promoción. */
export function promoTargetsQuery(rid: string) {
  return queryOptions({
    queryKey: promoKeys.targets(rid),
    queryFn: async () => {
      const [cats, prods] = await Promise.all([
        supabase.from('categories').select('id, name').eq('restaurant_id', rid).order('position').limit(200),
        supabase.from('products').select('id, name, category_id').eq('restaurant_id', rid).order('name').limit(1000),
      ])
      if (cats.error) throw cats.error
      if (prods.error) throw prods.error
      return { categories: cats.data, products: prods.data }
    },
  })
}

// -----------------------------------------------------------------------------
// Formularios (mismas reglas que los CHECK de la base)
// -----------------------------------------------------------------------------

const digits = (s: string) => Number(s.replace(/\D/g, '') || '0')

/** Formulario de cupón: código, tipo, valor, mínimo, vencimiento, usos máximos y primera compra. */
export const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,20}$/, 'Usa de 3 a 20 letras, números, guiones o guion bajo (sin espacios)'),
    kind: z.enum(['percent', 'fixed', 'free_delivery']),
    value: z.string().transform(digits),
    min_subtotal: z.string().transform(digits).pipe(z.number().max(10_000_000, 'Monto demasiado alto')),
    ends_at: z.string(),
    max_uses: z.string().transform((s) => (s.trim() === '' ? null : digits(s))),
    first_order_only: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'percent' && (d.value < 1 || d.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Entre 1 y 100 %' })
    if (d.kind === 'fixed' && (d.value < 1 || d.value > 1_000_000)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Ingresa el monto del descuento' })
    if (d.max_uses !== null && (d.max_uses < 1 || d.max_uses > 1_000_000)) ctx.addIssue({ code: 'custom', path: ['max_uses'], message: 'Entre 1 y 1.000.000' })
  })

export type CouponFormValues = z.input<typeof couponFormSchema>

/** Formulario de promoción: nombre, tipo (% o 2x1), a qué se aplica, días y franja horaria. */
export const promotionFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Ponle un nombre (lo ve el cliente)').max(60, 'Máximo 60 caracteres'),
    kind: z.enum(['percent', 'two_for_one']),
    percent: z.string().transform(digits),
    /** "all", "cat:<id>" o "prod:<id>". */
    target: z.string(),
    days: z.array(z.number().int().min(0).max(6)).min(1, 'Elige al menos un día'),
    start_time: z.string().regex(/^\d\d:\d\d$/, 'Hora inválida'),
    end_time: z.string().regex(/^\d\d:\d\d$/, 'Hora inválida'),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'percent' && (d.percent < 1 || d.percent > 90)) ctx.addIssue({ code: 'custom', path: ['percent'], message: 'Entre 1 y 90 %' })
    if (d.start_time === d.end_time) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La hora de término debe ser distinta a la de inicio' })
  })

export type PromotionFormValues = z.input<typeof promotionFormSchema>

// -----------------------------------------------------------------------------
// Mutaciones
// -----------------------------------------------------------------------------

/** Crear, pausar/activar y borrar cupones (solo el dueño, lo exige la RLS). */
export function useCouponMutations(rid: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: promoKeys.coupons(rid) })
  return {
    create: useMutation({
      mutationFn: async (v: z.output<typeof couponFormSchema>) => {
        const { error } = await supabase.from('coupons').insert({
          restaurant_id: rid,
          code: v.code,
          kind: v.kind,
          value: v.kind === 'free_delivery' ? 0 : v.value,
          min_subtotal: v.min_subtotal,
          // Vence al terminar el día elegido (hora local del navegador del dueño).
          ends_at: v.ends_at ? new Date(`${v.ends_at}T23:59:59`).toISOString() : null,
          max_uses: v.max_uses,
          first_order_only: v.first_order_only,
        })
        if (error) {
          if (error.code === '23505') throw { code: 'P0001', message: 'Ya existe un cupón con ese código' }
          throw error
        }
      },
      onSuccess: invalidate,
    }),
    toggle: useMutation({
      mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
        const { error } = await supabase.from('coupons').update({ is_active }).eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('coupons').delete().eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
  }
}

/** Crear, pausar/activar y borrar promociones por horario (solo el dueño, lo exige la RLS). */
export function usePromotionMutations(rid: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: promoKeys.promotions(rid) })
  return {
    create: useMutation({
      mutationFn: async (v: z.output<typeof promotionFormSchema>) => {
        const [kind, id] = v.target.split(':')
        const { error } = await supabase.from('promotions').insert({
          restaurant_id: rid,
          name: v.name,
          kind: v.kind,
          percent: v.kind === 'percent' ? v.percent : null,
          product_id: kind === 'prod' ? id : null,
          category_id: kind === 'cat' ? id : null,
          days: [...v.days].sort(),
          start_time: v.start_time,
          end_time: v.end_time,
        })
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
    toggle: useMutation({
      mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
        const { error } = await supabase.from('promotions').update({ is_active }).eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('promotions').delete().eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
  }
}

/** "10% de descuento", "$2.000 de descuento", "Envío gratis". */
export function couponLabel(c: Pick<Coupon, 'kind' | 'value'>, formatCLP: (n: number) => string): string {
  if (c.kind === 'percent') return `${c.value}% de descuento`
  if (c.kind === 'fixed') return `${formatCLP(c.value)} de descuento`
  return 'Envío gratis'
}
