/**
 * CAPTCHA de Cloudflare Turnstile.
 *
 * - Para la mayoría de las personas es invisible (`appearance: 'interaction-only'`): solo
 *   aparece un desafío si Cloudflare tiene dudas.
 * - Entrega un token de un solo uso con `onToken`; el servidor (Supabase Auth o la Edge
 *   Function place-order) lo verifica con Cloudflare. Sin token válido, la operación se rechaza.
 * - El script de Cloudflare se carga solo cuando se usa este componente (login, registro,
 *   checkout), no en el menú de la tienda: no afecta la velocidad de carga del menú.
 * - Tras un envío fallido hay que pedir un token nuevo: usar `reset()` (vía `ref`).
 *
 * Privacidad: Turnstile no usa cookies publicitarias; está declarado en la política de privacidad.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { env } from '@/lib/env'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** API mínima de Turnstile que usamos (window.turnstile). */
type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

/** Carga el script de Turnstile una sola vez para toda la app. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no disponible')))
    script.onerror = () => {
      scriptPromise = null // permite reintentar
      reject(new Error('No se pudo cargar el CAPTCHA'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export type CaptchaHandle = {
  /** Pide un token nuevo (los tokens sirven una sola vez). */
  reset: () => void
}

type CaptchaProps = {
  /** Token listo para enviar, o null si venció o falló. */
  onToken: (token: string | null) => void
  ref?: Ref<CaptchaHandle>
}

export function Captcha({ onToken, ref }: CaptchaProps) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  // Ref al callback más reciente: el widget no se vuelve a crear en cada render.
  const tokenCallback = useRef(onToken)
  useEffect(() => {
    tokenCallback.current = onToken
  }, [onToken])

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        widgetId.current = turnstile.render(container.current, {
          sitekey: env.VITE_TURNSTILE_SITE_KEY,
          language: 'es',
          appearance: 'interaction-only',
          callback: (token: string) => tokenCallback.current(token),
          'expired-callback': () => tokenCallback.current(null),
          'error-callback': () => tokenCallback.current(null),
        })
      })
      .catch(() => tokenCallback.current(null))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  useImperativeHandle(ref, () => ({
    reset: () => {
      tokenCallback.current(null)
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
    },
  }))

  return <div ref={container} className="flex justify-center empty:hidden" />
}
