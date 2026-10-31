/**
 * Grupos de opciones de un producto y sus opciones.
 *
 * Ejemplos:
 *   "Tamaño"    → mín. 1, máx. 1 (obligatorio, elegir uno): Mediana +$0, Familiar +$4.000
 *   "Agregados" → mín. 0, máx. 3 (opcional, hasta 3):      Extra queso +$1.000, …
 *
 * La tienda y la RPC create_order hacen respetar estos mínimos/máximos. Si un grupo
 * obligatorio no tiene suficientes opciones disponibles, el producto no se puede pedir:
 * se muestra un aviso para que el restaurante lo corrija.
 */
import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InputField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { formatPriceInput, PriceField } from '@/components/ui/PriceField'
import { Switch } from '@/components/ui/Switch'
import {
  menuApi,
  menuKeys,
  moveItem,
  optionGroupsQuery,
  useMenuMutation,
  type Option,
  type OptionGroup,
  type ReorderKind,
} from '@/features/menu/api'
import { optionGroupSchema, optionSchema, type OptionGroupValues, type OptionValues } from '@/features/menu/schemas'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { fieldErrors, type FieldErrors } from '@/lib/forms'
import { ReorderButtons } from './ReorderButtons'

/** Regla del grupo en palabras: "Obligatorio · elige 1", "Opcional · hasta 3"… */
function ruleText(min: number, max: number): string {
  if (min === max) return `Obligatorio · elige ${min}`
  if (min === 0) return `Opcional · hasta ${max}`
  return `Elige entre ${min} y ${max}`
}

/** Qué modal está abierto (o ninguno). */
type ModalState =
  | { type: 'group'; group?: OptionGroup }
  | { type: 'option'; groupId: string; option?: Option }
  | { type: 'delete-group'; group: OptionGroup }
  | { type: 'delete-option'; option: Option }
  | null

export function OptionGroupsEditor({ rid, productId }: { rid: string; productId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery(optionGroupsQuery(rid, productId))
  const [modal, setModal] = useState<ModalState>(null)

  const reorder = useMenuMutation(rid, ({ kind, ids }: { kind: ReorderKind; ids: string[] }) => menuApi.reorder(kind, ids))
  const toggleOption = useMenuMutation(rid, (o: { id: string; is_available: boolean }) => menuApi.updateOption(rid, o))
  const deleteGroup = useMenuMutation(rid, (id: string) => menuApi.deleteGroup(rid, id))
  const deleteOption = useMenuMutation(rid, (id: string) => menuApi.deleteOption(rid, id))

  const groups = query.data ?? []
  const key = menuKeys.groups(rid, productId)

  /** Reordena grupos: pantalla al instante + guardado. */
  function moveGroup(index: number, direction: -1 | 1) {
    const next = moveItem(groups, index, direction)
    queryClient.setQueryData(key, next)
    reorder.mutate({ kind: 'option_groups', ids: next.map((g) => g.id) })
  }

  /** Reordena las opciones dentro de un grupo. */
  function moveOption(group: OptionGroup, index: number, direction: -1 | 1) {
    const nextOptions = moveItem(group.options, index, direction)
    queryClient.setQueryData<OptionGroup[]>(key, (old) =>
      old?.map((g) => (g.id === group.id ? { ...g, options: nextOptions } : g)),
    )
    reorder.mutate({ kind: 'options', ids: nextOptions.map((o) => o.id) })
  }

  const closeModal = () => {
    setModal(null)
    deleteGroup.reset()
    deleteOption.reset()
  }

  return (
    <section aria-labelledby="opciones-titulo" className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="opciones-titulo" className="text-lg font-semibold text-zinc-900">
            Opciones
          </h2>
          <p className="mt-1 text-sm text-zinc-600">Tamaños, agregados, salsas… El cliente elige al agregar el producto al carrito.</p>
        </div>
        <Button variant="secondary" onClick={() => setModal({ type: 'group' })}>
          + Agregar grupo
        </Button>
      </div>

      {query.isError && <Alert tone="error">{dbErrorMessage(query.error)}</Alert>}
      {(reorder.isError || toggleOption.isError) && (
        <Alert tone="error">{dbErrorMessage(reorder.error ?? toggleOption.error)}</Alert>
      )}

      {query.isPending ? (
        <div className="h-24 animate-pulse rounded-xl bg-zinc-100" />
      ) : groups.length === 0 ? (
        <p className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">
          Este producto no tiene opciones. Si se vende siempre igual, no necesitas agregar nada.
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map((g, gi) => {
            const available = g.options.filter((o) => o.is_available).length
            return (
              <li key={g.id} className="rounded-xl border border-zinc-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900">{g.name}</p>
                    <p className="text-sm text-zinc-500">{ruleText(g.min_select, g.max_select)}</p>
                  </div>
                  <div className="flex items-center">
                    <ReorderButtons
                      label={`el grupo ${g.name}`}
                      onUp={() => moveGroup(gi, -1)}
                      onDown={() => moveGroup(gi, 1)}
                      isFirst={gi === 0}
                      isLast={gi === groups.length - 1}
                      disabled={reorder.isPending}
                    />
                    <Button variant="ghost" onClick={() => setModal({ type: 'group', group: g })}>
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setModal({ type: 'delete-group', group: g })}>
                      Eliminar
                    </Button>
                  </div>
                </div>

                {/* Aviso: un grupo obligatorio sin opciones suficientes bloquea la venta. */}
                {available < g.min_select && (
                  <div className="px-3 pt-3">
                    <Alert tone="error">
                      Este grupo exige elegir {g.min_select} y solo hay {available} opción{available === 1 ? '' : 'es'} disponible
                      {available === 1 ? '' : 's'}: tus clientes no podrán pedir este producto.
                    </Alert>
                  </div>
                )}

                <ul className="divide-y divide-zinc-100">
                  {g.options.map((o, oi) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap">
                      <div className="min-w-[9rem] flex-1">
                        <p className={`truncate text-sm font-medium ${o.is_available ? 'text-zinc-900' : 'text-zinc-500 line-through'}`}>
                          {o.name}
                        </p>
                        <p className="text-sm text-zinc-500">{o.extra_price > 0 ? `+ ${formatCLP(o.extra_price)}` : 'Sin costo extra'}</p>
                      </div>
                      <Switch
                        checked={o.is_available}
                        onChange={(is_available) => toggleOption.mutate({ id: o.id, is_available })}
                        label={`${o.name} disponible`}
                        disabled={toggleOption.isPending}
                      />
                      <ReorderButtons
                        label={o.name}
                        onUp={() => moveOption(g, oi, -1)}
                        onDown={() => moveOption(g, oi, 1)}
                        isFirst={oi === 0}
                        isLast={oi === g.options.length - 1}
                        disabled={reorder.isPending}
                      />
                      <Button variant="ghost" onClick={() => setModal({ type: 'option', groupId: g.id, option: o })}>
                        Editar
                      </Button>
                      <Button variant="ghost" onClick={() => setModal({ type: 'delete-option', option: o })}>
                        Eliminar
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="p-2">
                  <Button variant="ghost" onClick={() => setModal({ type: 'option', groupId: g.id })}>
                    + Agregar opción
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Crear / editar grupo */}
      <Modal open={modal?.type === 'group'} onClose={closeModal} title={modal?.type === 'group' && modal.group ? 'Editar grupo' : 'Nuevo grupo de opciones'}>
        {modal?.type === 'group' && <GroupForm rid={rid} productId={productId} group={modal.group} onDone={closeModal} />}
      </Modal>

      {/* Crear / editar opción */}
      <Modal open={modal?.type === 'option'} onClose={closeModal} title={modal?.type === 'option' && modal.option ? 'Editar opción' : 'Nueva opción'}>
        {modal?.type === 'option' && <OptionForm rid={rid} groupId={modal.groupId} option={modal.option} onDone={closeModal} />}
      </Modal>

      <ConfirmModal
        open={modal?.type === 'delete-group'}
        title="Eliminar grupo"
        confirmLabel="Eliminar"
        loading={deleteGroup.isPending}
        error={deleteGroup.isError ? dbErrorMessage(deleteGroup.error) : null}
        onClose={closeModal}
        onConfirm={() => modal?.type === 'delete-group' && deleteGroup.mutate(modal.group.id, { onSuccess: closeModal })}
      >
        <p>¿Eliminar el grupo <strong>{modal?.type === 'delete-group' && modal.group.name}</strong> y todas sus opciones?</p>
      </ConfirmModal>

      <ConfirmModal
        open={modal?.type === 'delete-option'}
        title="Eliminar opción"
        confirmLabel="Eliminar"
        loading={deleteOption.isPending}
        error={deleteOption.isError ? dbErrorMessage(deleteOption.error) : null}
        onClose={closeModal}
        onConfirm={() => modal?.type === 'delete-option' && deleteOption.mutate(modal.option.id, { onSuccess: closeModal })}
      >
        <p>¿Eliminar la opción <strong>{modal?.type === 'delete-option' && modal.option.name}</strong>?</p>
      </ConfirmModal>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Formularios de los modales
// -----------------------------------------------------------------------------

/** Atajos para las configuraciones más comunes. */
const PRESETS = [
  { label: 'Obligatorio, elegir 1', min: 1, max: 1 },
  { label: 'Opcional, hasta 3', min: 0, max: 3 },
] as const

function GroupForm({ rid, productId, group, onDone }: { rid: string; productId: string; group?: OptionGroup; onDone: () => void }) {
  const [values, setValues] = useState<OptionGroupValues>({
    name: group?.name ?? '',
    min_select: String(group?.min_select ?? 1),
    max_select: String(group?.max_select ?? 1),
  })
  const [errors, setErrors] = useState<FieldErrors<OptionGroupValues>>({})
  const save = useMenuMutation(rid, (v: { name: string; min_select: number; max_select: number }) =>
    group ? menuApi.updateGroup(rid, { id: group.id, ...v }) : menuApi.createGroup(rid, { product_id: productId, ...v }),
  )

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = optionGroupSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    save.mutate(parsed.data, { onSuccess: onDone })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {save.isError && <Alert tone="error">{dbErrorMessage(save.error)}</Alert>}
      <InputField
        label="Nombre del grupo"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        error={errors.name}
        placeholder="Ej: Tamaño, Agregados, Salsas"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setValues((v) => ({ ...v, min_select: String(p.min), max_select: String(p.max) }))}
            className="min-h-10 rounded-full border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Mínimo a elegir"
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={String(values.min_select)}
          onChange={(e) => setValues((v) => ({ ...v, min_select: e.target.value }))}
          error={errors.min_select}
          hint="0 = opcional"
        />
        <InputField
          label="Máximo a elegir"
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          value={String(values.max_select)}
          onChange={(e) => setValues((v) => ({ ...v, max_select: e.target.value }))}
          error={errors.max_select}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {group ? 'Guardar' : 'Crear grupo'}
        </Button>
      </div>
    </form>
  )
}

function OptionForm({ rid, groupId, option, onDone }: { rid: string; groupId: string; option?: Option; onDone: () => void }) {
  const [values, setValues] = useState<OptionValues>({
    name: option?.name ?? '',
    extra_price: option ? formatPriceInput(String(option.extra_price)) : '',
  })
  const [errors, setErrors] = useState<FieldErrors<OptionValues>>({})
  const save = useMenuMutation(rid, (v: { name: string; extra_price: number }) =>
    option ? menuApi.updateOption(rid, { id: option.id, ...v }) : menuApi.createOption(rid, { option_group_id: groupId, ...v }),
  )

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = optionSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    save.mutate(parsed.data, { onSuccess: onDone })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {save.isError && <Alert tone="error">{dbErrorMessage(save.error)}</Alert>}
      <InputField
        label="Nombre de la opción"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        error={errors.name}
        placeholder="Ej: Familiar, Extra queso"
        autoFocus
      />
      <PriceField
        label="Precio extra"
        value={values.extra_price}
        onChange={(extra_price) => setValues((v) => ({ ...v, extra_price }))}
        error={errors.extra_price}
        hint="Déjalo vacío si no tiene costo adicional."
        maxDigits={7}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {option ? 'Guardar' : 'Agregar opción'}
        </Button>
      </div>
    </form>
  )
}
