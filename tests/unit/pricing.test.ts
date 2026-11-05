/**
 * Fórmulas de precios del navegador (src/features/store/pricing.ts) vs. las del servidor.
 *
 * Los valores esperados son los MISMOS que verifican las pruebas pgTAP de la base
 * (supabase/tests/017_sell_more y 019_payments). Si alguien cambia una fórmula en SQL y no
 * aquí (o al revés), la tienda mostraría un total distinto del que se cobra: estas pruebas
 * lo detectan.
 */
import { describe, expect, it } from 'vitest'
import { couponDiscount, promoDiscount, tipAmount, type Promo } from '@/features/store/pricing'

const P3 = 10_990 // precio de "Cuatro Quesos" en el seed
const pct20: Promo = { name: 'Happy hour 20%', kind: 'percent', percent: 20 }
const twoForOne: Promo = { name: '2x1 de la casa', kind: 'two_for_one', percent: null }

describe('promoDiscount (= create_order)', () => {
  it('sin promoción no descuenta', () => {
    expect(promoDiscount(null, P3, 3)).toBe(0)
  })
  it('2x1 en 3 unidades descuenta 1 (se pagan 2)', () => {
    expect(promoDiscount(twoForOne, P3, 3)).toBe(P3)
  })
  it('2x1 en 1 unidad no descuenta nada', () => {
    expect(promoDiscount(twoForOne, P3, 1)).toBe(0)
  })
  it('2x1 en 4 unidades descuenta 2', () => {
    expect(promoDiscount(twoForOne, P3, 4)).toBe(P3 * 2)
  })
  it('20% redondeado al peso (round de SQL)', () => {
    expect(promoDiscount(pct20, P3, 1)).toBe(2198)
    expect(promoDiscount(pct20, 9_995, 1)).toBe(1999) // 1999,0
    expect(promoDiscount(pct20, 2_498, 1)).toBe(500) // 499,6 → 500
  })
})

describe('couponDiscount (= coupon_discount)', () => {
  it('10% sobre el subtotal con promociones', () => {
    expect(couponDiscount({ code: 'BIENVENIDA10', kind: 'percent', value: 10 }, P3 * 3, 0)).toBe(3297)
  })
  it('15% del caso E2E: 13.490 → 2.024', () => {
    expect(couponDiscount({ code: 'PRUEBA15', kind: 'percent', value: 15 }, 13_490, 0)).toBe(2024)
  })
  it('el porcentaje nunca supera el subtotal', () => {
    expect(couponDiscount({ code: 'TODO', kind: 'percent', value: 100 }, 5_000, 2_000)).toBe(5_000)
  })
  it('monto fijo, topado al subtotal', () => {
    expect(couponDiscount({ code: 'MIL', kind: 'fixed', value: 1_000 }, 5_000, 0)).toBe(1_000)
    expect(couponDiscount({ code: 'MUCHO', kind: 'fixed', value: 9_000 }, 5_000, 0)).toBe(5_000)
  })
  it('envío gratis descuenta el despacho', () => {
    expect(couponDiscount({ code: 'ENVIOGRATIS', kind: 'free_delivery', value: 0 }, 5_000, 2_000)).toBe(2_000)
  })
  it('sin cupón no descuenta', () => {
    expect(couponDiscount(null, 5_000, 2_000)).toBe(0)
  })
})

describe('tipAmount', () => {
  it('10% de 10.990 redondeado a la centena = 1.100 (caso E2E)', () => {
    expect(tipAmount(P3, 10)).toBe(1_100)
  })
  it('0% = sin propina', () => {
    expect(tipAmount(P3, 0)).toBe(0)
  })
})
