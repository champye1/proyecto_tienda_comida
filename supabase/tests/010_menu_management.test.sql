-- Etapa 4: posición automática, reorder_menu_items e imágenes solo del Storage propio.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Posición automática ------------------------------------------------------------------
insert into public.categories (restaurant_id, name, position)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Promociones', 0);

select is(
  (select position from public.categories where name = 'Promociones'), 3,
  'Una categoría nueva queda al final aunque el cliente envíe position = 0'
);

insert into public.products (restaurant_id, category_id, name, price)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c3', 'Panna cotta', 3490);

select is(
  (select position from public.products where name = 'Panna cotta'), 1,
  'Un producto nuevo queda al final de su categoría'
);

update public.products set category_id = 'aaaaaaaa-0000-4000-8000-0000000000c3'
where id = 'aaaaaaaa-0000-4000-8000-0000000000d6';

select is(
  (select position from public.products where id = 'aaaaaaaa-0000-4000-8000-0000000000d6'), 2,
  'Al cambiar de categoría, el producto pasa al final de la nueva'
);

-- reorder_menu_items --------------------------------------------------------------------
select lives_ok(
  $$ select public.reorder_menu_items('categories', array[
       'aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c2'
     ]::uuid[]) $$,
  'A reordena sus categorías'
);

select results_eq(
  $$ select id::text from public.categories
     where id in ('aaaaaaaa-0000-4000-8000-0000000000c1','aaaaaaaa-0000-4000-8000-0000000000c2','aaaaaaaa-0000-4000-8000-0000000000c3')
     order by position $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000c3'), ('aaaaaaaa-0000-4000-8000-0000000000c1'), ('aaaaaaaa-0000-4000-8000-0000000000c2') $$,
  'El nuevo orden quedó guardado'
);

select throws_ok(
  $$ select public.reorder_menu_items('categories', array['bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-0000000000c2']::uuid[]) $$,
  'P0002', 'No se encontraron los elementos a ordenar',
  'A no puede reordenar categorías de B'
);

select throws_ok(
  $$ select public.reorder_menu_items('categories', array['aaaaaaaa-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-0000000000c1']::uuid[]) $$,
  'P0002', null,
  'No se pueden mezclar elementos de dos restaurantes'
);

select throws_ok(
  $$ select public.reorder_menu_items('restaurant_members; drop table orders', array['aaaaaaaa-0000-4000-8000-0000000000c1']::uuid[]) $$,
  '22023', 'Tipo de elemento inválido',
  'Un tipo fuera de la lista blanca se rechaza (sin SQL dinámico arbitrario)'
);

select throws_ok(
  $$ select public.reorder_menu_items('categories', array['aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c1']::uuid[]) $$,
  '22023', null,
  'Se rechazan ids repetidos'
);

-- Imágenes solo del Storage propio -------------------------------------------------------
select lives_ok(
  $$ update public.products
     set image_url = 'http://127.0.0.1:55321/storage/v1/object/public/restaurant-images/aaaaaaaa-0000-4000-8000-000000000001/foto.webp'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  'Se acepta una imagen de la carpeta propia en nuestro Storage'
);

select throws_ok(
  $$ update public.products set image_url = 'https://otro-sitio.com/rastreo.png'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '23514', null,
  'Se rechaza una imagen externa'
);

select throws_ok(
  $$ update public.products
     set image_url = 'http://127.0.0.1:55321/storage/v1/object/public/restaurant-images/bbbbbbbb-0000-4000-8000-000000000001/foto.webp'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '23514', null,
  'Se rechaza una imagen de la carpeta de otro restaurante'
);

select throws_ok(
  $$ update public.restaurants set logo_url = 'https://otro-sitio.com/logo.png'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '23514', null,
  'Se rechaza un logo externo'
);

set local role anon;
select throws_ok(
  $$ select public.reorder_menu_items('categories', array['aaaaaaaa-0000-4000-8000-0000000000c1']::uuid[]) $$,
  '42501', null,
  'anon no puede ejecutar reorder_menu_items'
);

select * from finish();
rollback;
