/**
 * Exportar tablas a un archivo que Excel abre directamente (CSV).
 *
 * - Separador ";" y BOM UTF-8: así lo espera Excel configurado en español (Chile), con
 *   acentos y ñ correctos y cada dato en su columna, sin pasos de importación.
 * - Seguridad (inyección de fórmulas / "CSV injection"): un cliente podría escribir en su
 *   nombre o en la nota algo como =HYPERLINK("http://…") o =CMD|…; al abrir el archivo,
 *   Excel lo ejecutaría como fórmula. Toda celda de texto que empiece con = + - @ o un
 *   tabulador/retorno se antepone con un apóstrofo para que Excel la trate como texto.
 * - Los números se exportan sin formato (12990, no "$12.990") para poder sumarlos.
 */

export type CsvCell = string | number | boolean | null | undefined

/** Prepara una celda: neutraliza fórmulas y escapa comillas, ";" y saltos de línea. */
function cell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  let text = value
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Arma el contenido CSV (con BOM) a partir de encabezados y filas. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(cell).join(';'))
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Descarga el CSV con el nombre indicado (generado en el navegador, sin pasar por un servidor). */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
