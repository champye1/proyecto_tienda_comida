-- =============================================================================
-- 9. Endurecimiento de seguridad (auditoría de la etapa 3)
--
--   a) Límite de pedidos por teléfono: frena que alguien inunde la cocina de un
--      restaurante con pedidos falsos desde la tienda pública (create_order es anónima).
--   b) URLs de imágenes solo http(s): impide guardar esquemas peligrosos como
--      javascript: o data: en logo_url / image_url.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- a) Límite de frecuencia de pedidos
--
-- Regla: máximo 3 pedidos por teléfono, por restaurante, en 10 minutos.
--
-- Se aplica con un trigger BEFORE INSERT en orders (y no dentro de create_order) para
-- que cubra cualquier camino de inserción. No tiene carreras: create_order bloquea la
-- fila de order_counters del restaurante antes de insertar, así que dos pedidos
-- simultáneos del mismo restaurante se procesan en fila y el segundo ve al primero.
--
-- Limitación conocida: quien rote números de teléfono falsos puede saltarse esta regla.
-- La defensa completa contra bots es un CAPTCHA en el checkout + límite por IP en el
-- hosting/WAF (ver SECURITY.md, checklist de producción).
-- -----------------------------------------------------------------------------

-- Índice para que el conteo sea una búsqueda directa y no un recorrido de la tabla.
create index orders_restaurant_phone_created_at_idx
  on public.orders (restaurant_id, customer_phone, created_at desc);

create function public.orders_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_max_orders constant integer  := 3;
  c_window     constant interval := interval '10 minutes';
begin
  if (
    select count(*)
    from public.orders o
    where o.restaurant_id = new.restaurant_id
      and o.customer_phone = new.customer_phone
      and o.created_at > now() - c_window
  ) >= c_max_orders then
    raise exception 'Ya enviaste varios pedidos en los últimos minutos. Espera un momento o llama al restaurante.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger a_orders_rate_limit
  before insert on public.orders
  for each row execute function public.orders_rate_limit();

revoke execute on function public.orders_rate_limit() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- b) URLs de imágenes: solo http:// o https://, sin espacios.
-- (En producción todas apuntarán al Storage de Supabase, que es https.)
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add constraint restaurants_logo_url_scheme check (logo_url is null or logo_url ~ '^https?://\S+$');

alter table public.products
  add constraint products_image_url_scheme check (image_url is null or image_url ~ '^https?://\S+$');
