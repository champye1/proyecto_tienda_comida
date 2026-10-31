/**
 * Generación automática de los íconos de la PWA (favicon, apple-touch-icon, 192/512 px
 * y maskable) a partir de public/logo.svg. La usa VitePWA en cada build (pwaAssets).
 * Para cambiar el ícono de la app basta con reemplazar public/logo.svg.
 */
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: minimal2023Preset,
  images: ['public/logo.svg'],
})
