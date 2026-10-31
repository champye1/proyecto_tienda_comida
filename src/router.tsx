/**
 * Mapa de rutas de la aplicación (React Router).
 *
 *   /                         Página de inicio de la plataforma (presentación + registro)
 *   /r/:slug                  Tienda pública de un restaurante (clientes, sin login)
 *   /r/:slug/checkout         Datos del cliente y confirmación del pedido
 *   /r/:slug/pedido/:token    Pedido confirmado + seguimiento (link privado)
 *   /admin/login              Inicio de sesión              ┐ solo sin sesión
 *   /admin/registro           Crear cuenta                  ┘ (GuestOnly)
 *   /admin/recuperar          Pedir correo de recuperación  ┐ con o sin sesión
 *   /admin/nueva-contrasena   Crear contraseña desde correo ┘
 *   /admin/onboarding         Registrar un restaurante      ┐ requieren sesión
 *   /admin                    Inicio del panel              │ (RequireAuth)
 *   /admin/cuenta             Mi cuenta / cambiar contraseña│
 *   /admin/pedidos            Pedidos en vivo + historial   │
 *   /admin/reportes           Ventas y productos más vendidos│
 *   /admin/local              Mi local: datos y configuración│
 *   /admin/menu               Menú: categorías y productos  │
 *   /admin/menu/productos/…   Crear / editar un producto    ┘
 *
 * Todas las páginas se cargan con `lazy`: cada una es un archivo JS aparte que se
 * descarga solo al visitarla. Así el cliente que pide desde el celular no descarga
 * el código del panel, y viceversa.
 */
import { createBrowserRouter } from 'react-router'
import { PageLoader } from '@/components/PageLoader'
import RootLayout from '@/routes/RootLayout'
import RouteError from '@/routes/RouteError'

export const router = createBrowserRouter([
  {
    // Ruta raíz sin URL propia. No es lazy: aporta el HydrateFallback (loader) que se
    // muestra mientras se descarga el código de la primera página visitada.
    Component: RootLayout,
    HydrateFallback: PageLoader,
    // Pantalla amigable si una página falla (en vez de una página en blanco).
    ErrorBoundary: RouteError,
    children: [
      // ---------------------------------------------------------------- Inicio
      {
        index: true,
        // Landing animada: archivo aparte, así Motion no se descarga en la tienda ni en el panel.
        lazy: async () => ({ Component: (await import('./routes/landing/LandingPage')).default }),
      },

      // ---------------------------------------------------------------- Tienda
      {
        // StoreRoot carga el menú, el color y el carrito una vez para todas las páginas de la tienda.
        path: '/r/:slug',
        lazy: async () => ({ Component: (await import('./routes/store/StoreRoot')).default }),
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('./routes/store/StorePage')).default }),
          },
          {
            path: 'checkout',
            lazy: async () => ({ Component: (await import('./routes/store/CheckoutPage')).default }),
          },
          {
            path: 'pedido/:token',
            lazy: async () => ({ Component: (await import('./routes/store/OrderPage')).default }),
          },
        ],
      },

      // ---------------------------------------------------------------- Panel
      {
        path: '/admin',
        // AdminRoot provee la sesión (AuthProvider) a todo /admin.
        lazy: async () => ({ Component: (await import('./routes/admin/AdminRoot')).default }),
        children: [
          // Páginas para quien NO ha iniciado sesión; con sesión redirigen al panel.
          {
            lazy: async () => ({ Component: (await import('./features/auth/guards')).GuestOnly }),
            children: [
              {
                path: 'login',
                lazy: async () => ({ Component: (await import('./routes/admin/LoginPage')).default }),
              },
              {
                path: 'registro',
                lazy: async () => ({ Component: (await import('./routes/admin/RegisterPage')).default }),
              },
            ],
          },

          // Recuperación de contraseña: accesible con o sin sesión
          // (desde "Mi cuenta" también se puede pedir el correo).
          {
            path: 'recuperar',
            lazy: async () => ({ Component: (await import('./routes/admin/ForgotPasswordPage')).default }),
          },
          {
            path: 'nueva-contrasena',
            lazy: async () => ({ Component: (await import('./routes/admin/ResetPasswordPage')).default }),
          },

          // Páginas que requieren sesión; sin sesión redirigen al login.
          {
            lazy: async () => ({ Component: (await import('./features/auth/guards')).RequireAuth }),
            children: [
              // Onboarding fuera de AdminShell: el usuario aún puede no tener restaurante.
              {
                path: 'onboarding',
                lazy: async () => ({ Component: (await import('./routes/admin/OnboardingPage')).default }),
              },
              // AdminShell: cabecera del panel + restaurante activo (sin restaurante → onboarding).
              {
                lazy: async () => ({ Component: (await import('./routes/admin/AdminShell')).default }),
                children: [
                  {
                    index: true,
                    lazy: async () => ({ Component: (await import('./routes/admin/DashboardPage')).default }),
                  },
                  {
                    path: 'cuenta',
                    lazy: async () => ({ Component: (await import('./routes/admin/AccountPage')).default }),
                  },
                  // Reporte de ventas y configuración del local.
                  {
                    path: 'reportes',
                    lazy: async () => ({ Component: (await import('./routes/admin/reports/ReportsPage')).default }),
                  },
                  {
                    path: 'local',
                    lazy: async () => ({ Component: (await import('./routes/admin/SettingsPage')).default }),
                  },
                  // Pedidos en vivo (tablero + historial).
                  {
                    path: 'pedidos',
                    lazy: async () => ({ Component: (await import('./routes/admin/orders/OrdersPage')).default }),
                  },
                  // Menú: categorías y productos, y el editor de cada producto.
                  {
                    path: 'menu',
                    lazy: async () => ({ Component: (await import('./routes/admin/menu/MenuPage')).default }),
                  },
                  {
                    path: 'menu/productos/nuevo',
                    lazy: async () => ({ Component: (await import('./routes/admin/menu/ProductEditorPage')).default }),
                  },
                  {
                    path: 'menu/productos/:productId',
                    lazy: async () => ({ Component: (await import('./routes/admin/menu/ProductEditorPage')).default }),
                  },
                ],
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------- 404
      {
        path: '*',
        lazy: async () => ({ Component: (await import('./routes/NotFound')).default }),
      },
    ],
  },
])
