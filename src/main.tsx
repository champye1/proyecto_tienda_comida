/**
 * Punto de entrada de la aplicación: monta React en <div id="root"> (index.html).
 *
 * Proveedores globales, de afuera hacia adentro:
 *   - StrictMode: en desarrollo detecta efectos mal escritos (los ejecuta dos veces).
 *   - QueryClientProvider: caché de datos del servidor (TanStack Query).
 *   - RouterProvider: decide qué página mostrar según la URL (ver router.tsx).
 *   - PwaUpdatePrompt: aviso de "nueva versión disponible" del service worker.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <PwaUpdatePrompt />
    </QueryClientProvider>
  </StrictMode>,
)
