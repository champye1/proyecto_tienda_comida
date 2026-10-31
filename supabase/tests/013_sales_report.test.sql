-- Etapa 7: reporte de ventas (montos, productos más vendidos, días de Chile y acceso).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- "Hoy" en Chile (los pedidos del seed se crean ahora).
select (now() at time zone 'America/Santiago')::date as today \gset

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Seed de A (hoy): 18.490 (pendiente) + 19.980 (en preparación) + 20.970 (entregado).
select is((public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', :'today', :'today') ->> 'revenue')::int, 59440, 'Ventas del día = suma de pedidos no cancelados');
select is((public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', :'today', :'today') ->> 'orders')::int, 3, 'Cantidad de pedidos');
select is((public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', :'today', :'today') ->> 'avg_ticket')::int, 19813, 'Ticket promedio (redondeado)');
select is(
  public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', :'today', :'today') -> 'top_products' -> 0 ->> 'name',
  'Pepperoni',
  'Producto más vendido: Pepperoni (2 unidades, mayor monto que Tiramisú)'
);
select is(
  jsonb_array_length(public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', :'today', :'today') -> 'series'),
  24,
  'Un solo día: serie de 24 horas (incluye horas sin ventas)'
);
select is(
  jsonb_array_length(public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', (:'today'::date - 6), :'today') -> 'series'),
  7,
  'Siete días: serie de 7 días'
);
select is((public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', (:'today'::date - 1), (:'today'::date - 1)) ->> 'revenue')::int, 0, 'Ayer (sin pedidos) = 0');

-- Cancelados no suman (B: 16.580 confirmado + 15.480 cancelado).
set local "request.jwt.claims" to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select results_eq(
  format($$ select (r ->> 'revenue')::int, (r ->> 'cancelled')::int
            from public.get_sales_report('bbbbbbbb-0000-4000-8000-000000000001', %L, %L) r $$, :'today', :'today'),
  $$ values (16580, 1) $$,
  'Los cancelados se informan aparte y no suman a las ventas'
);

-- Acceso.
select throws_ok(
  format($$ select public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', %L, %L) $$, :'today', :'today'),
  '42501', 'No tienes acceso a los reportes de este restaurante',
  'B no puede ver el reporte de A'
);
select throws_like(
  format($$ select public.get_sales_report('bbbbbbbb-0000-4000-8000-000000000001', %L, %L) $$, (:'today'::date - 40), :'today'),
  '%máximo del reporte es de 31 días%',
  'Rango de más de 31 días: rechazado'
);
select throws_like(
  format($$ select public.get_sales_report('bbbbbbbb-0000-4000-8000-000000000001', %L, %L) $$, :'today', (:'today'::date - 1)),
  '%rango de fechas no es válido%',
  'Rango invertido: rechazado'
);

set local role anon;
select throws_ok(
  format($$ select public.get_sales_report('aaaaaaaa-0000-4000-8000-000000000001', %L, %L) $$, :'today', :'today'),
  '42501', null,
  'anon no puede ver reportes'
);

select * from finish();
rollback;
