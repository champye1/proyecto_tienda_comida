-- Etapa 6: aviso en vivo al cliente cuando cambia el estado de su pedido.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select id as order_id, tracking_token as token from public.orders where customer_name = 'Camila Rojas' \gset

-- El restaurante confirma el pedido (como owner A, por la RPC).
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.update_order_status(:'order_id', 'confirmed') is not null as ignore \gset
reset role;

select is(
  (select count(*)::int from realtime.messages where topic = 'order:' || :'token' and event = 'status'),
  1,
  'Un cambio de estado publica un aviso en el canal del pedido'
);

select is(
  (select payload ->> 'status' from realtime.messages where topic = 'order:' || :'token' order by inserted_at desc limit 1),
  'confirmed',
  'El aviso trae el nuevo estado'
);

-- realtime.send agrega "id": un UUID aleatorio propio de cada mensaje (no es un dato del pedido).
select ok(
  (select array_agg(k order by k) = array['id', 'status']
          and m.payload ->> 'id' <> :'order_id'
   from realtime.messages m, jsonb_object_keys(m.payload) k
   where m.topic = 'order:' || :'token'
   group by m.payload),
  'El aviso NO incluye datos personales ni montos (solo "status" + id aleatorio del mensaje)'
);

select is(
  (select private from realtime.messages where topic = 'order:' || :'token' limit 1),
  false,
  'Canal público: el acceso lo controla el token secreto del nombre del canal'
);

-- Un UPDATE que no cambia el estado no genera avisos.
update public.orders set status = status where id = :'order_id';
select is(
  (select count(*)::int from realtime.messages where topic = 'order:' || :'token'),
  1,
  'Sin cambio de estado, no hay aviso'
);

select * from finish();
rollback;
