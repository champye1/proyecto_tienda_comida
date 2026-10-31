/**
 * Pantalla para crear una nueva contraseña (/admin/nueva-contrasena).
 *
 * Se llega desde el enlace del correo de recuperación, que trae
 * `?token_hash=...&type=recovery`. Flujo:
 *   1. Se verifica el token con Supabase (verifyOtp). Si es válido, Supabase inicia
 *      una sesión temporal para ese usuario.
 *   2. El usuario escribe la nueva contraseña y se guarda con updateUser.
 *   3. Queda con la sesión iniciada y pasa al panel.
 *
 * Se usa token_hash (y no el enlace mágico estándar) porque funciona aunque el
 * correo se abra en otro dispositivo y porque los antivirus de correo que
 * "pre-abren" enlaces no consumen el token: verificarlo requiere ejecutar esta página.
 */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageLoader } from '@/components/PageLoader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/Field'
import { newPasswordSchema, type NewPasswordValues } from '@/features/auth/schemas'
import { authErrorMessage } from '@/features/auth/authErrors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthCard } from './AuthCard'

/** Etapas de la pantalla: verificando el enlace, enlace inválido o formulario listo. */
type Status = 'verifying' | 'invalid' | 'ready'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('verifying')
  const [values, setValues] = useState<NewPasswordValues>({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<FieldErrors<NewPasswordValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // React StrictMode ejecuta los efectos dos veces en desarrollo; el token es de un
  // solo uso, así que este ref evita verificarlo dos veces (la segunda fallaría).
  const verifyStarted = useRef(false)

  // Paso 1: verificar el token del enlace al abrir la página.
  useEffect(() => {
    if (verifyStarted.current) return
    verifyStarted.current = true

    const tokenHash = params.get('token_hash')
    if (!tokenHash || params.get('type') !== 'recovery') {
      setStatus('invalid')
      return
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
      // Se quita el token de la URL: ya se usó y no debe quedar en el historial.
      setParams({}, { replace: true })
      setStatus(error ? 'invalid' : 'ready')
    })
  }, [params, setParams])

  const set = (field: keyof NewPasswordValues) => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }))

  // Paso 2: guardar la nueva contraseña.
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const parsed = newPasswordSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    setSubmitting(false)
    if (error) {
      setFormError(authErrorMessage(error))
      return
    }
    // Paso 3: la sesión ya está iniciada; directo al panel.
    navigate('/admin', { replace: true, state: { passwordChanged: true } })
  }

  if (status === 'verifying') return <PageLoader />

  if (status === 'invalid') {
    return (
      <AuthCard title="Enlace no válido">
        <div className="space-y-4 text-sm text-zinc-700">
          <p>El enlace para restablecer la contraseña venció o ya fue usado. Los enlaces duran 1 hora y sirven una sola vez.</p>
          <Link
            to="/admin/recuperar"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast"
          >
            Pedir un enlace nuevo
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Crea una nueva contraseña" subtitle="Úsala la próxima vez que inicies sesión.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
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
        <Button type="submit" loading={submitting} className="w-full">
          Guardar contraseña
        </Button>
      </form>
    </AuthCard>
  )
}
