/**
 * Procesamiento de imágenes en el navegador, antes de subirlas (fotos del menú, logo y
 * comprobantes de transferencia). No depende de supabase-js: la tienda lo usa sin cargar
 * ese cliente.
 *
 *   1. Se valida el tipo (JPEG, PNG o WebP) y el tamaño de entrada (máx. 10 MB).
 *   2. Se decodifica y se vuelve a dibujar en un canvas, reducida al tamaño indicado.
 *   3. Se exporta como WebP.
 * Privacidad: el re-dibujado elimina los metadatos EXIF (ubicación GPS, modelo del teléfono).
 * Seguridad: solo se sube una imagen recién generada; el contenido extra escondido en el
 * archivo original (archivos "políglota") se descarta.
 */

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_INPUT_BYTES = 10 * 1024 * 1024 // archivo elegido por el usuario
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024 // límite del bucket de imágenes
const MAX_DIMENSION = 1200 // px, lado más largo por defecto

/** Devuelve un mensaje de error si el archivo no sirve, o null si está bien. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'La foto debe ser JPG, PNG o WebP.'
  if (file.size > MAX_INPUT_BYTES) return 'La foto no puede pesar más de 10 MB.'
  return null
}

/** Exporta el canvas como WebP con la calidad indicada. */
function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/webp', quality),
  )
}

/**
 * Reduce la foto (por defecto a máx. 1200 px) y la convierte a WebP sin metadatos.
 * `imageOrientation: 'from-image'` respeta la rotación de las fotos de celular antes de
 * descartar el EXIF (si no, algunas quedarían de lado).
 */
export async function processImage(file: File, maxDimension = MAX_DIMENSION): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // No se pudo decodificar: el archivo está dañado o no es realmente una imagen.
    throw new Error('El archivo no es una imagen válida.')
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Tu navegador no permite procesar fotos.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let blob = await canvasToWebp(canvas, 0.82)
  // Caso raro (foto muy detallada): se intenta con menos calidad antes de rechazarla.
  if (blob.size > MAX_OUTPUT_BYTES) blob = await canvasToWebp(canvas, 0.6)
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error('La foto es demasiado pesada incluso después de comprimirla.')
  return blob
}
