-- Prueba 9: update_order_status valida transiciones y pertenencia al restaurante.
-- También verifica los permisos del rol staff.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Usuario staff de A (solo dentro de esta transacción).
insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
        'authenticated', 'authenticated', 'staff-a@test.cl');
insert into public.restaurant_members (restaurant_id, user_id, role)
values ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'staff');

select id as camila    from public.orders where customer_name = 'Camila Rojas' \gset
select id as diego     from public.orders where customer_name = 'Diego Muñoz' \gset
select id as valentina from public.orders where customer_name = 'Valentina Soto' \gset
select id as matias    from public.orders where customer_name = 'Matías González' \gset

-- =============================================================================
-- Owner A
-- =============================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  format('select public.update_order_status(%L, %L)', :'camila', 'confirmed'),
  'pendiente → confirmado es válido'
);

select is(
  (select status::text from public.orders where id = :'camila'), 'confirmed',
  'El estado quedó en confirmado'
);

select throws_like(
  format('select public.update_order_status(%L, %L)', :'camila', 'pending'),
  '%de "confirmado" a "pendiente"%',
  'No se puede retroceder (confirmado → pendiente)'
);

select throws_like(
  format('select public.update_order_status(%L, %L)', :'valentina', 'pending'),
  '%de "entregado" a "pendiente"%',
  'Un pedido entregado no puede volver a pendiente'
);

select lives_ok(
  format('select public.update_order_status(%L, %L)', :'diego', 'cancelled'),
  'en preparación → cancelado es válido'
);

select throws_like(
  format('select public.update_order_status(%L, %L)', :'diego', 'ready'),
  '%de "cancelado" a "listo"%',
  'Un pedido cancelado no puede reactivarse'
);

select throws_like(
  format('select public.update_order_status(%L, %L)', :'matias', 'preparing'),
  'Pedido no encontrado',
  'A no puede cambiar el estado de un pedido de B'
);

select throws_ok(
  format('update public.orders set status = %L where id = %L', 'ready', :'camila'),
  '42501', null,
  'UPDATE directo de status en orders está prohibido (solo vía RPC)'
);

select throws_ok(
  format('update public.orders set total = 1 where id = %L', :'camila'),
  '42501', null,
  'UPDATE directo de montos en orders está prohibido'
);

-- =============================================================================
-- Staff de A
-- =============================================================================
set local "request.jwt.claims" to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select lives_ok(
  format('select public.update_order_status(%L, %L)', :'camila', 'preparing'),
  'Staff puede cambiar el estado de un pedido de su restaurante'
);

update public.restaurants set name = 'Editado por staff' where id = 'aaaaaaaa-0000-4000-8000-000000000001';

select throws_ok(
  $$ insert into public.restaurant_members (restaurant_id, user_id, role)
     values ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'staff') $$,
  '42501', null,
  'Staff no puede gestionar miembros'
);

-- =============================================================================
-- Verificación como postgres
-- =============================================================================
reset role;

select is(
  (select name from public.restaurants where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'Pizzería Demo',
  'Staff no puede editar los datos del restaurante'
);

select is(
  (select status::text from public.orders where id = :'matias'), 'confirmed',
  'El pedido de B no cambió'
);

select is(
  (select status::text from public.orders where id = :'camila'), 'preparing',
  'El cambio del staff quedó guardado'
);

-- El trigger protege incluso a roles privilegiados (service_role, SQL directo).
select throws_like(
  format('update public.orders set total = 1 where id = %L', :'camila'),
  '%Solo se puede modificar el estado%',
  'El trigger impide cambiar montos incluso con un rol privilegiado'
);

select throws_like(
  format('update public.orders set status = %L where id = %L', 'pending', :'camila'),
  '%No se puede cambiar un pedido%',
  'El trigger valida transiciones incluso con un rol privilegiado'
);

select * from finish();
rollback;
