/**
 * Alerta sonora de pedidos nuevos.
 *
 * El sonido se genera con la Web Audio API (dos tonos cortos): no hay archivos de audio
 * que descargar ni que permitir en la CSP.
 *
 * Los navegadores no dejan reproducir audio hasta que la persona toca la página
 * (política de autoplay). Por eso el audio se "desbloquea" con el primer toque o tecla, y
 * mientras tanto el panel muestra "Toca la pantalla para activar el sonido".
 * La preferencia (activado/desactivado) se guarda en este dispositivo.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const PREF_KEY = 'admin:sound'

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    /* preferencia no persistente: igual funciona en esta sesión */
  }
}

/** Dos tonos ascendentes (≈0,6 s), lo bastante claros para oírse en una cocina. */
function chime(ctx: AudioContext) {
  const start = ctx.currentTime
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = start + i * 0.22
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.4)
  }
}

export type SoundAlerts = {
  /** El usuario quiere sonido. */
  enabled: boolean
  /** Quiere sonido, pero el navegador aún no lo permite (falta un toque). */
  blocked: boolean
  toggle: () => void
  play: () => void
}

export function useSoundAlerts(): SoundAlerts {
  const [enabled, setEnabled] = useState(readPref)
  const [unlocked, setUnlocked] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)

  /** Crea o reanuda el contexto de audio (debe llamarse dentro de un toque/tecla). */
  const unlock = useCallback(() => {
    ctxRef.current ??= new AudioContext()
    void ctxRef.current.resume().then(() => setUnlocked(ctxRef.current?.state === 'running'))
  }, [])

  // Desbloqueo con el primer clic o tecla en cualquier parte del panel. Se usa 'click' (no
  // 'pointerdown') para que la pantalla no cambie en medio del toque y este no se pierda.
  useEffect(() => {
    if (!enabled || unlocked) return
    const onGesture = () => unlock()
    window.addEventListener('click', onGesture, { once: true })
    window.addEventListener('keydown', onGesture, { once: true })
    return () => {
      window.removeEventListener('click', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [enabled, unlocked, unlock])

  // Libera el audio al salir del panel.
  useEffect(() => () => void ctxRef.current?.close(), [])

  const play = useCallback(() => {
    const ctx = ctxRef.current
    if (enabled && ctx?.state === 'running') chime(ctx)
  }, [enabled])

  /** Activa/desactiva. Al activar suena una vez para confirmar (el clic desbloquea el audio). */
  const toggle = useCallback(() => {
    // Los efectos (guardar, sonar) van fuera del actualizador de estado: React puede
    // ejecutar ese actualizador dos veces en modo estricto y el tono sonaría doble.
    const next = !enabled
    setEnabled(next)
    writePref(next)
    if (next) {
      unlock()
      setTimeout(() => {
        if (ctxRef.current?.state === 'running') chime(ctxRef.current)
      }, 50)
    }
  }, [enabled, unlock])

  return { enabled, blocked: enabled && !unlocked, toggle, play }
}
