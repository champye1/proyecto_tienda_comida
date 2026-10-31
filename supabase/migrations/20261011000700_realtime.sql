-- =============================================================================
-- 7. Realtime
--
-- Los cambios en orders se publican por supabase_realtime (postgres_changes).
-- Realtime evalúa la política SELECT de orders con el JWT de cada suscriptor:
-- un miembro del restaurante A solo recibe eventos de pedidos de A, aunque
-- intente suscribirse sin filtro o con el restaurant_id de otro.
-- anon no tiene SELECT sobre orders, así que no recibe ningún evento.
--
-- Escalabilidad: postgres_changes revisa RLS por cada suscriptor y evento. Si el
-- volumen crece mucho, el paso siguiente es emitir por Realtime Broadcast desde un
-- trigger (realtime.broadcast_changes) a un canal privado por restaurante.
-- =============================================================================

alter publication supabase_realtime add table public.orders;
