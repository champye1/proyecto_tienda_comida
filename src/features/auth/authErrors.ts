/**
 * Mensajes en español para errores de Supabase Auth (login, registro, contraseñas).
 *
 * Está separado de src/lib/errors.ts a propósito: este archivo depende de supabase-js, y
 * la tienda pública (que no usa supabase-js para cargar más rápido) solo importa
 * lib/errors.ts.
 */
import { isAuthError } from '@supabase/supabase-js'
import { GENERIC_ERROR, NETWORK_ERROR } from '@/lib/errors'

/**
 * Traduce un error de Auth. Se basa en `error.code`, que es estable entre versiones
 * (el texto en inglés no lo es).
 */
export function authErrorMessage(error: unknown): string {
  if (isAuthError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'Email o contraseña incorrectos.'
      case 'user_already_exists':
      case 'email_exists':
        return 'Ya existe una cuenta con ese email. Inicia sesión.'
      case 'weak_password':
        return 'La contraseña es demasiado débil. Usa al menos 8 caracteres, con letras y números.'
      case 'same_password':
        return 'La nueva contraseña debe ser distinta a la anterior.'
      case 'reauthentication_needed':
        // secure_password_change (config.toml): la sesión es antigua para cambiar la clave.
        return 'Por seguridad, vuelve a iniciar sesión antes de cambiar tu contraseña.'
      case 'email_not_confirmed':
        return 'Debes confirmar tu email antes de iniciar sesión. Revisa tu correo.'
      case 'otp_expired':
        return 'El enlace venció o ya fue usado. Pide uno nuevo.'
      case 'session_not_found':
      case 'session_expired':
        return 'Tu sesión expiró. Vuelve a iniciar sesión.'
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
      case 'signup_disabled':
      case 'email_provider_disabled':
        return 'El registro está deshabilitado en este momento.'
      case 'validation_failed':
        return 'Revisa los datos ingresados.'
    }
    if (error.name === 'AuthRetryableFetchError') return NETWORK_ERROR
  }
  return GENERIC_ERROR
}
