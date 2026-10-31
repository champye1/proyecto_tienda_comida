/**
 * Modal para crear o editar una categoría del menú (ej. "Pizzas", "Bebidas").
 * Al editar se puede además ocultarla de la tienda sin borrarla (is_active).
 */
import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { InputField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { menuApi, useMenuMutation, type Category } from '@/features/menu/api'
import { categorySchema, type CategoryValues } from '@/features/menu/schemas'
import { dbErrorMessage } from '@/lib/errors'
import { fieldErrors, type FieldErrors } from '@/lib/forms'

type CategoryFormModalProps = {
  rid: string
  open: boolean
  onClose: () => void
  /** Categoría a editar; sin ella el modal crea una nueva. */
  category?: Category
}

export function CategoryFormModal({ rid, open, onClose, category }: CategoryFormModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={category ? 'Editar categoría' : 'Nueva categoría'}>
      {/* El formulario se monta al abrir: parte con los datos actuales cada vez. */}
      <CategoryForm rid={rid} category={category} onDone={onClose} />
    </Modal>
  )
}

function CategoryForm({ rid, category, onDone }: { rid: string; category?: Category; onDone: () => void }) {
  const [values, setValues] = useState<CategoryValues>({
    name: category?.name ?? '',
    is_active: category?.is_active ?? true,
  })
  const [errors, setErrors] = useState<FieldErrors<CategoryValues>>({})
  const save = useMenuMutation(rid, (v: CategoryValues) =>
    category ? menuApi.updateCategory(rid, { id: category.id, ...v }) : menuApi.createCategory(rid, v),
  )

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = categorySchema.safeParse(values)
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
        label="Nombre"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        error={errors.name}
        placeholder="Ej: Pizzas"
        autoFocus
      />
      {category && (
        <div>
          <Switch
            checked={values.is_active}
            onChange={(is_active) => setValues((v) => ({ ...v, is_active }))}
            label="Visible en la tienda"
            showLabel
          />
          <p className="text-sm text-zinc-500">Si la ocultas, sus productos no aparecen en la tienda.</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {category ? 'Guardar' : 'Crear categoría'}
        </Button>
      </div>
    </form>
  )
}
