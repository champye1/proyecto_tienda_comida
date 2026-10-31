/**
 * Campos de formulario con etiqueta, ayuda y mensaje de error:
 *   - InputField    → <input>
 *   - TextareaField → <textarea>
 *
 * Se encargan de la accesibilidad: el <label> queda asociado al campo, y el error o
 * la ayuda se vinculan con aria-describedby para que los lectores de pantalla los lean.
 */
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

// text-base (16 px) en celular: con menos, iOS hace zoom automático al tocar el campo.
const inputClass =
  'block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 sm:text-sm'

/** Borde rojo si hay error; color de marca al enfocar si no. */
function stateClass(error?: string) {
  return error ? 'border-red-400 focus:ring-red-200' : 'border-zinc-300 focus:border-brand focus:ring-brand/20'
}

type FieldShellProps = {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}

/** Estructura común: etiqueta arriba, campo, y debajo el error (si hay) o la ayuda. */
function FieldShell({ id, label, error, hint, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-sm text-zinc-500">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  hint?: ReactNode
}

/** Campo de texto de una línea. Acepta cualquier atributo de <input>. */
export function InputField({ label, error, hint, id, className = '', ...props }: InputFieldProps) {
  // useId genera un id único para enlazar <label>, campo y mensajes si no se pasa uno.
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint}>
      <input
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`${inputClass} ${stateClass(error)} ${className}`}
      />
    </FieldShell>
  )
}

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string
  hint?: ReactNode
}

/** Campo de texto de varias líneas. Acepta cualquier atributo de <textarea>. */
export function TextareaField({ label, error, hint, id, className = '', ...props }: TextareaFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint}>
      <textarea
        {...props}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={`${inputClass} ${stateClass(error)} ${className}`}
      />
    </FieldShell>
  )
}
