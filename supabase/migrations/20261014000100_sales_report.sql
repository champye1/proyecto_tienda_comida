-- =============================================================================
-- 13. Reporte de ventas (etapa 7)
--
-- get_sales_report(restaurant_id, desde, hasta): todo el reporte en UNA consulta.
--
--   * Los días son días de Chile (America/Santiago), no UTC: un pedido de las 22:00 de
--     hoy cuenta para hoy, no para mañana.
--   * "Ventas" = pedidos NO cancelados (pendientes, en curso y entregados). Los cancelados
--     se informan aparte y no suman.
--   * Productos más vendidos: por el nombre guardado al momento de la compra (si el
--     producto se renombró o se borró, el historial no cambia).
--   * Rango máximo de 31 días: el reporte siempre es acotado (rendimiento).
--
-- Seguridad (doble capa):
--   * SECURITY INVOKER: la RLS de orders/order_items se aplica a quien consulta.
--   * Además verifica explícitamente que el usuario sea miembro del restaurante y, si no,
--     responde un error claro (en vez de un reporte vacío que parezca "sin ventas").
-- =============================================================================

create function public.get_sales_report(p_restaurant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  c_tz       constant text := 'America/Santiago';
  v_start    timestamptz;
  v_end      timestamptz;
  v_hourly   boolean;
begin
  if (select auth.uid()) is null or not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'No tienes acceso a los reportes de este restaurante' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;

  if p_to - p_from > 30 then
    raise exception 'El rango máximo del reporte es de 31 días' using errcode = '22023';
  end if;

  -- Medianoche de Chile del primer día → medianoche de Chile del día siguiente al último.
  v_start  := p_from::timestamp at time zone c_tz;
  v_end    := (p_to + 1)::timestamp at time zone c_tz;
  v_hourly := p_from = p_to; -- un solo día: ventas por hora; varios días: por día

  return (
    with o as (
      select *
      from public.orders
      where restaurant_id = p_restaurant_id
        and created_at >= v_start
        and created_at < v_end
    ),
    sold as (select * from o where status <> 'cancelled')
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'timezone', c_tz,
      'revenue', coalesce((select sum(total) from sold), 0),
      'orders', (select count(*) from sold),
      'avg_ticket', coalesce((select round(avg(total))::integer from sold), 0),
      'cancelled', (select count(*) from o where status = 'cancelled'),
      'by_type', jsonb_build_object(
        'delivery', jsonb_build_object('orders', (select count(*) from sold where type = 'delivery'),
                                       'revenue', coalesce((select sum(total) from sold where type = 'delivery'), 0)),
        'pickup',   jsonb_build_object('orders', (select count(*) from sold where type = 'pickup'),
                                       'revenue', coalesce((select sum(total) from sold where type = 'pickup'), 0))
      ),
      'by_payment', jsonb_build_object(
        'cash',     jsonb_build_object('orders', (select count(*) from sold where payment_method = 'cash'),
                                       'revenue', coalesce((select sum(total) from sold where payment_method = 'cash'), 0)),
        'transfer', jsonb_build_object('orders', (select count(*) from sold where payment_method = 'transfer'),
                                       'revenue', coalesce((select sum(total) from sold where payment_method = 'transfer'), 0))
      ),
      -- Serie de tiempo completa (incluye horas/días sin ventas, para que el gráfico no salte huecos).
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('bucket', b.bucket, 'orders', coalesce(s.orders, 0), 'revenue', coalesce(s.revenue, 0)) order by b.bucket), '[]'::jsonb)
        from (
          select g as bucket
          from generate_series(0, case when v_hourly then 23 else p_to - p_from end) as g
        ) b
        left join (
          select case when v_hourly then extract(hour from created_at at time zone c_tz)::integer
                      else ((created_at at time zone c_tz)::date - p_from) end as bucket,
                 count(*) as orders,
                 sum(total) as revenue
          from sold
          group by 1
        ) s on s.bucket = b.bucket
      ),
      'series_unit', case when v_hourly then 'hour' else 'day' end,
      'top_products', (
        select coalesce(jsonb_agg(t order by t.quantity desc, t.revenue desc, t.name), '[]'::jsonb)
        from (
          select i.product_name as name, sum(i.quantity)::integer as quantity, sum(i.line_total)::integer as revenue
          from public.order_items i
          join sold on sold.id = i.order_id and sold.created_at = i.order_created_at
          where i.restaurant_id = p_restaurant_id
          group by i.product_name
          order by 2 desc, 3 desc, 1
          limit 10
        ) t
      )
    )
  );
end;
$$;

revoke execute on function public.get_sales_report(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_sales_report(uuid, date, date) to authenticated;
