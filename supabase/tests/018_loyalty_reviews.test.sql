-- Etapa D: tarjeta de sellos, cupón para recuperar clientes y reseñas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set items '''[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]'''
\set phone '''+56955550001'''

-- El límite anti-spam (3 pedidos por teléfono cada 10 min, migración 9) se prueba en la 009;
-- aquí se desactiva para simular muchos pedidos del mismo cliente. Todo se revierte al final.
alter table public.orders disable trigger a_orders_rate_limit;

-- Tarjeta de 3 sellos con premio de $2.000.
update public.restaurants
set loyalty_enabled = true, loyalty_stamps = 3, loyalty_reward_kind = 'fixed', loyalty_reward_value = 2000, min_order = 0,
    google_review_url = 'https://g.page/r/pizzeria-demo/review'
where id = :A;

-- Crea y entrega N pedidos del mismo teléfono.
create function pg_temp.order_and_deliver(p_phone text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select order_id into v_id from public.create_order('pizzeria-demo', 'Fiel', p_phone, 'pickup', null, null, 'cash',
    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]');
  update public.orders set status = 'confirmed' where id = v_id;
  update public.orders set status = 'preparing' where id = v_id;
  update public.orders set status = 'ready' where id = v_id;
  update public.orders set status = 'delivered' where id = v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Sellos
-- -----------------------------------------------------------------------------
select pg_temp.order_and_deliver(:phone) as o1 \gset
select is((select stamps from public.loyalty_cards where restaurant_id = :A and phone = :phone), 1, 'Un pedido entregado suma un sello');

-- Un pedido cancelado no suma.
select order_id as cancelled from public.create_order('pizzeria-demo', 'Fiel', :phone, 'pickup', null, null, 'cash', :items) \gset
update public.orders set status = 'cancelled' where id = :'cancelled';
select is((select stamps from public.loyalty_cards where restaurant_id = :A and phone = :phone), 1, 'Un pedido cancelado no suma sellos');

select pg_temp.order_and_deliver(:phone) as o2 \gset
select pg_temp.order_and_deliver(:phone) as o3 \gset
select results_eq(
  format($$ select stamps, rewards_issued from public.loyalty_cards where restaurant_id = %L and phone = %L $$, 'aaaaaaaa-0000-4000-8000-000000000001', '+56955550001'),
  $$ values (0, 1) $$,
  'Al completar la tarjeta se reinicia y se cuenta el premio'
);
select ok(
  (select code ~ '^PREMIO-[A-Z2-9]{6}$' and kind = 'fixed' and value = 2000 and max_uses = 1 and customer_phone = '+56955550001'
          and ends_at > now() + interval '59 days'
   from public.coupons where restaurant_id = :A and code like 'PREMIO-%'),
  'Se genera un cupón PREMIO personal, de un solo uso, con vencimiento'
);
select code as reward from public.coupons where restaurant_id = :A and code like 'PREMIO-%' \gset

-- El seguimiento muestra los sellos y el premio (con el token de un pedido de ese cliente).
select tracking_token as t3 from public.orders where id = :'o3' \gset
set local role anon;
select ok(
  (select (r -> 'loyalty' ->> 'required')::int = 3 and r -> 'loyalty' ->> 'reward_code' = :'reward'
   from public.get_order_by_token(:'t3') r),
  'El cliente ve su tarjeta y el código de su premio en el seguimiento'
);
select is((public.get_public_menu('pizzeria-demo') -> 'restaurant' -> 'loyalty' ->> 'required')::int, 3, 'La tienda anuncia la tarjeta de sellos');
reset role;

-- El premio solo sirve para ese teléfono y una vez.
set local role service_role;
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Otro', '+56955550099', 'pickup', null, null, 'cash', %L, %L) $$, :items, :'reward'),
  'P0001', 'Cupón no válido', 'El premio no sirve con otro teléfono');
select lives_ok(format($$ select * from public.create_order('pizzeria-demo', 'Fiel', '+56955550001', 'pickup', null, null, 'cash', %L, %L) $$, :items, :'reward'),
  'El dueño del teléfono canjea su premio');
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Fiel', '+56955550001', 'pickup', null, null, 'cash', %L, %L) $$, :items, :'reward'),
  'P0001', 'Este cupón ya alcanzó su máximo de usos', 'El premio es de un solo uso');
reset role;

-- Nadie escribe sellos desde la API.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ update public.loyalty_cards set stamps = 99 $$, '42501', null, 'Ni el dueño puede modificar sellos a mano');
select is((select count(*)::int from public.loyalty_cards where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1, 'El dueño ve las tarjetas de sus clientes');

-- -----------------------------------------------------------------------------
-- Recuperar clientes
-- -----------------------------------------------------------------------------
select ok(public.create_winback_coupon(:A, '+56987654321', 15) ~ '^VUELVE-[A-Z2-9]{6}$', 'El dueño genera un cupón VUELVE para un cliente');
select throws_ok($$ select public.create_winback_coupon('aaaaaaaa-0000-4000-8000-000000000001', '+56900000000', 15) $$,
  'P0002', 'Ese teléfono no es cliente de tu local', 'Solo para clientes reales del local');
select throws_ok($$ select public.create_winback_coupon('aaaaaaaa-0000-4000-8000-000000000001', '+56987654321', 90) $$,
  '22023', null, 'Descuento acotado (5 a 50 %)');
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select public.create_winback_coupon('aaaaaaaa-0000-4000-8000-000000000001', '+56987654321', 15) $$,
  '42501', null, 'Un dueño ajeno no puede crear cupones para clientes de otro local');
reset role;

-- -----------------------------------------------------------------------------
-- Reseñas
-- -----------------------------------------------------------------------------
select tracking_token as pending_token from public.orders
where restaurant_id = :A and status = 'pending' order by created_at limit 1 \gset
set local role anon;
select throws_ok(format($$ select public.submit_review(%L, 5) $$, :'pending_token'), 'P0001',
  'Podrás calificar tu pedido cuando lo recibas', 'No se califica un pedido que no fue entregado');
select lives_ok(format($$ select public.submit_review(%L, 5, '  ¡Muy rica! <script>alert(1)</script> ') $$, :'t3'),
  'El cliente califica su pedido entregado');
select throws_ok(format($$ select public.submit_review(%L, 4) $$, :'t3'), 'P0001', 'Ya calificaste este pedido. ¡Gracias!',
  'Una sola reseña por pedido');
select ok(
  (select (r -> 'review' ->> 'rating')::int = 5 and r -> 'restaurant' ->> 'google_review_url' like 'https://%'
   from public.get_order_by_token(:'t3') r),
  'El seguimiento muestra la reseña y el link de Google del local'
);
reset role;
select is((select comment from public.order_reviews where order_id = :'o3'), '¡Muy rica! <script>alert(1)</script>',
  'El comentario se guarda como texto plano (sin interpretar); React lo escapa al mostrarlo');

select * from finish();
rollback;
