-- =============================================================================
-- 12. Seguimiento en vivo del pedido para el cliente (etapa 6)
--
-- El cliente de la tienda es anónimo: la RLS no le permite escuchar cambios de la tabla
-- orders (y está bien así). Para avisarle en vivo, cada cambio de estado se publica por
-- Realtime Broadcast en el canal "order:{tracking_token}".
--
-- Seguridad:
--   * El nombre del canal incluye el token secreto de 192 bits: solo quien tiene el link
--     del pedido puede adivinarlo (mismo nivel de acceso que la página de seguimiento).
--   * El mensaje NO lleva datos personales ni montos: solo el nuevo estado. Además la
--     tienda lo usa únicamente como señal de "algo cambió" y vuelve a pedir el estado real
--     con get_order_by_token; un mensaje falso no puede mostrar información falsa.
--   * El panel del restaurante NO usa esto: escucha la tabla orders con postgres_changes,
--     donde la RLS filtra por restaurante.
-- =============================================================================

create function public.orders_broadcast_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('status', new.status),
    'status',
    'order:' || new.tracking_token,
    false -- canal público: el control de acceso es el token secreto en el nombre del canal
  );
  return null;
end;
$$;

create trigger orders_broadcast_status
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.orders_broadcast_status();

revoke execute on function public.orders_broadcast_status() from public, anon, authenticated;
