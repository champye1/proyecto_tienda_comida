-- =============================================================================
-- 15. Operación diaria (etapa A): horario de atención, zona horaria y tiempo estimado
--
-- Horario automático
--   * restaurants.opening_hours: horario semanal en JSON (NULL = sin horario, solo el
--     interruptor manual, como antes). Formato: arreglo de 7 días, lunes primero; cada día
--     es una lista de tramos {"open":"HH:MM","close":"HH:MM"} (máx. 3, p. ej. almuerzo y cena).
--     Si "close" es menor o igual que "open", el tramo cruza la medianoche
--     (ej. 19:00–02:00 del viernes sigue abierto el sábado de madrugada).
--   * Abierto de verdad = interruptor manual (is_open) Y dentro del horario.
--     Así, si el dueño olvida cerrar, a las 02:00 dejan de entrar pedidos igual.
--   * La regla vive en la base: el trigger a_orders_opening_hours rechaza pedidos fuera de
--     horario aunque alguien llame a create_order directamente (defensa en profundidad).
--
-- Zona horaria por restaurante
--   * restaurants.timezone: las 3 zonas de Chile. El horario y el reporte de ventas
--     (qué es "hoy") se calculan en la hora del restaurante, no en UTC.
--
-- Tiempo estimado
--   * restaurants.prep_time_minutes: tiempo habitual de preparación (se muestra en la
--     tienda y es la opción por defecto al confirmar).
--   * orders.estimated_ready_at: hora estimada en que el pedido estará listo. Se fija al
--     confirmar (confirm_order) y se puede ajustar mientras está confirmado o en preparación
--     (set_order_estimate). El cliente lo ve en su página de seguimiento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columnas nuevas
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column timezone          text    not null default 'America/Santiago',
  add column opening_hours     jsonb,
  add column prep_time_minutes integer not null default 25,
  -- Las 3 zonas horarias de Chile (continental, Magallanes e Isla de Pascua).
  add constraint restaurants_timezone_allowed
    check (timezone in ('America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter')),
  add constraint restaurants_prep_time_range check (prep_time_minutes between 5 and 240),
  -- Tope de tamaño: el contenido exacto lo valida el trigger de abajo.
  add constraint restaurants_opening_hours_size
    check (opening_hours is null or pg_column_size(opening_hours) <= 4000);

alter table public.orders
  add column estimated_ready_at timestamptz;

-- El dueño edita las columnas nuevas (la RLS sigue exigiendo que sea owner).
grant update (timezone, opening_hours, prep_time_minutes) on public.restaurants to authenticated;

-- -----------------------------------------------------------------------------
-- Validación del horario (trigger: así no hace falta dar EXECUTE a nadie)
-- -----------------------------------------------------------------------------
create function public.restaurants_validate_opening_hours()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_day   jsonb;
  v_slot  jsonb;
begin
  if new.opening_hours is null then
    return new;
  end if;

  if jsonb_typeof(new.opening_hours) <> 'array' or jsonb_array_length(new.opening_hours) <> 7 then
    raise exception 'El horario debe tener los 7 días de la semana' using errcode = '22023';
  end if;

  for v_day in select * from jsonb_array_elements(new.opening_hours) loop
    if jsonb_typeof(v_day) <> 'array' or jsonb_array_length(v_day) > 3 then
      raise exception 'Cada día admite hasta 3 tramos de horario' using errcode = '22023';
    end if;

    for v_slot in select * from jsonb_array_elements(v_day) loop
      if jsonb_typeof(v_slot) <> 'object'
         or (select count(*) from jsonb_object_keys(v_slot)) <> 2
         or coalesce(v_slot ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(v_slot ->> 'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Horario inválido: usa el formato HH:MM' using errcode = '22023';
      end if;

      if v_slot ->> 'open' = v_slot ->> 'close' then
        raise exception 'Un tramo no puede abrir y cerrar a la misma hora' using errcode = '22023';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

create trigger b_restaurants_validate_opening_hours
  before insert or update of opening_hours on public.restaurants
  for each row execute function public.restaurants_validate_opening_hours();

revoke execute on function public.restaurants_validate_opening_hours() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- is_open_at: ¿el local recibe pedidos en este momento?
-- Función pura (no lee tablas): la usan el menú público, el trigger de pedidos y el
-- panel. Por eso anon y authenticated pueden ejecutarla sin riesgo.
-- -----------------------------------------------------------------------------
create function public.is_open_at(
  p_is_open boolean,
  p_hours   jsonb,
  p_tz      text,
  p_at      timestamptz default now()
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_local     timestamp := p_at at time zone coalesce(p_tz, 'America/Santiago');
  v_time      time      := v_local::time;
  v_today     integer   := extract(isodow from v_local)::integer - 1; -- 0 = lunes
  v_yesterday integer   := (v_today + 6) % 7;
  v_slot      jsonb;
  v_open      time;
  v_close     time;
begin
  if not coalesce(p_is_open, false) then
    return false;
  end if;
  if p_hours is null then
    return true; -- sin horario: manda el interruptor manual
  end if;

  -- Tramos de hoy.
  for v_slot in select * from jsonb_array_elements(p_hours -> v_today) loop
    v_open  := (v_slot ->> 'open')::time;
    v_close := (v_slot ->> 'close')::time;
    if v_close > v_open then
      if v_time >= v_open and v_time < v_close then return true; end if;
    elsif v_time >= v_open then
      return true; -- tramo que cruza la medianoche: parte de hoy
    end if;
  end loop;

  -- Tramos de ayer que cruzan la medianoche (ej. viernes 19:00–02:00 → sábado hasta las 02:00).
  for v_slot in select * from jsonb_array_elements(p_hours -> v_yesterday) loop
    v_open  := (v_slot ->> 'open')::time;
    v_close := (v_slot ->> 'close')::time;
    if v_close <= v_open and v_time < v_close then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

revoke execute on function public.is_open_at(boolean, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.is_open_at(boolean, jsonb, text, timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Pedidos fuera de horario: rechazados en la base, para cualquier camino de inserción.
-- Prefijo "a_orders_o…": corre antes que a_orders_rate_limit (orden alfabético).
-- -----------------------------------------------------------------------------
create function public.orders_check_opening_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  select r.* into v_restaurant from public.restaurants r where r.id = new.restaurant_id;

  if not public.is_open_at(v_restaurant.is_open, v_restaurant.opening_hours, v_restaurant.timezone, now()) then
    raise exception 'El local está fuera de su horario de atención y no está recibiendo pedidos'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger a_orders_opening_hours
  before insert on public.orders
  for each row execute function public.orders_check_opening_hours();

revoke execute on function public.orders_check_opening_hours() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Guardia de UPDATE en orders: ahora también admite cambiar estimated_ready_at, pero
-- solo mientras el pedido está confirmado o en preparación.
-- -----------------------------------------------------------------------------
create or replace function public.orders_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'status' - 'updated_at' - 'estimated_ready_at')
     is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'estimated_ready_at') then
    raise exception 'Solo se puede modificar el estado del pedido'
      using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status
     and not public.is_valid_order_transition(old.status, new.status) then
    raise exception 'No se puede cambiar un pedido de "%" a "%"',
      public.order_status_label(old.status), public.order_status_label(new.status)
      using errcode = 'P0001';
  end if;

  if new.estimated_ready_at is distinct from old.estimated_ready_at
     and new.status not in ('confirmed', 'preparing') then
    raise exception 'El tiempo estimado solo se puede indicar en pedidos confirmados o en preparación'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- confirm_order: confirma un pedido nuevo con su tiempo estimado (una sola operación).
-- set_order_estimate: ajusta el tiempo ("+10 min") de un pedido en curso.
-- -----------------------------------------------------------------------------
create function public.confirm_order(p_order_id uuid, p_ready_minutes integer)
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

  if p_ready_minutes is null or p_ready_minutes not between 1 and 240 then
    raise exception 'El tiempo estimado debe estar entre 1 y 240 minutos' using errcode = '22023';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id for update;

  -- Mismo mensaje si no existe o si es de otro restaurante: no revela pedidos ajenos.
  if not found or not public.is_restaurant_member(v_order.restaurant_id) then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Este pedido ya no está pendiente' using errcode = 'P0001';
  end if;

  update public.orders o
  set status = 'confirmed',
      estimated_ready_at = now() + make_interval(mins => p_ready_minutes)
  where o.id = p_order_id
  returning o.* into v_order;

  return v_order;
end;
$$;

create function public.set_order_estimate(p_order_id uuid, p_ready_minutes integer)
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

  if p_ready_minutes is null or p_ready_minutes not between 1 and 240 then
    raise exception 'El tiempo estimado debe estar entre 1 y 240 minutos' using errcode = '22023';
  end if;

  select o.* into v_order from public.orders o where o.id = p_order_id for update;

  if not found or not public.is_restaurant_member(v_order.restaurant_id) then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  if v_order.status not in ('confirmed', 'preparing') then
    raise exception 'El tiempo estimado solo se puede cambiar en pedidos confirmados o en preparación'
      using errcode = 'P0001';
  end if;

  update public.orders o
  set estimated_ready_at = now() + make_interval(mins => p_ready_minutes)
  where o.id = p_order_id
  returning o.* into v_order;

  return v_order;
end;
$$;

revoke execute on function public.confirm_order(uuid, integer) from public, anon, authenticated;
revoke execute on function public.set_order_estimate(uuid, integer) from public, anon, authenticated;
grant execute on function public.confirm_order(uuid, integer) to authenticated;
grant execute on function public.set_order_estimate(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Aviso en vivo al cliente: también cuando cambia el tiempo estimado (el mensaje sigue
-- siendo solo el estado; la tienda vuelve a consultar el pedido completo).
-- -----------------------------------------------------------------------------
drop trigger orders_broadcast_status on public.orders;
create trigger orders_broadcast_status
  after update of status, estimated_ready_at on public.orders
  for each row
  when (old.status is distinct from new.status
        or old.estimated_ready_at is distinct from new.estimated_ready_at)
  execute function public.orders_broadcast_status();

-- -----------------------------------------------------------------------------
-- get_order_by_token: + tiempo estimado y zona horaria del restaurante (para mostrar la
-- hora local). Sigue sin devolver datos personales.
-- -----------------------------------------------------------------------------
create or replace function public.get_order_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number',       o.order_number,
    'status',             o.status,
    'type',               o.type,
    'payment_method',     o.payment_method,
    'subtotal',           o.subtotal,
    'delivery_fee',       o.delivery_fee,
    'total',              o.total,
    'created_at',         o.created_at,
    'updated_at',         o.updated_at,
    'estimated_ready_at', o.estimated_ready_at,
    'restaurant', jsonb_build_object(
      'name',          r.name,
      'slug',          r.slug,
      'logo_url',      r.logo_url,
      'phone',         r.phone,
      'primary_color', r.primary_color,
      'timezone',      r.timezone
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
-- get_public_menu: el estado "abierto" ahora considera el horario, y se publican el
-- horario, la zona horaria y el tiempo de preparación (para mostrarlos en la tienda).
-- Mismo cuerpo que la migración 11 en todo lo demás.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_menu(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  perform set_config(
    'response.headers',
    '[{"Cache-Control": "public, max-age=30, stale-while-revalidate=120"}]',
    true
  );

  select r.* into v_restaurant
  from public.restaurants r
  where r.slug = lower(btrim(coalesce(p_slug, '')))
    and r.is_active;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'slug',             v_restaurant.slug,
      'name',             v_restaurant.name,
      'description',      v_restaurant.description,
      'logo_url',         v_restaurant.logo_url,
      'primary_color',    v_restaurant.primary_color,
      'phone',            v_restaurant.phone,
      'address',          v_restaurant.address,
      -- Abierto = interruptor manual Y dentro del horario (ver is_open_at).
      'is_open',          public.is_open_at(v_restaurant.is_open, v_restaurant.opening_hours, v_restaurant.timezone, now()),
      -- El interruptor solo: permite decir "abre a las 19:00" (cerrado por horario) o no (cerrado a mano).
      'is_open_manual',   v_restaurant.is_open,
      'delivery_enabled', v_restaurant.delivery_enabled,
      'pickup_enabled',   v_restaurant.pickup_enabled,
      'delivery_fee',     v_restaurant.delivery_fee,
      'min_order',        v_restaurant.min_order,
      'opening_hours',    v_restaurant.opening_hours,
      'timezone',         v_restaurant.timezone,
      'prep_time_minutes', v_restaurant.prep_time_minutes
    ),
    'categories', coalesce((
      select jsonb_agg(cat.obj order by cat.position, cat.created_at)
      from (
        select c.position, c.created_at,
               jsonb_build_object('id', c.id, 'name', c.name, 'products', prods.list) as obj
        from public.categories c
        cross join lateral (
          select coalesce(jsonb_agg(
                   jsonb_build_object(
                     'id',            p.id,
                     'name',          p.name,
                     'description',   p.description,
                     'price',         p.price,
                     'image_url',     p.image_url,
                     'option_groups', coalesce((
                       select jsonb_agg(
                                jsonb_build_object(
                                  'id',         g.id,
                                  'name',       g.name,
                                  'min_select', g.min_select,
                                  'max_select', g.max_select,
                                  'options',    coalesce((
                                    select jsonb_agg(
                                             jsonb_build_object('id', o.id, 'name', o.name, 'extra_price', o.extra_price)
                                             order by o.position, o.created_at)
                                    from public.options o
                                    where o.restaurant_id = v_restaurant.id
                                      and o.option_group_id = g.id
                                      and o.is_available
                                  ), '[]'::jsonb)
                                ) order by g.position, g.created_at)
                       from public.option_groups g
                       where g.restaurant_id = v_restaurant.id
                         and g.product_id = p.id
                     ), '[]'::jsonb)
                   ) order by p.position, p.created_at), '[]'::jsonb) as list
          from public.products p
          where p.restaurant_id = v_restaurant.id
            and p.category_id = c.id
            and p.is_available
            -- Excluye productos imposibles de pedir (grupo obligatorio sin opciones suficientes).
            and not exists (
              select 1
              from public.option_groups g
              where g.restaurant_id = v_restaurant.id
                and g.product_id = p.id
                and g.min_select > (
                  select count(*) from public.options o
                  where o.restaurant_id = v_restaurant.id and o.option_group_id = g.id and o.is_available
                )
            )
        ) prods
        where c.restaurant_id = v_restaurant.id
          and c.is_active
          and prods.list <> '[]'::jsonb  -- categorías sin productos visibles no se muestran
      ) cat
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- get_sales_report: los días se cuentan en la zona horaria de cada restaurante
-- (antes, fija en America/Santiago). Mismo cuerpo que la migración 13 en todo lo demás.
-- -----------------------------------------------------------------------------
create or replace function public.get_sales_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz       text;
  v_start    timestamptz;
  v_end      timestamptz;
  v_hourly   boolean;
begin
  if (select auth.uid()) is null or not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'No tienes acceso a los reportes de este restaurante' using errcode = '42501';
  end if;

  -- Los días se cuentan en la zona horaria del restaurante.
  select r.timezone into v_tz from public.restaurants r where r.id = p_restaurant_id;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;

  if p_to - p_from > 30 then
    raise exception 'El rango máximo del reporte es de 31 días' using errcode = '22023';
  end if;

  -- Medianoche de Chile del primer día → medianoche de Chile del día siguiente al último.
  v_start  := p_from::timestamp at time zone v_tz;
  v_end    := (p_to + 1)::timestamp at time zone v_tz;
  v_hourly := p_from = p_to; -- un solo día: ventas por hora; varios días: por día

  return (
    with o as (
      select *
      from public.orders
      where restaurant_id = p_restaurant_id
        and created_at >= v_start
        and created_at < v_end
    ),
    sold as (select * from o where status <> 'cancelled')
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'timezone', v_tz,
      'revenue', coalesce((select sum(total) from sold), 0),
      'orders', (select count(*) from sold),
      'avg_ticket', coalesce((select round(avg(total))::integer from sold), 0),
      'cancelled', (select count(*) from o where status = 'cancelled'),
      'by_type', jsonb_build_object(
        'delivery', jsonb_build_object('orders', (select count(*) from sold where type = 'delivery'),
                                       'revenue', coalesce((select sum(total) from sold where type = 'delivery'), 0)),
        'pickup',   jsonb_build_object('orders', (select count(*) from sold where type = 'pickup'),
                                       'revenue', coalesce((select sum(total) from sold where type = 'pickup'), 0))
      ),
      'by_payment', jsonb_build_object(
        'cash',     jsonb_build_object('orders', (select count(*) from sold where payment_method = 'cash'),
                                       'revenue', coalesce((select sum(total) from sold where payment_method = 'cash'), 0)),
        'transfer', jsonb_build_object('orders', (select count(*) from sold where payment_method = 'transfer'),
                                       'revenue', coalesce((select sum(total) from sold where payment_method = 'transfer'), 0))
      ),
      -- Serie de tiempo completa (incluye horas/días sin ventas, para que el gráfico no salte huecos).
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('bucket', b.bucket, 'orders', coalesce(s.orders, 0), 'revenue', coalesce(s.revenue, 0)) order by b.bucket), '[]'::jsonb)
        from (
          select g as bucket
          from generate_series(0, case when v_hourly then 23 else p_to - p_from end) as g
        ) b
        left join (
          select case when v_hourly then extract(hour from created_at at time zone v_tz)::integer
                      else ((created_at at time zone v_tz)::date - p_from) end as bucket,
                 count(*) as orders,
                 sum(total) as revenue
          from sold
          group by 1
        ) s on s.bucket = b.bucket
      ),
      'series_unit', case when v_hourly then 'hour' else 'day' end,
      'top_products', (
        select coalesce(jsonb_agg(t order by t.quantity desc, t.revenue desc, t.name), '[]'::jsonb)
        from (
          select i.product_name as name, sum(i.quantity)::integer as quantity, sum(i.line_total)::integer as revenue
          from public.order_items i
          join sold on sold.id = i.order_id and sold.created_at = i.order_created_at
          where i.restaurant_id = p_restaurant_id
          group by i.product_name
          order by 2 desc, 3 desc, 1
          limit 10
        ) t
      )
    )
  );
end;
$$;
