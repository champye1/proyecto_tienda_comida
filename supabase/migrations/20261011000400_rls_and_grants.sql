-- =============================================================================
-- 4. Row Level Security y permisos
--
-- Dos capas:
--   1. GRANT/REVOKE: qué operaciones puede intentar cada rol sobre cada tabla
--      (y qué columnas puede modificar).
--   2. RLS: sobre qué filas.
-- Una operación sin GRANT falla con "permission denied" antes de llegar a RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RLS activado en TODAS las tablas de public
-- -----------------------------------------------------------------------------
alter table public.restaurants        enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.option_groups      enable row level security;
alter table public.options            enable row level security;
alter table public.order_counters     enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;

-- -----------------------------------------------------------------------------
-- Permisos de tabla: se parte de cero y se otorga lo mínimo
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Las tablas que se creen en el futuro tampoco quedan abiertas por defecto.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- anon: solo lectura del menú público.
grant select on public.restaurants, public.categories, public.products,
                public.option_groups, public.options
  to anon;

-- authenticated: lectura del menú público + su propio restaurante.
grant select on public.restaurants, public.restaurant_members, public.categories,
                public.products, public.option_groups, public.options,
                public.orders, public.order_items
  to authenticated;

-- restaurants: solo se crean vía create_restaurant(). El owner edita estas columnas
-- (no id, is_active ni timestamps).
grant update (slug, name, description, logo_url, primary_color, phone, address,
              is_open, delivery_enabled, pickup_enabled, delivery_fee, min_order)
  on public.restaurants to authenticated;
grant delete on public.restaurants to authenticated;

-- restaurant_members: el owner gestiona el equipo.
grant insert (restaurant_id, user_id, role) on public.restaurant_members to authenticated;
grant update (role) on public.restaurant_members to authenticated;
grant delete on public.restaurant_members to authenticated;

-- Menú: restaurant_id se fija al crear y no se puede cambiar después.
grant insert (restaurant_id, name, position, is_active) on public.categories to authenticated;
grant update (name, position, is_active) on public.categories to authenticated;
grant delete on public.categories to authenticated;

grant insert (restaurant_id, category_id, name, description, price, image_url, is_available, position)
  on public.products to authenticated;
grant update (category_id, name, description, price, image_url, is_available, position)
  on public.products to authenticated;
grant delete on public.products to authenticated;

grant insert (restaurant_id, product_id, name, min_select, max_select, position)
  on public.option_groups to authenticated;
grant update (name, min_select, max_select, position) on public.option_groups to authenticated;
grant delete on public.option_groups to authenticated;

grant insert (restaurant_id, option_group_id, name, extra_price, is_available, position)
  on public.options to authenticated;
grant update (name, extra_price, is_available, position) on public.options to authenticated;
grant delete on public.options to authenticated;

-- orders / order_items / order_counters: sin INSERT, UPDATE ni DELETE para nadie.
-- Los pedidos se crean con create_order() y el estado se cambia con update_order_status().

-- -----------------------------------------------------------------------------
-- Funciones: nadie ejecuta nada salvo lo otorgado explícitamente
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
-- Quita el GRANT automático de Supabase a anon/authenticated en funciones futuras.
-- El EXECUTE implícito a PUBLIC no se puede quitar por esquema: cada migración que cree
-- funciones debe hacer su propio REVOKE ... FROM public (lo verifica una prueba pgTAP).
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Las funciones que aparecen en las políticas se ejecutan con el rol de quien consulta,
-- por eso necesitan EXECUTE. Solo devuelven información sobre el propio usuario.
grant execute on function public.is_restaurant_public(uuid) to anon, authenticated;
grant execute on function public.is_restaurant_member(uuid) to authenticated;
grant execute on function public.is_restaurant_owner(uuid) to authenticated;
grant execute on function public.can_manage_restaurant_file(text) to authenticated;

-- =============================================================================
-- Políticas
-- Una por operación y por rol. Ninguna FOR ALL.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- restaurants
-- -----------------------------------------------------------------------------
create policy "anon: ver restaurantes activos"
  on public.restaurants for select to anon
  using (is_active);

create policy "authenticated: ver restaurantes activos o propios"
  on public.restaurants for select to authenticated
  using (is_active or public.is_restaurant_member(id));

create policy "authenticated: owner edita su restaurante"
  on public.restaurants for update to authenticated
  using (public.is_restaurant_owner(id))
  with check (public.is_restaurant_owner(id));

create policy "authenticated: owner elimina su restaurante"
  on public.restaurants for delete to authenticated
  using (public.is_restaurant_owner(id));

-- -----------------------------------------------------------------------------
-- restaurant_members
-- -----------------------------------------------------------------------------
create policy "authenticated: miembros ven su equipo"
  on public.restaurant_members for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

create policy "authenticated: owner agrega miembros"
  on public.restaurant_members for insert to authenticated
  with check (public.is_restaurant_owner(restaurant_id));

-- El owner no puede cambiar su propio rol ni eliminarse (el restaurante quedaría sin owner).
create policy "authenticated: owner cambia rol de otros miembros"
  on public.restaurant_members for update to authenticated
  using (public.is_restaurant_owner(restaurant_id) and user_id <> (select auth.uid()))
  with check (public.is_restaurant_owner(restaurant_id) and user_id <> (select auth.uid()));

create policy "authenticated: owner elimina a otros miembros"
  on public.restaurant_members for delete to authenticated
  using (public.is_restaurant_owner(restaurant_id) and user_id <> (select auth.uid()));

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create policy "anon: ver categorías activas"
  on public.categories for select to anon
  using (is_active and public.is_restaurant_public(restaurant_id));

create policy "authenticated: ver categorías activas"
  on public.categories for select to authenticated
  using (is_active and public.is_restaurant_public(restaurant_id));

create policy "authenticated: miembros ven todas sus categorías"
  on public.categories for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros crean categorías"
  on public.categories for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros editan categorías"
  on public.categories for update to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros eliminan categorías"
  on public.categories for delete to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create policy "anon: ver productos disponibles"
  on public.products for select to anon
  using (is_available and public.is_restaurant_public(restaurant_id));

create policy "authenticated: ver productos disponibles"
  on public.products for select to authenticated
  using (is_available and public.is_restaurant_public(restaurant_id));

create policy "authenticated: miembros ven todos sus productos"
  on public.products for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros crean productos"
  on public.products for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros editan productos"
  on public.products for update to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros eliminan productos"
  on public.products for delete to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- -----------------------------------------------------------------------------
-- option_groups
-- -----------------------------------------------------------------------------
create policy "anon: ver grupos de opciones"
  on public.option_groups for select to anon
  using (public.is_restaurant_public(restaurant_id));

create policy "authenticated: ver grupos de opciones públicos"
  on public.option_groups for select to authenticated
  using (public.is_restaurant_public(restaurant_id));

create policy "authenticated: miembros ven sus grupos de opciones"
  on public.option_groups for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros crean grupos de opciones"
  on public.option_groups for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros editan grupos de opciones"
  on public.option_groups for update to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros eliminan grupos de opciones"
  on public.option_groups for delete to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- -----------------------------------------------------------------------------
-- options
-- -----------------------------------------------------------------------------
create policy "anon: ver opciones disponibles"
  on public.options for select to anon
  using (is_available and public.is_restaurant_public(restaurant_id));

create policy "authenticated: ver opciones disponibles"
  on public.options for select to authenticated
  using (is_available and public.is_restaurant_public(restaurant_id));

create policy "authenticated: miembros ven todas sus opciones"
  on public.options for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros crean opciones"
  on public.options for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros editan opciones"
  on public.options for update to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros eliminan opciones"
  on public.options for delete to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- -----------------------------------------------------------------------------
-- orders / order_items: solo lectura para miembros (incluye staff).
-- Sin políticas de INSERT/UPDATE/DELETE: además no hay GRANT.
-- -----------------------------------------------------------------------------
create policy "authenticated: miembros ven pedidos de su restaurante"
  on public.orders for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

create policy "authenticated: miembros ven ítems de pedidos de su restaurante"
  on public.order_items for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- -----------------------------------------------------------------------------
-- order_counters: sin políticas ni GRANT. Solo lo tocan las funciones SECURITY DEFINER.
-- -----------------------------------------------------------------------------
