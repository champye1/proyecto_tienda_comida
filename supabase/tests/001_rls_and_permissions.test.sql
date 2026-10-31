-- Prueba 1: RLS activado en todas las tablas y permisos mínimos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select is_empty(
  $$ select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'Todas las tablas de public tienen RLS activado'
);

select is_empty(
  $$ select tablename || ': ' || policyname from pg_policies
     where schemaname = 'public' and cmd = 'ALL' $$,
  'No hay políticas FOR ALL en public'
);

select is_empty(
  $$ select tablename || ': ' || policyname from pg_policies
     where schemaname = 'public' and roles @> array['public'::name] $$,
  'Todas las políticas declaran rol explícito (anon o authenticated)'
);

select is_empty(
  $$ select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and (has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
            or has_any_column_privilege('anon', c.oid, 'INSERT, UPDATE')) $$,
  'anon no puede escribir en ninguna tabla de public'
);

select is_empty(
  $$ select c.relname
     from pg_class c
     where c.oid in ('public.orders'::regclass, 'public.order_items'::regclass, 'public.order_counters'::regclass)
       and (has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
            or has_any_column_privilege('authenticated', c.oid, 'INSERT, UPDATE')) $$,
  'authenticated no puede escribir directamente en orders, order_items ni order_counters'
);

select is_empty(
  $$ select p.proname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname not in ('create_order', 'get_order_by_token', 'is_restaurant_public', 'get_public_menu') $$,
  'anon solo puede ejecutar las funciones públicas (pedido, seguimiento, menú)'
);

select is_empty(
  $$ select p.proname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and p.proname not in (
         'create_order', 'get_order_by_token', 'create_restaurant', 'update_order_status',
         'is_restaurant_public', 'is_restaurant_member', 'is_restaurant_owner', 'can_manage_restaurant_file',
         'is_slug_available', 'is_reserved_slug', 'reorder_menu_items', 'get_public_menu', 'get_sales_report'
       ) $$,
  'authenticated solo puede ejecutar las funciones permitidas'
);

select * from finish();
rollback;
