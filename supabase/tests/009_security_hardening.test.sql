-- Controles de la migración 9: límite de pedidos por teléfono y URLs de imágenes seguras.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local role anon;

-- Límite de pedidos ------------------------------------------------------------------
-- Tres pedidos seguidos con el mismo teléfono se aceptan…
select lives_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente Repetido', '+56955550001', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'Primer pedido del teléfono: aceptado'
);
select lives_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente Repetido', '+56955550001', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'Segundo pedido del teléfono: aceptado'
);
select lives_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente Repetido', '+56955550001', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'Tercer pedido del teléfono: aceptado'
);

-- …el cuarto en menos de 10 minutos se rechaza (y no consume número de pedido).
select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente Repetido', '+56955550001', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  '%Ya enviaste varios pedidos%',
  'Cuarto pedido del mismo teléfono en 10 minutos: rechazado'
);

-- El límite es por restaurante: el mismo teléfono puede pedir en otro local.
select lives_ok(
  $$ select * from public.create_order('sushi-demo', 'Cliente Repetido', '+56955550001', 'pickup', null, null, 'cash',
       '[{"product_id":"bbbbbbbb-0000-4000-8000-0000000000d2","quantity":2}]') $$,
  'El mismo teléfono puede pedir en otro restaurante'
);

reset role;

-- URLs de imágenes -------------------------------------------------------------------
select throws_ok(
  $$ update public.products set image_url = 'javascript:alert(1)' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '23514', null,
  'Se rechaza una image_url con esquema javascript:'
);

select throws_ok(
  $$ update public.restaurants set logo_url = 'data:image/svg+xml,<svg onload=alert(1)>' where slug = 'pizzeria-demo' $$,
  '23514', null,
  'Se rechaza un logo_url con esquema data:'
);

select * from finish();
rollback;
