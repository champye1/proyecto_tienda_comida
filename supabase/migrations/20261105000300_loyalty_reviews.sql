-- =============================================================================
-- 18. Fidelización y reseñas (etapa D)
--
-- Tarjeta de sellos
--   * Cada pedido ENTREGADO suma un sello al teléfono del cliente (trigger en orders). Al
--     completar la tarjeta se reinicia y se genera un cupón personal: ligado a ese teléfono,
--     de un solo uso y con vencimiento (60 días). El cliente lo ve en su página de seguimiento.
--   * Los sellos solo los suma la base: no hay forma de escribirlos desde la API.
--   * Riesgo aceptado: el teléfono no se verifica (no hay SMS), así que alguien podría pedir
--     con el teléfono de otra persona; el premio igual queda ligado a ese teléfono y es de
--     un solo uso. Ver SECURITY.md.
--
-- Recuperar clientes inactivos: create_winback_coupon genera un cupón personal de un solo
-- uso (14 días) para invitar por WhatsApp a quien dejó de pedir. Solo el dueño.
--
-- Reseñas: solo de pedidos entregados, una por pedido, con el token secreto del pedido
-- (submit_review). El comentario es texto plano (React lo escapa al mostrarlo). Si el local
-- configuró su link de Google, a quien pone 5 estrellas se le invita a dejarla allí también.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración del restaurante
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column loyalty_enabled      boolean not null default false,
  add column loyalty_stamps       integer not null default 10,
  add column loyalty_reward_kind  text    not null default 'percent',
  add column loyalty_reward_value integer not null default 20,
  add column google_review_url    text,
  add constraint restaurants_loyalty_stamps_range check (loyalty_stamps between 3 and 20),
  add constraint restaurants_loyalty_reward check (
    (loyalty_reward_kind = 'percent' and loyalty_reward_value between 1 and 100)
    or (loyalty_reward_kind = 'fixed' and loyalty_reward_value between 1 and 1000000)
  ),
  -- Solo https:// (nada de javascript: ni data:), y largo acotado.
  add constraint restaurants_google_review_url_format check (
    google_review_url is null or (google_review_url ~ '^https://[^\s<>"]+$' and char_length(google_review_url) <= 500)
  );

grant update (loyalty_enabled, loyalty_stamps, loyalty_reward_kind, loyalty_reward_value, google_review_url)
  on public.restaurants to authenticated;

-- -----------------------------------------------------------------------------
-- loyalty_cards: sellos por teléfono y restaurante
-- -----------------------------------------------------------------------------
create table public.loyalty_cards (
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  phone          text not null,
  stamps         integer not null default 0,
  rewards_issued integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (restaurant_id, phone),
  constraint loyalty_cards_phone_format check (phone ~ '^\+?[0-9]{8,15}$'),
  constraint loyalty_cards_stamps_range check (stamps >= 0),
  constraint loyalty_cards_rewards_range check (rewards_issued >= 0)
);

create trigger set_updated_at before update on public.loyalty_cards
  for each row execute function public.set_updated_at();

alter table public.loyalty_cards enable row level security;
revoke all on public.loyalty_cards from anon, authenticated;
grant select on public.loyalty_cards to authenticated;

create policy "authenticated: miembros ven las tarjetas de sus clientes"
  on public.loyalty_cards for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- Código aleatorio para cupones generados ("PREMIO-7K2QX9"). Sin 0/O/1/I para dictarlo fácil.
create function public.random_coupon_code(p_prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select p_prefix || '-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '' order by i)
  from extensions.gen_random_bytes(6) b, generate_series(0, 5) i;
$$;

revoke execute on function public.random_coupon_code(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sello por pedido entregado (y premio al completar la tarjeta)
-- -----------------------------------------------------------------------------
create function public.orders_loyalty_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
  v_stamps     integer;
begin
  select r.* into v_restaurant from public.restaurants r where r.id = new.restaurant_id;
  if not v_restaurant.loyalty_enabled then
    return null;
  end if;

  insert into public.loyalty_cards as lc (restaurant_id, phone, stamps)
  values (new.restaurant_id, new.customer_phone, 1)
  on conflict (restaurant_id, phone) do update set stamps = lc.stamps + 1
  returning lc.stamps into v_stamps;

  if v_stamps >= v_restaurant.loyalty_stamps then
    update public.loyalty_cards
    set stamps = 0, rewards_issued = rewards_issued + 1
    where restaurant_id = new.restaurant_id and phone = new.customer_phone;

    insert into public.coupons (restaurant_id, code, kind, value, max_uses, customer_phone, ends_at)
    values (new.restaurant_id, public.random_coupon_code('PREMIO'), v_restaurant.loyalty_reward_kind,
            v_restaurant.loyalty_reward_value, 1, new.customer_phone, now() + interval '60 days');
  end if;
  return null;
end;
$$;

create trigger orders_loyalty_stamp
  after update of status on public.orders
  for each row
  when (new.status = 'delivered' and old.status is distinct from 'delivered')
  execute function public.orders_loyalty_stamp();

revoke execute on function public.orders_loyalty_stamp() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Cupón para recuperar a un cliente inactivo (solo el dueño)
-- -----------------------------------------------------------------------------
create function public.create_winback_coupon(p_restaurant_id uuid, p_phone text, p_percent integer)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := public.random_coupon_code('VUELVE');
begin
  if (select auth.uid()) is null or not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'Solo el dueño puede crear cupones' using errcode = '42501';
  end if;
  if p_percent is null or p_percent not between 5 and 50 then
    raise exception 'El descuento debe estar entre 5 y 50 %%' using errcode = '22023';
  end if;
  -- Solo para clientes reales de este restaurante (no para cualquier teléfono).
  if not exists (select 1 from public.orders o where o.restaurant_id = p_restaurant_id and o.customer_phone = p_phone) then
    raise exception 'Ese teléfono no es cliente de tu local' using errcode = 'P0002';
  end if;

  insert into public.coupons (restaurant_id, code, kind, value, max_uses, customer_phone, ends_at)
  values (p_restaurant_id, v_code, 'percent', p_percent, 1, p_phone, now() + interval '14 days');
  return v_code;
end;
$$;

revoke execute on function public.create_winback_coupon(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.create_winback_coupon(uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- order_reviews
-- -----------------------------------------------------------------------------
create table public.order_reviews (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  order_id      uuid not null references public.orders (id) on delete cascade,
  rating        integer not null,
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint order_reviews_order_key unique (order_id),
  constraint order_reviews_rating_range check (rating between 1 and 5),
  constraint order_reviews_comment_length check (comment is null or char_length(comment) <= 500)
);

create index order_reviews_restaurant_created_idx on public.order_reviews (restaurant_id, created_at desc);

create trigger set_updated_at before update on public.order_reviews
  for each row execute function public.set_updated_at();

alter table public.order_reviews enable row level security;
revoke all on public.order_reviews from anon, authenticated;
grant select on public.order_reviews to authenticated;

create policy "authenticated: miembros ven las reseñas de su local"
  on public.order_reviews for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- Reseña del cliente: con el token secreto del pedido, solo si fue entregado y una vez.
create function public.submit_review(p_token text, p_rating integer, p_comment text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order   public.orders;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select o.* into v_order
  from public.orders o
  where coalesce(p_token, '') ~ '^[0-9a-f]{48}$' and o.tracking_token = p_token;

  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status <> 'delivered' then
    raise exception 'Podrás calificar tu pedido cuando lo recibas' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'La calificación debe ser de 1 a 5 estrellas' using errcode = '22023';
  end if;
  if char_length(coalesce(v_comment, '')) > 500 then
    raise exception 'El comentario no puede superar los 500 caracteres' using errcode = '22023';
  end if;

  insert into public.order_reviews (restaurant_id, order_id, rating, comment)
  values (v_order.restaurant_id, v_order.id, p_rating, v_comment)
  on conflict (order_id) do nothing;

  if not found then
    raise exception 'Ya calificaste este pedido. ¡Gracias!' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.submit_review(text, integer, text) from public, anon, authenticated;
grant execute on function public.submit_review(text, integer, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- get_customers: + sellos de la tarjeta.
-- -----------------------------------------------------------------------------
drop function public.get_customers(uuid);
create function public.get_customers(p_restaurant_id uuid)
returns table (
  phone        text,
  name         text,
  orders       integer,
  total_spent  bigint,
  first_order  timestamptz,
  last_order   timestamptz,
  stamps       integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'No tienes acceso a los clientes de este restaurante' using errcode = '42501';
  end if;

  return query
    select o.customer_phone,
           (array_agg(o.customer_name order by o.created_at desc))[1],
           count(*)::integer,
           coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)::bigint,
           min(o.created_at),
           max(o.created_at),
           coalesce(max(lc.stamps), 0)::integer
    from public.orders o
    left join public.loyalty_cards lc on lc.restaurant_id = o.restaurant_id and lc.phone = o.customer_phone
    where o.restaurant_id = p_restaurant_id
    group by o.customer_phone
    order by max(o.created_at) desc
    limit 2000;
end;
$$;

revoke execute on function public.get_customers(uuid) from public, anon, authenticated;
grant execute on function public.get_customers(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- get_order_by_token: + reseña, tarjeta de sellos con su premio y link de Google.
-- Mismo cuerpo que la migración 17 en todo lo demás.
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
      'google_review_url', r.google_review_url
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
-- get_public_menu: + aviso de la tarjeta de sellos. Mismo cuerpo que la migración 17.
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
