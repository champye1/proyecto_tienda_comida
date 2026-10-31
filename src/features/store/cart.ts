/**
 * Carrito de la tienda, persistente en localStorage (uno por restaurante).
 *
 * Seguridad y consistencia:
 *   - Solo se guardan ids y cantidades, NUNCA precios: los montos que se muestran se
 *     recalculan con el menú actual, y el servidor los vuelve a calcular al pedir.
 *   - localStorage es editable por cualquiera desde el navegador: al leerlo se valida con
 *     Zod. Si el contenido está dañado o manipulado, se descarta en vez de romper la app.
 *   - Mismos límites que el servidor: máx. 50 líneas y 1 a 99 unidades por línea.
 *   - Si un producto u opción deja de estar disponible, esa línea se quita al cargar.
 */
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { indexProducts, optionsLabel, unitPrice, validateSelection, type PublicMenu, type PublicProduct } from './menu'

export const MAX_LINES = 50
export const MAX_QUANTITY = 99

const lineSchema = z.object({
  productId: z.uuid(),
  optionIds: z.array(z.uuid()).max(40),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
})
const storedCartSchema = z.object({ version: z.literal(1), lines: z.array(lineSchema).max(MAX_LINES) })

/** Línea del carrito tal como se guarda. */
export type CartLine = z.infer<typeof lineSchema>

/** Línea del carrito resuelta con el menú actual (lista para mostrar). */
export type ResolvedLine = CartLine & {
  key: string
  product: PublicProduct
  optionsText: string
  unitPrice: number
  lineTotal: number
}

const storageKey = (slug: string) => `pedidos:cart:v1:${slug}`

/** Identificador de la combinación producto + opciones (las mismas opciones suman cantidad). */
export function lineKey(productId: string, optionIds: string[]): string {
  return `${productId}|${[...optionIds].sort().join(',')}`
}

/** Lee el carrito guardado; si no existe, está dañado o fue manipulado, devuelve vacío. */
function readCart(slug: string): CartLine[] {
  try {
    const raw = localStorage.getItem(storageKey(slug))
    if (!raw) return []
    const parsed = storedCartSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data.lines
    localStorage.removeItem(storageKey(slug))
  } catch {
    /* JSON inválido o almacenamiento bloqueado: carrito vacío */
  }
  return []
}

function writeCart(slug: string, lines: CartLine[]) {
  try {
    if (lines.length === 0) localStorage.removeItem(storageKey(slug))
    else localStorage.setItem(storageKey(slug), JSON.stringify({ version: 1, lines }))
  } catch {
    /* modo privado o almacenamiento lleno: el carrito sigue funcionando en memoria */
  }
}

/** Estado del carrito de un restaurante + acciones. */
export function useCart(slug: string) {
  const [lines, setLines] = useState<CartLine[]>(() => readCart(slug))

  // Guardar en cada cambio.
  useEffect(() => writeCart(slug, lines), [slug, lines])

  // Si el carrito cambia en otra pestaña de la misma tienda, se sincroniza.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(slug)) setLines(readCart(slug))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [slug])

  /** Agrega un producto. Devuelve false si el carrito ya tiene el máximo de líneas. */
  const add = useCallback(
    (productId: string, optionIds: string[], quantity: number): boolean => {
      const key = lineKey(productId, optionIds)
      const exists = lines.some((l) => lineKey(l.productId, l.optionIds) === key)
      // Se decide con el estado actual (no dentro de setLines, que React puede ejecutar después).
      if (!exists && lines.length >= MAX_LINES) return false
      setLines((prev) => {
        const existing = prev.find((l) => lineKey(l.productId, l.optionIds) === key)
        if (existing) {
          return prev.map((l) => (l === existing ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l))
        }
        return [...prev, { productId, optionIds, quantity: Math.min(MAX_QUANTITY, quantity) }]
      })
      return true
    },
    [lines],
  )

  /** Cambia la cantidad de una línea (0 o menos la quita). */
  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => lineKey(l.productId, l.optionIds) !== key)
        : prev.map((l) => (lineKey(l.productId, l.optionIds) === key ? { ...l, quantity: Math.min(MAX_QUANTITY, quantity) } : l)),
    )
  }, [])

  /** Deja solo las líneas indicadas (para quitar las que ya no son válidas). */
  const keepOnly = useCallback((keys: Set<string>) => {
    setLines((prev) => prev.filter((l) => keys.has(lineKey(l.productId, l.optionIds))))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  return { lines, add, setQuantity, keepOnly, clear }
}

export type Cart = ReturnType<typeof useCart>

/**
 * Cruza el carrito con el menú actual: calcula precios para mostrar y separa las líneas
 * que ya no se pueden pedir (producto u opción no disponible, reglas cambiadas).
 */
export function resolveCart(lines: CartLine[], menu: PublicMenu) {
  const products = indexProducts(menu)
  const resolved: ResolvedLine[] = []
  let dropped = 0
  for (const line of lines) {
    const product = products.get(line.productId)
    if (!product || validateSelection(product, line.optionIds) !== null) {
      dropped++
      continue
    }
    const price = unitPrice(product, line.optionIds)
    resolved.push({
      ...line,
      key: lineKey(line.productId, line.optionIds),
      product,
      optionsText: optionsLabel(product, line.optionIds),
      unitPrice: price,
      lineTotal: price * line.quantity,
    })
  }
  const subtotal = resolved.reduce((sum, l) => sum + l.lineTotal, 0)
  const count = resolved.reduce((sum, l) => sum + l.quantity, 0)
  return { resolved, dropped, subtotal, count }
}
