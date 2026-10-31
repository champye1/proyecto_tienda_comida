/**
 * Acceso a datos del menú desde el panel (TanStack Query + Supabase).
 *
 * Todas las consultas filtran por restaurant_id además de la RLS: la RLS impide ver
 * datos ajenos, y el filtro explícito hace que la consulta use los índices compuestos
 * (restaurant_id, …) y no traiga datos de otro restaurante del mismo usuario.
 *
 * Paginación: los productos se cargan de a PRODUCTS_PAGE_SIZE ("Cargar más"); las
 * demás listas tienen un tope (limit) para no traer nunca todo de una vez.
 */
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

export type Category = Tables<'categories'> & { product_count: number }
export type Product = Tables<'products'>
export type Option = Tables<'options'>
export type OptionGroup = Tables<'option_groups'> & { options: Option[] }
/** Tablas que se pueden reordenar con la RPC reorder_menu_items. */
export type ReorderKind = 'categories' | 'products' | 'option_groups' | 'options'

export const PRODUCTS_PAGE_SIZE = 20
const MAX_CATEGORIES = 100
const MAX_GROUPS = 50

/** Query keys del menú. Todas cuelgan de ['menu', restaurantId] para invalidar en bloque. */
export const menuKeys = {
  all: (rid: string) => ['menu', rid] as const,
  categories: (rid: string) => ['menu', rid, 'categories'] as const,
  products: (rid: string, categoryId: string) => ['menu', rid, 'products', categoryId] as const,
  product: (rid: string, productId: string) => ['menu', rid, 'product', productId] as const,
  groups: (rid: string, productId: string) => ['menu', rid, 'groups', productId] as const,
}

// -----------------------------------------------------------------------------
// Consultas
// -----------------------------------------------------------------------------

/** Categorías del restaurante, en orden, con la cantidad de productos de cada una. */
export function categoriesQuery(rid: string) {
  return queryOptions({
    queryKey: menuKeys.categories(rid),
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*, products(count)')
        .eq('restaurant_id', rid)
        .order('position')
        .order('created_at')
        .limit(MAX_CATEGORIES)
      if (error) throw error
      return data.map(({ products, ...c }) => ({ ...c, product_count: products[0]?.count ?? 0 }))
    },
  })
}

/** Productos de una categoría, paginados (cada página = PRODUCTS_PAGE_SIZE). */
export function productsInfiniteQuery(rid: string, categoryId: string) {
  return infiniteQueryOptions({
    queryKey: menuKeys.products(rid, categoryId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Product[]> => {
      const from = pageParam * PRODUCTS_PAGE_SIZE
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', rid)
        .eq('category_id', categoryId)
        .order('position')
        .order('created_at')
        .range(from, from + PRODUCTS_PAGE_SIZE - 1)
      if (error) throw error
      return data
    },
    // Página incompleta = no hay más.
    getNextPageParam: (last, all) => (last.length < PRODUCTS_PAGE_SIZE ? undefined : all.length),
  })
}

/** Un producto del restaurante (null si no existe o es de otro restaurante). */
export function productQuery(rid: string, productId: string) {
  return queryOptions({
    queryKey: menuKeys.product(rid, productId),
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', rid)
        .eq('id', productId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Grupos de opciones de un producto, con sus opciones, todo en orden. */
export function optionGroupsQuery(rid: string, productId: string) {
  return queryOptions({
    queryKey: menuKeys.groups(rid, productId),
    queryFn: async (): Promise<OptionGroup[]> => {
      const { data, error } = await supabase
        .from('option_groups')
        .select('*, options(*)')
        .eq('restaurant_id', rid)
        .eq('product_id', productId)
        .order('position')
        .order('created_at')
        .order('position', { referencedTable: 'options' })
        .order('created_at', { referencedTable: 'options' })
        .limit(MAX_GROUPS)
      if (error) throw error
      return data
    },
  })
}

// -----------------------------------------------------------------------------
// Mutaciones
// -----------------------------------------------------------------------------

/**
 * Escrituras del menú: funciones simples (sin estado) que lanzan el error de Supabase si
 * lo hay. Las pantallas las usan a través de useMenuMutation, que refresca la caché.
 * Todas acotan por restaurant_id además de la RLS (defensa en profundidad).
 */
export const menuApi = {
  async createCategory(rid: string, values: Omit<TablesInsert<'categories'>, 'restaurant_id'>) {
    const { error } = await supabase.from('categories').insert({ ...values, restaurant_id: rid })
    if (error) throw error
  },
  async updateCategory(rid: string, { id, ...values }: TablesUpdate<'categories'> & { id: string }) {
    const { error } = await supabase.from('categories').update(values).eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },
  async deleteCategory(rid: string, id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },

  /** Crea el producto y devuelve su id (para pasar a la edición de opciones). */
  async createProduct(rid: string, values: Omit<TablesInsert<'products'>, 'restaurant_id'>): Promise<string> {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...values, restaurant_id: rid })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  },
  async updateProduct(rid: string, { id, ...values }: TablesUpdate<'products'> & { id: string }) {
    const { error } = await supabase.from('products').update(values).eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },
  async deleteProduct(rid: string, id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },

  async createGroup(rid: string, values: Omit<TablesInsert<'option_groups'>, 'restaurant_id'>) {
    const { error } = await supabase.from('option_groups').insert({ ...values, restaurant_id: rid })
    if (error) throw error
  },
  async updateGroup(rid: string, { id, ...values }: TablesUpdate<'option_groups'> & { id: string }) {
    const { error } = await supabase.from('option_groups').update(values).eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },
  async deleteGroup(rid: string, id: string) {
    const { error } = await supabase.from('option_groups').delete().eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },

  async createOption(rid: string, values: Omit<TablesInsert<'options'>, 'restaurant_id'>) {
    const { error } = await supabase.from('options').insert({ ...values, restaurant_id: rid })
    if (error) throw error
  },
  async updateOption(rid: string, { id, ...values }: TablesUpdate<'options'> & { id: string }) {
    const { error } = await supabase.from('options').update(values).eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },
  async deleteOption(rid: string, id: string) {
    const { error } = await supabase.from('options').delete().eq('id', id).eq('restaurant_id', rid)
    if (error) throw error
  },

  /** Guarda un nuevo orden: `ids` es la lista (o el prefijo ya cargado) en el orden nuevo. */
  async reorder(kind: ReorderKind, ids: string[]) {
    const { error } = await supabase.rpc('reorder_menu_items', { p_kind: kind, p_ids: ids })
    if (error) throw error
  },
}

/**
 * Mutación del menú: ejecuta `fn` y, termine bien o mal, recarga las consultas del menú
 * del restaurante para que todas las pantallas muestren el estado real.
 * Uso: const crear = useMenuMutation(rid, (v: Valores) => menuApi.createCategory(rid, v))
 */
export function useMenuMutation<TArgs, TResult>(rid: string, fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: menuKeys.all(rid) }),
  })
}

/** Devuelve una copia de la lista con el elemento `index` movido una posición arriba o abajo. */
export function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target]!, copy[index]!]
  return copy
}
