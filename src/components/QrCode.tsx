/**
 * Código QR como SVG, dibujado con React (sin HTML inyectado: compatible con la CSP).
 * La matriz la calcula la librería uqr; aquí cada módulo oscuro se agrega a un único
 * <path>, que es liviano incluso para URLs largas.
 *
 * También exporta helpers para descargar el QR como PNG o SVG (archivo para la imprenta).
 */
import { encode } from 'uqr'

/** Margen de módulos claros alrededor del código (el estándar recomienda 4). */
const BORDER = 4

/** Matriz del QR. Corrección "M": sigue funcionando con hasta ~15% del código dañado o tapado. */
function matrix(value: string): boolean[][] {
  return encode(value, { ecc: 'M', border: BORDER }).data
}

/** Trazado SVG de los módulos oscuros: "M x y h1v1h-1z" por cada uno. */
function pathFor(data: boolean[][]): string {
  let d = ''
  data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)))
  return d
}

export function QrCode({ value, size = 240, title }: { value: string; size?: number; title: string }) {
  const data = matrix(value)
  return (
    <svg
      role="img"
      aria-label={title}
      width={size}
      height={size}
      viewBox={`0 0 ${data.length} ${data.length}`}
      shapeRendering="crispEdges"
      className="bg-white"
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={pathFor(data)} fill="#000000" />
    </svg>
  )
}

/** Descarga un archivo generado en el navegador (Blob). */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Descarga el QR como SVG (vectorial: ideal para imprenta, se puede agrandar sin perder calidad). */
export function downloadQrSvg(value: string, filename: string) {
  const data = matrix(value)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.length} ${data.length}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${pathFor(data)}" fill="#000"/></svg>`
  download(new Blob([svg], { type: 'image/svg+xml' }), filename)
}

/** Descarga el QR como PNG de alta resolución (para WhatsApp, Instagram o un flyer). */
export function downloadQrPng(value: string, filename: string, pixels = 1200) {
  const data = matrix(value)
  const scale = Math.floor(pixels / data.length)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = data.length * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  data.forEach((row, y) => row.forEach((dark, x) => dark && ctx.fillRect(x * scale, y * scale, scale, scale)))
  canvas.toBlob((blob) => blob && download(blob, filename), 'image/png')
}
