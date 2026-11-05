-- =============================================================================
-- 17. Vender más (etapa C): cupones, promociones por horario, destacados, venta sugerida,
--     pedidos programados (y la columna de propina, que usa la etapa E).
--
-- Principio: TODO descuento lo calcula el servidor dentro de create_order. El navegador
-- solo muestra estimaciones; un cliente que manipule precios o cupones no gana nada.
--
-- Promociones (promotions)
--   * Tipo "percent" (1–90 %) o "two_for_one" (2x1: se cobra la mitad de las unidades,
--     redondeando hacia arriba). Aplican a un producto, a una categoría o a todo el menú.
--   * Días de la semana y franja horaria (puede cruzar la medianoche), evaluados en la zona
--     horaria del restaurante con la misma regla del horario de atención (is_open_at).
--   * Si a un producto le sirven varias, se aplica la de mayor descuento. El descuento queda
--     guardado en la línea del pedido (order_items.discount y promotion_name).
--
-- Cupones (coupons)
--   * Porcentaje, monto fijo o envío gratis; mínimo de compra, vigencia, usos máximos y
--     "solo primera compra" (por teléfono). Pueden quedar ligados a un teléfono (premios de
--     fidelización, etapa D). No son legibles desde la API pública: se validan por RPC.
--   * El uso se cuenta con la fila del cupón bloqueada (FOR UPDATE): dos pedidos simultáneos
--     no pueden pasarse del máximo de usos.
--   * check_coupon (pública) devuelve el mismo "Cupón no válido" si no existe o es de otro
--     teléfono, para no revelar cupones personales.
--
-- Pedidos programados: restaurants.scheduling_days (0 = no acepta). La hora debe estar
-- dentro del horario, con al menos el tiempo de preparación de anticipación.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columnas nuevas
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column scheduling_days integer not null default 0,
  add constraint restaurants_scheduling_days_range check (scheduling_days between 0 and 7);
grant update (scheduling_days) on public.restaurants to authenticated;

alter table public.products
  add column is_featured boolean not null default false,
  add column is_upsell   boolean not null default false;
grant insert (is_featured, is_upsell), update (is_featured, is_upsell) on public.products to authenticated;

alter table public.orders
  add column discount      integer not null default 0,
  add column coupon_code   text,
  add column tip           integer not null default 0,
  add column scheduled_for timestamptz,
  add constraint orders_discount_range check (discount >= 0 and discount <= subtotal + delivery_fee),
  add constraint orders_tip_range check (tip between 0 and 1000000),
  add constraint orders_coupon_code_format check (coupon_code is null or coupon_code ~ '^[A-Z0-9_-]{3,20}$'),
  drop constraint orders_total_matches,
  add constraint orders_total_matches check (total = subtotal + delivery_fee - discount + tip);

alter table public.order_items
  add column discount       integer not null default 0,
  add column promotion_name text,
  drop constraint order_items_line_total_matches,
  add constraint order_items_discount_range check (discount between 0 and unit_price * quantity),
  add constraint order_items_line_total_matches check (line_total = unit_price * quantity - discount),
  add constraint order_items_promotion_name_length check (promotion_name is null or char_length(promotion_name) <= 60);

-- -----------------------------------------------------------------------------
-- promotions
-- -----------------------------------------------------------------------------
create table public.promotions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null,
  kind          text not null,
  percent       integer,
  product_id    uuid,
  category_id   uuid,
  days          integer[] not null,
  start_time    time not null,
  end_time      time not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- FKs compuestas: la promoción solo puede apuntar a productos/categorías del MISMO restaurante.
  constraint promotions_product_fkey foreign key (restaurant_id, product_id)
    references public.products (restaurant_id, id) on delete cascade,
  constraint promotions_category_fkey foreign key (restaurant_id, category_id)
    references public.categories (restaurant_id, id) on delete cascade,
  constraint promotions_name_length check (char_length(btrim(name)) between 2 and 60),
  constraint promotions_kind check (kind in ('percent', 'two_for_one')),
  constraint promotions_percent_range check (
    (kind = 'percent' and percent between 1 and 90) or (kind = 'two_for_one' and percent is null)
  ),
  constraint promotions_single_target check (product_id is null or category_id is null),
  constraint promotions_days_valid check (
    cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]
  ),
  constraint promotions_time_range check (start_time <> end_time)
);

create index promotions_restaurant_idx on public.promotions (restaurant_id) where is_active;
create index promotions_product_idx on public.promotions (restaurant_id, product_id);
create index promotions_category_idx on public.promotions (restaurant_id, category_id);

create trigger set_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;

-- Las promociones activas son públicas (se muestran en la tienda). Las gestiona el dueño.
revoke all on public.promotions from anon, authenticated;
grant select on public.promotions to anon, authenticated;
grant insert (restaurant_id, name, kind, percent, product_id, category_id, days, start_time, end_time, is_active),
      update (name, kind, percent, product_id, category_id, days, start_time, end_time, is_active),
      delete
  on public.promotions to authenticated;

create policy "anon: ver promociones activas"
  on public.promotions for select to anon
  using (is_active and public.is_restaurant_public(restaurant_id));
create policy "authenticated: ver promociones activas o propias"
  on public.promotions for select to authenticated
  using ((is_active and public.is_restaurant_public(restaurant_id)) or public.is_restaurant_member(restaurant_id));
create policy "authenticated: owner crea promociones"
  on public.promotions for insert to authenticated
  with check (public.is_restaurant_owner(restaurant_id));
create policy "authenticated: owner edita promociones"
  on public.promotions for update to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));
create policy "authenticated: owner elimina promociones"
  on public.promotions for delete to authenticated
  using (public.is_restaurant_owner(restaurant_id));

-- ¿La promoción rige en este instante? Misma regla que el horario de atención.
create function public.promotion_active_at(p_days integer[], p_start time, p_end time, p_tz text, p_at timestamptz)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.is_open_at(
    true,
    (select jsonb_agg(
              case when d = any (p_days)
                   then jsonb_build_array(jsonb_build_object('open', to_char(p_start, 'HH24:MI'), 'close', to_char(p_end, 'HH24:MI')))
                   else '[]'::jsonb end
              order by d)
     from generate_series(0, 6) d),
    p_tz,
    p_at
  );
$$;

revoke execute on function public.promotion_active_at(integer[], time, time, text, timestamptz) from public, anon, authenticated;
grant execute on function public.promotion_active_at(integer[], time, time, text, timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- coupons
-- -----------------------------------------------------------------------------
create table public.coupons (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  code             text not null,
  kind             text not null,
  value            integer not null default 0,
  min_subtotal     integer not null default 0,
  starts_at        timestamptz,
  ends_at          timestamptz,
  max_uses         integer,
  uses             integer not null default 0,
  first_order_only boolean not null default false,
  customer_phone   text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint coupons_restaurant_code_key unique (restaurant_id, code),
  constraint coupons_code_format check (code ~ '^[A-Z0-9_-]{3,20}$'),
  constraint coupons_kind check (kind in ('percent', 'fixed', 'free_delivery')),
  constraint coupons_value_range check (
    (kind = 'percent' and value between 1 and 100)
    or (kind = 'fixed' and value between 1 and 1000000)
    or (kind = 'free_delivery' and value = 0)
  ),
  constraint coupons_min_subtotal_range check (min_subtotal between 0 and 10000000),
  constraint coupons_dates check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint coupons_max_uses_range check (max_uses is null or max_uses between 1 and 1000000),
  constraint coupons_uses_range check (uses >= 0),
  constraint coupons_customer_phone_format check (customer_phone is null or customer_phone ~ '^\+?[0-9]{8,15}$')
);

create trigger set_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

alter table public.coupons enable row level security;

-- Nadie anónimo lee cupones (se validan por RPC). Miembros los ven; el dueño los gestiona.
-- "uses" no es editable: solo create_order lo incrementa.
revoke all on public.coupons from anon, authenticated;
grant select on public.coupons to authenticated;
grant insert (restaurant_id, code, kind, value, min_subtotal, starts_at, ends_at, max_uses, first_order_only, is_active),
      update (code, kind, value, min_subtotal, starts_at, ends_at, max_uses, first_order_only, is_active),
      delete
  on public.coupons to authenticated;

create policy "authenticated: miembros ven sus cupones"
  on public.coupons for select to authenticated
  using (public.is_restaurant_member(restaurant_id));
create policy "authenticated: owner crea cupones"
  on public.coupons for insert to authenticated
  with check (public.is_restaurant_owner(restaurant_id));
create policy "authenticated: owner edita cupones"
  on public.coupons for update to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));
create policy "authenticated: owner elimina cupones"
  on public.coupons for delete to authenticated
  using (public.is_restaurant_owner(restaurant_id));

-- -----------------------------------------------------------------------------
-- coupon_discount: valida un cupón para un pedido y devuelve el descuento en pesos.
-- Interna (la usan create_order y check_coupon). Lanza P0001 con mensajes para el usuario.
-- -----------------------------------------------------------------------------
create function public.coupon_discount(
  p_coupon       public.coupons,
  p_subtotal     bigint,
  p_delivery_fee integer,
  p_phone        text,
  p_at           timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Cupón personal de otro teléfono: mismo mensaje que si no existiera.
  if p_coupon.id is null or not p_coupon.is_active
     or (p_coupon.customer_phone is not null and p_coupon.customer_phone is distinct from p_phone) then
    raise exception 'Cupón no válido' using errcode = 'P0001';
  end if;
  if p_coupon.starts_at is not null and p_at < p_coupon.starts_at then
    raise exception 'Este cupón todavía no está vigente' using errcode = 'P0001';
  end if;
  if p_coupon.ends_at is not null and p_at >= p_coupon.ends_at then
    raise exception 'Este cupón ya venció' using errcode = 'P0001';
  end if;
  if p_coupon.max_uses is not null and p_coupon.uses >= p_coupon.max_uses then
    raise exception 'Este cupón ya alcanzó su máximo de usos' using errcode = 'P0001';
  end if;
  if p_coupon.kind = 'free_delivery' and coalesce(p_delivery_fee, 0) = 0 then
    raise exception 'Este cupón es de envío gratis: aplica solo a pedidos con delivery' using errcode = 'P0001';
  end if;
  if p_subtotal < p_coupon.min_subtotal then
    raise exception 'Este cupón es para compras desde %', public.format_clp(p_coupon.min_subtotal) using errcode = 'P0001';
  end if;
  if p_coupon.first_order_only then
    if p_phone is null then
      raise exception 'Ingresa tu teléfono para usar este cupón' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.orders o
               where o.restaurant_id = p_coupon.restaurant_id and o.customer_phone = p_phone and o.status <> 'cancelled') then
      raise exception 'Este cupón es solo para tu primera compra' using errcode = 'P0001';
    end if;
  end if;

  return case p_coupon.kind
    when 'percent' then least(round(p_subtotal * p_coupon.value / 100.0), p_subtotal)::integer
    when 'fixed' then least(p_coupon.value, p_subtotal)::integer
    else p_delivery_fee
  end;
end;
$$;

revoke execute on function public.coupon_discount(public.coupons, bigint, integer, text, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- check_coupon: vista previa en el checkout. El total real lo calcula create_order.
-- -----------------------------------------------------------------------------
create function public.check_coupon(
  p_slug         text,
  p_code         text,
  p_subtotal     integer,
  p_delivery_fee integer default 0,
  p_phone        text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coupon public.coupons;
  v_phone  text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g'), '');
  v_discount integer;
begin
  select c.* into v_coupon
  from public.coupons c
  join public.restaurants r on r.id = c.restaurant_id
  where r.slug = lower(btrim(coalesce(p_slug, ''))) and r.is_active
    and c.code = upper(btrim(coalesce(p_code, '')));

  v_discount := public.coupon_discount(v_coupon, greatest(coalesce(p_subtotal, 0), 0), greatest(coalesce(p_delivery_fee, 0), 0), v_phone, now());

  return jsonb_build_object('code', v_coupon.code, 'kind', v_coupon.kind, 'value', v_coupon.value, 'discount', v_discount);
end;
$$;

revoke execute on function public.check_coupon(text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.check_coupon(text, text, integer, integer, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Horario y pedidos programados: el trigger evalúa la hora programada si existe.
-- -----------------------------------------------------------------------------
create or replace function public.orders_check_opening_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  select r.* into v_restaurant from public.restaurants r where r.id = new.restaurant_id;

  if not public.is_open_at(v_restaurant.is_open, v_restaurant.opening_hours, v_restaurant.timezone,
                           coalesce(new.scheduled_for, now())) then
    if new.scheduled_for is not null then
      raise exception 'El local no atiende a la hora programada' using errcode = 'P0001';
    end if;
    raise exception 'El local está fuera de su horario de atención y no está recibiendo pedidos'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_order v2: + cupón, promociones, pedido programado y propina.
-- Se reemplaza la función (cambia la firma); sigue siendo ejecutable solo por service_role
-- (la llama la Edge Function place-order después del CAPTCHA, migración 14).
-- -----------------------------------------------------------------------------
drop function public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb);

create function public.create_order(
  p_restaurant_slug text,
  p_customer_name   text,
  p_customer_phone  text,
  p_type            public.order_type,
  p_address         text,
  p_notes           text,
  p_payment_method  public.payment_method,
  p_items           jsonb,
  p_coupon_code     text        default null,
  p_scheduled_for   timestamptz default null,
  p_tip             integer     default 0
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
  -- Etapa C/E: promociones, cupón, programado y propina.
  v_promo         record;
  v_line_discount bigint;
  v_promo_name    text;
  v_coupon        public.coupons;
  v_coupon_code   text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_discount      integer := 0;
  v_tip           integer := coalesce(p_tip, 0);
  v_total         bigint;
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

  -- Pedido programado: dentro de la ventana permitida y con tiempo para prepararlo.
  -- (Que caiga dentro del horario lo verifica el trigger a_orders_opening_hours.)
  if p_scheduled_for is not null then
    if v_restaurant.scheduling_days = 0 then
      raise exception 'Este local no acepta pedidos programados' using errcode = 'P0001';
    end if;
    if p_scheduled_for < v_created_at + make_interval(mins => v_restaurant.prep_time_minutes) then
      raise exception 'Programa tu pedido con al menos % minutos de anticipación', v_restaurant.prep_time_minutes
        using errcode = '22023';
    end if;
    if p_scheduled_for > v_created_at + make_interval(days => v_restaurant.scheduling_days) then
      raise exception 'Solo puedes programar pedidos hasta % día(s) de anticipación', v_restaurant.scheduling_days
        using errcode = '22023';
    end if;
  end if;

  if v_tip not between 0 and 1000000 then
    raise exception 'La propina no es válida' using errcode = '22023';
  end if;

  if v_coupon_code is not null and v_coupon_code !~ '^[A-Z0-9_-]{3,20}$' then
    raise exception 'Cupón no válido' using errcode = 'P0001';
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
    select p.id, p.name, p.price, p.is_available, p.category_id, c.is_active as category_active
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

    -- Promoción vigente con el mayor descuento para este producto (producto, categoría o todo el menú).
    select pr.name,
           case pr.kind
             when 'percent' then round(v_unit_price * v_quantity * pr.percent / 100.0)
             else v_unit_price * floor(v_quantity / 2)  -- 2x1: se cobra la mitad, redondeando hacia arriba
           end::bigint as amount
      into v_promo
    from public.promotions pr
    where pr.restaurant_id = v_restaurant.id
      and pr.is_active
      and (pr.product_id = v_product.id
           or pr.category_id = v_product.category_id
           or (pr.product_id is null and pr.category_id is null))
      and public.promotion_active_at(pr.days, pr.start_time, pr.end_time, v_restaurant.timezone, v_created_at)
    order by 2 desc
    limit 1;

    if found and v_promo.amount > 0 then
      v_line_discount := v_promo.amount;
      v_promo_name    := v_promo.name;
    else
      v_line_discount := 0;
      v_promo_name    := null;
    end if;

    v_subtotal := v_subtotal + v_unit_price * v_quantity - v_line_discount;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',       v_product.id,
      'product_name',     v_product.name,
      'unit_price',       v_unit_price,
      'quantity',         v_quantity,
      'selected_options', v_selected,
      'discount',         v_line_discount,
      'promotion_name',   v_promo_name,
      'line_total',       v_unit_price * v_quantity - v_line_discount
    ));
  end loop;

  -- Totales -----------------------------------------------------------------------------
  if v_subtotal < v_restaurant.min_order then
    raise exception 'El pedido mínimo es %. Tu pedido suma %',
      public.format_clp(v_restaurant.min_order), public.format_clp(v_subtotal)
      using errcode = 'P0001';
  end if;

  v_delivery_fee := case when p_type = 'delivery' then v_restaurant.delivery_fee else 0 end;

  -- Cupón: fila bloqueada mientras se valida y se cuenta el uso (sin carreras con otro pedido).
  if v_coupon_code is not null then
    select c.* into v_coupon
    from public.coupons c
    where c.restaurant_id = v_restaurant.id and c.code = v_coupon_code
    for update;

    v_discount := public.coupon_discount(v_coupon, v_subtotal, v_delivery_fee, v_phone, v_created_at);
    update public.coupons set uses = uses + 1 where id = v_coupon.id;
  end if;

  v_total := v_subtotal + v_delivery_fee - v_discount + v_tip;

  if v_total > c_max_total then
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
    subtotal, delivery_fee, discount, coupon_code, tip, total, payment_method, scheduled_for, created_at
  )
  values (
    v_order_id, v_restaurant.id, v_number, v_name, v_phone, p_type, v_address, v_notes,
    v_subtotal, v_delivery_fee, v_discount, v_coupon.code, v_tip, v_total, p_payment_method, p_scheduled_for, v_created_at
  )
  returning orders.tracking_token into v_token;

  insert into public.order_items (
    restaurant_id, order_id, order_created_at, product_id, product_name,
    unit_price, quantity, selected_options, discount, promotion_name, line_total, created_at
  )
  select v_restaurant.id, v_order_id, v_created_at, l.product_id, l.product_name,
         l.unit_price, l.quantity, l.selected_options, l.discount, l.promotion_name, l.line_total, v_created_at
  from jsonb_to_recordset(v_lines) as l(
    product_id uuid, product_name text, unit_price integer,
    quantity integer, selected_options jsonb, discount integer, promotion_name text, line_total integer
  );

  order_id       := v_order_id;
  order_number   := v_number;
  total          := v_total::integer;
  tracking_token := v_token;
  return next;
end;
$$;

revoke execute on function public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb, text, timestamptz, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- get_order_by_token: + descuento, cupón, propina, hora programada y promoción por línea.
-- Mismo cuerpo que la migración 15 en todo lo demás.
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
    'discount',           o.discount,
    'coupon_code',        o.coupon_code,
    'tip',                o.tip,
    'scheduled_for',      o.scheduled_for,
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
                 'discount',         i.discount,
                 'promotion_name',   i.promotion_name,
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
-- get_public_menu: + destacados, venta sugerida, promoción vigente por producto y
-- días de anticipación para programar. Mismo cuerpo que la migración 15 en lo demás.
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
      'prep_time_minutes', v_restaurant.prep_time_minutes,
      'scheduling_days',  v_restaurant.scheduling_days
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
                     'is_featured',   p.is_featured,
                     'is_upsell',     p.is_upsell,
                     -- Promoción vigente ahora (la de mayor descuento). create_order la recalcula.
                     'promo', (
                       select jsonb_build_object('name', pr.name, 'kind', pr.kind, 'percent', pr.percent)
                       from public.promotions pr
                       where pr.restaurant_id = v_restaurant.id
                         and pr.is_active
                         and (pr.product_id = p.id or pr.category_id = p.category_id
                              or (pr.product_id is null and pr.category_id is null))
                         and public.promotion_active_at(pr.days, pr.start_time, pr.end_time, v_restaurant.timezone, now())
                       order by case pr.kind when 'percent' then pr.percent else 50 end desc
                       limit 1
                     ),
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
