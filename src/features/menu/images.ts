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

// Validar y procesar viven en lib/imageProcessing (también los usa la tienda).
export { processImage, validateImageFile } from '@/lib/imageProcessing'

const BUCKET = 'restaurant-images'

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
