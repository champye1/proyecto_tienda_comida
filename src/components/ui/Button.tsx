/**
 * Botón base de la app.
 *
 * - `variant`: primary (color de marca), secondary (borde), ghost (sin fondo) o danger
 *   (rojo, para acciones irreversibles como eliminar).
 * - `loading`: muestra un spinner y deshabilita el botón (evita doble envío de formularios).
 * - Alto mínimo de 44 px (min-h-11): tamaño cómodo para tocar en celular y tablet.
 * Acepta cualquier atributo de <button> (type, onClick, etc.).
 */
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-contrast hover:brightness-95 disabled:opacity-60',
  secondary: 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-60',
  ghost: 'text-zinc-700 hover:bg-zinc-100 disabled:opacity-60',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
}

export function Button({ variant = 'primary', loading = false, disabled, className = '', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  )
}
