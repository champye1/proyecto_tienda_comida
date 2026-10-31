-- =============================================================================
-- 2. Tablas, constraints e índices
--
-- Convenciones:
--   * PK uuid (gen_random_uuid), nunca serial.
--   * created_at / updated_at timestamptz en todas las tablas.
--   * Montos en CLP como integer, sin decimales.
--   * Las tablas hijas del menú referencian a su padre con FK compuesta
--     (restaurant_id, parent_id): la base de datos garantiza que un producto
--     nunca apunte a una categoría de OTRO restaurante, aunque falle el frontend.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- restaurants
-- -----------------------------------------------------------------------------
create table public.restaurants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  name             text not null,
  description      text,
  logo_url         text,
  primary_color    text not null default '#e11d48',
  phone            text,
  address          text,
  is_active        boolean not null default true,   -- control de plataforma (suspensión); el owner no puede editarlo
  is_open          boolean not null default false,
  delivery_enabled boolean not null default true,
  pickup_enabled   boolean not null default true,
  delivery_fee     integer not null default 0,
  min_order        integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint restaurants_slug_key unique (slug),
  constraint restaurants_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 50
  ),
  constraint restaurants_name_length check (char_length(btrim(name)) between 2 and 100),
  constraint restaurants_description_length check (description is null or char_length(description) <= 500),
  constraint restaurants_logo_url_length check (logo_url is null or char_length(logo_url) <= 500),
  constraint restaurants_primary_color_format check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint restaurants_phone_format check (phone is null or phone ~ '^\+?[0-9]{8,15}$'),
  constraint restaurants_address_length check (address is null or char_length(address) <= 200),
  constraint restaurants_delivery_fee_range check (delivery_fee between 0 and 1000000),
  constraint restaurants_min_order_range check (min_order between 0 and 10000000),
  constraint restaurants_some_order_type check (delivery_enabled or pickup_enabled)
);

-- -----------------------------------------------------------------------------
-- restaurant_members
-- -----------------------------------------------------------------------------
create table public.restaurant_members (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.member_role not null default 'staff',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- También sirve de índice para la FK restaurant_id.
  constraint restaurant_members_restaurant_user_key unique (restaurant_id, user_id)
);

-- Índice que usan las funciones de RLS (is_restaurant_member / is_restaurant_owner). Cubre la FK user_id.
create index restaurant_members_user_restaurant_idx
  on public.restaurant_members (user_id, restaurant_id) include (role);

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null,
  position      integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint categories_restaurant_id_id_key unique (restaurant_id, id),
  constraint categories_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint categories_position_range check (position >= 0)
);

-- Menú ordenado; también cubre la FK restaurant_id.
create index categories_restaurant_position_idx on public.categories (restaurant_id, position);

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id   uuid not null,
  name          text not null,
  description   text,
  price         integer not null,
  image_url     text,
  is_available  boolean not null default true,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint products_restaurant_id_id_key unique (restaurant_id, id),
  -- NO ACTION: no se puede borrar una categoría que tiene productos (evita perder el menú por un clic).
  -- No se usa RESTRICT porque se verifica de inmediato y rompería el borrado en cascada de un
  -- restaurante; NO ACTION se verifica al final de la sentencia, cuando la cascada ya borró los productos.
  constraint products_category_fkey foreign key (restaurant_id, category_id)
    references public.categories (restaurant_id, id) on delete no action,
  constraint products_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint products_description_length check (description is null or char_length(description) <= 500),
  constraint products_price_range check (price between 0 and 10000000),
  constraint products_image_url_length check (image_url is null or char_length(image_url) <= 500),
  constraint products_position_range check (position >= 0)
);

-- Menú por categoría ordenado; también cubre la FK compuesta (restaurant_id, category_id).
create index products_restaurant_category_position_idx
  on public.products (restaurant_id, category_id, position);

-- -----------------------------------------------------------------------------
-- option_groups  (ej: "Tamaño", "Agregados")
-- -----------------------------------------------------------------------------
create table public.option_groups (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  product_id    uuid not null,
  name          text not null,
  min_select    integer not null default 0,
  max_select    integer not null default 1,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint option_groups_restaurant_id_id_key unique (restaurant_id, id),
  constraint option_groups_product_fkey foreign key (restaurant_id, product_id)
    references public.products (restaurant_id, id) on delete cascade,
  constraint option_groups_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint option_groups_min_select_range check (min_select >= 0),
  constraint option_groups_max_select_range check (max_select >= min_select and max_select between 1 and 20),
  constraint option_groups_position_range check (position >= 0)
);

-- Cubre la FK compuesta (restaurant_id, product_id).
create index option_groups_restaurant_product_position_idx
  on public.option_groups (restaurant_id, product_id, position);

-- -----------------------------------------------------------------------------
-- options
-- -----------------------------------------------------------------------------
create table public.options (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  option_group_id uuid not null,
  name            text not null,
  extra_price     integer not null default 0,
  is_available    boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint options_option_group_fkey foreign key (restaurant_id, option_group_id)
    references public.option_groups (restaurant_id, id) on delete cascade,
  constraint options_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint options_extra_price_range check (extra_price between 0 and 1000000),
  constraint options_position_range check (position >= 0)
);

-- Cubre la FK compuesta (restaurant_id, option_group_id).
create index options_restaurant_group_position_idx
  on public.options (restaurant_id, option_group_id, position);

-- -----------------------------------------------------------------------------
-- order_counters  (correlativo por restaurante; la fila se bloquea al incrementar)
-- -----------------------------------------------------------------------------
create table public.order_counters (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  last_number   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint order_counters_last_number_range check (last_number >= 0)
);

-- -----------------------------------------------------------------------------
-- orders
--
-- Preparada para particionar por created_at en el futuro:
--   * created_at es inmutable (trigger en la migración 3).
--   * order_items referencia (order_id, order_created_at) mediante la clave
--     única (id, created_at), que es la forma que exige Postgres para una FK
--     hacia una tabla particionada. Al particionar, la PK pasa a ser
--     (id, created_at) sin tocar order_items.
-- -----------------------------------------------------------------------------
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  order_number   integer not null,
  tracking_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  customer_name  text not null,
  customer_phone text not null,
  type           public.order_type not null,
  address        text,
  notes          text,
  subtotal       integer not null,
  delivery_fee   integer not null default 0,
  total          integer not null,
  status         public.order_status not null default 'pending',
  payment_method public.payment_method not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint orders_id_created_at_key unique (id, created_at),
  constraint orders_restaurant_order_number_key unique (restaurant_id, order_number),
  constraint orders_tracking_token_key unique (tracking_token),
  constraint orders_order_number_range check (order_number > 0),
  constraint orders_tracking_token_format check (tracking_token ~ '^[0-9a-f]{48}$'),
  constraint orders_customer_name_length check (char_length(btrim(customer_name)) between 2 and 80),
  constraint orders_customer_phone_format check (customer_phone ~ '^\+?[0-9]{8,15}$'),
  constraint orders_address_length check (address is null or char_length(address) <= 200),
  constraint orders_address_required check (type <> 'delivery' or char_length(btrim(coalesce(address, ''))) >= 5),
  constraint orders_notes_length check (notes is null or char_length(notes) <= 500),
  constraint orders_subtotal_range check (subtotal >= 0),
  constraint orders_delivery_fee_range check (delivery_fee >= 0),
  constraint orders_total_matches check (total = subtotal + delivery_fee)
);

-- Historial y reporte del día. Cubre la FK restaurant_id.
create index orders_restaurant_created_at_idx on public.orders (restaurant_id, created_at desc);
-- Kanban por estado (también sirve para filtrar solo por restaurant_id + status).
create index orders_restaurant_status_created_at_idx on public.orders (restaurant_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- order_items  (copia del nombre y los precios al momento de la compra)
-- -----------------------------------------------------------------------------
create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  order_id         uuid not null,
  order_created_at timestamptz not null,
  -- SET NULL: borrar un producto no rompe el historial (nombre y precio quedan guardados aquí).
  product_id       uuid references public.products (id) on delete set null,
  product_name     text not null,
  unit_price       integer not null,  -- precio base + extras de las opciones, por unidad
  quantity         integer not null,
  selected_options jsonb not null default '[]'::jsonb,
  line_total       integer not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint order_items_order_fkey foreign key (order_id, order_created_at)
    references public.orders (id, created_at) on delete cascade,
  constraint order_items_product_name_length check (char_length(product_name) between 1 and 100),
  constraint order_items_unit_price_range check (unit_price >= 0),
  constraint order_items_quantity_range check (quantity between 1 and 99),
  constraint order_items_selected_options_array check (jsonb_typeof(selected_options) = 'array'),
  constraint order_items_line_total_matches check (line_total = unit_price * quantity)
);

-- FK al pedido.
create index order_items_order_idx on public.order_items (order_id, order_created_at);
-- Reporte de productos más vendidos por restaurante y fecha. Cubre la FK restaurant_id.
create index order_items_restaurant_created_at_idx on public.order_items (restaurant_id, created_at desc);
-- FK a products (ON DELETE SET NULL).
create index order_items_product_id_idx on public.order_items (product_id);
