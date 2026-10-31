/**
 * Hoja de producto: foto, descripción, opciones y cantidad, con el precio en vivo.
 *
 * Reglas de opciones (las mismas que valida el servidor en create_order):
 *   - Grupo de máx. 1 → se elige con radio (al elegir otra, reemplaza).
 *   - Grupo de máx. > 1 → casillas; al llegar al máximo, las demás se deshabilitan.
 *   - "Agregar" se habilita solo cuando todos los grupos obligatorios están completos.
 *   - Grupos obligatorios de una sola elección arrancan con la primera opción marcada.
 */
import { useId, useState } from 'react'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Sheet } from '@/components/ui/Sheet'
import { groupRuleText, unitPrice, validateSelection, type PublicProduct } from '@/features/store/menu'
import { formatCLP } from '@/lib/format'

type ProductSheetProps = {
  product: PublicProduct | null
  onClose: () => void
  /** Agrega al carrito; devuelve false si no se pudo (carrito lleno). */
  onAdd: (product: PublicProduct, optionIds: string[], quantity: number) => boolean
}

export function ProductSheet({ product, onClose, onAdd }: ProductSheetProps) {
  return (
    <Sheet open={product !== null} onClose={onClose} label={product ? product.name : 'Producto'}>
      {/* key: cada producto parte con su selección por defecto. */}
      {product && <ProductForm key={product.id} product={product} onClose={onClose} onAdd={onAdd} />}
    </Sheet>
  )
}

/** Selección inicial: primera opción en los grupos "elige 1 obligatorio". */
function defaultSelection(product: PublicProduct): Record<string, string[]> {
  return Object.fromEntries(
    product.option_groups.map((g) => [
      g.id,
      g.min_select === 1 && g.max_select === 1 && g.options[0] ? [g.options[0].id] : [],
    ]),
  )
}

function ProductForm({ product, onClose, onAdd }: { product: PublicProduct; onClose: () => void; onAdd: ProductSheetProps['onAdd'] }) {
  const idPrefix = useId()
  const [selection, setSelection] = useState(() => defaultSelection(product))
  const [quantity, setQuantity] = useState(1)
  const [fullCart, setFullCart] = useState(false)

  const optionIds = Object.values(selection).flat()
  const problem = validateSelection(product, optionIds)
  const total = unitPrice(product, optionIds) * quantity

  /** Marca o desmarca una opción respetando el máximo del grupo. */
  function toggle(groupId: string, optionId: string, max: number) {
    setSelection((prev) => {
      const current = prev[groupId] ?? []
      if (max === 1) return { ...prev, [groupId]: current.includes(optionId) ? current : [optionId] }
      if (current.includes(optionId)) return { ...prev, [groupId]: current.filter((id) => id !== optionId) }
      if (current.length >= max) return prev
      return { ...prev, [groupId]: [...current, optionId] }
    })
  }

  function add() {
    if (problem) return
    if (onAdd(product, optionIds, quantity)) onClose()
    else setFullCart(true)
  }

  return (
    <div className="flex max-h-[92dvh] flex-col sm:max-h-[85dvh]">
      <div className="relative overflow-y-auto">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="h-6" />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow"
        >
          ✕
        </button>

        <div className="space-y-6 px-5 pb-6 pt-4">
          <div>
            <h2 className="pr-10 text-xl font-bold text-zinc-900">{product.name}</h2>
            {product.description && <p className="mt-2 text-zinc-600">{product.description}</p>}
            <p className="mt-2 font-semibold text-zinc-900">{formatCLP(product.price)}</p>
          </div>

          {product.option_groups.map((g) => {
            const selected = selection[g.id] ?? []
            const single = g.max_select === 1
            const legendId = `${idPrefix}-${g.id}`
            return (
              <fieldset key={g.id} aria-describedby={`${legendId}-rule`}>
                <div className="flex items-baseline justify-between gap-3">
                  <legend className="font-semibold text-zinc-900">{g.name}</legend>
                  <span
                    id={`${legendId}-rule`}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      g.min_select > 0 && selected.length < g.min_select ? 'bg-amber-100 text-amber-900' : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {groupRuleText(g)}
                  </span>
                </div>
                <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                  {g.options.map((o) => {
                    const checked = selected.includes(o.id)
                    const disabled = !single && !checked && selected.length >= g.max_select
                    return (
                      <label
                        key={o.id}
                        className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <input
                          type={single ? 'radio' : 'checkbox'}
                          name={legendId}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(g.id, o.id, g.max_select)}
                          className="size-5 accent-[var(--brand)]"
                        />
                        <span className="flex-1 text-zinc-800">{o.name}</span>
                        {o.extra_price > 0 && <span className="text-sm text-zinc-600">+ {formatCLP(o.extra_price)}</span>}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>
      </div>

      {/* Pie fijo: cantidad + botón con el total */}
      <div className="border-t border-zinc-200 bg-white px-5 py-4">
        {problem && <p className="mb-2 text-sm text-amber-800">{problem}</p>}
        {fullCart && <p className="mb-2 text-sm text-red-600">Tu carrito llegó al máximo de productos distintos.</p>}
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} itemName={product.name} />
          <button
            type="button"
            onClick={add}
            disabled={problem !== null}
            className="flex min-h-12 flex-1 items-center justify-between gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-contrast disabled:opacity-50"
          >
            <span>Agregar</span>
            <span className="tabular-nums">{formatCLP(total)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
