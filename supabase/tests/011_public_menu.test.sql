-- Etapa 5: get_public_menu devuelve solo lo publicado, en una sola respuesta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Preparación (como postgres): una categoría oculta, una opción agotada y un producto
-- con grupo obligatorio sin opciones suficientes.
update public.categories set is_active = false where id = 'bbbbbbbb-0000-4000-8000-0000000000c3'; -- Bebidas de B
update public.options set is_available = false where id = 'aaaaaaaa-0000-4000-8000-0000000000f6';  -- Jamón
insert into public.option_groups (restaurant_id, product_id, name, min_select, max_select)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d3', 'Masa', 1, 1); -- sin opciones

set local role anon;

select is(public.get_public_menu('no-existe'), null, 'Slug inexistente → null');

select is(public.get_public_menu(' Pizzeria-Demo ') -> 'restaurant' ->> 'name', 'Pizzería Demo', 'Encuentra el restaurante (slug normalizado)');

select ok(
  not (public.get_public_menu('pizzeria-demo') -> 'restaurant' ?| array['id', 'is_active', 'created_at']),
  'No expone campos internos del restaurante'
);

select is(
  (select jsonb_agg(c ->> 'name') from jsonb_array_elements(public.get_public_menu('pizzeria-demo') -> 'categories') c),
  '["Pizzas", "Bebidas", "Postres"]'::jsonb,
  'Categorías en orden'
);

select is(
  (select jsonb_agg(p ->> 'name')
   from jsonb_array_elements(public.get_public_menu('pizzeria-demo') -> 'categories' -> 0 -> 'products') p),
  '["Margarita", "Pepperoni"]'::jsonb,
  'Pizzas: oculta Calzone (agotado) y Cuatro Quesos (grupo obligatorio sin opciones)'
);

select is(
  (select jsonb_agg(o ->> 'name')
   from jsonb_array_elements(public.get_public_menu('pizzeria-demo') -> 'categories' -> 0 -> 'products' -> 0 -> 'option_groups' -> 1 -> 'options') o),
  '["Extra queso", "Champiñones", "Aceitunas"]'::jsonb,
  'Opciones: oculta la agotada (Jamón) y respeta el orden'
);

select is(
  public.get_public_menu('pizzeria-demo') -> 'categories' -> 0 -> 'products' -> 0 -> 'option_groups' -> 0 ->> 'min_select',
  '1',
  'Incluye las reglas mín./máx. de cada grupo'
);

select is(
  (select count(*)::int from jsonb_array_elements(public.get_public_menu('sushi-demo') -> 'categories')),
  2,
  'Categoría oculta (Bebidas de B) no aparece'
);

-- El dueño con sesión ve su tienda igual que un cliente (sin borradores).
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select jsonb_agg(p ->> 'name')
   from jsonb_array_elements(public.get_public_menu('pizzeria-demo') -> 'categories' -> 0 -> 'products') p),
  '["Margarita", "Pepperoni"]'::jsonb,
  'El dueño también ve solo lo publicado'
);

-- Restaurante suspendido por la plataforma.
reset role;
update public.restaurants set is_active = false where slug = 'sushi-demo';
set local role anon;
select is(public.get_public_menu('sushi-demo'), null, 'Restaurante suspendido → null');

select is(
  current_setting('response.headers', true)::jsonb -> 0 ->> 'Cache-Control',
  'public, max-age=30, stale-while-revalidate=120',
  'Envía cabecera de caché HTTP'
);

select ok(
  (select provolatile = 's' and not prosecdef from pg_proc where proname = 'get_public_menu'),
  'Es STABLE (se puede pedir por GET) y SECURITY INVOKER (aplica RLS)'
);

select * from finish();
rollback;
