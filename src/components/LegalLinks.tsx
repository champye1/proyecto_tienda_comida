/**
 * Enlaces a los textos legales (Términos y Privacidad) para los pies de página de la
 * landing, la tienda y las pantallas de acceso. Archivo aparte y sin dependencias, para
 * no sumar código a la tienda ni a la landing.
 */
import { Link } from 'react-router'

export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex gap-4 ${className}`}>
      <Link to="/legal/terminos" className="hover:text-zinc-900 hover:underline">
        Términos
      </Link>
      <Link to="/legal/privacidad" className="hover:text-zinc-900 hover:underline">
        Privacidad
      </Link>
    </span>
  )
}
