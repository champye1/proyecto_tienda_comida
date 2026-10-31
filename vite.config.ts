/**
 * Configuración de Vite (servidor de desarrollo y build de producción).
 *
 * Plugins:
 *   - react: JSX y recarga en caliente.
 *   - tailwindcss: compila las clases de Tailwind.
 *   - VitePWA: genera el manifest, los íconos y el service worker para instalar la app.
 *   - cspMeta: agrega la Content-Security-Policy al index.html del build (seguridad).
 *   - preconnectSupabase: adelanta la conexión con Supabase (rendimiento).
 */
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { buildCsp, devSecurityHeaders, securityHeaders } from './security/headers.ts'

/**
 * Inyecta la CSP como <meta http-equiv> al inicio del <head>, solo en el build
 * (en desarrollo rompería la recarga en caliente, que usa scripts inline).
 */
function cspMeta(supabaseUrl: string): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(supabaseUrl, { meta: true }) },
        injectTo: 'head-prepend',
      },
    ],
  }
}

/**
 * Abre la conexión con Supabase (DNS + TLS) apenas carga el HTML, en paralelo con la descarga
 * del JavaScript: el menú de la tienda llega antes al celular del cliente.
 */
function preconnectSupabase(supabaseUrl: string): Plugin {
  return {
    name: 'preconnect-supabase',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'preconnect', href: new URL(supabaseUrl).origin, crossorigin: '' }, injectTo: 'head' },
    ],
  }
}

export default defineConfig(({ mode }) => {
  // Lee .env / .env.local para conocer la URL de Supabase (la necesita la CSP).
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const supabaseUrl = env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321'
  const supabaseHost = new URL(supabaseUrl).host

  return {
    plugins: [
      react(),
      tailwindcss(),
      cspMeta(supabaseUrl),
      preconnectSupabase(supabaseUrl),
      VitePWA({
        // 'prompt': nunca recargar solo; en cocina una recarga inesperada en plena hora punta es peor que una versión vieja.
        registerType: 'prompt',
        // Íconos generados desde public/logo.svg (ver pwa-assets.config.ts).
        pwaAssets: { config: true, overrideManifestIcons: true },
        manifest: {
          name: 'Pedidos — Panel del restaurante',
          short_name: 'Pedidos',
          description: 'Gestiona tu menú y tus pedidos en tiempo real.',
          lang: 'es-CL',
          // El alcance es solo el panel: en la tienda pública el navegador no ofrece "instalar"
          // la app del restaurante a los clientes.
          start_url: '/admin/',
          scope: '/admin/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#e11d48',
          background_color: '#ffffff',
        },
        workbox: {
          // Solo recursos estáticos del build. Nada de datos.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          // Seguridad: cualquier petición a Supabase (REST, Auth, Realtime, Storage, RPC) va
          // siempre a la red. Nunca se guardan en caché pedidos ni respuestas autenticadas.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.host === supabaseHost || url.hostname.endsWith('.supabase.co'),
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    // Alias "@/" = carpeta src/ (import { x } from "@/lib/x" en vez de rutas relativas largas).
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Cabeceras de seguridad en desarrollo (sin CSP) y en `vite preview` (todas, como en producción).
    server: { headers: devSecurityHeaders() },
    preview: { headers: securityHeaders(supabaseUrl) },
    // Build de producción.
    build: {
      // Sin source maps públicos: no se publica el código fuente original.
      sourcemap: false,
      rollupOptions: {
        output: {
          // Separar vendor pesado para que la tienda pública cargue rápido en 4G.
          manualChunks: (id) => {
            // Realtime va aparte: la página de seguimiento del cliente lo usa sin cargar el resto de supabase-js.
            if (id.includes('node_modules/@supabase/realtime-js') || id.includes('node_modules/@supabase/phoenix')) return 'realtime'
            if (id.includes('node_modules/@supabase')) return 'supabase'
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react'
          },
        },
      },
    },
  }
})
