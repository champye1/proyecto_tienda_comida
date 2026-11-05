-- =============================================================================
-- 14. Los pedidos de la tienda pasan obligatoriamente por el CAPTCHA
--
-- Antes, create_order se podía llamar directo desde internet (anon). Un bot podía
-- crear pedidos falsos en masa saltándose cualquier CAPTCHA puesto en la pantalla.
--
-- Ahora solo la Edge Function "place-order" puede crear pedidos: primero verifica el
-- CAPTCHA (Cloudflare Turnstile) y después llama a create_order con la clave de servicio,
-- que vive solo en el servidor. Todas las validaciones de negocio siguen en create_order.
-- =============================================================================

revoke execute on function public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_order(text, text, text, public.order_type, text, text, public.payment_method, jsonb)
  to service_role;
