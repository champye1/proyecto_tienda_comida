/**
 * Apariencia de la tienda: color de marca del restaurante y metadatos de la página.
 */
import { useEffect } from 'react'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * Color de texto legible sobre el color de marca: blanco sobre colores oscuros y casi
 * negro sobre colores claros (luminancia relativa WCAG).
 */
export function contrastColor(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.4 ? '#18181b' : '#ffffff'
}

/**
 * Aplica el color del restaurante a toda la página (variables CSS --brand y
 * --brand-contrast) y a la barra del navegador en celular (theme-color).
 * Se aplica con style.setProperty (CSSOM), compatible con la CSP sin estilos inline.
 * Al salir de la tienda se restauran los valores anteriores.
 */
export function useBrandColor(hex: string | undefined) {
  useEffect(() => {
    if (!hex || !HEX_COLOR.test(hex)) return // la base ya lo valida; doble chequeo antes de usarlo
    const root = document.documentElement
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const previous = {
      brand: root.style.getPropertyValue('--brand'),
      contrast: root.style.getPropertyValue('--brand-contrast'),
      theme: themeMeta?.content,
    }
    root.style.setProperty('--brand', hex)
    root.style.setProperty('--brand-contrast', contrastColor(hex))
    if (themeMeta) themeMeta.content = hex
    return () => {
      root.style.setProperty('--brand', previous.brand)
      root.style.setProperty('--brand-contrast', previous.contrast)
      if (themeMeta && previous.theme) themeMeta.content = previous.theme
    }
  }, [hex])
}

/**
 * Título y descripción de la página (pestaña del navegador, buscadores que ejecutan JS).
 * La vista previa en WhatsApp/Instagram la da la Edge Function "og", no esto.
 * `noindex`: páginas privadas (seguimiento de pedido) que no deben aparecer en buscadores.
 */
export function useDocumentMeta({ title, description, noindex = false }: { title: string; description?: string; noindex?: boolean }) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const descMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDesc = descMeta?.content
    if (descMeta && description) descMeta.content = description

    let robots: HTMLMetaElement | null = null
    if (noindex) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      robots.content = 'noindex, nofollow'
      document.head.appendChild(robots)
    }

    return () => {
      document.title = previousTitle
      if (descMeta && previousDesc !== undefined) descMeta.content = previousDesc
      robots?.remove()
    }
  }, [title, description, noindex])
}
