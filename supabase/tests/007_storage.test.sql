-- Prueba 10: un usuario solo puede subir archivos a la carpeta de su restaurante.
-- (El borrado se prueba por la API en scripts/verify-api.mjs: Storage bloquea
--  cualquier DELETE directo en SQL con el trigger protect_objects_delete.)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Archivo existente de B.
insert into storage.objects (bucket_id, name)
values ('restaurant-images', 'bbbbbbbb-0000-4000-8000-000000000001/menu.png');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('restaurant-images', 'aaaaaaaa-0000-4000-8000-000000000001/logo.png') $$,
  'A puede subir a la carpeta de su restaurante'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('restaurant-images', 'bbbbbbbb-0000-4000-8000-000000000001/logo.png') $$,
  '42501', null,
  'A no puede subir a la carpeta de B'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('restaurant-images', 'logo.png') $$,
  '42501', null,
  'A no puede subir fuera de una carpeta de restaurante'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('restaurant-images', 'no-es-uuid/logo.png') $$,
  '42501', null,
  'A no puede subir a una carpeta con nombre inválido'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('restaurant-images', 'aaaaaaaa-0000-4000-8000-000000000001/../bbbbbbbb-0000-4000-8000-000000000001/x.png') $$,
  '42501', null,
  'A no puede usar subcarpetas ni rutas relativas'
);

select is_empty(
  $$ select 1 from storage.objects where name like 'bbbbbbbb-0000-4000-8000-000000000001/%' $$,
  'A no puede listar los archivos de B'
);

update storage.objects set name = 'aaaaaaaa-0000-4000-8000-000000000001/robado.png'
where name = 'bbbbbbbb-0000-4000-8000-000000000001/menu.png';

set local role anon;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('restaurant-images', 'aaaaaaaa-0000-4000-8000-000000000001/anon.png') $$,
  '42501', null,
  'anon no puede subir archivos'
);

reset role;

select isnt_empty(
  $$ select 1 from storage.objects where name = 'bbbbbbbb-0000-4000-8000-000000000001/menu.png' $$,
  'A no pudo mover ni renombrar el archivo de B'
);

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'restaurant-images' $$,
  $$ values (true, 5242880::bigint, array['image/jpeg', 'image/png', 'image/webp']) $$,
  'Bucket público, máximo 5 MB, solo jpeg/png/webp'
);

select * from finish();
rollback;
