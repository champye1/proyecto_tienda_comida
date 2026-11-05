-- =============================================================================
-- 19. Pagos sin pasarela (etapa E): transferencia con comprobante y propina
--
-- Transferencia
--   * Datos bancarios del local (titular, RUT, banco, tipo y número de cuenta, email):
--     son públicos a propósito, como los que el local ya comparte en Instagram. Se muestran
--     en el checkout y en el seguimiento solo cuando se elige pagar por transferencia.
--   * orders.payment_status: unpaid → reported (el cliente avisa "ya transferí", con o sin
--     comprobante) → verified (el local revisó su banco). Solo esas transiciones, por RPC.
--   * Comprobante: imagen en un bucket PRIVADO (payment-receipts). La sube la Edge Function
--     upload-receipt (con service_role) después de verificar el token del pedido, el tipo
--     real del archivo y su tamaño; ningún usuario puede escribir en ese bucket directo.
--     Solo los miembros del local la leen, con URL firmada de corta duración.
--
-- Propina: opcional por local (tips_enabled). Un trigger rechaza propinas si el local no
-- las acepta. Los reportes de ventas la excluyen y la informan aparte (es del equipo).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración del restaurante
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column tips_enabled            boolean not null default false,
  add column transfer_holder         text,
  add column transfer_rut            text,
  add column transfer_bank           text,
  add column transfer_account_type   text,
  add column transfer_account_number text,
  add column transfer_email          text,
  add constraint restaurants_transfer_lengths check (
    char_length(coalesce(transfer_holder, '')) <= 100 and char_length(coalesce(transfer_bank, '')) <= 60
    and char_length(coalesce(transfer_account_type, '')) <= 40 and char_length(coalesce(transfer_account_number, '')) <= 30
  ),
  add constraint restaurants_transfer_rut_format check (transfer_rut is null or transfer_rut ~ '^[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9kK]$'),
  add constraint restaurants_transfer_account_format check (transfer_account_number is null or transfer_account_number ~ '^[0-9-]{4,30}$'),
  add constraint restaurants_transfer_email_format check (
    transfer_email is null or (transfer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(transfer_email) <= 254)
  );

grant update (tips_enabled, transfer_holder, transfer_rut, transfer_bank, transfer_account_type, transfer_account_number, transfer_email)
  on public.restaurants to authenticated;

-- -----------------------------------------------------------------------------
-- Estado del pago del pedido
-- -----------------------------------------------------------------------------
alter table public.orders
  add column payment_status       text not null default 'unpaid',
  add column payment_reported_at  timestamptz,
  add column payment_receipt_path text,
  add constraint orders_payment_status check (payment_status in ('unpaid', 'reported', 'verified')),
  add constraint orders_payment_receipt_path_format check (
    payment_receipt_path is null or payment_receipt_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
  );

-- La guardia de orders admite también los campos de pago; quién y cuándo los cambia lo
-- controlan report_payment y verify_payment (no hay UPDATE directo para nadie).
create or replace function public.orders_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'status' - 'updated_at' - 'estimated_ready_at'
                    - 'payment_status' - 'payment_reported_at' - 'payment_receipt_path')
     is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'estimated_ready_at'
                    - 'payment_status' - 'payment_reported_at' - 'payment_receipt_path') then
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

  -- El estado del pago solo avanza (nunca vuelve a "sin pagar" ni deja de estar verificado).
  if new.payment_status is distinct from old.payment_status
     and not ((old.payment_status = 'unpaid' and new.payment_status in ('reported', 'verified'))
              or (old.payment_status = 'reported' and new.payment_status = 'verified')) then
    raise exception 'Cambio de estado de pago no válido' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Propina solo si el local la acepta (cubre cualquier camino de inserción).
create function public.orders_check_tip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tip > 0 and not (select r.tips_enabled from public.restaurants r where r.id = new.restaurant_id) then
    raise exception 'Este local no recibe propinas en línea' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger a_orders_tip_allowed
  before insert on public.orders
  for each row execute function public.orders_check_tip();

revoke execute on function public.orders_check_tip() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- report_payment: el cliente avisa que transfirió (con el token secreto del pedido).
-- La Edge Function upload-receipt la llama con la ruta del comprobante ya subido.
-- -----------------------------------------------------------------------------
create function public.report_payment(p_token text, p_receipt_path text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select o.* into v_order
  from public.orders o
  where coalesce(p_token, '') ~ '^[0-9a-f]{48}$' and o.tracking_token = p_token
  for update;

  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.payment_method <> 'transfer' then
    raise exception 'Este pedido no es por transferencia' using errcode = 'P0001';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido fue cancelado' using errcode = 'P0001';
  end if;
  if v_order.payment_status = 'verified' then
    raise exception 'El restaurante ya confirmó tu pago' using errcode = 'P0001';
  end if;
  -- El comprobante solo puede estar en la carpeta de ESTE pedido.
  if p_receipt_path is not null and p_receipt_path not like v_order.restaurant_id || '/' || v_order.id || '/%' then
    raise exception 'Comprobante no válido' using errcode = '22023';
  end if;

  update public.orders
  set payment_status = 'reported',
      payment_reported_at = now(),
      payment_receipt_path = coalesce(p_receipt_path, payment_receipt_path)
  where id = v_order.id;
end;
$$;

-- El comprobante con ruta solo lo registra service_role (la Edge Function que lo subió);
-- el cliente directo solo puede avisar "ya transferí" sin ruta (ver report_payment_public).
revoke execute on function public.report_payment(text, text) from public, anon, authenticated;
grant execute on function public.report_payment(text, text) to service_role;

create function public.report_payment_public(p_token text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select public.report_payment(p_token, null);
$$;

revoke execute on function public.report_payment_public(text) from public, anon, authenticated;
grant execute on function public.report_payment_public(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- verify_payment: el local confirma que recibió la transferencia (miembros).
-- -----------------------------------------------------------------------------
create function public.verify_payment(p_order_id uuid)
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

  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found or not public.is_restaurant_member(v_order.restaurant_id) then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.payment_status = 'verified' then
    return v_order;
  end if;

  update public.orders o set payment_status = 'verified' where o.id = p_order_id returning o.* into v_order;
  return v_order;
end;
$$;

revoke execute on function public.verify_payment(uuid) from public, anon, authenticated;
grant execute on function public.verify_payment(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Bucket privado de comprobantes
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Solo lectura para los miembros del local (carpeta = restaurant_id). Sin políticas de
-- escritura: subir solo lo hace la Edge Function con service_role.
create policy "payment-receipts: miembros ven los comprobantes de su local"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
  );


-- -----------------------------------------------------------------------------
-- get_order_by_token: + estado del pago, si hay comprobante y datos de transferencia.
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
    'payment_status',     o.payment_status,
    'has_receipt',        o.payment_receipt_path is not null,
    -- Reseña ya enviada (si existe).
    'review', (select jsonb_build_object('rating', rv.rating, 'comment', rv.comment)
               from public.order_reviews rv where rv.order_id = o.id),
    -- Tarjeta de sellos del cliente (solo si el local la tiene activa) y su premio vigente.
    'loyalty', case when r.loyalty_enabled then jsonb_build_object(
      'stamps',       coalesce((select lc.stamps from public.loyalty_cards lc
                                where lc.restaurant_id = o.restaurant_id and lc.phone = o.customer_phone), 0),
      'required',     r.loyalty_stamps,
      'reward_kind',  r.loyalty_reward_kind,
      'reward_value', r.loyalty_reward_value,
      'reward_code',  (select c.code from public.coupons c
                       where c.restaurant_id = o.restaurant_id and c.customer_phone = o.customer_phone
                         and c.code like 'PREMIO-%' and c.is_active and c.uses < coalesce(c.max_uses, 1)
                         and (c.ends_at is null or c.ends_at > now())
                       order by c.created_at desc limit 1)
    ) end,
    'restaurant', jsonb_build_object(
      'name',          r.name,
      'slug',          r.slug,
      'logo_url',      r.logo_url,
      'phone',         r.phone,
      'primary_color', r.primary_color,
      'timezone',      r.timezone,
      'google_review_url', r.google_review_url,
      'transfer', case when r.transfer_holder is not null and r.transfer_bank is not null and r.transfer_account_number is not null
        then jsonb_build_object('holder', r.transfer_holder, 'rut', r.transfer_rut, 'bank', r.transfer_bank,
                                'account_type', r.transfer_account_type, 'account_number', r.transfer_account_number,
                                'email', r.transfer_email) end
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
-- get_public_menu: + propina habilitada y datos de transferencia.
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
      'scheduling_days',  v_restaurant.scheduling_days,
      'tips_enabled',     v_restaurant.tips_enabled,
      'transfer',         case when v_restaurant.transfer_holder is not null and v_restaurant.transfer_bank is not null and v_restaurant.transfer_account_number is not null
        then jsonb_build_object('holder', v_restaurant.transfer_holder, 'rut', v_restaurant.transfer_rut, 'bank', v_restaurant.transfer_bank,
                                'account_type', v_restaurant.transfer_account_type, 'account_number', v_restaurant.transfer_account_number,
                                'email', v_restaurant.transfer_email) end,
      -- Tarjeta de sellos (para el aviso "Junta 10 sellos y gana…"); null si no está activa.
      'loyalty', case when v_restaurant.loyalty_enabled then jsonb_build_object(
        'required', v_restaurant.loyalty_stamps,
        'reward_kind', v_restaurant.loyalty_reward_kind,
        'reward_value', v_restaurant.loyalty_reward_value) end
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

-- -----------------------------------------------------------------------------
-- get_sales_report: ventas SIN propina; la propina se informa aparte ("tips").
-- -----------------------------------------------------------------------------
create or replace function public.get_sales_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz     text;
  v_start  timestamptz;
  v_end    timestamptz;
  v_unit   text;
  v_month0 date := date_trunc('month', p_from)::date;
begin
  if (select auth.uid()) is null or not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'No tienes acceso a los reportes de este restaurante' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;

  if p_to - p_from > 365 then
    raise exception 'El rango máximo del reporte es de un año' using errcode = '22023';
  end if;

  -- Los días se cuentan en la zona horaria del restaurante.
  select r.timezone into v_tz from public.restaurants r where r.id = p_restaurant_id;

  v_start := p_from::timestamp at time zone v_tz;
  v_end   := (p_to + 1)::timestamp at time zone v_tz;
  v_unit  := case when p_from = p_to then 'hour' when p_to - p_from <= 91 then 'day' else 'month' end;

  return (
    with o as (
      select o.*, (o.created_at at time zone v_tz) as local_at
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.created_at >= v_start
        and o.created_at < v_end
    ),
    sold as (select * from o where status <> 'cancelled')
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'timezone', v_tz,
      'revenue', coalesce((select sum(total - tip) from sold), 0),
      'tips', coalesce((select sum(tip) from sold), 0),
      'orders', (select count(*) from sold),
      'avg_ticket', coalesce((select round(avg(total - tip))::integer from sold), 0),
      'cancelled', (select count(*) from o where status = 'cancelled'),
      'by_type', jsonb_build_object(
        'delivery', jsonb_build_object('orders', (select count(*) from sold where type = 'delivery'),
                                       'revenue', coalesce((select sum(total - tip) from sold where type = 'delivery'), 0)),
        'pickup',   jsonb_build_object('orders', (select count(*) from sold where type = 'pickup'),
                                       'revenue', coalesce((select sum(total - tip) from sold where type = 'pickup'), 0))
      ),
      'by_payment', jsonb_build_object(
        'cash',     jsonb_build_object('orders', (select count(*) from sold where payment_method = 'cash'),
                                       'revenue', coalesce((select sum(total - tip) from sold where payment_method = 'cash'), 0)),
        'transfer', jsonb_build_object('orders', (select count(*) from sold where payment_method = 'transfer'),
                                       'revenue', coalesce((select sum(total - tip) from sold where payment_method = 'transfer'), 0))
      ),
      -- Serie completa (incluye horas/días/meses sin ventas, para que el gráfico no salte huecos).
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('bucket', b.bucket, 'orders', coalesce(s.orders, 0), 'revenue', coalesce(s.revenue, 0)) order by b.bucket), '[]'::jsonb)
        from (
          select g as bucket
          from generate_series(0, case v_unit
                                    when 'hour' then 23
                                    when 'day' then p_to - p_from
                                    else ((extract(year from p_to) - extract(year from p_from)) * 12
                                          + extract(month from p_to) - extract(month from p_from))::integer
                                  end) as g
        ) b
        left join (
          select case v_unit
                   when 'hour' then extract(hour from local_at)::integer
                   when 'day' then (local_at::date - p_from)
                   else ((extract(year from local_at) - extract(year from v_month0)) * 12
                         + extract(month from local_at) - extract(month from v_month0))::integer
                 end as bucket,
                 count(*) as orders,
                 sum(total - tip) as revenue
          from sold
          group by 1
        ) s on s.bucket = b.bucket
      ),
      'series_unit', v_unit,
      -- Horas peak: pedidos por hora del día en todo el período (0–23).
      'peak_hours', (
        select jsonb_agg(coalesce(c.n, 0) order by h)
        from generate_series(0, 23) h
        left join (select extract(hour from local_at)::integer as hr, count(*) as n from sold group by 1) c on c.hr = h
      ),
      -- Pedidos por día de la semana (0 = lunes … 6 = domingo).
      'by_weekday', (
        select jsonb_agg(coalesce(c.n, 0) order by d)
        from generate_series(0, 6) d
        left join (select (extract(isodow from local_at)::integer - 1) as wd, count(*) as n from sold group by 1) c on c.wd = d
      ),
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
      ),
      -- Productos publicados que nadie pidió en el período (candidatos a revisar o quitar).
      'unsold_products', (
        select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
        from (
          select p.name
          from public.products p
          where p.restaurant_id = p_restaurant_id
            and p.is_available
            and not exists (
              select 1
              from public.order_items i
              join sold on sold.id = i.order_id and sold.created_at = i.order_created_at
              where i.restaurant_id = p_restaurant_id and i.product_id = p.id
            )
          order by p.name
          limit 20
        ) p
      )
    )
  );
end;
$$;
