-- Etapa A: horario de atención, zona horaria por restaurante y tiempo estimado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Horario de prueba: lunes a domingo 12:00–15:00 y 19:00–02:00 (cruza la medianoche).
-- 2026-11-02 es lunes. Santiago está en UTC-3 en noviembre (horario de verano).
\set week '[[{"open":"12:00","close":"15:00"},{"open":"19:00","close":"02:00"}],[{"open":"12:00","close":"15:00"},{"open":"19:00","close":"02:00"}],[{"open":"12:00","close":"15:00"},{"open":"19:00","close":"02:00"}],[{"open":"12:00","close":"15:00"},{"open":"19:00","close":"02:00"}],[{"open":"12:00","close":"15:00"},{"open":"19:00","close":"02:00"}],[{"open":"12:00","close":"15:00"},{"open":"19:00","close":"02:00"}],[{"open":"12:00","close":"15:00"},{"open":"19:00","close":"02:00"}]]'
-- Solo el viernes 20:00–03:00; el resto cerrado.
\set friday '[[],[],[],[],[{"open":"20:00","close":"03:00"}],[],[]]'

-- -----------------------------------------------------------------------------
-- is_open_at (función pura)
-- -----------------------------------------------------------------------------
select is(public.is_open_at(true, null, 'America/Santiago', '2026-11-02 06:00-03'), true, 'Sin horario: manda el interruptor (abierto)');
select is(public.is_open_at(false, null, 'America/Santiago', '2026-11-02 13:00-03'), false, 'Sin horario: manda el interruptor (cerrado)');
select is(public.is_open_at(false, :'week', 'America/Santiago', '2026-11-02 13:00-03'), false, 'Interruptor apagado: cerrado aunque esté en horario');
select is(public.is_open_at(true, :'week', 'America/Santiago', '2026-11-02 13:00-03'), true, '13:00 dentro del tramo de almuerzo');
select is(public.is_open_at(true, :'week', 'America/Santiago', '2026-11-02 15:00-03'), false, '15:00 en punto ya está cerrado (cierre exclusivo)');
select is(public.is_open_at(true, :'week', 'America/Santiago', '2026-11-02 17:00-03'), false, '17:00 entre tramos: cerrado');
select is(public.is_open_at(true, :'week', 'America/Santiago', '2026-11-02 23:30-03'), true, '23:30 dentro del tramo nocturno');
select is(public.is_open_at(true, :'week', 'America/Santiago', '2026-11-03 01:30-03'), true, '01:30 del día siguiente: sigue el tramo que cruzó la medianoche');
select is(public.is_open_at(true, :'week', 'America/Santiago', '2026-11-03 03:00-03'), false, '03:00: el tramo nocturno ya terminó');
select is(public.is_open_at(true, :'friday', 'America/Santiago', '2026-11-07 02:00-03'), true, 'Sábado 02:00: abierto por el tramo del viernes');
select is(public.is_open_at(true, :'friday', 'America/Santiago', '2026-11-08 02:00-03'), false, 'Domingo 02:00: el sábado no tiene tramo que cruce');
select is(public.is_open_at(true, :'friday', 'America/Santiago', '2026-11-06 21:00-03'), true, 'Viernes 21:00: abierto');
-- 13:00 en Santiago = 11:00 en Isla de Pascua (UTC-5): el mismo instante da otro resultado.
select is(public.is_open_at(true, :'week', 'Pacific/Easter', '2026-11-02 13:00-03'), false, 'La hora se evalúa en la zona del restaurante (Isla de Pascua)');

-- -----------------------------------------------------------------------------
-- Validación del horario y de las columnas nuevas
-- -----------------------------------------------------------------------------
select throws_ok($$ update public.restaurants set opening_hours = '[[],[],[]]' where slug = 'pizzeria-demo' $$,
  '22023', 'El horario debe tener los 7 días de la semana', 'Rechaza un horario sin los 7 días');
select throws_ok($$ update public.restaurants set opening_hours = '[[{"open":"25:00","close":"15:00"}],[],[],[],[],[],[]]' where slug = 'pizzeria-demo' $$,
  '22023', 'Horario inválido: usa el formato HH:MM', 'Rechaza horas inexistentes');
select throws_ok($$ update public.restaurants set opening_hours = '[[{"open":"12:00","close":"15:00","x":"<script>"}],[],[],[],[],[],[]]' where slug = 'pizzeria-demo' $$,
  '22023', 'Horario inválido: usa el formato HH:MM', 'Rechaza campos extra en un tramo');
select throws_ok($$ update public.restaurants set opening_hours = '[[{"open":"12:00","close":"12:00"}],[],[],[],[],[],[]]' where slug = 'pizzeria-demo' $$,
  '22023', 'Un tramo no puede abrir y cerrar a la misma hora', 'Rechaza tramos de duración cero');
select throws_ok($$ update public.restaurants set opening_hours = '[[{"open":"08:00","close":"09:00"},{"open":"10:00","close":"11:00"},{"open":"12:00","close":"13:00"},{"open":"14:00","close":"15:00"}],[],[],[],[],[],[]]' where slug = 'pizzeria-demo' $$,
  '22023', 'Cada día admite hasta 3 tramos de horario', 'Máximo 3 tramos por día');
select throws_ok($$ update public.restaurants set timezone = 'UTC' where slug = 'pizzeria-demo' $$,
  '23514', null, 'Solo se aceptan las zonas horarias de Chile');
select throws_ok($$ update public.restaurants set prep_time_minutes = 0 where slug = 'pizzeria-demo' $$,
  '23514', null, 'El tiempo de preparación debe estar entre 5 y 240 minutos');

-- El personal (staff) no puede cambiar el horario: solo el dueño (RLS).
insert into public.restaurant_members (restaurant_id, user_id, role)
values ('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'staff');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
update public.restaurants set opening_hours = '[[],[],[],[],[],[],[]]' where slug = 'pizzeria-demo';
reset role;
select is((select opening_hours from public.restaurants where slug = 'pizzeria-demo'), null, 'El personal no puede cambiar el horario del local');

-- -----------------------------------------------------------------------------
-- Pedidos fuera de horario
-- -----------------------------------------------------------------------------
-- Todos los días sin tramos = siempre fuera de horario.
update public.restaurants set opening_hours = '[[],[],[],[],[],[],[]]' where slug = 'pizzeria-demo';
set local role service_role;
select throws_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Ana', '+56911119999', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'P0001', 'El local está fuera de su horario de atención y no está recibiendo pedidos',
  'create_order rechaza pedidos fuera de horario aunque el interruptor esté encendido'
);
reset role;
set local role anon;
select is((public.get_public_menu('pizzeria-demo') -> 'restaurant' ->> 'is_open')::boolean, false, 'El menú público muestra el local cerrado fuera de horario');
select is(public.get_public_menu('pizzeria-demo') -> 'restaurant' -> 'opening_hours', '[[],[],[],[],[],[],[]]'::jsonb, 'El menú público incluye el horario');
select is((public.get_public_menu('pizzeria-demo') -> 'restaurant' ->> 'is_open_manual')::boolean, true,
  'El menú distingue "cerrado por horario" (interruptor encendido) de "cerrado a mano"');
reset role;
update public.restaurants set opening_hours = null where slug = 'pizzeria-demo';

-- -----------------------------------------------------------------------------
-- Tiempo estimado
-- -----------------------------------------------------------------------------
select id as pending_id, tracking_token as pending_token
from public.orders where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' and status = 'pending'
order by created_at limit 1 \gset

-- El dueño de B (que no es miembro de A como owner, pero sí como staff ahora) no; usamos un tercero: anon.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(format($$ select public.confirm_order(%L, 20) $$, :'pending_id'), 'P0002', 'Pedido no encontrado',
  'Un usuario ajeno al restaurante no puede confirmar el pedido (ni saber que existe)');

set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(format($$ select public.set_order_estimate(%L, 20) $$, :'pending_id'), 'P0001',
  'El tiempo estimado solo se puede cambiar en pedidos confirmados o en preparación', 'No se ajusta el tiempo de un pedido aún pendiente');
select throws_ok(format($$ select public.confirm_order(%L, 0) $$, :'pending_id'), '22023',
  'El tiempo estimado debe estar entre 1 y 240 minutos', 'Minutos fuera de rango');
select ok(
  (select status = 'confirmed' and estimated_ready_at between now() + interval '24 minutes' and now() + interval '26 minutes'
   from public.confirm_order(:'pending_id', 25)),
  'confirm_order confirma y fija la hora estimada (ahora + 25 min) en una sola operación'
);
select throws_ok(format($$ select public.confirm_order(%L, 20) $$, :'pending_id'), 'P0001', 'Este pedido ya no está pendiente',
  'No se puede confirmar dos veces');

-- El personal también puede ajustar el tiempo (es trabajo de cocina).
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select ok(
  (select estimated_ready_at > now() + interval '39 minutes' from public.set_order_estimate(:'pending_id', 40)),
  'El personal puede ajustar el tiempo estimado'
);
reset role;

-- Seguimiento del cliente: incluye la hora estimada y la zona horaria, sin datos personales.
set local role anon;
select ok(
  (select (r ? 'estimated_ready_at') and r -> 'restaurant' ->> 'timezone' = 'America/Santiago'
          and not (r ? 'customer_phone') and not (r ? 'customer_name')
   from public.get_order_by_token(:'pending_token') r),
  'El seguimiento muestra la hora estimada y la zona horaria, sin datos personales'
);
reset role;

-- La guardia de orders impide fijar un tiempo en un pedido terminado, incluso a service_role.
set local role service_role;
select throws_ok(
  $$ update public.orders set estimated_ready_at = now()
     where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' and status = 'delivered' $$,
  'P0001', 'El tiempo estimado solo se puede indicar en pedidos confirmados o en preparación',
  'La guardia de la tabla rechaza tiempos estimados en pedidos terminados'
);

select * from finish();
rollback;
