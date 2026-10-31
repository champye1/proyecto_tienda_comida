-- Pruebas 2 y 3: anon lee el menú público, pero no pedidos, miembros ni contadores,
-- y no puede escribir directamente.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

set local role anon;

-- Lectura del menú ---------------------------------------------------------------
select results_eq(
  $$ select name from public.restaurants where slug = 'pizzeria-demo' $$,
  $$ values ('Pizzería Demo'::text) $$,
  'anon ve el restaurante por su slug'
);

select results_eq(
  $$ select count(*)::int from public.categories where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ values (3) $$,
  'anon ve las categorías activas'
);

select results_eq(
  $$ select count(*)::int from public.products where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ values (6) $$,
  'anon ve los 6 productos disponibles'
);

select is_empty(
  $$ select 1 from public.products where id = 'aaaaaaaa-0000-4000-8000-0000000000d4' $$,
  'anon no ve un producto no disponible (Calzone)'
);

select results_eq(
  $$ select count(*)::int from public.options where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ values (8) $$,
  'anon ve las opciones del menú'
);

-- Sin lectura de datos privados -------------------------------------------------------
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon no puede leer orders');
select throws_ok($$ select * from public.order_items $$, '42501', null, 'anon no puede leer order_items');
select throws_ok($$ select * from public.restaurant_members $$, '42501', null, 'anon no puede leer restaurant_members');
select throws_ok($$ select * from public.order_counters $$, '42501', null, 'anon no puede leer order_counters');

-- Sin escritura directa ---------------------------------------------------------------
select throws_ok(
  $$ insert into public.orders (restaurant_id, order_number, customer_name, customer_phone, type,
                                subtotal, delivery_fee, total, payment_method)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 999, 'Hacker', '+56900000000', 'pickup', 0, 0, 0, 'cash') $$,
  '42501', null,
  'anon no puede insertar directamente en orders'
);

select throws_ok(
  $$ insert into public.order_items (restaurant_id, order_id, order_created_at, product_name, unit_price, quantity, line_total)
     values ('aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), now(), 'X', 0, 1, 0) $$,
  '42501', null,
  'anon no puede insertar directamente en order_items'
);

select throws_ok(
  $$ update public.products set price = 1 where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '42501', null,
  'anon no puede modificar productos'
);

select throws_ok(
  $$ update public.order_counters set last_number = 0 $$,
  '42501', null,
  'anon no puede modificar order_counters'
);

select throws_ok(
  $$ select public.create_restaurant('Hack', 'hack-slug') $$,
  '42501', null,
  'anon no puede ejecutar create_restaurant'
);

select throws_ok(
  $$ select public.update_order_status(gen_random_uuid(), 'delivered') $$,
  '42501', null,
  'anon no puede ejecutar update_order_status'
);

select * from finish();
rollback;
