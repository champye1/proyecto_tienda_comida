/**
 * Edge Function "og": vista previa de la tienda al compartir el link (WhatsApp, Instagram,
 * Facebook, Telegram…).
 *
 * Por qué existe: la tienda es una app de una sola página; los "bots" que arman la vista
 * previa NO ejecutan JavaScript, así que no verían el nombre ni el logo del restaurante.
 * Esta función responde HTML con las etiquetas Open Graph de cada restaurante.
 *
 * Uso:
 *   GET /functions/v1/og/pizzeria-demo   (o /functions/v1/og?slug=pizzeria-demo)
 * Las personas son redirigidas a la tienda real ({SITE_URL}/r/{slug}); los bots leen las
 * etiquetas. En producción, el hosting reenvía a esta función las visitas de bots a
 * /r/:slug (ver README → "Vista previa al compartir"), así el link compartido es el normal.
 *
 * Seguridad:
 *   - El slug se valida con la misma regla de la base ANTES de usarlo (sin inyección en el
 *     filtro de PostgREST).
 *   - Nombre y descripción los escribe el restaurante: se ESCAPAN como HTML. Un nombre
 *     como `<script>…` se muestra como texto y nunca se ejecuta.
 *   - Usa la clave anónima: la RLS solo deja ver restaurantes activos (nunca service_role).
 *   - Cabeceras: CSP que bloquea todo script, nosniff y sin iframes.
 */

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
// Dirección pública del sitio (donde vive la tienda). Se configura como secreto en producción.
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://localhost:5173').replace(/\/+$/, '')

/** Cabeceras de seguridad de todas las respuestas. */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; img-src * data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

type Restaurant = { slug: string; name: string; description: string | null; logo_url: string | null }

/** Convierte texto en HTML seguro: ningún carácter puede abrir etiquetas ni atributos. */
function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return text.replace(/[&<>"']/g, (c) => map[c]!)
}

/** Respuesta HTML con las cabeceras de seguridad. */
function html(body: string, status = 200, cacheSeconds = 300): Response {
  return new Response(body, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}`,
    },
  })
}

/** 404 genérico: no revela si el slug existe pero está suspendido. */
function notFound(): Response {
  return html('<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><title>Tienda no encontrada</title></head><body>Tienda no encontrada</body></html>', 404, 60)
}

/** Busca el restaurante con la clave anónima (la RLS solo devuelve restaurantes activos). */
async function findRestaurant(slug: string): Promise<Restaurant | null> {
  const url = `${SUPABASE_URL}/rest/v1/restaurants?slug=eq.${slug}&select=slug,name,description,logo_url&limit=1`
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
  if (!res.ok) throw new Error(`PostgREST respondió ${res.status}`)
  const rows = (await res.json()) as Restaurant[]
  return rows[0] ?? null
}

/** Arma la página con las etiquetas Open Graph del restaurante. */
function renderPage(r: Restaurant): string {
  const storeUrl = `${SITE_URL}/r/${r.slug}`
  const title = escapeHtml(`${r.name} · Pide online`)
  const description = escapeHtml(
    (r.description?.trim() || `Mira el menú de ${r.name} y haz tu pedido online.`).slice(0, 200),
  )
  // Imagen: el logo del restaurante (siempre de nuestro Storage, lo exige la base) o el ícono de la app.
  const image = escapeHtml(r.logo_url ?? `${SITE_URL}/pwa-512x512.png`)
  const url = escapeHtml(storeUrl)

  return `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_CL">
<meta property="og:site_name" content="Pedidos">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${url}">
</head>
<body><p><a href="${url}">Ver el menú de ${escapeHtml(r.name)}</a></p></body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método no permitido', { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD' } })
  }

  // El slug puede venir como /og/{slug} o como ?slug={slug}.
  const url = new URL(req.url)
  const fromPath = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
  const slug = (url.searchParams.get('slug') ?? (fromPath === 'og' ? '' : fromPath)).toLowerCase()
  if (slug.length < 3 || slug.length > 50 || !SLUG_PATTERN.test(slug)) return notFound()

  try {
    const restaurant = await findRestaurant(slug)
    return restaurant ? html(renderPage(restaurant)) : notFound()
  } catch (err) {
    console.error('og:', err)
    return html('<!doctype html><title>Error</title>Error temporal', 502, 0)
  }
})
