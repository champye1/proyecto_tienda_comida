-- =============================================================================
-- 3. Triggers y funciones auxiliares
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'restaurants', 'restaurant_members', 'categories', 'products',
    'option_groups', 'options', 'order_counters', 'orders', 'order_items'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Etiquetas en español para los mensajes de error
-- -----------------------------------------------------------------------------
create function public.order_status_label(p_status public.order_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'pending'   then 'pendiente'
    when 'confirmed' then 'confirmado'
    when 'preparing' then 'en preparación'
    when 'ready'     then 'listo'
    when 'delivered' then 'entregado'
    when 'cancelled' then 'cancelado'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Máquina de estados de un pedido
--
--   pending → confirmed → preparing → ready → delivered
--   Se permite avanzar saltándose pasos (ej. pending → preparing), nunca retroceder.
--   Cualquier estado no final puede pasar a cancelled.
--   delivered y cancelled son finales.
-- -----------------------------------------------------------------------------
create function public.is_valid_order_transition(
  p_from public.order_status,
  p_to   public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from in ('delivered', 'cancelled') then false
    when p_to = 'cancelled' then true
    else array_position(
           array['pending', 'confirmed', 'preparing', 'ready', 'delivered']::public.order_status[], p_to
         ) >
         array_position(
           array['pending', 'confirmed', 'preparing', 'ready', 'delivered']::public.order_status[], p_from
         )
  end;
$$;

-- -----------------------------------------------------------------------------
-- Guardia de UPDATE en orders: aplica a cualquier rol, incluso service_role.
--   * Solo se puede cambiar status (updated_at lo pone el trigger).
--   * El cambio de status debe ser una transición válida.
-- -----------------------------------------------------------------------------
create function public.orders_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Solo se puede modificar el estado del pedido'
      using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status
     and not public.is_valid_order_transition(old.status, new.status) then
    raise exception 'No se puede cambiar un pedido de "%" a "%"',
      public.order_status_label(old.status), public.order_status_label(new.status)
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Nombre con prefijo "a_" para que corra antes que set_updated_at (orden alfabético).
create trigger a_orders_guard_update
  before update on public.orders
  for each row execute function public.orders_guard_update();

-- order_items es un registro histórico: no se modifica nunca.
create function public.prevent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los registros de % no se pueden modificar', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger a_order_items_prevent_update
  before update on public.order_items
  for each row execute function public.prevent_update();

-- -----------------------------------------------------------------------------
-- Funciones auxiliares para RLS
--
-- SECURITY DEFINER: leen restaurant_members sin pasar por su propia RLS
--   (evita recursión y es más rápido).
-- STABLE: Postgres puede reutilizar el resultado dentro de una misma consulta.
-- (select auth.uid()): se evalúa una sola vez por consulta (initPlan).
-- search_path = '' + nombres calificados: inmunes a secuestro de search_path.
-- -----------------------------------------------------------------------------
create function public.is_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members m
    where m.user_id = (select auth.uid())
      and m.restaurant_id = p_restaurant_id
  );
$$;

create function public.is_restaurant_owner(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members m
    where m.user_id = (select auth.uid())
      and m.restaurant_id = p_restaurant_id
      and m.role = 'owner'
  );
$$;

-- Restaurante visible para el público (no suspendido por la plataforma).
create function public.is_restaurant_public(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurants r
    where r.id = p_restaurant_id
      and r.is_active
  );
$$;

-- Ruta de Storage "{restaurant_id}/archivo": ¿el usuario puede gestionar esa carpeta?
-- El CASE garantiza que no se intente convertir a uuid algo que no lo es.
create function public.can_manage_restaurant_file(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_object_name, '/');
begin
  if array_length(v_parts, 1) <> 2
     or v_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(v_parts[2], '') = '' then
    return false;
  end if;

  return public.is_restaurant_member(v_parts[1]::uuid);
end;
$$;
