-- =============================================================================
-- 16. Equipo y reportes (etapa B)
--
-- Invitaciones al personal
--   * El dueño invita por email y recibe un LINK de un solo uso (lo comparte por WhatsApp o
--     correo). Quien lo abre debe iniciar sesión con ESE MISMO email para aceptarlo.
--   * En la base solo se guarda el hash SHA-256 del token: si alguien leyera la tabla, no
--     podría usar las invitaciones. Vencen a los 7 días.
--   * Se elimina el INSERT directo en restaurant_members: antes un dueño podía agregar a
--     cualquier usuario (conociendo su id) sin que esa persona aceptara. Ahora sumarse a un
--     equipo SIEMPRE requiere aceptar una invitación (o crear el restaurante).
--
-- Clientes frecuentes (get_customers): agrupados por teléfono, con pedidos, gasto y última
-- compra. Solo miembros del restaurante (los mismos que ya ven los pedidos).
--
-- Reporte de ventas: rango de hasta 366 días (por hora / día / mes), horas y días peak, y
-- productos publicados que no se vendieron en el período.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sumarse a un equipo solo por invitación
-- -----------------------------------------------------------------------------
drop policy "authenticated: owner agrega miembros" on public.restaurant_members;
revoke insert on public.restaurant_members from authenticated;

-- -----------------------------------------------------------------------------
-- restaurant_invitations
-- -----------------------------------------------------------------------------
create table public.restaurant_invitations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  email         text not null,
  role          public.member_role not null default 'staff',
  token_hash    text not null,
  created_by    uuid references auth.users (id) on delete set null,
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint restaurant_invitations_token_hash_key unique (token_hash),
  constraint restaurant_invitations_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint restaurant_invitations_email_format check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  -- Por ahora solo se invita personal; traspasar la propiedad es otra operación.
  constraint restaurant_invitations_role_staff check (role = 'staff')
);

-- Una sola invitación pendiente por email y restaurante. Cubre la FK restaurant_id.
create unique index restaurant_invitations_pending_key
  on public.restaurant_invitations (restaurant_id, email) where accepted_at is null;
create index restaurant_invitations_created_by_idx on public.restaurant_invitations (created_by);
create index restaurant_invitations_accepted_by_idx on public.restaurant_invitations (accepted_by);

create trigger set_updated_at before update on public.restaurant_invitations
  for each row execute function public.set_updated_at();

alter table public.restaurant_invitations enable row level security;

-- El dueño ve y revoca las invitaciones de su restaurante. Crear y aceptar: solo por RPC.
revoke all on public.restaurant_invitations from anon, authenticated;
grant select (id, restaurant_id, email, role, expires_at, accepted_at, created_at) on public.restaurant_invitations to authenticated;
grant delete on public.restaurant_invitations to authenticated;

create policy "authenticated: owner ve las invitaciones"
  on public.restaurant_invitations for select to authenticated
  using (public.is_restaurant_owner(restaurant_id));

create policy "authenticated: owner revoca invitaciones pendientes"
  on public.restaurant_invitations for delete to authenticated
  using (public.is_restaurant_owner(restaurant_id) and accepted_at is null);

-- -----------------------------------------------------------------------------
-- create_invitation: devuelve el token UNA sola vez (en la base queda solo su hash).
-- Si ya había una invitación pendiente para ese email, se renueva (nuevo link y plazo).
-- -----------------------------------------------------------------------------
create function public.create_invitation(p_restaurant_id uuid, p_email text)
returns table (token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_token   text := encode(extensions.gen_random_bytes(24), 'hex');
  v_hash    text := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires timestamptz := now() + interval '7 days';
begin
  if (select auth.uid()) is null or not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'Solo el dueño puede invitar personal' using errcode = '42501';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Ingresa un email válido' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.restaurant_members m
    join auth.users u on u.id = m.user_id
    where m.restaurant_id = p_restaurant_id and lower(u.email) = v_email
  ) then
    raise exception 'Esa persona ya es parte de tu equipo' using errcode = 'P0001';
  end if;

  -- Tope de invitaciones pendientes (evita usar la función para generar links sin fin).
  if (select count(*) from public.restaurant_invitations i
      where i.restaurant_id = p_restaurant_id and i.accepted_at is null and i.email <> v_email) >= 20 then
    raise exception 'Tienes demasiadas invitaciones pendientes. Revoca alguna antes de invitar a otra persona'
      using errcode = 'P0001';
  end if;

  insert into public.restaurant_invitations (restaurant_id, email, token_hash, created_by, expires_at)
  values (p_restaurant_id, v_email, v_hash, (select auth.uid()), v_expires)
  on conflict (restaurant_id, email) where accepted_at is null
  do update set token_hash = excluded.token_hash, created_by = excluded.created_by, expires_at = excluded.expires_at;

  return query select v_token, v_expires;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_invitation: datos mínimos para la página de la invitación (nombre del local y si
-- el email coincide con la sesión). Nunca devuelve el email completo de la invitación.
-- -----------------------------------------------------------------------------
create function public.get_invitation(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurant_name', r.name,
    'email_matches',   i.email = lower(coalesce((select u.email from auth.users u where u.id = (select auth.uid())), '')),
    -- "an***@gmail.com": suficiente para saber con qué cuenta entrar, sin exponerlo entero.
    'email_hint',      left(i.email, 2) || '***@' || split_part(i.email, '@', 2),
    'expired',         i.expires_at < now(),
    'accepted',        i.accepted_at is not null
  )
  from public.restaurant_invitations i
  join public.restaurants r on r.id = i.restaurant_id
  where p_token ~ '^[0-9a-f]{48}$'
    and i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- accept_invitation: suma al usuario actual como personal, si el email coincide.
-- -----------------------------------------------------------------------------
create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv  public.restaurant_invitations;
  v_user auth.users;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  select i.* into v_inv
  from public.restaurant_invitations i
  where coalesce(p_token, '') ~ '^[0-9a-f]{48}$'
    and i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_inv.accepted_at is not null then
    raise exception 'La invitación no existe o ya fue usada' using errcode = 'P0002';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'La invitación venció. Pide al dueño que te envíe una nueva' using errcode = 'P0001';
  end if;

  select u.* into v_user from auth.users u where u.id = (select auth.uid());
  if lower(v_user.email) <> v_inv.email then
    raise exception 'Esta invitación es para otro email. Inicia sesión con el email al que te invitaron'
      using errcode = '42501';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'Confirma tu email antes de aceptar la invitación' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.restaurant_members m
             where m.restaurant_id = v_inv.restaurant_id and m.user_id = v_user.id) then
    raise exception 'Ya eres parte de este equipo' using errcode = 'P0001';
  end if;

  insert into public.restaurant_members (restaurant_id, user_id, role)
  values (v_inv.restaurant_id, v_user.id, v_inv.role);

  update public.restaurant_invitations
  set accepted_at = now(), accepted_by = v_user.id
  where id = v_inv.id;

  return v_inv.restaurant_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_team: miembros con su email (la tabla auth.users no es legible desde la API).
-- Solo el dueño.
-- -----------------------------------------------------------------------------
create function public.get_team(p_restaurant_id uuid)
returns table (member_id uuid, user_id uuid, email text, role public.member_role, joined_at timestamptz, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'Solo el dueño puede ver el equipo' using errcode = '42501';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at, m.user_id = (select auth.uid())
    from public.restaurant_members m
    join auth.users u on u.id = m.user_id
    where m.restaurant_id = p_restaurant_id
    order by m.role, m.created_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_customers: clientes del restaurante agrupados por teléfono (CRM simple).
--   Nombre = el del pedido más reciente. Gasto = pedidos no cancelados.
-- -----------------------------------------------------------------------------
create function public.get_customers(p_restaurant_id uuid)
returns table (
  phone        text,
  name         text,
  orders       integer,
  total_spent  bigint,
  first_order  timestamptz,
  last_order   timestamptz
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
           max(o.created_at)
    from public.orders o
    where o.restaurant_id = p_restaurant_id
    group by o.customer_phone
    order by max(o.created_at) desc
    limit 2000;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_sales_report v3: hasta 366 días, por hora (1 día), por día (≤ 92 días) o por mes;
-- más horas peak, días de la semana y productos sin ventas.
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
                 sum(total) as revenue
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

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke execute on function public.create_invitation(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_invitation(text) from public, anon, authenticated;
revoke execute on function public.accept_invitation(text) from public, anon, authenticated;
revoke execute on function public.get_team(uuid) from public, anon, authenticated;
revoke execute on function public.get_customers(uuid) from public, anon, authenticated;

grant execute on function public.create_invitation(uuid, text) to authenticated;
grant execute on function public.get_invitation(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.get_team(uuid) to authenticated;
grant execute on function public.get_customers(uuid) to authenticated;
