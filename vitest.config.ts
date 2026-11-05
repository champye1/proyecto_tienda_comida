/**
 * Configuración de las pruebas unitarias (Vitest): lógica pura del frontend que se puede
 * probar sin navegador ni base de datos (precios, horarios, exportación CSV…).
 * Separada de vite.config.ts para no cargar los plugins del build (PWA, CSP).
 * Las pruebas de la base están en supabase/tests (pgTAP) y las de navegador en tests/e2e.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
