/**
 * "Mi cuenta" (/admin/cuenta): datos del usuario y cambio de contraseña con la sesión iniciada.
 *
 * Para cambiar la contraseña se exige la actual: así alguien que encuentre la
 * tablet de cocina con la sesión abierta no puede apropiarse de la cuenta.
 */
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import { isAuthError } from '@supabase/supabase-js'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/Field'
import { useSession } from '@/features/auth/AuthProvider'
import { changePasswordSchema, type ChangePasswordValues } from '@/features/auth/schemas'
import { authErrorMessage } from '@/features/auth/authErrors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'

const EMPTY: ChangePasswordValues = { currentPassword: '', password: '', confirmPassword: '' }

export default function AccountPage() {
  const session = useSession()
  const email = session.user.email ?? ''
  const [values, setValues] = useState<ChangePasswordValues>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors<ChangePasswordValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const set = (field: keyof ChangePasswordValues) => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSuccess(false)
    const parsed = changePasswordSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)

    // 1. Comprobar la contraseña actual volviendo a iniciar sesión con ella.
    //    (Mismo usuario: AuthProvider no limpia la caché.)
    const check = await supabase.auth.signInWithPassword({ email, password: parsed.data.currentPassword })
    if (check.error) {
      setSubmitting(false)
      if (isAuthError(check.error) && check.error.code === 'invalid_credentials') {
        setErrors({ currentPassword: 'La contraseña actual no es correcta' })
      } else {
        setFormError(authErrorMessage(check.error))
      }
      return
    }

    // 2. Guardar la nueva. Supabase envía además el correo de aviso "Tu contraseña fue cambiada".
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    setSubmitting(false)
    if (error) {
      setFormError(authErrorMessage(error))
      return
    }
    setValues(EMPTY)
    setSuccess(true)
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Mi cuenta</h1>
        <p className="mt-1 text-sm text-zinc-600">{email}</p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Cambiar contraseña</h2>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          {success && <Alert tone="success">Listo. Tu contraseña fue cambiada.</Alert>}
          {formError && <Alert tone="error">{formError}</Alert>}
          <InputField
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={set('currentPassword')}
            error={errors.currentPassword}
          />
          <InputField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={set('password')}
            error={errors.password}
            hint="Mínimo 8 caracteres, con letras y números."
          />
          <InputField
            label="Repite la nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={set('confirmPassword')}
            error={errors.confirmPassword}
          />
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" loading={submitting}>
              Guardar nueva contraseña
            </Button>
            {/* Si no recuerda la actual, el camino es el correo de recuperación. */}
            <Link to="/admin/recuperar" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              No recuerdo mi contraseña actual
            </Link>
          </div>
        </form>
      </section>
    </div>
  )
}
