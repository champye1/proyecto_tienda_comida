-- Migración 14: nadie desde internet puede crear pedidos saltándose el CAPTCHA.
-- Solo service_role (la Edge Function place-order, después de verificar Turnstile) puede.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role anon;
select throws_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Bot', '+56900000001', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  '42501', null,
  'anon NO puede llamar create_order directamente (debe pasar por place-order + CAPTCHA)'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Bot', '+56900000001', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  '42501', null,
  'Un usuario con sesión tampoco puede saltarse el CAPTCHA'
);

set local role service_role;
select lives_ok(
  $$ select * from public.create_order('pizzeria-demo', 'Cliente Real', '+56900000002', 'pickup', null, null, 'cash',
       '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]') $$,
  'service_role (la Edge Function, después del CAPTCHA) sí puede crear pedidos'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb, text, timestamptz, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb, text, timestamptz, integer)', 'EXECUTE'),
  'Permisos: create_order sin EXECUTE para anon ni authenticated'
);

select * from finish();
rollback;
