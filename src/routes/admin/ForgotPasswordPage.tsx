/**
 * Pantalla "¿Olvidaste tu contraseña?" (/admin/recuperar).
 *
 * Pide el email y solicita a Supabase Auth que envíe el correo de recuperación.
 * El enlace del correo apunta a /admin/nueva-contrasena (ver ResetPasswordPage y
 * supabase/templates/recovery.html).
 */
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import { isAuthError } from '@supabase/supabase-js'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/Field'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas'
import { authErrorMessage } from '@/features/auth/authErrors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthCard } from './AuthCard'

export default function ForgotPasswordPage() {
  const [values, setValues] = useState<ForgotPasswordValues>({ email: '' })
  const [errors, setErrors] = useState<FieldErrors<ForgotPasswordValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Email al que se envió el enlace; cuando existe se muestra la confirmación.
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const parsed = forgotPasswordSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      // Página donde el usuario crea la nueva contraseña. Debe estar en la lista
      // de URLs permitidas de Auth (additional_redirect_urls en config.toml).
      redirectTo: `${window.location.origin}/admin/nueva-contrasena`,
    })
    setSubmitting(false)

    // Solo se informan los errores de límite de envío. Cualquier otro caso se trata
    // como enviado, para no revelar qué emails tienen cuenta (enumeración de usuarios).
    if (error && isAuthError(error) && error.code?.startsWith('over_')) {
      setFormError(authErrorMessage(error))
      return
    }
    setSentTo(parsed.data.email)
  }

  if (sentTo) {
    return (
      <AuthCard title="Revisa tu correo">
        <div className="space-y-4 text-sm text-zinc-700">
          <p>
            Si existe una cuenta con <strong>{sentTo}</strong>, te enviamos un enlace para crear una nueva
            contraseña. Vence en 1 hora.
          </p>
          <p className="text-zinc-500">¿No llegó? Revisa la carpeta de spam o vuelve a intentarlo en unos minutos.</p>
          <Link to="/admin/login" className="inline-block font-semibold text-brand hover:underline">
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviaremos un enlace para crear una nueva."
      footer={
        <Link to="/admin/login" className="font-semibold text-brand hover:underline">
          Volver a iniciar sesión
        </Link>
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
          onChange={(e: ChangeEvent<HTMLInputElement>) => setValues({ email: e.target.value })}
          error={errors.email}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Enviar enlace
        </Button>
      </form>
    </AuthCard>
  )
}
