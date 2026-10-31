-- =============================================================================
-- 6. Storage: imágenes de restaurantes (logos y fotos de productos)
--
-- Rutas: {restaurant_id}/{archivo}
-- Bucket público: cualquiera puede ver una imagen por su URL pública
--   (/storage/v1/object/public/restaurant-images/...), sin pasar por políticas.
-- No se agrega una política SELECT abierta a anon: permitiría LISTAR los archivos
-- de todos los restaurantes. Los miembros sí pueden listar su propia carpeta
-- (también lo necesita el "upsert" para reemplazar un archivo).
-- Tipos y tamaño los aplica la API de Storage según la configuración del bucket.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-images',
  'restaurant-images',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "restaurant-images: miembros ven archivos de su restaurante"
  on storage.objects for select to authenticated
  using (bucket_id = 'restaurant-images' and public.can_manage_restaurant_file(name));

create policy "restaurant-images: miembros suben a la carpeta de su restaurante"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'restaurant-images' and public.can_manage_restaurant_file(name));

create policy "restaurant-images: miembros reemplazan archivos de su restaurante"
  on storage.objects for update to authenticated
  using (bucket_id = 'restaurant-images' and public.can_manage_restaurant_file(name))
  with check (bucket_id = 'restaurant-images' and public.can_manage_restaurant_file(name));

create policy "restaurant-images: miembros borran archivos de su restaurante"
  on storage.objects for delete to authenticated
  using (bucket_id = 'restaurant-images' and public.can_manage_restaurant_file(name));
