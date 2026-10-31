/**
 * Hooks que deciden CUÁNTA animación mostrar en la landing.
 *
 * Reglas (requisitos de rendimiento y accesibilidad):
 *   - prefers-reduced-motion activo → todo estático, sin bucles.
 *   - Celular o pantalla táctil → versión liviana: sin tilt 3D, sin parallax, sin scroll fijo.
 *   - Escritorio con mouse → experiencia completa.
 *   - Los bucles se pausan cuando su sección no está en pantalla.
 */
import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { useInView, useReducedMotion } from 'motion/react'

/** Estado de una media query CSS, actualizado en vivo (p. ej. al rotar la tablet). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Escritorio con mouse (no táctil): habilita las animaciones pesadas. */
const DESKTOP_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

/**
 * Nivel de animación permitido:
 *   reduced → el usuario pidió menos movimiento (todo estático)
 *   desktop → pantalla grande con mouse
 *   rich    → animaciones pesadas permitidas (tilt 3D, parallax): desktop y sin reduced
 */
export function useMotionLevel() {
  const reduced = useReducedMotion() ?? false
  const desktop = useMediaQuery(DESKTOP_QUERY)
  return { reduced, desktop, rich: desktop && !reduced }
}

/**
 * Ejecuta `callback` cada `ms` milisegundos SOLO mientras `ref` está en pantalla y el
 * usuario no pidió menos movimiento. Así las animaciones en bucle no gastan batería
 * ni CPU cuando nadie las está viendo.
 * @returns si el bucle está corriendo ahora.
 */
export function useVisibleInterval(ref: RefObject<Element | null>, callback: () => void, ms: number): boolean {
  const reduced = useReducedMotion() ?? false
  const inView = useInView(ref, { amount: 0.25 })
  const running = inView && !reduced
  // Ref al callback más reciente: el intervalo no se reinicia en cada render.
  const saved = useRef(callback)
  useEffect(() => {
    saved.current = callback
  }, [callback])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => saved.current(), ms)
    return () => clearInterval(id)
  }, [running, ms])

  return running
}

/** Curva de animación "suave al final" usada en toda la landing (estilo Linear/Vercel). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
