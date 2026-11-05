-- Etapa C: promociones, cupones, pedidos programados y propina (todo calculado en el servidor).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000001'''
\set d3 '''aaaaaaaa-0000-4000-8000-0000000000d3'''
\set items3 '''[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":3}]'''
\set items1 '''[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]'''

select price as p3 from public.products where id = :d3 \gset
select delivery_fee as fee from public.restaurants where id = :A \gset
-- Sin pedido mínimo para que las cuentas sean simples.
update public.restaurants set min_order = 0 where id = :A;

-- -----------------------------------------------------------------------------
-- Promociones
-- -----------------------------------------------------------------------------
insert into public.promotions (restaurant_id, name, kind, percent, product_id, days, start_time, end_time)
values (:A, 'Happy hour 20%', 'percent', 20, :d3, '{0,1,2,3,4,5,6}', '00:00', '23:59'),
       (:A, '2x1 de la casa', 'two_for_one', null, :d3, '{0,1,2,3,4,5,6}', '00:00', '23:59'),
       (:A, 'Promo apagada 90%', 'percent', 90, :d3, '{0,1,2,3,4,5,6}', '00:00', '23:59');
update public.promotions set is_active = false where name = 'Promo apagada 90%';
-- Promoción de "otro día": nunca rige hoy.
insert into public.promotions (restaurant_id, name, kind, percent, days, start_time, end_time)
select :A, 'Solo otro día', 'percent', 80, array[((extract(isodow from now() at time zone 'America/Santiago')::int) % 7)], '00:00', '23:59';

set local role service_role;
select order_id as o1 from public.create_order('pizzeria-demo', 'Promo Uno', '+56911110001', 'pickup', null, null, 'cash', :items3) \gset
reset role;
select results_eq(
  format($$ select discount, promotion_name, line_total from public.order_items where order_id = %L $$, :'o1'),
  format($$ values (%s, '2x1 de la casa'::text, %s) $$, :p3, :p3 * 2),
  'Se aplica la promoción de MAYOR descuento (2x1 en 3 unidades = paga 2) y queda guardada en la línea'
);
select is((select subtotal from public.orders where id = :'o1'), :p3 * 2, 'El subtotal ya incluye el descuento de la promoción');

set local role service_role;
select order_id as o2 from public.create_order('pizzeria-demo', 'Promo Dos', '+56911110002', 'pickup', null, null, 'cash', :items1) \gset
reset role;
select is((select promotion_name from public.order_items where order_id = :'o2'), 'Happy hour 20%',
  'Con 1 unidad el 2x1 no descuenta nada: gana el 20%');
select is((select discount from public.order_items where order_id = :'o2'), round(:p3 * 0.2)::int, '20% de descuento calculado en el servidor');

select throws_ok(
  format($$ insert into public.promotions (restaurant_id, name, kind, percent, product_id, days, start_time, end_time)
            values (%L, 'Robo', 'percent', 50, %L, '{0}', '10:00', '12:00') $$, 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d3'),
  '23503', null, 'Una promoción no puede apuntar a un producto de otro restaurante (FK compuesta)'
);
select throws_ok($$ insert into public.promotions (restaurant_id, name, kind, percent, days, start_time, end_time)
                    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Mal', 'percent', 95, '{0}', '10:00', '12:00') $$,
  '23514', null, 'El porcentaje máximo de una promoción es 90%');

set local role anon;
select is(public.get_public_menu('pizzeria-demo') #>> '{categories}' like '%2x1 de la casa%', true,
  'El menú público muestra la promoción vigente del producto');
reset role;

delete from public.promotions where restaurant_id = :A;

-- -----------------------------------------------------------------------------
-- Cupones
-- -----------------------------------------------------------------------------
insert into public.coupons (restaurant_id, code, kind, value, max_uses) values (:A, 'BIENVENIDA10', 'percent', 10, 1);
insert into public.coupons (restaurant_id, code, kind, value, first_order_only) values (:A, 'PRIMERA', 'fixed', 1000, true);
insert into public.coupons (restaurant_id, code, kind) values (:A, 'ENVIOGRATIS', 'free_delivery');
insert into public.coupons (restaurant_id, code, kind, value, ends_at) values (:A, 'VENCIDO', 'fixed', 500, now() - interval '1 day');
insert into public.coupons (restaurant_id, code, kind, value, customer_phone) values (:A, 'SOLOPARAMI', 'fixed', 2000, '+56922220000');

set local role service_role;
select order_id as c1, total as c1_total
from public.create_order('pizzeria-demo', 'Cupón Uno', '+56911110003', 'pickup', null, null, 'cash', :items3, 'bienvenida10') \gset
reset role;
select results_eq(
  format($$ select discount, coupon_code, total from public.orders where id = %L $$, :'c1'),
  format($$ values (%s, 'BIENVENIDA10'::text, %s) $$, round(:p3 * 3 * 0.1)::int, :p3 * 3 - round(:p3 * 3 * 0.1)::int),
  'Cupón de 10%: descuento y total calculados en el servidor (el código se normaliza a mayúsculas)'
);
select is((select uses from public.coupons where code = 'BIENVENIDA10'), 1, 'Se cuenta el uso del cupón');

set local role service_role;
select throws_ok($$ select * from public.create_order('pizzeria-demo', 'Cupón Dos', '+56911110004', 'pickup', null, null, 'cash',
                    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]', 'BIENVENIDA10') $$,
  'P0001', 'Este cupón ya alcanzó su máximo de usos', 'Respeta el máximo de usos');
select throws_ok($$ select * from public.create_order('pizzeria-demo', 'Camila', '+56987654321', 'pickup', null, null, 'cash',
                    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]', 'PRIMERA') $$,
  'P0001', 'Este cupón es solo para tu primera compra', '"Solo primera compra": rechaza a un cliente que ya compró');
select lives_ok($$ select * from public.create_order('pizzeria-demo', 'Nueva', '+56911110005', 'pickup', null, null, 'cash',
                    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]', 'PRIMERA') $$,
  '"Solo primera compra": acepta a un cliente nuevo');
select throws_ok($$ select * from public.create_order('pizzeria-demo', 'Retiro', '+56911110006', 'pickup', null, null, 'cash',
                    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]', 'ENVIOGRATIS') $$,
  'P0001', 'Este cupón es de envío gratis: aplica solo a pedidos con delivery', 'Envío gratis no aplica a retiro');
select ok(
  (select total = :p3 from public.create_order('pizzeria-demo', 'Delivery', '+56911110007', 'delivery', 'Calle Falsa 123', null, 'cash', :items1, 'ENVIOGRATIS')),
  'Envío gratis: el total queda sin costo de envío'
);
select throws_ok($$ select * from public.create_order('pizzeria-demo', 'Xime', '+56911110008', 'pickup', null, null, 'cash',
                    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]', 'VENCIDO') $$,
  'P0001', 'Este cupón ya venció', 'Rechaza cupones vencidos');
select throws_ok($$ select * from public.create_order('pizzeria-demo', 'Xime', '+56911110009', 'pickup', null, null, 'cash',
                    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]', 'NOEXISTE') $$,
  'P0001', 'Cupón no válido', 'Cupón inexistente');
select throws_ok($$ select * from public.create_order('pizzeria-demo', 'Xime', '+56911110010', 'pickup', null, null, 'cash',
                    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]', 'SOLOPARAMI') $$,
  'P0001', 'Cupón no válido', 'Un cupón personal de otro teléfono responde igual que uno inexistente');
reset role;

-- Vista previa pública y permisos.
set local role anon;
select is((public.check_coupon('pizzeria-demo', 'enviogratis', 5000, 2000) ->> 'discount')::int, 2000, 'check_coupon calcula la vista previa');
select throws_ok($$ select * from public.coupons $$, '42501', null, 'Los cupones no son legibles desde la API pública');
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ insert into public.coupons (restaurant_id, code, kind, value) values ('aaaaaaaa-0000-4000-8000-000000000001', 'HACK', 'percent', 100) $$,
  '42501', null, 'Un dueño ajeno no puede crear cupones en otro restaurante');
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ update public.coupons set uses = 0 where code = 'BIENVENIDA10' $$, '42501', null,
  'Ni el dueño puede reiniciar el contador de usos');
reset role;

-- -----------------------------------------------------------------------------
-- Pedidos programados y propina
-- -----------------------------------------------------------------------------
set local role service_role;
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Prog', '+56911110011', 'pickup', null, null, 'cash', %L, null, now() + interval '2 hours') $$, :items1),
  'P0001', 'Este local no acepta pedidos programados', 'Sin activar, no se aceptan pedidos programados');
reset role;
update public.restaurants set scheduling_days = 2, tips_enabled = true where id = :A;
set local role service_role;
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Prog', '+56911110012', 'pickup', null, null, 'cash', %L, null, now() + interval '10 minutes') $$, :items1),
  '22023', 'Programa tu pedido con al menos 25 minutos de anticipación', 'Exige al menos el tiempo de preparación');
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Prog', '+56911110013', 'pickup', null, null, 'cash', %L, null, now() + interval '3 days') $$, :items1),
  '22023', 'Solo puedes programar pedidos hasta 2 día(s) de anticipación', 'Respeta los días máximos de anticipación');
select order_id as s1 from public.create_order('pizzeria-demo', 'Prog', '+56911110014', 'pickup', null, null, 'cash', :items1, null, now() + interval '3 hours', 1500) \gset
reset role;
select ok((select scheduled_for between now() + interval '179 minutes' and now() + interval '181 minutes' and tip = 1500 and total = :p3 + 1500
           from public.orders where id = :'s1'),
  'Pedido programado guardado con su hora; la propina se suma al total');

update public.restaurants set opening_hours = '[[],[],[],[],[],[],[]]' where id = :A;
set local role service_role;
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Prog', '+56911110015', 'pickup', null, null, 'cash', %L, null, now() + interval '3 hours') $$, :items1),
  'P0001', null, 'No se puede programar fuera del horario de atención');
reset role;
update public.restaurants set opening_hours = null where id = :A;
set local role service_role;
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Tip', '+56911110017', 'pickup', null, null, 'cash', %L, null, null, -100) $$, :items1),
  '22023', 'La propina no es válida', 'Rechaza propinas negativas');
reset role;

-- Seguimiento: muestra descuento, propina y hora programada (sin datos personales).
select tracking_token as s1_token from public.orders where id = :'s1' \gset
set local role anon;
select ok((select (r ->> 'tip')::int = 1500 and r ? 'scheduled_for' and r ? 'discount' and not (r ? 'customer_phone')
           from public.get_order_by_token(:'s1_token') r),
  'El seguimiento incluye propina, descuento y hora programada');
reset role;

select * from finish();
rollback;
