/**
 * Pantalla de error general (ErrorBoundary de la ruta raíz).
 *
 * Aparece si una página falla de forma inesperada, en vez de dejar la pantalla en blanco.
 * Caso típico en producción: se publicó una versión nueva y el navegador (o la PWA
 * instalada) pide un archivo JS que ya no existe. Recargar trae la versión nueva.
 * No muestra detalles técnicos al usuario; quedan en la consola del navegador.
 */
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

export default function RouteError() {
  const error = useRouteError()
  console.error(error)

  // Error al descargar el código de una página (versión nueva publicada o sin conexión).
  const chunkFailed =
    error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message)
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">
        {notFound ? 'Página no encontrada' : chunkFailed ? 'Hay una versión nueva' : 'Algo salió mal'}
      </h1>
      <p className="max-w-sm text-zinc-600">
        {chunkFailed
          ? 'La aplicación se actualizó o se perdió la conexión. Recarga para continuar.'
          : 'Ocurrió un error inesperado. Recarga la página; si se repite, intenta de nuevo en unos minutos.'}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Recargar
        </button>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100">
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
