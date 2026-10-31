-- =============================================================================
-- 10. Gestión del menú desde el panel (etapa 4)
--
--   a) Posición automática: todo elemento nuevo del menú queda al final de su lista.
--   b) reorder_menu_items(): reordenar una lista completa en una sola transacción.
--   c) Imágenes solo del Storage propio: logo_url / image_url deben apuntar a la
--      carpeta del mismo restaurante en el bucket restaurant-images.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- a) Posición automática al final de la lista
--
-- "Hermanos" de cada tabla (elementos de la misma lista):
--   categories    → mismas restaurant_id
--   products      → misma category_id
--   option_groups → mismo product_id
--   options       → mismo option_group_id
-- Así el panel no necesita conocer la lista completa (los productos se cargan paginados)
-- para agregar un elemento al final. La posición que envíe el cliente se ignora.
-- Si un producto cambia de categoría, pasa al final de la nueva categoría.
-- -----------------------------------------------------------------------------
create function public.menu_append_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- En UPDATE (solo existe para products) actúa únicamente si cambió la categoría.
  -- Van anidados a propósito: new.category_id no existe en las otras tablas y PL/pgSQL
  -- fallaría al evaluar la condición si estuviera en el mismo `if` que tg_op.
  if tg_op = 'UPDATE' then
    if new.category_id is not distinct from old.category_id then
      return new;
    end if;
  end if;

  case tg_table_name
    when 'categories' then
      select coalesce(max(position) + 1, 0) into new.position
      from public.categories where restaurant_id = new.restaurant_id;
    when 'products' then
      select coalesce(max(position) + 1, 0) into new.position
      from public.products where category_id = new.category_id and id <> new.id;
    when 'option_groups' then
      select coalesce(max(position) + 1, 0) into new.position
      from public.option_groups where product_id = new.product_id;
    when 'options' then
      select coalesce(max(position) + 1, 0) into new.position
      from public.options where option_group_id = new.option_group_id;
  end case;
  return new;
end;
$$;

create trigger b_categories_append_position before insert on public.categories
  for each row execute function public.menu_append_position();
create trigger b_products_append_position before insert or update of category_id on public.products
  for each row execute function public.menu_append_position();
create trigger b_option_groups_append_position before insert on public.option_groups
  for each row execute function public.menu_append_position();
create trigger b_options_append_position before insert on public.options
  for each row execute function public.menu_append_position();

-- -----------------------------------------------------------------------------
-- b) reorder_menu_items(kind, ids)
--
-- Recibe la lista de ids en el nuevo orden y asigna position = 0, 1, 2… en una sola
-- transacción (dos usuarios reordenando a la vez no dejan posiciones mezcladas).
-- Seguridad:
--   - `kind` se valida contra una lista blanca antes de usarse en SQL dinámico (%I).
--   - Todos los ids deben existir y pertenecer a UN mismo restaurante.
--   - El usuario debe ser miembro de ese restaurante. Si no, el mismo mensaje que
--     "no encontrado" (no revela si los ids existen en otro restaurante).
-- -----------------------------------------------------------------------------
create function public.reorder_menu_items(p_kind text, p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_table       text;
  v_restaurants uuid[];
  v_found       integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  v_table := case p_kind
    when 'categories' then 'categories'
    when 'products' then 'products'
    when 'option_groups' then 'option_groups'
    when 'options' then 'options'
  end;
  if v_table is null then
    raise exception 'Tipo de elemento inválido' using errcode = '22023';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'La lista a ordenar debe tener entre 1 y 500 elementos' using errcode = '22023';
  end if;

  if cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'La lista a ordenar tiene elementos repetidos' using errcode = '22023';
  end if;

  execute format(
    'select array_agg(distinct restaurant_id), count(*) from public.%I where id = any ($1)', v_table
  ) into v_restaurants, v_found using p_ids;

  if v_found <> cardinality(p_ids)
     or cardinality(v_restaurants) <> 1
     or not public.is_restaurant_member(v_restaurants[1]) then
    raise exception 'No se encontraron los elementos a ordenar' using errcode = 'P0002';
  end if;

  execute format(
    'update public.%I as t set position = s.ord - 1
       from unnest($1) with ordinality as s(id, ord)
      where t.id = s.id', v_table
  ) using p_ids;
end;
$$;

-- -----------------------------------------------------------------------------
-- c) Imágenes solo del Storage propio
--
-- La URL debe contener la ruta pública del bucket + la carpeta del MISMO restaurante:
--   …/storage/v1/object/public/restaurant-images/{restaurant_id}/archivo
-- Evita enlazar imágenes externas (rastreo, contenido inapropiado) o de otro local.
-- Defensa adicional: la CSP del frontend solo permite cargar imágenes de nuestro Supabase.
-- -----------------------------------------------------------------------------
alter table public.products
  add constraint products_image_url_own_storage check (
    image_url is null
    or strpos(image_url, '/storage/v1/object/public/restaurant-images/' || restaurant_id::text || '/') > 0
  );

alter table public.restaurants
  add constraint restaurants_logo_url_own_storage check (
    logo_url is null
    or strpos(logo_url, '/storage/v1/object/public/restaurant-images/' || id::text || '/') > 0
  );

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
revoke execute on function public.menu_append_position() from public, anon, authenticated;
revoke execute on function public.reorder_menu_items(text, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_menu_items(text, uuid[]) to authenticated;
