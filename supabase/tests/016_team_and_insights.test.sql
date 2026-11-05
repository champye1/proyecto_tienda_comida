-- Etapa B: invitaciones al personal, equipo, clientes frecuentes y reporte ampliado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Usuarios extra: uno invitado (email confirmado) y uno sin confirmar.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'cocina@test.cl', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated',
   'sinconfirmar@test.cl', '', null, '{}', '{}', now(), now());

\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set owner_a '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}'
\set owner_b '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}'
\set cocina '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}'
\set sinconf '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}'

-- -----------------------------------------------------------------------------
-- Crear invitaciones
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to :'owner_a';

select token as invite_token from public.create_invitation(:A, '  Cocina@Test.cl ') \gset
select ok(:'invite_token' ~ '^[0-9a-f]{48}$', 'create_invitation devuelve un token de 192 bits');
select token as invite_unconfirmed from public.create_invitation(:A, 'sinconfirmar@test.cl') \gset
select token as invite_expired from public.create_invitation(:A, 'vencida@test.cl') \gset

select throws_ok($$ select public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'no-es-email') $$,
  '22023', 'Ingresa un email válido', 'Rechaza emails inválidos');
select throws_ok($$ select public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@test.cl') $$,
  'P0001', 'Esa persona ya es parte de tu equipo', 'No se invita a quien ya es miembro');
select is((select count(*)::int from public.restaurant_invitations where restaurant_id = :A), 3,
  'El dueño ve sus invitaciones (el email se guarda en minúsculas y sin espacios)');
select throws_ok($$ insert into public.restaurant_members (restaurant_id, user_id, role)
                    values ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'staff') $$,
  '42501', null, 'El dueño ya no puede agregar miembros directamente (solo por invitación aceptada)');

-- Otro dueño no puede invitar a A ni ver sus invitaciones.
set local "request.jwt.claims" to :'owner_b';
select throws_ok($$ select public.create_invitation('aaaaaaaa-0000-4000-8000-000000000001', 'x@test.cl') $$,
  '42501', 'Solo el dueño puede invitar personal', 'Un dueño ajeno no puede invitar al equipo de A');
select is((select count(*)::int from public.restaurant_invitations where restaurant_id = :A), 0,
  'Un dueño ajeno no ve las invitaciones de A');
reset role;

-- En la base no queda el token, solo su hash.
select is((select count(*)::int from public.restaurant_invitations where token_hash = :'invite_token'), 0,
  'El token no se guarda en texto plano');
select is((select count(*)::int from public.restaurant_invitations
           where token_hash = encode(extensions.digest(:'invite_token', 'sha256'), 'hex')), 1,
  'Se guarda el hash SHA-256 del token');
update public.restaurant_invitations set expires_at = now() - interval '1 minute' where email = 'vencida@test.cl';

-- -----------------------------------------------------------------------------
-- Ver y aceptar
-- -----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to :'cocina';
select is(public.get_invitation(:'invite_token') ->> 'restaurant_name', 'Pizzería Demo', 'La invitación muestra el nombre del local');
select is((public.get_invitation(:'invite_token') ->> 'email_matches')::boolean, true, 'Indica si la sesión coincide con el email invitado');
select is(public.get_invitation(:'invite_token') ->> 'email_hint', 'co***@test.cl', 'El email se muestra enmascarado');
select is(public.get_invitation('ffffffffffffffffffffffffffffffffffffffffffffffff'), null, 'Un token inexistente no devuelve nada');

set local "request.jwt.claims" to :'owner_b';
select throws_ok(format($$ select public.accept_invitation(%L) $$, :'invite_token'), '42501',
  'Esta invitación es para otro email. Inicia sesión con el email al que te invitaron',
  'Otra cuenta no puede usar la invitación aunque tenga el link');

set local "request.jwt.claims" to :'sinconf';
select throws_ok(format($$ select public.accept_invitation(%L) $$, :'invite_unconfirmed'), 'P0001',
  'Confirma tu email antes de aceptar la invitación', 'Se exige el email confirmado');

set local "request.jwt.claims" to :'cocina';
select throws_ok(format($$ select public.accept_invitation(%L) $$, :'invite_expired'), 'P0001', null,
  'Una invitación vencida no se puede usar (se revisa antes que el email)');
select is(public.accept_invitation(:'invite_token'), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'El invitado acepta y se une al restaurante');
select is((select role::text from public.restaurant_members where user_id = '33333333-3333-4333-8333-333333333333'), 'staff',
  'Queda como personal (staff), nunca como dueño');
select throws_ok(format($$ select public.accept_invitation(%L) $$, :'invite_token'), 'P0002',
  'La invitación no existe o ya fue usada', 'El link es de un solo uso');

-- El personal no ve el equipo ni las invitaciones.
select throws_ok($$ select * from public.get_team('aaaaaaaa-0000-4000-8000-000000000001') $$, '42501',
  'Solo el dueño puede ver el equipo', 'El personal no ve la lista del equipo');
select is((select count(*)::int from public.restaurant_invitations), 0, 'El personal no ve las invitaciones');
reset role;

-- Invitación vencida: el dueño la ve vencida; el invitado correcto recibe el mensaje claro.
update public.restaurant_invitations set email = 'cocina2@test.cl' where email = 'vencida@test.cl';
update auth.users set email = 'cocina2@test.cl' where id = '44444444-4444-4444-8444-444444444444';
update auth.users set email_confirmed_at = now() where id = '44444444-4444-4444-8444-444444444444';
set local role authenticated;
set local "request.jwt.claims" to :'sinconf';
select throws_ok(format($$ select public.accept_invitation(%L) $$, :'invite_expired'), 'P0001',
  'La invitación venció. Pide al dueño que te envíe una nueva', 'Las invitaciones vencen a los 7 días');

-- -----------------------------------------------------------------------------
-- Equipo y revocación (dueño)
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to :'owner_a';
select results_eq(
  $$ select email, role::text from public.get_team('aaaaaaaa-0000-4000-8000-000000000001') $$,
  $$ values ('owner-a@test.cl', 'owner'), ('cocina@test.cl', 'staff') $$,
  'El dueño ve su equipo con los emails'
);
delete from public.restaurant_invitations where restaurant_id = :A;
select is((select count(*)::int from public.restaurant_invitations where restaurant_id = :A), 1,
  'El dueño revoca las pendientes; la aceptada queda como registro');

-- -----------------------------------------------------------------------------
-- Clientes frecuentes
-- -----------------------------------------------------------------------------
select ok(
  (select orders >= 1 and name = 'Camila Rojas' from public.get_customers(:A) where phone = '+56987654321'),
  'get_customers agrupa por teléfono con el nombre y la cantidad de pedidos'
);
set local "request.jwt.claims" to :'owner_b';
select throws_ok($$ select * from public.get_customers('aaaaaaaa-0000-4000-8000-000000000001') $$, '42501', null,
  'Un dueño ajeno no ve los clientes de A');

-- -----------------------------------------------------------------------------
-- Reporte ampliado
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to :'owner_a';
select is(public.get_sales_report(:A, current_date - 120, current_date) ->> 'series_unit', 'month', 'Más de 92 días: serie por mes');
select ok(
  (select jsonb_array_length(r -> 'peak_hours') = 24 and jsonb_array_length(r -> 'by_weekday') = 7
          and jsonb_typeof(r -> 'unsold_products') = 'array' and jsonb_array_length(r -> 'unsold_products') > 0
   from public.get_sales_report(:A, current_date - 6, current_date) r),
  'El reporte trae horas peak (24), días de la semana (7) y productos sin ventas'
);
select throws_like(format($$ select public.get_sales_report(%L, current_date - 400, current_date) $$, 'aaaaaaaa-0000-4000-8000-000000000001'),
  '%máximo del reporte es de un año%', 'Rango de más de un año: rechazado');

select * from finish();
rollback;
