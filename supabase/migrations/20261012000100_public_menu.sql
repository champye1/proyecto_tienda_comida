-- =============================================================================
-- 11. Menú público de la tienda (etapa 5)
--
-- get_public_menu(slug): TODO lo que necesita la tienda en UNA sola petición
-- (restaurante + categorías + productos + grupos + opciones), listo para cachear.
--
-- Decisiones:
--   * SECURITY INVOKER: se ejecuta con los permisos de quien consulta, así la RLS
--     sigue aplicando (defensa en profundidad; anon solo ve lo público).
--   * Filtra explícitamente lo publicado (categoría activa, producto/opción disponible):
--     un dueño con sesión iniciada ve su tienda igual que un cliente, no sus borradores.
--   * Oculta productos que no se pueden pedir: los que tienen un grupo obligatorio con
--     menos opciones disponibles que su mínimo (create_order los rechazaría).
--   * Devuelve solo campos públicos (sin ids internos de restaurante ni flags de plataforma).
--   * Cache-Control de 30 s: el navegador (o un CDN delante de la API) reutiliza la
--     respuesta. Si el local cierra, create_order igual lo valida en el servidor.
--   * STABLE: PostgREST permite llamarla por GET (cacheable).
--     `supabase db lint` advierte que usa set_config (volátil) dentro de una función STABLE.
--     Es intencional: es el mecanismo documentado por PostgREST para fijar cabeceras HTTP
--     (response.headers) y solo afecta a la transacción de esta petición.
-- =============================================================================

create function public.get_public_menu(p_slug text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_restaurant public.restaurants;
begin
  perform set_config(
    'response.headers',
    '[{"Cache-Control": "public, max-age=30, stale-while-revalidate=120"}]',
    true
  );

  select r.* into v_restaurant
  from public.restaurants r
  where r.slug = lower(btrim(coalesce(p_slug, '')))
    and r.is_active;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'slug',             v_restaurant.slug,
      'name',             v_restaurant.name,
      'description',      v_restaurant.description,
      'logo_url',         v_restaurant.logo_url,
      'primary_color',    v_restaurant.primary_color,
      'phone',            v_restaurant.phone,
      'address',          v_restaurant.address,
      'is_open',          v_restaurant.is_open,
      'delivery_enabled', v_restaurant.delivery_enabled,
      'pickup_enabled',   v_restaurant.pickup_enabled,
      'delivery_fee',     v_restaurant.delivery_fee,
      'min_order',        v_restaurant.min_order
    ),
    'categories', coalesce((
      select jsonb_agg(cat.obj order by cat.position, cat.created_at)
      from (
        select c.position, c.created_at,
               jsonb_build_object('id', c.id, 'name', c.name, 'products', prods.list) as obj
        from public.categories c
        cross join lateral (
          select coalesce(jsonb_agg(
                   jsonb_build_object(
                     'id',            p.id,
                     'name',          p.name,
                     'description',   p.description,
                     'price',         p.price,
                     'image_url',     p.image_url,
                     'option_groups', coalesce((
                       select jsonb_agg(
                                jsonb_build_object(
                                  'id',         g.id,
                                  'name',       g.name,
                                  'min_select', g.min_select,
                                  'max_select', g.max_select,
                                  'options',    coalesce((
                                    select jsonb_agg(
                                             jsonb_build_object('id', o.id, 'name', o.name, 'extra_price', o.extra_price)
                                             order by o.position, o.created_at)
                                    from public.options o
                                    where o.restaurant_id = v_restaurant.id
                                      and o.option_group_id = g.id
                                      and o.is_available
                                  ), '[]'::jsonb)
                                ) order by g.position, g.created_at)
                       from public.option_groups g
                       where g.restaurant_id = v_restaurant.id
                         and g.product_id = p.id
                     ), '[]'::jsonb)
                   ) order by p.position, p.created_at), '[]'::jsonb) as list
          from public.products p
          where p.restaurant_id = v_restaurant.id
            and p.category_id = c.id
            and p.is_available
            -- Excluye productos imposibles de pedir (grupo obligatorio sin opciones suficientes).
            and not exists (
              select 1
              from public.option_groups g
              where g.restaurant_id = v_restaurant.id
                and g.product_id = p.id
                and g.min_select > (
                  select count(*) from public.options o
                  where o.restaurant_id = v_restaurant.id and o.option_group_id = g.id and o.is_available
                )
            )
        ) prods
        where c.restaurant_id = v_restaurant.id
          and c.is_active
          and prods.list <> '[]'::jsonb  -- categorías sin productos visibles no se muestran
      ) cat
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_public_menu(text) from public, anon, authenticated;
grant execute on function public.get_public_menu(text) to anon, authenticated;
