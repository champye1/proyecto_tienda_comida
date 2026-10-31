-- =============================================================================
-- 5. Funciones RPC de negocio
--
-- Todas SECURITY DEFINER con search_path = '' y nombres calificados.
-- Validan permisos por su cuenta (no dependen de RLS) y devuelven errores en español.
-- Códigos de error usados:
--   42501 permiso denegado · P0002 no encontrado · 22023 dato inválido
--   23505 duplicado        · P0001 regla de negocio
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Formato CLP para mensajes de error: 12990 → "$12.990"
-- -----------------------------------------------------------------------------
create function public.format_clp(p_amount bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$' || replace(to_char(p_amount, 'FM999,999,999,999'), ',', '.');
$$;

-- -----------------------------------------------------------------------------
-- create_restaurant: crea restaurante + owner + contador en una transacción
-- -----------------------------------------------------------------------------
create function public.create_restaurant(
  p_name        text,
  p_slug        text,
  p_phone       text default null,
  p_address     text default null,
  p_description text default null
)
returns public.restaurants
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := (select auth.uid());
  v_name       text := btrim(coalesce(p_name, ''));
  v_slug       text := lower(btrim(coalesce(p_slug, '')));
  v_phone      text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g'), '');
  v_address    text := nullif(btrim(coalesce(p_address, '')), '');
  v_desc       text := nullif(btrim(coalesce(p_description, '')), '');
  v_restaurant public.restaurants;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para crear un restaurante' using errcode = '42501';
  end if;

  if char_length(v_name) not between 2 and 100 then
    raise exception 'El nombre debe tener entre 2 y 100 caracteres' using errcode = '22023';
  end if;

  if char_length(v_slug) not between 3 and 50 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'La dirección web solo puede tener letras minúsculas, números y guiones (entre 3 y 50 caracteres)'
      using errcode = '22023';
  end if;

  if v_phone is not null and v_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception 'El teléfono no es válido' using errcode = '22023';
  end if;

  if char_length(coalesce(v_address, '')) > 200 then
    raise exception 'La dirección no puede superar los 200 caracteres' using errcode = '22023';
  end if;

  if char_length(coalesce(v_desc, '')) > 500 then
    raise exception 'La descripción no puede superar los 500 caracteres' using errcode = '22023';
  end if;

  begin
    insert into public.restaurants (slug, name, phone, address, description)
    values (v_slug, v_name, v_phone, v_address, v_desc)
    returning * into v_restaurant;
  exception when unique_violation then
    raise exception 'La dirección "%" ya está en uso. Elige otra.', v_slug using errcode = '23505';
  end;

  insert into public.restaurant_members (restaurant_id, user_id, role)
  values (v_restaurant.id, v_user_id, 'owner');

  insert into public.order_counters (restaurant_id, last_number)
  values (v_restaurant.id, 0);

  return v_restaurant;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_order: el cliente envía SOLO ids y cantidades. Todo precio sale de la base.
--
-- p_items: [{ "product_id": uuid, "quantity": 1..99, "option_ids": [uuid, ...] }, ...]
-- Cualquier otra clave (p. ej. "price") se ignora.
-- -----------------------------------------------------------------------------
create function public.create_order(
  p_restaurant_slug text,
  p_customer_name   text,
  p_customer_phone  text,
  p_type            public.order_type,
  p_address         text,
  p_notes           text,
  p_payment_method  public.payment_method,
  p_items           jsonb
)
returns table (order_id uuid, order_number integer, total integer, tracking_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  c_max_items  constant integer := 50;
  c_max_total  constant bigint  := 50000000;
  v_restaurant   public.restaurants;
  v_name         text := btrim(coalesce(p_customer_name, ''));
  v_phone        text := regexp_replace(coalesce(p_customer_phone, ''), '[\s().-]', '', 'g');
  v_address      text := nullif(btrim(coalesce(p_address, '')), '');
  v_notes        text := nullif(btrim(coalesce(p_notes, '')), '');
  v_item         jsonb;
  v_product_id   uuid;
  v_quantity     integer;
  v_option_ids   uuid[];
  v_product      record;
  v_group        record;
  v_extra        bigint;
  v_selected     jsonb;
  v_unit_price   bigint;
  v_lines        jsonb := '[]'::jsonb;
  v_subtotal     bigint := 0;
  v_delivery_fee integer;
  v_order_id     uuid := gen_random_uuid();
  v_created_at   timestamptz := now();
  v_number       integer;
  v_token        text;
begin
  -- Restaurante -----------------------------------------------------------------
  select r.* into v_restaurant
  from public.restaurants r
  where r.slug = lower(btrim(coalesce(p_restaurant_slug, '')))
    and r.is_active;

  if not found then
    raise exception 'Restaurante no encontrado' using errcode = 'P0002';
  end if;

  if not v_restaurant.is_open then
    raise exception 'El restaurante está cerrado y no está recibiendo pedidos' using errcode = 'P0001';
  end if;

  -- Datos del cliente y tipo de pedido ---------------------------------------------
  if p_type is null then
    raise exception 'Debes elegir retiro o delivery' using errcode = '22023';
  end if;

  if p_type = 'delivery' and not v_restaurant.delivery_enabled then
    raise exception 'Este restaurante no ofrece delivery' using errcode = 'P0001';
  end if;

  if p_type = 'pickup' and not v_restaurant.pickup_enabled then
    raise exception 'Este restaurante no ofrece retiro en el local' using errcode = 'P0001';
  end if;

  if p_type = 'delivery' and char_length(coalesce(v_address, '')) < 5 then
    raise exception 'La dirección es obligatoria para pedidos con delivery' using errcode = '22023';
  end if;

  if p_type = 'pickup' then
    v_address := null;
  end if;

  if char_length(coalesce(v_address, '')) > 200 then
    raise exception 'La dirección no puede superar los 200 caracteres' using errcode = '22023';
  end if;

  if char_length(v_name) not between 2 and 80 then
    raise exception 'Ingresa tu nombre (entre 2 y 80 caracteres)' using errcode = '22023';
  end if;

  if v_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception 'Ingresa un teléfono válido' using errcode = '22023';
  end if;

  if char_length(coalesce(v_notes, '')) > 500 then
    raise exception 'Las notas no pueden superar los 500 caracteres' using errcode = '22023';
  end if;

  if p_payment_method is null then
    raise exception 'Debes elegir un método de pago' using errcode = '22023';
  end if;

  -- Ítems ----------------------------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > c_max_items then
    raise exception 'Un pedido puede tener como máximo % productos', c_max_items using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      if jsonb_typeof(v_item) <> 'object' then
        raise invalid_parameter_value;
      end if;
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity   := (v_item ->> 'quantity')::integer;
      v_option_ids := array(
        select jsonb_array_elements_text(coalesce(v_item -> 'option_ids', '[]'::jsonb))::uuid
      );
    exception
      when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
        raise exception 'El formato de los productos del pedido no es válido' using errcode = '22023';
    end;

    if v_product_id is null then
      raise exception 'El formato de los productos del pedido no es válido' using errcode = '22023';
    end if;

    if v_quantity is null or v_quantity not between 1 and 99 then
      raise exception 'La cantidad de cada producto debe estar entre 1 y 99' using errcode = '22023';
    end if;

    if cardinality(v_option_ids) <> (select count(distinct x) from unnest(v_option_ids) as x) then
      raise exception 'Hay opciones repetidas en el pedido' using errcode = '22023';
    end if;

    -- El producto debe ser de ESTE restaurante.
    select p.id, p.name, p.price, p.is_available, c.is_active as category_active
      into v_product
    from public.products p
    join public.categories c on c.restaurant_id = p.restaurant_id and c.id = p.category_id
    where p.id = v_product_id
      and p.restaurant_id = v_restaurant.id;

    if not found then
      raise exception 'Uno de los productos no pertenece a este restaurante' using errcode = 'P0001';
    end if;

    if not v_product.is_available or not v_product.category_active then
      raise exception 'El producto "%" no está disponible', v_product.name using errcode = 'P0001';
    end if;

    -- Cada opción elegida debe pertenecer a un grupo de ESTE producto y estar disponible.
    if exists (
      select 1
      from unnest(v_option_ids) as sel(id)
      where not exists (
        select 1
        from public.options o
        join public.option_groups g on g.id = o.option_group_id
        where o.id = sel.id
          and g.product_id = v_product.id
          and o.is_available
      )
    ) then
      raise exception 'Una de las opciones elegidas para "%" no es válida o no está disponible', v_product.name
        using errcode = 'P0001';
    end if;

    -- Cada grupo del producto respeta min_select / max_select.
    for v_group in
      select g.name, g.min_select, g.max_select,
             (select count(*) from public.options o
               where o.option_group_id = g.id and o.id = any (v_option_ids)) as selected
      from public.option_groups g
      where g.product_id = v_product.id
      order by g.position
    loop
      if v_group.selected < v_group.min_select then
        raise exception 'Debes elegir al menos % opción(es) en "%" para "%"',
          v_group.min_select, v_group.name, v_product.name using errcode = 'P0001';
      end if;
      if v_group.selected > v_group.max_select then
        raise exception 'Puedes elegir como máximo % opción(es) en "%" para "%"',
          v_group.max_select, v_group.name, v_product.name using errcode = 'P0001';
      end if;
    end loop;

    -- Precio desde la base: base + extras de las opciones.
    select coalesce(sum(o.extra_price), 0),
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'option_id',   o.id,
                 'group',       g.name,
                 'name',        o.name,
                 'extra_price', o.extra_price
               ) order by g.position, o.position
             ),
             '[]'::jsonb
           )
      into v_extra, v_selected
    from public.options o
    join public.option_groups g on g.id = o.option_group_id
    where o.id = any (v_option_ids);

    v_unit_price := v_product.price + v_extra;
    v_subtotal   := v_subtotal + v_unit_price * v_quantity;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',       v_product.id,
      'product_name',     v_product.name,
      'unit_price',       v_unit_price,
      'quantity',         v_quantity,
      'selected_options', v_selected,
      'line_total',       v_unit_price * v_quantity
    ));
  end loop;

  -- Totales -----------------------------------------------------------------------------
  if v_subtotal < v_restaurant.min_order then
    raise exception 'El pedido mínimo es %. Tu pedido suma %',
      public.format_clp(v_restaurant.min_order), public.format_clp(v_subtotal)
      using errcode = 'P0001';
  end if;

  v_delivery_fee := case when p_type = 'delivery' then v_restaurant.delivery_fee else 0 end;

  if v_subtotal + v_delivery_fee > c_max_total then
    raise exception 'El monto del pedido supera el máximo permitido' using errcode = 'P0001';
  end if;

  -- Número correlativo ----------------------------------------------------------------------
  -- El UPDATE del upsert toma un bloqueo de fila sobre el contador del restaurante: un segundo
  -- pedido simultáneo espera a que esta transacción termine y recibe el número siguiente.
  -- Se hace al final para mantener el bloqueo el menor tiempo posible.
  insert into public.order_counters as oc (restaurant_id, last_number)
  values (v_restaurant.id, 1)
  on conflict (restaurant_id) do update set last_number = oc.last_number + 1
  returning oc.last_number into v_number;

  -- Inserción ---------------------------------------------------------------------------------
  insert into public.orders (
    id, restaurant_id, order_number, customer_name, customer_phone, type, address, notes,
    subtotal, delivery_fee, total, payment_method, created_at
  )
  values (
    v_order_id, v_restaurant.id, v_number, v_name, v_phone, p_type, v_address, v_notes,
    v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee, p_payment_method, v_created_at
  )
  returning orders.tracking_token into v_token;

  insert into public.order_items (
    restaurant_id, order_id, order_created_at, product_id, product_name,
    unit_price, quantity, selected_options, line_total, created_at
  )
  select v_restaurant.id, v_order_id, v_created_at, l.product_id, l.product_name,
         l.unit_price, l.quantity, l.selected_options, l.line_total, v_created_at
  from jsonb_to_recordset(v_lines) as l(
    product_id uuid, product_name text, unit_price integer,
    quantity integer, selected_options jsonb, line_total integer
  );

  order_id       := v_order_id;
  order_number   := v_number;
  total          := (v_subtotal + v_delivery_fee)::integer;
  tracking_token := v_token;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_order_by_token: datos mínimos para la página de seguimiento.
-- Nunca devuelve teléfono, nombre ni dirección del cliente. Token inválido → null.
-- -----------------------------------------------------------------------------
create function public.get_order_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number',   o.order_number,
    'status',         o.status,
    'type',           o.type,
    'payment_method', o.payment_method,
    'subtotal',       o.subtotal,
    'delivery_fee',   o.delivery_fee,
    'total',          o.total,
    'created_at',     o.created_at,
    'updated_at',     o.updated_at,
    'restaurant', jsonb_build_object(
      'name',          r.name,
      'slug',          r.slug,
      'logo_url',      r.logo_url,
      'phone',         r.phone,
      'primary_color', r.primary_color
    ),
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'product_name',     i.product_name,
                 'quantity',         i.quantity,
                 'unit_price',       i.unit_price,
                 'line_total',       i.line_total,
                 'selected_options', i.selected_options
               ) order by i.product_name, i.id
             )
      from public.order_items i
      where i.order_id = o.id
        and i.order_created_at = o.created_at
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where p_token ~ '^[0-9a-f]{48}$'
    and o.tracking_token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- update_order_status: solo miembros del restaurante del pedido.
-- La transición se valida aquí (mensaje claro) y otra vez en el trigger de orders.
-- -----------------------------------------------------------------------------
create function public.update_order_status(
  p_order_id uuid,
  p_status   public.order_status
)
returns public.orders
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'Debes indicar el nuevo estado' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  -- Mismo mensaje si no existe o si es de otro restaurante: no revela pedidos ajenos.
  if not found or not public.is_restaurant_member(v_order.restaurant_id) then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  if v_order.status = p_status then
    return v_order;
  end if;

  if not public.is_valid_order_transition(v_order.status, p_status) then
    raise exception 'No se puede cambiar un pedido de "%" a "%"',
      public.order_status_label(v_order.status), public.order_status_label(p_status)
      using errcode = 'P0001';
  end if;

  update public.orders o
  set status = p_status
  where o.id = p_order_id
  returning o.* into v_order;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke execute on function public.format_clp(bigint) from public, anon, authenticated;
revoke execute on function public.create_restaurant(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb)
  from public, anon, authenticated;
revoke execute on function public.get_order_by_token(text) from public, anon, authenticated;
revoke execute on function public.update_order_status(uuid, public.order_status) from public, anon, authenticated;

grant execute on function public.create_restaurant(text, text, text, text, text) to authenticated;
grant execute on function public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb)
  to anon, authenticated;
grant execute on function public.get_order_by_token(text) to anon, authenticated;
grant execute on function public.update_order_status(uuid, public.order_status) to authenticated;
