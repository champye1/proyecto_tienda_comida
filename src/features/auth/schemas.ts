/**
 * Esquemas Zod de los formularios de autenticación (login, registro, recuperación
 * y cambio de contraseña). Validan en el navegador para dar mensajes claros en
 * español; Supabase Auth vuelve a validar en el servidor.
 */
import { z } from 'zod'

/** Email normalizado (sin espacios al inicio o final). */
const emailField = z.string().trim().pipe(z.email('Ingresa un email válido'))

/**
 * Regla única de contraseña nueva, compartida por registro, recuperación y cambio.
 * Refleja la configuración de Supabase Auth (config.toml):
 *   minimum_password_length = 8 y password_requirements = "letters_digits".
 * 72 = máximo que admite bcrypt.
 */
const newPasswordField = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar los 72 caracteres')
  .regex(/[a-zA-Z]/, 'La contraseña debe incluir al menos una letra')
  .regex(/[0-9]/, 'La contraseña debe incluir al menos un número')

/** Formulario de inicio de sesión. */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

/** Formulario de registro: contraseña nueva + confirmación. */
export const registerSchema = z
  .object({
    email: emailField,
    password: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

/** "¿Olvidaste tu contraseña?": solo pide el email al que se envía el enlace. */
export const forgotPasswordSchema = z.object({
  email: emailField,
})

/** Nueva contraseña después de abrir el enlace del correo de recuperación. */
export const newPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

/** Cambio de contraseña desde "Mi cuenta": exige la contraseña actual. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
    password: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((d) => d.password !== d.currentPassword, {
    message: 'La nueva contraseña debe ser distinta a la actual',
    path: ['password'],
  })

export type LoginValues = z.input<typeof loginSchema>
export type RegisterValues = z.input<typeof registerSchema>
export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>
export type NewPasswordValues = z.input<typeof newPasswordSchema>
export type ChangePasswordValues = z.input<typeof changePasswordSchema>
