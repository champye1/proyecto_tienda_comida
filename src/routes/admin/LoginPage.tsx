/**
 * Inicio de sesión del panel (/admin/login) con email y contraseña (Supabase Auth).
 *
 * Si se llegó aquí desde una página protegida, la URL trae `?next=/admin/...` y al
 * entrar se vuelve a esa página (solo rutas internas: ver safeNext en guards.tsx).
 */
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/Field'
import { safeNext } from '@/features/auth/guards'
import { loginSchema, type LoginValues } from '@/features/auth/schemas'
import { authErrorMessage } from '@/features/auth/authErrors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthCard } from './AuthCard'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' })
  const [errors, setErrors] = useState<FieldErrors<LoginValues>>({}) // errores por campo
  const [formError, setFormError] = useState<string | null>(null) // error general (credenciales, red)
  const [submitting, setSubmitting] = useState(false)

  /** Crea el onChange de un campo del formulario. */
  const set = (field: keyof LoginValues) => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    setSubmitting(false)
    if (error) {
      setFormError(authErrorMessage(error))
      return
    }
    navigate(safeNext(params.get('next')), { replace: true })
  }

  return (
    <AuthCard
      title="Inicia sesión"
      subtitle="Gestiona el menú y los pedidos de tu restaurante."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to="/admin/registro" className="font-semibold text-brand hover:underline">
            Regístrate
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <InputField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />
        <InputField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
        />
        <div className="text-right">
          <Link to="/admin/recuperar" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <Button type="submit" loading={submitting} className="w-full">
          Entrar
        </Button>
      </form>
    </AuthCard>
  )
}
