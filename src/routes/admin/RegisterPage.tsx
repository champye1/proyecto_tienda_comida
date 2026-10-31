/**
 * Registro de cuenta nueva (/admin/registro) con email y contraseña.
 *
 * Después de registrarse, el usuario pasa al onboarding para crear su restaurante.
 * Si Supabase tiene activada la confirmación de email (lo normal en producción),
 * no hay sesión hasta confirmar y se muestra "Revisa tu correo".
 */
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/Field'
import { registerSchema, type RegisterValues } from '@/features/auth/schemas'
import { authErrorMessage } from '@/features/auth/authErrors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthCard } from './AuthCard'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<RegisterValues>({ email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<FieldErrors<RegisterValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Email que debe confirmarse; cuando existe se muestra la pantalla "Revisa tu correo".
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null)

  /** Crea el onChange de un campo del formulario. */
  const set = (field: keyof RegisterValues) => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const parsed = registerSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      // A dónde lleva el enlace del correo de confirmación (si está activada).
      options: { emailRedirectTo: `${window.location.origin}/admin/onboarding` },
    })
    setSubmitting(false)
    if (error) {
      setFormError(authErrorMessage(error))
      return
    }
    // Con confirmación de email activada (producción) no hay sesión hasta confirmar.
    if (!data.session) {
      setPendingConfirmation(parsed.data.email)
      return
    }
    navigate('/admin/onboarding', { replace: true })
  }

  if (pendingConfirmation) {
    return (
      <AuthCard title="Revisa tu correo">
        <div className="space-y-4 text-sm text-zinc-700">
          <p>
            Te enviamos un enlace a <strong>{pendingConfirmation}</strong> para confirmar tu cuenta. Ábrelo desde
            este mismo dispositivo para continuar.
          </p>
          <Link to="/admin/login" className="font-semibold text-brand hover:underline">
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Crea tu cuenta"
      subtitle="En el siguiente paso registras tu restaurante."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/admin/login" className="font-semibold text-brand hover:underline">
            Inicia sesión
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
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          hint="Mínimo 8 caracteres, con letras y números."
        />
        <InputField
          label="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={set('confirmPassword')}
          error={errors.confirmPassword}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Crear cuenta
        </Button>
      </form>
    </AuthCard>
  )
}
