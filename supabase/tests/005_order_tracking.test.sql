-- Prueba 8: get_order_by_token devuelve el pedido correcto, sin datos personales.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select tracking_token as token_a from public.orders where customer_name = 'Camila Rojas' \gset
select tracking_token as token_b from public.orders where customer_name = 'Matías González' \gset

set local role anon;

select is(public.get_order_by_token(:'token_a') ->> 'order_number', '1', 'Devuelve el número del pedido');
select is(public.get_order_by_token(:'token_a') -> 'restaurant' ->> 'name', 'Pizzería Demo', 'Devuelve el nombre del restaurante');
select is(public.get_order_by_token(:'token_a') ->> 'status', 'pending', 'Devuelve el estado');
select is(public.get_order_by_token(:'token_a') ->> 'total', '18490', 'Devuelve el total');
select is(jsonb_array_length(public.get_order_by_token(:'token_a') -> 'items'), 2, 'Devuelve los ítems');

select ok(
  not (public.get_order_by_token(:'token_a') ?| array['customer_phone', 'customer_name', 'address', 'notes', 'id', 'restaurant_id', 'tracking_token']),
  'No incluye claves con datos personales ni identificadores internos'
);

select ok(
  public.get_order_by_token(:'token_a')::text not like '%987654321%'
  and public.get_order_by_token(:'token_a')::text not like '%Los Leones%'
  and public.get_order_by_token(:'token_a')::text not like '%Camila%',
  'El teléfono, la dirección y el nombre del cliente no aparecen en ninguna parte de la respuesta'
);

select is(public.get_order_by_token(:'token_b') -> 'restaurant' ->> 'name', 'Sushi Demo', 'El token de otro pedido devuelve ese pedido y no otro');

select is(public.get_order_by_token(repeat('a', 48)), null, 'Un token inexistente no devuelve nada');
select is(public.get_order_by_token($$' or '1'='1$$), null, 'Un token malformado no devuelve nada');
select is(public.get_order_by_token(null), null, 'Un token nulo no devuelve nada');

select * from finish();
rollback;
