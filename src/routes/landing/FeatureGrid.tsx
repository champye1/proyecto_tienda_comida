/**
 * Grilla de beneficios con tarjetas "spotlight": un halo de luz sigue al cursor dentro
 * de cada tarjeta, la tarjeta se eleva levemente y su ícono se anima al pasar el mouse.
 * Las tarjetas aparecen en secuencia (stagger) al entrar en pantalla.
 */
import type { ComponentType, SVGProps } from 'react'
import { IconCart, IconCash, IconPhone, IconShare, IconShield, IconTablet } from './icons'
import { Reveal, SpotlightCard, Stagger, StaggerItem } from './primitives'

const BENEFITS: { title: string; text: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    title: 'Pensada para el celular',
    text: 'La mayoría de tus clientes pide desde el teléfono. La tienda se ve y funciona perfecto en pantallas chicas.',
    icon: IconPhone,
  },
  {
    title: 'Un link para compartir',
    text: 'Tu tienda tiene su propia dirección. Al compartirla en WhatsApp o Instagram se ve con tu nombre y tu logo.',
    icon: IconShare,
  },
  {
    title: 'Carrito que no se pierde',
    text: 'Si tu cliente cierra la página, su carrito sigue ahí cuando vuelve.',
    icon: IconCart,
  },
  {
    title: 'Efectivo o transferencia',
    text: 'Tu cliente elige cómo pagar al hacer el pedido. Los precios se calculan siempre en el servidor.',
    icon: IconCash,
  },
  {
    title: 'Se instala en la tablet',
    text: 'El panel se instala como una app y se abre a pantalla completa. Ideal para la cocina.',
    icon: IconTablet,
  },
  {
    title: 'Datos protegidos',
    text: 'Cada restaurante ve solo su información. La seguridad se aplica en la base de datos, no solo en la pantalla.',
    icon: IconShield,
  },
]

export function FeatureGrid() {
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Hecha para restaurantes</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Simple para tus clientes, cómoda para tu equipo
          </h2>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => {
            const Icon = b.icon
            return (
              <StaggerItem key={b.title}>
                <SpotlightCard className="h-full">
                  {/* El ícono gira y crece levemente al pasar el mouse sobre la tarjeta (CSS transform). */}
                  <span className="flex size-11 items-center justify-center rounded-xl bg-rose-50 text-brand transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transition-none">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-zinc-900">{b.title}</h3>
                  <p className="mt-2 text-zinc-600">{b.text}</p>
                </SpotlightCard>
              </StaggerItem>
            )
          })}
        </Stagger>
      </div>
    </section>
  )
}
