-- Pruebas 5, 6 y 7: create_order calcula precios en el servidor, valida reglas de negocio
-- y genera correlativos sin repetir.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

set local role anon;

-- =============================================================================
-- 5. Ignora precios enviados por el cliente
-- Margarita (8.990) + Familiar (4.000) + Extra queso (1.000) + Champiñones (800) = 14.790
-- x2 = 29.580 + delivery 2.000 = 31.580
-- =============================================================================
select results_eq(
  $$ select total from public.create_order(
       'pizzeria-demo', 'Test Precio', '+56911112222', 'delivery', 'Calle Falsa 123', null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d1","quantity":2,"price":1,"unit_price":1,"total":1,
          "option_ids":["aaaaaaaa-0000-4000-8000-0000000000f2","aaaaaaaa-0000-4000-8000-0000000000f3","aaaaaaaa-0000-4000-8000-0000000000f4"]}]'
     ) $$,
  $$ values (31580) $$,
  'create_order ignora los precios enviados y devuelve el total calculado en el servidor'
);

reset role;

select results_eq(
  $$ select o.subtotal, o.delivery_fee, o.total, i.unit_price, i.quantity, i.line_total, jsonb_array_length(i.selected_options)
     from public.orders o join public.order_items i on i.order_id = o.id
     where o.customer_name = 'Test Precio' $$,
  $$ values (29580, 2000, 31580, 14790, 2, 29580, 3) $$,
  'El pedido y su ítem guardan los montos calculados en el servidor'
);

select results_eq(
  $$ select i.product_name, i.selected_options -> 0 ->> 'name'
     from public.orders o join public.order_items i on i.order_id = o.id
     where o.customer_name = 'Test Precio' $$,
  $$ values ('Margarita'::text, 'Familiar'::text) $$,
  'El ítem guarda una copia del nombre del producto y de las opciones'
);

select is(
  (select customer_phone from public.orders where customer_name = 'Test Precio'), '+56911112222',
  'El teléfono se guarda normalizado'
);

-- =============================================================================
-- 6. Rechazos
-- =============================================================================
set local role anon;

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"bbbbbbbb-0000-4000-8000-0000000000d1","quantity":2,"option_ids":["bbbbbbbb-0000-4000-8000-0000000000f1"]}]') $$,
  '%no pertenece a este restaurante%',
  'Rechaza un producto de otro restaurante'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d4","quantity":1}]') $$,
  '%"Calzone" no está disponible%',
  'Rechaza un producto no disponible'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d1","quantity":1}]') $$,
  '%al menos 1 opción(es) en "Tamaño"%',
  'Rechaza si no se elige el mínimo de un grupo (Tamaño)'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d1","quantity":1,
          "option_ids":["aaaaaaaa-0000-4000-8000-0000000000f1","aaaaaaaa-0000-4000-8000-0000000000f2"]}]') $$,
  '%como máximo 1 opción(es) en "Tamaño"%',
  'Rechaza si se supera el máximo de un grupo (dos tamaños)'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d1","quantity":1,
          "option_ids":["aaaaaaaa-0000-4000-8000-0000000000f1","aaaaaaaa-0000-4000-8000-0000000000f3","aaaaaaaa-0000-4000-8000-0000000000f4",
                        "aaaaaaaa-0000-4000-8000-0000000000f5","aaaaaaaa-0000-4000-8000-0000000000f6"]}]') $$,
  '%como máximo 3 opción(es) en "Agregados"%',
  'Rechaza más agregados de los permitidos'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d2","quantity":1,"option_ids":["aaaaaaaa-0000-4000-8000-0000000000f1"]}]') $$,
  '%opciones elegidas para "Pepperoni" no es válida%',
  'Rechaza una opción que pertenece a otro producto'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'delivery', '  ', null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  '%dirección es obligatoria%',
  'Rechaza delivery sin dirección'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d5","quantity":1}]') $$,
  '%pedido mínimo es $8.000. Tu pedido suma $2.500%',
  'Rechaza un pedido bajo el mínimo'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       (select jsonb_agg(jsonb_build_object('product_id', 'aaaaaaaa-0000-4000-8000-0000000000d6', 'quantity', 1))
        from generate_series(1, 51))) $$,
  '%como máximo 50 productos%',
  'Rechaza más de 50 ítems'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":0}]') $$,
  '%entre 1 y 99%',
  'Rechaza cantidad 0'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"no-es-un-uuid","quantity":1}]') $$,
  '%formato de los productos%',
  'Rechaza un product_id con formato inválido'
);

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '123', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  '%teléfono válido%',
  'Rechaza un teléfono inválido'
);

select throws_like(
  $$ select * from public.create_order('no-existe', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'Restaurante no encontrado',
  'Rechaza un restaurante inexistente'
);

-- Restaurante cerrado
reset role;
update public.restaurants set is_open = false where slug = 'pizzeria-demo';
set local role anon;

select throws_like(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  '%está cerrado%',
  'Rechaza pedidos si el restaurante está cerrado'
);

reset role;
update public.restaurants set is_open = true where slug = 'pizzeria-demo';

-- =============================================================================
-- 7. Correlativos
-- =============================================================================
set local role anon;

select lives_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Correlativo Uno', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'Primer pedido para correlativo'
);
select lives_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Correlativo Dos', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'Segundo pedido para correlativo'
);
select lives_ok(
  $$ select * from public.create_order('sushi-demo', 'Correlativo Sushi', '+56911112222', 'pickup', null, null, 'cash',
       '[{"product_id":"bbbbbbbb-0000-4000-8000-0000000000d2","quantity":2}]') $$,
  'Pedido en otro restaurante'
);

reset role;

select is(
  (select order_number from public.orders where customer_name = 'Correlativo Dos')
  - (select order_number from public.orders where customer_name = 'Correlativo Uno'),
  1,
  'Dos pedidos seguidos reciben números consecutivos'
);

select results_eq(
  $$ select count(*)::int, count(distinct order_number)::int, max(order_number)
     from public.orders where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ select c.last_number, c.last_number, c.last_number
     from public.order_counters c where c.restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'Los números de A son 1..N sin huecos ni repetidos y coinciden con el contador'
);

select is(
  (select order_number from public.orders where customer_name = 'Correlativo Sushi'), 3,
  'Cada restaurante tiene su propio correlativo (B sigue en 3)'
);

select * from finish();
rollback;
