/**
 * Aviso "Hay una nueva versión disponible" de la PWA.
 *
 * Cuando se publica una versión nueva, el service worker la descarga en segundo
 * plano pero NO la activa solo (registerType: 'prompt' en vite.config.ts): en una
 * cocina, recargar la pantalla en plena hora punta sería peor que seguir con la
 * versión anterior. El usuario decide cuándo actualizar.
 */
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  // Sin versión nueva pendiente no se muestra nada.
  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-zinc-900 p-4 text-sm text-white shadow-lg">
      <span className="flex-1">Hay una nueva versión disponible.</span>
      <button className="rounded-lg px-3 py-2 text-zinc-300" onClick={() => setNeedRefresh(false)}>
        Después
      </button>
      {/* Activa la nueva versión y recarga la página. */}
      <button className="rounded-lg bg-white px-3 py-2 font-medium text-zinc-900" onClick={() => updateServiceWorker()}>
        Actualizar
      </button>
    </div>
  )
}
