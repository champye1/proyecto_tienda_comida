/**
 * Contenedor raíz de todas las rutas (ver router.tsx). Por ahora solo muestra la
 * página actual (<Outlet />). Es el lugar para agregar cosas comunes a toda la app,
 * por ejemplo una pantalla de error general.
 */
import { Outlet } from 'react-router'

export default function RootLayout() {
  return <Outlet />
}
