-- =============================================================================
-- 8. Slugs reservados y verificación de disponibilidad (onboarding)
--
-- Cuando la tienda pase a subdominios ({slug}.dominio.cl), un restaurante no puede
-- quedarse con "www", "admin", "api", etc. Se bloquean desde ya.
-- =============================================================================

create function public.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_slug) = any (array[
    'admin', 'api', 'app', 'assets', 'auth', 'ayuda', 'billing', 'blog', 'cdn', 'dashboard',
    'dev', 'docs', 'email', 'help', 'login', 'mail', 'panel', 'pagos', 'registro', 'soporte',
    'static', 'status', 'staging', 'storage', 'support', 'test', 'www'
  ]);
$$;

alter table public.restaurants
  add constraint restaurants_slug_not_reserved check (not public.is_reserved_slug(slug));

-- -----------------------------------------------------------------------------
-- is_slug_available: 'ok' | 'invalid' | 'reserved' | 'taken'
-- Considera también restaurantes inactivos (que el usuario no puede ver por RLS).
-- -----------------------------------------------------------------------------
create function public.is_slug_available(p_slug text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  if char_length(v_slug) not between 3 and 50 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return 'invalid';
  end if;

  if public.is_reserved_slug(v_slug) then
    return 'reserved';
  end if;

  if exists (select 1 from public.restaurants r where r.slug = v_slug) then
    return 'taken';
  end if;

  return 'ok';
end;
$$;

-- -----------------------------------------------------------------------------
-- create_restaurant: igual que en la migración 5, más el rechazo de slugs reservados.
-- -----------------------------------------------------------------------------
create or replace function public.create_restaurant(
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

  if public.is_reserved_slug(v_slug) then
    raise exception 'La dirección "%" está reservada. Elige otra.', v_slug using errcode = '22023';
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
-- Permisos
-- is_reserved_slug lo evalúa el CHECK cuando un owner edita su slug, y es una
-- función pura sin datos: se otorga a authenticated.
-- -----------------------------------------------------------------------------
revoke execute on function public.is_reserved_slug(text) from public, anon, authenticated;
revoke execute on function public.is_slug_available(text) from public, anon, authenticated;

grant execute on function public.is_reserved_slug(text) to authenticated;
grant execute on function public.is_slug_available(text) to authenticated;
