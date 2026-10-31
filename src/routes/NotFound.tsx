/** Página 404: se muestra para cualquier URL que no coincide con ninguna ruta. */
import { Link } from 'react-router'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold">Página no encontrada</h1>
      <Link to="/" className="text-brand underline">
        Volver al inicio
      </Link>
    </main>
  )
}
