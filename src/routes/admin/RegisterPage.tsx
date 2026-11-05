/**
 * Registro de cuenta nueva (/admin/registro) con email y contraseña.
 *
 * - Exige aceptar los Términos y la Política de privacidad. La aceptación (con la versión
 *   y la fecha) se guarda en los metadatos del usuario como constancia.
 * - Protegido con CAPTCHA (Turnstile): Supabase Auth rechaza el registro sin token válido,
 *   lo que frena la creación masiva de cuentas falsas.
 *
 * Después de registrarse, el usuario pasa al onboarding para crear su restaurante.
 * Si Supabase tiene activada la confirmación de email (lo normal en producción),
 * no hay sesión hasta confirmar y se muestra "Revisa tu correo".
 */
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Captcha, type CaptchaHandle } from '@/components/Captcha'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/Field'
import { authErrorMessage } from '@/features/auth/authErrors'
import { LEGAL_VERSION, registerSchema, type RegisterValues } from '@/features/auth/schemas'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthCard } from './AuthCard'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<RegisterValues>({ email: '', password: '', confirmPassword: '', acceptTerms: false })
  const [errors, setErrors] = useState<FieldErrors<RegisterValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Email que debe confirmarse; cuando existe se muestra la pantalla "Revisa tu correo".
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null)
  // CAPTCHA: token de un solo uso que Supabase Auth verifica con Cloudflare.
  const captcha = useRef<CaptchaHandle>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  /** Crea el onChange de un campo de texto del formulario. */
  const set = (field: 'email' | 'password' | 'confirmPassword') => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const parsed = registerSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    if (!captchaToken) return
    setErrors({})
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        captchaToken,
        // A dónde lleva el enlace del correo de confirmación (si está activada).
        emailRedirectTo: `${window.location.origin}/admin/onboarding`,
        // Constancia de la aceptación de los textos legales (qué versión y cuándo).
        data: { terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString() },
      },
    })
    setSubmitting(false)
    if (error) {
      captcha.current?.reset() // el token ya se usó: se necesita uno nuevo para reintentar
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

        {/* Aceptación explícita de los textos legales (se abren en otra pestaña). */}
        <div>
          <label className="flex items-start gap-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={values.acceptTerms}
              onChange={(e) => setValues((v) => ({ ...v, acceptTerms: e.target.checked }))}
              aria-invalid={errors.acceptTerms ? true : undefined}
              className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
            />
            <span>
              Acepto los{' '}
              <Link to="/legal/terminos" target="_blank" className="font-semibold text-brand underline">
                Términos y condiciones
              </Link>{' '}
              y la{' '}
              <Link to="/legal/privacidad" target="_blank" className="font-semibold text-brand underline">
                Política de privacidad
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms && <p className="mt-1 text-sm text-red-600">{errors.acceptTerms}</p>}
        </div>

        <Captcha ref={captcha} onToken={setCaptchaToken} />
        <Button type="submit" loading={submitting} disabled={!captchaToken} className="w-full">
          Crear cuenta
        </Button>
        {!captchaToken && <p className="text-center text-xs text-zinc-500">Verificando que eres una persona…</p>}
      </form>
    </AuthCard>
  )
}
