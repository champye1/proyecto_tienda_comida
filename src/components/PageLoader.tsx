/**
 * Indicador de carga a pantalla completa (círculo girando en el color de la marca).
 * Se usa mientras se descarga el código de una página (HydrateFallback del router)
 * o mientras se espera la sesión o los datos iniciales del panel.
 */
export function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <div className="size-10 animate-spin rounded-full border-4 border-zinc-200 border-t-brand" />
      {/* Texto solo para lectores de pantalla. */}
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
