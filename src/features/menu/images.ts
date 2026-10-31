/**
 * Imágenes del restaurante (fotos de productos y logo): validar, procesar, subir y borrar.
 *
 * Antes de subir, cada foto se procesa en el navegador:
 *   1. Se valida el tipo (JPEG, PNG o WebP) y el tamaño de entrada (máx. 10 MB).
 *   2. Se decodifica y se vuelve a dibujar en un canvas, reducida a máx. 1200 px.
 *   3. Se exporta como WebP.
 * Beneficios:
 *   - Rendimiento: fotos livianas que cargan rápido en el celular del cliente.
 *   - Privacidad: el re-dibujado elimina los metadatos EXIF (que pueden incluir la
 *     ubicación GPS donde se tomó la foto y el modelo del teléfono).
 *   - Seguridad: solo se sube una imagen recién generada; cualquier contenido extra
 *     escondido en el archivo original (archivos "políglota") se descarta.
 *
 * El nombre del archivo es un UUID aleatorio (nunca el nombre original) dentro de la
 * carpeta del restaurante: {restaurant_id}/{uuid}.webp. Así lo exigen las políticas de
 * Storage y la regla products_image_url_own_storage de la base.
 */
import { supabase } from '@/lib/supabase'

const BUCKET = 'restaurant-images'
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_INPUT_BYTES = 10 * 1024 * 1024 // archivo elegido por el usuario
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024 // límite del bucket
const MAX_DIMENSION = 1200 // px, lado más largo (fotos de productos; el logo usa 512)

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

/** Sube la imagen procesada a la carpeta del restaurante y devuelve su URL pública. */
export async function uploadRestaurantImage(restaurantId: string, blob: Blob): Promise<string> {
  const path = `${restaurantId}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    // El nombre es único y nunca se reutiliza: el navegador puede guardarla en caché 1 año.
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error('No se pudo subir la foto. Intenta de nuevo.')
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Extrae la ruta dentro del bucket ({restaurant_id}/archivo) desde una URL pública. */
export function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}

/**
 * Borra una foto que ya no se usa (al reemplazarla o al borrar el producto).
 * Es "mejor esfuerzo": si falla, el producto igual queda bien guardado y solo queda un
 * archivo huérfano en el Storage, que no afecta a nadie.
 */
export async function removeRestaurantImage(url: string | null | undefined): Promise<void> {
  const path = url ? storagePathFromUrl(url) : null
  if (!path) return
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch {
    /* archivo huérfano: no bloquea al usuario */
  }
}
