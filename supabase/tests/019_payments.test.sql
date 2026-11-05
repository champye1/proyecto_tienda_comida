-- Etapa E: transferencia (aviso, comprobante, verificación), datos bancarios y propina.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set items '''[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1}]'''

update public.restaurants
set min_order = 0, transfer_holder = 'Pizzería Demo SpA', transfer_rut = '76.123.456-7', transfer_bank = 'Banco Estado',
    transfer_account_type = 'Cuenta corriente', transfer_account_number = '12345678', transfer_email = 'pagos@demo.cl'
where id = :A;

-- -----------------------------------------------------------------------------
-- Propina
-- -----------------------------------------------------------------------------
set local role service_role;
select throws_ok(format($$ select * from public.create_order('pizzeria-demo', 'Tip', '+56977001001', 'pickup', null, null, 'cash', %L, null, null, 1000) $$, :items),
  'P0001', 'Este local no recibe propinas en línea', 'Sin activar, no se aceptan propinas');
reset role;
update public.restaurants set tips_enabled = true where id = :A;
set local role service_role;
select order_id as tip_order from public.create_order('pizzeria-demo', 'Tip', '+56977001002', 'pickup', null, null, 'cash', :items, null, null, 1000) \gset
reset role;
select is((select tip from public.orders where id = :'tip_order'), 1000, 'Con propinas activadas, se guarda la propina');

-- El reporte separa la propina de las ventas.
update public.orders set status = 'confirmed' where id = :'tip_order';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(
  (select (r ->> 'tips')::int >= 1000 and (r ->> 'revenue')::int = (select sum(total - tip) from public.orders
                                                                     where restaurant_id = 'aaaaaaaa-0000-4000-8000-000000000001' and status <> 'cancelled'
                                                                       and created_at >= current_date - 1)
   from public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', current_date - 1, current_date + 1) r),
  'El reporte informa la propina aparte y las ventas sin propina'
);
reset role;

-- -----------------------------------------------------------------------------
-- Transferencia: aviso del cliente, comprobante y verificación
-- -----------------------------------------------------------------------------
set local role service_role;
select order_id as t_id, tracking_token as t_token
from public.create_order('pizzeria-demo', 'Transfiere', '+56977001003', 'pickup', null, null, 'transfer', :items) \gset
select order_id as c_id, tracking_token as c_token
from public.create_order('pizzeria-demo', 'Efectivo', '+56977001004', 'pickup', null, null, 'cash', :items) \gset
reset role;

set local role anon;
select ok(
  (select r -> 'restaurant' -> 'transfer' ->> 'account_number' = '12345678' and r ->> 'payment_status' = 'unpaid'
   from public.get_order_by_token(:'t_token') r),
  'El seguimiento muestra los datos de transferencia y el estado del pago'
);
select is(public.get_public_menu('pizzeria-demo') -> 'restaurant' -> 'transfer' ->> 'bank', 'Banco Estado', 'La tienda muestra los datos de transferencia');
select throws_ok(format($$ select public.report_payment_public(%L) $$, :'c_token'), 'P0001', 'Este pedido no es por transferencia',
  'No se informa pago de un pedido en efectivo');
select lives_ok(format($$ select public.report_payment_public(%L) $$, :'t_token'), 'El cliente avisa "ya transferí"');
select throws_ok(format($$ select public.report_payment(%L, %L) $$, :'t_token', 'x'), '42501', null,
  'El navegador no puede registrar una ruta de comprobante (solo la Edge Function)');
reset role;
select is((select payment_status from public.orders where id = :'t_id'), 'reported', 'El pago queda "informado"');

-- La Edge Function registra el comprobante: solo dentro de la carpeta de ESE pedido.
set local role service_role;
select throws_ok(format($$ select public.report_payment(%L, %L) $$, :'t_token', 'aaaaaaaa-0000-4000-8000-000000000001/' || :'c_id' || '/11111111-1111-4111-8111-111111111111.webp'),
  '22023', 'Comprobante no válido', 'No acepta un comprobante de la carpeta de otro pedido');
select lives_ok(format($$ select public.report_payment(%L, %L) $$, :'t_token', 'aaaaaaaa-0000-4000-8000-000000000001/' || :'t_id' || '/11111111-1111-4111-8111-111111111111.webp'),
  'Registra el comprobante de la carpeta del pedido');
reset role;

-- Verificación por el local.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(format($$ select public.verify_payment(%L) $$, :'t_id'), 'P0002', 'Pedido no encontrado', 'Otro local no puede verificar el pago');
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select payment_status from public.verify_payment(:'t_id')), 'verified', 'El local marca el pago como verificado');
reset role;
set local role anon;
select throws_ok(format($$ select public.report_payment_public(%L) $$, :'t_token'), 'P0001', 'El restaurante ya confirmó tu pago',
  'Una vez verificado, el cliente no puede volver a cambiarlo');
reset role;

-- La guardia impide retroceder el estado del pago, incluso a service_role.
set local role service_role;
select throws_ok(format($$ update public.orders set payment_status = 'unpaid' where id = %L $$, :'t_id'), 'P0001',
  'Cambio de estado de pago no válido', 'El estado del pago no puede retroceder');
reset role;

-- -----------------------------------------------------------------------------
-- Bucket privado
-- -----------------------------------------------------------------------------
select is((select public from storage.buckets where id = 'payment-receipts'), false, 'El bucket de comprobantes es privado');
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'payment-receipts:%' and cmd in ('INSERT', 'UPDATE', 'DELETE')),
  0, 'Nadie puede escribir comprobantes directo (solo la Edge Function con service_role)'
);

select * from finish();
rollback;
