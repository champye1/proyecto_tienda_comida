/**
 * Impresión de una parte de la pantalla (comanda de cocina, cartel con el QR).
 *
 * usePrint() devuelve:
 *   print(contenido)  muestra el contenido en un contenedor .print-root y abre el diálogo
 *                     de impresión del navegador. Al cerrarlo, el contenedor se vacía.
 *   portal            debe renderizarse en el componente (es el contenedor, fuera de #root).
 *
 * Los estilos de index.css ocultan todo lo demás al imprimir. Funciona con cualquier
 * impresora que el sistema conozca, incluidas las térmicas de 58/80 mm (ancho de la comanda).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function usePrint() {
  const [content, setContent] = useState<ReactNode>(null)

  useEffect(() => {
    if (content === null) return
    const done = () => setContent(null)
    window.addEventListener('afterprint', done, { once: true })
    // Se espera un cuadro para que el contenido esté pintado antes de abrir el diálogo.
    const frame = requestAnimationFrame(() => window.print())
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', done)
    }
  }, [content])

  const portal = content === null ? null : createPortal(<div className="print-root">{content}</div>, document.body)
  return { print: (node: ReactNode) => setContent(node), portal }
}
