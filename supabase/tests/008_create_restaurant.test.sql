-- Onboarding: create_restaurant e is_slug_available.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Usuario nuevo, sin restaurante (solo dentro de esta transacción).
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
        'authenticated', 'authenticated', 'nuevo@test.cl');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

-- is_slug_available ------------------------------------------------------------------
select is(public.is_slug_available('mi-local-nuevo'), 'ok', 'Slug libre → ok');
select is(public.is_slug_available('pizzeria-demo'), 'taken', 'Slug usado → taken');
select is(public.is_slug_available('www'), 'reserved', 'Slug reservado → reserved');
select is(public.is_slug_available('Con Espacios!'), 'invalid', 'Slug con formato inválido → invalid');

-- create_restaurant ------------------------------------------------------------------
select results_eq(
  $$ select slug, name, phone, is_open
     from public.create_restaurant('  Mi Local Nuevo ', 'Mi-Local-Nuevo', '+56 9 1234 5678', 'Calle 1', null) $$,
  $$ values ('mi-local-nuevo'::text, 'Mi Local Nuevo'::text, '+56912345678'::text, false) $$,
  'Crea el restaurante normalizando nombre, slug y teléfono (cerrado por defecto)'
);

select results_eq(
  $$ select m.role::text from public.restaurant_members m
     join public.restaurants r on r.id = m.restaurant_id
     where r.slug = 'mi-local-nuevo' and m.user_id = '44444444-4444-4444-8444-444444444444' $$,
  $$ values ('owner'::text) $$,
  'El creador queda como owner'
);

select is(public.is_slug_available('mi-local-nuevo'), 'taken', 'El slug recién creado ya no está disponible');

select throws_ok(
  $$ select public.create_restaurant('Otra Pizzería', 'pizzeria-demo') $$,
  '23505', 'La dirección "pizzeria-demo" ya está en uso. Elige otra.',
  'Slug duplicado → error claro'
);

select throws_like(
  $$ select public.create_restaurant('Admin', 'admin') $$,
  '%está reservada%',
  'Slug reservado → error claro'
);

select throws_like(
  $$ select public.create_restaurant('Local', 'local_con_guion_bajo') $$,
  '%minúsculas, números y guiones%',
  'Slug con formato inválido → error claro'
);

select throws_ok(
  $$ update public.restaurants set slug = 'api' where slug = 'mi-local-nuevo' $$,
  '23514', null,
  'El owner no puede cambiar su slug a uno reservado (CHECK)'
);

reset role;

select is(
  (select c.last_number from public.order_counters c
   join public.restaurants r on r.id = c.restaurant_id where r.slug = 'mi-local-nuevo'),
  0,
  'Se crea el contador de pedidos en 0'
);

set local role anon;
select throws_ok(
  $$ select public.is_slug_available('algo') $$,
  '42501', null,
  'anon no puede ejecutar is_slug_available'
);

select * from finish();
rollback;
