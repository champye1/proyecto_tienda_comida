-- Prueba 4: aislamiento entre restaurantes.
-- El owner A no puede leer, modificar ni borrar datos privados de B (y viceversa).
--
-- Nota: el menú público (productos disponibles, categorías activas) lo puede leer
-- cualquiera, igual que anon. Lo que se verifica es que A no vea lo que B no publicó
-- (productos no disponibles, categorías inactivas, pedidos, miembros) ni pueda escribir.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- B desactiva una categoría (dato privado de B).
update public.categories set is_active = false where id = 'bbbbbbbb-0000-4000-8000-0000000000c3';

-- =============================================================================
-- Como owner A
-- =============================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Control positivo: A ve y edita lo suyo -------------------------------------------
select results_eq(
  $$ select count(*)::int from public.products where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ values (7) $$,
  'A ve sus 7 productos, incluido el no disponible'
);

select results_eq(
  $$ select count(*)::int from public.orders where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ values (3) $$,
  'A ve sus 3 pedidos'
);

select lives_ok(
  $$ update public.products set price = 9290 where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  'A puede editar un producto propio'
);

-- Lectura de B ---------------------------------------------------------------------------
select is_empty(
  $$ select 1 from public.products where id = 'bbbbbbbb-0000-4000-8000-0000000000d7' $$,
  'A no ve el producto no disponible de B'
);

select is_empty(
  $$ select 1 from public.categories where id = 'bbbbbbbb-0000-4000-8000-0000000000c3' $$,
  'A no ve la categoría inactiva de B'
);

select is_empty(
  $$ select 1 from public.orders where restaurant_id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  'A no ve pedidos de B'
);

select is_empty(
  $$ select 1 from public.order_items where restaurant_id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  'A no ve ítems de pedidos de B'
);

select is_empty(
  $$ select 1 from public.restaurant_members where restaurant_id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  'A no ve los miembros de B'
);

-- Escritura sobre B (los UPDATE/DELETE no fallan: simplemente no encuentran filas) -------
update public.products set price = 1 where id = 'bbbbbbbb-0000-4000-8000-0000000000d1';
delete from public.products where id = 'bbbbbbbb-0000-4000-8000-0000000000d2';
update public.categories set name = 'Hackeado' where id = 'bbbbbbbb-0000-4000-8000-0000000000c1';
delete from public.options where id = 'bbbbbbbb-0000-4000-8000-0000000000f1';
update public.restaurants set is_open = false, name = 'Hackeado' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
delete from public.restaurants where id = 'bbbbbbbb-0000-4000-8000-000000000001';

select throws_ok(
  $$ insert into public.categories (restaurant_id, name) values ('bbbbbbbb-0000-4000-8000-000000000001', 'Intrusa') $$,
  '42501', null,
  'A no puede crear categorías en B'
);

select throws_ok(
  $$ insert into public.products (restaurant_id, category_id, name, price)
     values ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'Intruso', 100) $$,
  '42501', null,
  'A no puede crear productos en B'
);

select throws_ok(
  $$ insert into public.products (restaurant_id, category_id, name, price)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'Cruzado', 100) $$,
  '23503', null,
  'A no puede asociar su producto a una categoría de B (FK compuesta)'
);

select throws_ok(
  $$ update public.products set restaurant_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'A no puede mover un producto a otro restaurante (restaurant_id no es editable)'
);

select throws_ok(
  $$ insert into public.restaurant_members (restaurant_id, user_id, role)
     values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner') $$,
  '42501', null,
  'A no puede agregarse como miembro de B'
);

-- =============================================================================
-- Verificación como postgres: B quedó intacto
-- =============================================================================
reset role;

select is(
  (select price from public.products where id = 'bbbbbbbb-0000-4000-8000-0000000000d1'), 6990,
  'A no pudo modificar el precio de un producto de B'
);

select isnt_empty(
  $$ select 1 from public.products where id = 'bbbbbbbb-0000-4000-8000-0000000000d2' $$,
  'A no pudo borrar un producto de B'
);

select is(
  (select name from public.categories where id = 'bbbbbbbb-0000-4000-8000-0000000000c1'), 'Rolls',
  'A no pudo modificar una categoría de B'
);

select isnt_empty(
  $$ select 1 from public.options where id = 'bbbbbbbb-0000-4000-8000-0000000000f1' $$,
  'A no pudo borrar una opción de B'
);

select results_eq(
  $$ select name, is_open from public.restaurants where id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  $$ values ('Sushi Demo'::text, true) $$,
  'A no pudo modificar ni borrar el restaurante B'
);

select is(
  (select price from public.products where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 9290,
  'El cambio de A sobre su propio producto sí quedó guardado'
);

-- =============================================================================
-- Como owner B (sentido inverso)
-- =============================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is_empty(
  $$ select 1 from public.orders where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'B no ve pedidos de A'
);

select is_empty(
  $$ select 1 from public.products where id = 'aaaaaaaa-0000-4000-8000-0000000000d4' $$,
  'B no ve el producto no disponible de A'
);

update public.products set price = 1 where id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
delete from public.categories where id = 'aaaaaaaa-0000-4000-8000-0000000000c3';

select throws_ok(
  $$ insert into public.products (restaurant_id, category_id, name, price)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Intruso', 100) $$,
  '42501', null,
  'B no puede crear productos en A'
);

reset role;

select is(
  (select price from public.products where id = 'aaaaaaaa-0000-4000-8000-0000000000d2'), 9990,
  'B no pudo modificar un producto de A'
);

select isnt_empty(
  $$ select 1 from public.categories where id = 'aaaaaaaa-0000-4000-8000-0000000000c3' $$,
  'B no pudo borrar una categoría de A'
);

select * from finish();
rollback;
