-- =============================================================================
-- Datos de prueba (solo desarrollo local). Se ejecuta en cada `supabase db reset`.
--
-- Usuarios (contraseña para ambos: password123)
--   owner-a@test.cl  → owner de "Pizzería Demo"  (/r/pizzeria-demo)
--   owner-b@test.cl  → owner de "Sushi Demo"     (/r/sushi-demo)
--
-- Los UUID son fijos para que las pruebas pgTAP puedan referenciarlos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Usuarios de Supabase Auth
-- Las columnas de tokens van como '' (no NULL): GoTrue falla al leer NULL en ellas.
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'owner-a@test.cl',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner Pizzería"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'owner-b@test.cl',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner Sushi"}', now(), now(),
   '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in ('owner-a@test.cl', 'owner-b@test.cl');

-- -----------------------------------------------------------------------------
-- Restaurantes, miembros y contadores
-- -----------------------------------------------------------------------------
insert into public.restaurants (
  id, slug, name, description, primary_color, phone, address,
  is_open, delivery_enabled, pickup_enabled, delivery_fee, min_order
)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'pizzeria-demo', 'Pizzería Demo',
   'Pizzas a la piedra hechas al momento.', '#dc2626', '+56911111111',
   'Av. Providencia 1234, Providencia', true, true, true, 2000, 8000),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'sushi-demo', 'Sushi Demo',
   'Rolls frescos todos los días.', '#0f766e', '+56922222222',
   'Av. Irarrázaval 4321, Ñuñoa', true, true, true, 2500, 10000);

insert into public.restaurant_members (restaurant_id, user_id, role)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'owner');

insert into public.order_counters (restaurant_id, last_number)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 0),
  ('bbbbbbbb-0000-4000-8000-000000000001', 0);

-- -----------------------------------------------------------------------------
-- Menú A: Pizzería Demo
-- -----------------------------------------------------------------------------
insert into public.categories (id, restaurant_id, name, position)
values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Pizzas', 0),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Bebidas', 1),
  ('aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-000000000001', 'Postres', 2);

insert into public.products (id, restaurant_id, category_id, name, description, price, is_available, position)
values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   'Margarita', 'Salsa de tomate, mozzarella y albahaca.', 8990, true, 0),
  ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   'Pepperoni', 'Mozzarella y pepperoni.', 9990, true, 1),
  ('aaaaaaaa-0000-4000-8000-0000000000d3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   'Cuatro Quesos', 'Mozzarella, gorgonzola, parmesano y queso de cabra.', 10990, true, 2),
  ('aaaaaaaa-0000-4000-8000-0000000000d4', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   'Calzone', 'Jamón, ricotta y mozzarella. Temporalmente agotado.', 9490, false, 3),
  ('aaaaaaaa-0000-4000-8000-0000000000d5', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c2',
   'Coca-Cola 1,5 L', null, 2500, true, 0),
  ('aaaaaaaa-0000-4000-8000-0000000000d6', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c2',
   'Agua mineral 500 ml', null, 1200, true, 1),
  ('aaaaaaaa-0000-4000-8000-0000000000d7', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c3',
   'Tiramisú', 'Porción individual.', 3990, true, 0);

insert into public.option_groups (id, restaurant_id, product_id, name, min_select, max_select, position)
values
  -- Margarita
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'Tamaño', 1, 1, 0),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'Agregados', 0, 3, 1),
  -- Pepperoni
  ('aaaaaaaa-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'Tamaño', 1, 1, 0);

insert into public.options (id, restaurant_id, option_group_id, name, extra_price, position)
values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'Mediana', 0, 0),
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'Familiar', 4000, 1),
  ('aaaaaaaa-0000-4000-8000-0000000000f3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Extra queso', 1000, 0),
  ('aaaaaaaa-0000-4000-8000-0000000000f4', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Champiñones', 800, 1),
  ('aaaaaaaa-0000-4000-8000-0000000000f5', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Aceitunas', 700, 2),
  ('aaaaaaaa-0000-4000-8000-0000000000f6', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Jamón', 1200, 3),
  ('aaaaaaaa-0000-4000-8000-0000000000f7', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e3', 'Mediana', 0, 0),
  ('aaaaaaaa-0000-4000-8000-0000000000f8', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e3', 'Familiar', 4000, 1);

-- -----------------------------------------------------------------------------
-- Menú B: Sushi Demo
-- -----------------------------------------------------------------------------
insert into public.categories (id, restaurant_id, name, position)
values
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-000000000001', 'Rolls', 0),
  ('bbbbbbbb-0000-4000-8000-0000000000c2', 'bbbbbbbb-0000-4000-8000-000000000001', 'Entradas', 1),
  ('bbbbbbbb-0000-4000-8000-0000000000c3', 'bbbbbbbb-0000-4000-8000-000000000001', 'Bebidas', 2);

insert into public.products (id, restaurant_id, category_id, name, description, price, is_available, position)
values
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1',
   'Roll California', 'Kanikama, palta y queso crema. 10 piezas.', 6990, true, 0),
  ('bbbbbbbb-0000-4000-8000-0000000000d2', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1',
   'Roll Acevichado', 'Camarón furai cubierto de salmón acevichado. 10 piezas.', 7990, true, 1),
  ('bbbbbbbb-0000-4000-8000-0000000000d3', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1',
   'Roll Tempura', 'Salmón y queso crema, apanado en panko. 10 piezas.', 7490, true, 2),
  ('bbbbbbbb-0000-4000-8000-0000000000d4', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c2',
   'Gyozas de cerdo', '6 unidades.', 4990, true, 0),
  ('bbbbbbbb-0000-4000-8000-0000000000d5', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c2',
   'Sopa miso', null, 2990, true, 1),
  ('bbbbbbbb-0000-4000-8000-0000000000d6', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c3',
   'Té verde helado', null, 1990, true, 0),
  ('bbbbbbbb-0000-4000-8000-0000000000d7', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c3',
   'Ramune', 'Sin stock.', 2490, false, 1);

insert into public.option_groups (id, restaurant_id, product_id, name, min_select, max_select, position)
values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000d1', 'Envoltura', 1, 1, 0),
  ('bbbbbbbb-0000-4000-8000-0000000000e2', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000d1', 'Salsas', 0, 2, 1);

insert into public.options (id, restaurant_id, option_group_id, name, extra_price, position)
values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'Sésamo', 0, 0),
  ('bbbbbbbb-0000-4000-8000-0000000000f2', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'Palta', 1000, 1),
  ('bbbbbbbb-0000-4000-8000-0000000000f3', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'Salmón', 1500, 2),
  ('bbbbbbbb-0000-4000-8000-0000000000f4', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e2', 'Soya', 0, 0),
  ('bbbbbbbb-0000-4000-8000-0000000000f5', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e2', 'Teriyaki', 300, 1),
  ('bbbbbbbb-0000-4000-8000-0000000000f6', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e2', 'Spicy mayo', 500, 2);

-- -----------------------------------------------------------------------------
-- Pedidos de ejemplo
-- Se crean con la misma RPC que usa la tienda, así los montos y correlativos
-- son exactamente los que produciría un cliente real.
-- -----------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  -- Pizzería Demo
  select order_id into v_id from public.create_order(
    'pizzeria-demo', 'Camila Rojas', '+56 9 8765 4321', 'delivery', 'Los Leones 456, depto 32', 'Timbre no funciona, llamar',
    'cash',
    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d1","quantity":1,
       "option_ids":["aaaaaaaa-0000-4000-8000-0000000000f2","aaaaaaaa-0000-4000-8000-0000000000f3"]},
      {"product_id":"aaaaaaaa-0000-4000-8000-0000000000d5","quantity":1}]'
  );  -- queda pending

  select order_id into v_id from public.create_order(
    'pizzeria-demo', 'Diego Muñoz', '987654322', 'pickup', null, null, 'transfer',
    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d2","quantity":2,
       "option_ids":["aaaaaaaa-0000-4000-8000-0000000000f7"]}]'
  );
  update public.orders set status = 'preparing' where id = v_id;

  select order_id into v_id from public.create_order(
    'pizzeria-demo', 'Valentina Soto', '+56987654323', 'delivery', 'Manuel Montt 789', null, 'cash',
    '[{"product_id":"aaaaaaaa-0000-4000-8000-0000000000d3","quantity":1},
      {"product_id":"aaaaaaaa-0000-4000-8000-0000000000d7","quantity":2}]'
  );
  update public.orders set status = 'delivered' where id = v_id;

  -- Sushi Demo
  select order_id into v_id from public.create_order(
    'sushi-demo', 'Matías González', '+56987654324', 'pickup', null, 'Sin wasabi', 'cash',
    '[{"product_id":"bbbbbbbb-0000-4000-8000-0000000000d1","quantity":2,
       "option_ids":["bbbbbbbb-0000-4000-8000-0000000000f2","bbbbbbbb-0000-4000-8000-0000000000f5"]}]'
  );
  update public.orders set status = 'confirmed' where id = v_id;

  select order_id into v_id from public.create_order(
    'sushi-demo', 'Francisca Díaz', '+56987654325', 'delivery', 'Av. Grecia 1500', null, 'transfer',
    '[{"product_id":"bbbbbbbb-0000-4000-8000-0000000000d2","quantity":1},
      {"product_id":"bbbbbbbb-0000-4000-8000-0000000000d4","quantity":1}]'
  );
  update public.orders set status = 'cancelled' where id = v_id;
end;
$$;
