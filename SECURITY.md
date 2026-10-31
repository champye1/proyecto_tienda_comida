# Seguridad

Documento vivo: describe de qué nos protegemos, cómo, dónde está implementado cada control
y qué falta hacer antes de salir a producción. **Actualizarlo en cada etapa.**

Principio rector: **defensa en profundidad**. La seguridad real vive en la base de datos
(RLS, funciones, triggers); la API y el frontend agregan capas, pero nunca son la única barrera.
Ocultar un botón en la pantalla no es un control de seguridad.

---

## 1. Modelo de amenazas

| Actor | Qué podría intentar | Controles principales |
|---|---|---|
| Cliente anónimo malicioso | Pagar menos manipulando precios; ver pedidos ajenos | Precios recalculados en el servidor (`create_order`); sin acceso a `orders`; seguimiento solo con token de 192 bits |
| Bot / spam | Inundar la cocina con pedidos falsos; probar contraseñas | Límite de pedidos por teléfono; límites de Auth por IP; CAPTCHA (pendiente, ver checklist) |
| Otro restaurante (tenant) | Leer o modificar menú, pedidos o clientes de la competencia | RLS por `restaurant_id` en todas las tablas; FKs compuestas; Storage por carpeta |
| Personal (staff) | Cambiar montos, editar el local, agregar miembros | Rol `staff` limitado; montos inmutables (trigger); solo el dueño gestiona local y equipo |
| Atacante con XSS | Robar la sesión o los datos de clientes | CSP estricta (sin scripts inline ni de terceros; `connect-src` solo a Supabase); React escapa todo el HTML |
| Sitio malicioso | Clickjacking del panel | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Tablet robada o compartida | Usar la sesión abierta | Cambiar contraseña exige la actual + sesión reciente; logout limpia la caché |

## 2. Controles implementados

### Base de datos (Postgres + RLS)
| Control | Dónde | Prueba |
|---|---|---|
| RLS activado en **todas** las tablas, políticas por operación y rol (sin `FOR ALL`) | `migrations/…0400_rls_and_grants.sql` | `tests/001`, `003` |
| Permisos mínimos: se revoca todo y se otorga solo lo necesario, incluso por columna (`restaurant_id` nunca editable) | `…0400` | `tests/001`, `003` |
| `orders`, `order_items` y `order_counters` sin escritura directa para nadie | `…0400` | `tests/001`, `002`, `006` |
| Funciones `SECURITY DEFINER` con `search_path = ''` (inmunes a secuestro de search_path) | todas las migraciones | `db lint` |
| Solo se pueden ejecutar las funciones permitidas por rol (lista blanca verificada) | `…0400`, `…0500` | `tests/001` |
| FKs compuestas `(restaurant_id, id)`: imposible mezclar datos de dos restaurantes | `…0200` | `tests/003` |
| `create_order`: precios, totales, disponibilidad, mín./máx. de opciones y pedido mínimo calculados en el servidor | `…0500` | `tests/004` |
| Montos de un pedido inmutables y transiciones de estado válidas, **incluso para service_role** | trigger `a_orders_guard_update` (`…0300`) | `tests/006` |
| Máximo 3 pedidos por teléfono y restaurante cada 10 minutos | trigger `a_orders_rate_limit` (`…0900`) | `tests/009` |
| Seguimiento por token aleatorio de 192 bits; no expone teléfono, nombre ni dirección | `get_order_by_token` (`…0500`) | `tests/005` |
| URLs de imágenes solo `http(s)://` (sin `javascript:` ni `data:`) | `…0900` | `tests/009` |
| Slugs reservados (`www`, `admin`, `api`…) para los futuros subdominios | `…0800` | `tests/008` |
| Imágenes solo del Storage propio: `image_url`/`logo_url` deben apuntar a la carpeta del mismo restaurante | `…1000` | `tests/010` |
| Reporte de ventas por `get_sales_report`: SECURITY INVOKER + verificación explícita de membresía (error claro, no un reporte vacío), rango máx. 31 días | `…0100_sales_report` | `tests/013` |
| Menú público por `get_public_menu`: SECURITY INVOKER (aplica RLS), solo lo publicado y sin campos internos | `…0100_public_menu` | `tests/011` |
| Reordenar el menú por RPC: tipo validado con lista blanca antes del SQL dinámico (`%I`), ids de un solo restaurante y membresía verificada | `reorder_menu_items` (`…1000`) | `tests/010` |
| Errores de negocio con mensajes pensados para el usuario; los errores internos no se muestran | RPCs + `src/lib/errors.ts` | — |

### API (Supabase)
- Solo se expone el esquema `public` (GraphQL desactivado: no permite consultar la estructura de la base). → `config.toml [api]`
- `max_rows = 1000`: ninguna consulta devuelve más filas (además, el frontend pagina).
- La clave del frontend es la **publicable** (pública por diseño). La `service_role` nunca va al frontend.

### Autenticación
- Contraseña de mínimo 8 caracteres, con letras y números (servidor + formulario).
- Cambiar la contraseña exige sesión reciente (`secure_password_change`) y, en "Mi cuenta", la contraseña actual.
- Recuperación con `token_hash`: el enlace es de un solo uso, vence en 1 hora y se borra de la URL al usarlo.
- La recuperación no revela si un email tiene cuenta (anti-enumeración).
- Correo de aviso cada vez que cambia la contraseña.
- Límites por IP de Supabase Auth: 30 intentos de login/registro cada 5 minutos, entre otros (`[auth.rate_limit]`).
- Rotación de refresh tokens activada.
- Redirecciones solo a rutas internas (`safeNext`: sin redirección abierta).
- Al cerrar sesión o cambiar de usuario se borra la caché de datos del navegador.

### Frontend y cabeceras HTTP
Fuente única: `security/headers.ts`.
- **CSP** estricta: `script-src 'self'`, `style-src 'self'`, `connect-src` solo a Supabase, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
  Va como `<meta>` en el build (funciona en cualquier hosting) **y** debe ir como cabecera HTTP en el hosting (la `<meta>` no admite `frame-ancestors`).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (cámara, micrófono, geolocalización y pagos desactivados), `Cross-Origin-Opener-Policy: same-origin`.
- HSTS automático cuando la URL de Supabase es `https://`.
- Sin `dangerouslySetInnerHTML`, `eval` ni HTML construido a mano. Sin source maps públicos.
- El service worker **nunca** guarda en caché respuestas de Supabase (pedidos, sesión, etc.).
- Zod en modo `jitless`: no intenta usar `eval`, compatible con la CSP (0 violaciones en todas las páginas).

### Tienda pública
- La tienda **no carga supabase-js**: usa un cliente mínimo (`src/lib/publicApi.ts`) sin sesión ni cookies (`credentials: 'omit'`).
- El carrito guarda **solo ids y cantidades** (nunca precios) y se **valida con Zod** al leerlo de localStorage:
  contenido dañado o manipulado se descarta; productos de otro restaurante o no disponibles se quitan y se avisa.
- El token de seguimiento se envía por **POST** (no queda en URLs, logs ni cachés) y su formato se valida antes de consultar.
  La página del pedido es `noindex` y `robots.txt` excluye `/r/*/pedido/`.
- "Recordar mis datos" es opcional y viene **desmarcado** (dispositivos compartidos).
- El manifest de la PWA tiene alcance `/admin/`: a los clientes de la tienda no se les ofrece instalar el panel.

### Vista previa al compartir (Edge Function `og`)
- Nombre y descripción del restaurante se **escapan como HTML** (probado con `<script>` y `onerror`).
- El slug se valida con la misma regla de la base **antes** de usarlo en la consulta (sin inyección en filtros de PostgREST).
- Usa la clave anónima (RLS: solo restaurantes activos), responde 404 genérico, 405 a métodos distintos de GET y
  envía `Content-Security-Policy: default-src 'none'`.

### Storage
- Bucket público solo de imágenes: JPEG, PNG y WebP, máximo 5 MB. **SVG prohibido** (puede contener scripts).
- Las fotos se **re-codifican en el navegador** antes de subir (WebP, máx. 1200 px): se eliminan los metadatos EXIF
  (ubicación GPS, modelo del teléfono) y cualquier contenido extra escondido en el archivo original. → `src/features/menu/images.ts`
- Nombre de archivo aleatorio (UUID), nunca el original. Al reemplazar o borrar un producto se borra su foto anterior.
- Solo los miembros suben, reemplazan o borran archivos, y solo en la carpeta `{restaurant_id}/` de su restaurante.
- No se pueden listar los archivos de otros restaurantes.

### Realtime
- **Panel:** `postgres_changes` evalúa la RLS de `orders` por suscriptor: cada restaurante recibe solo sus pedidos
  (probado con dos cocinas abiertas a la vez). "En vivo" se muestra recién cuando Realtime confirma la suscripción
  a PostgreSQL; al reconectarse se recargan los pedidos (probado reiniciando el servidor de Realtime).
- **Cliente (seguimiento):** cada cambio de estado se publica por Broadcast en el canal `order:{token}` (migración 12).
  El nombre del canal incluye el token secreto de 192 bits y el mensaje solo trae el estado (sin datos personales,
  `tests/012`). La tienda lo usa como señal y **vuelve a pedir el estado real** al servidor: un mensaje falso no
  puede mostrar un estado falso.

## 3. Riesgos conocidos y aceptados (por ahora)

| Riesgo | Por qué se acepta / mitigación futura |
|---|---|
| El límite de pedidos se evade rotando teléfonos falsos | Agregar CAPTCHA (Cloudflare Turnstile) en el checkout + límite por IP en el hosting antes del lanzamiento |
| Realtime envía a anónimos un evento **vacío** (401) cuando se crea un pedido | No contiene datos. Se elimina pasando a Realtime Broadcast con canales privados |
| El canal de seguimiento `order:{token}` es público: quien tenga el link del pedido podría enviar mensajes al canal | El mensaje solo dispara una consulta al servidor; el estado mostrado siempre es el real. Alternativa futura: canales privados con autorización de Realtime |
| La sesión vive en `localStorage` (un XSS podría leerla) | Mitigado por la CSP estricta y React. Alternativa: cookies httpOnly con un backend (SSR) |
| El menú publicado es visible para cualquiera, incluida la competencia | Es inherente a una tienda pública |
| Sin registro de auditoría (quién cambió qué) | Agregar tabla de auditoría en una etapa posterior |
| Sin MFA para dueños | Activar TOTP de Supabase Auth en una etapa posterior |

## 4. Checklist antes de producción

**Supabase (dashboard del proyecto):**
- [ ] Activar **confirmación de email** (Auth → Providers → Email).
- [ ] Configurar **SMTP propio** (el de Supabase admite muy pocos correos por hora).
- [ ] Copiar las plantillas de `supabase/templates/` a Auth → Email Templates.
- [ ] Definir Site URL y Redirect URLs **exactas** del dominio (sin comodines como en local).
- [ ] Activar **CAPTCHA** (Turnstile) para registro, login y recuperación, y en el checkout.
- [ ] Activar **protección de contraseñas filtradas** (HaveIBeenPwned; plan Pro).
- [ ] Revisar el **Security Advisor** y el **Performance Advisor**: deben quedar sin alertas.
- [ ] Activar **SSL enforcement** y **Network restrictions** para conexiones directas a Postgres.
- [ ] Activar backups / **PITR** y probar una restauración.
- [ ] Guardar la `service_role` y la contraseña de la base en un gestor de secretos; nunca en el repositorio.

**Hosting del frontend:**
- [ ] Servir **todas** las cabeceras de `securityHeaders()` (`security/headers.ts`) como cabeceras HTTP, incluida HSTS.
- [ ] Forzar HTTPS y redirigir `http://` → `https://`.
- [ ] Límite de peticiones por IP / WAF (Cloudflare, Vercel Firewall, etc.).
- [ ] Verificar con https://securityheaders.com y https://observatory.mozilla.org (objetivo: A+).

**Operación:**
- [ ] `npm audit` sin vulnerabilidades altas antes de cada despliegue.
- [ ] Alertas por picos de errores 4xx/5xx y de pedidos por restaurante.

## 5. Reglas para las próximas etapas

1. **Toda tabla nueva:** RLS + políticas por operación y rol + `revoke` + prueba pgTAP de aislamiento.
2. **Toda función nueva:** `set search_path = ''`, nombres calificados, `revoke execute … from public, anon, authenticated` y `grant` explícito. La lista blanca de `tests/001` debe actualizarse a propósito.
3. **Nunca** confiar en datos del cliente para precios, permisos o `restaurant_id`.
4. **Seguimiento de pedidos (etapa 6):** usar `Referrer-Policy: no-referrer` en esa página y no enviar el token a servicios de terceros (analytics).
5. **No** agregar scripts de terceros (analytics, chat, etc.) sin revisar la CSP y su impacto en la privacidad.
6. Los mensajes de error al usuario nunca deben incluir detalles internos (SQL, stack traces).

## 6. Cómo verificar

```bash
npm run db:reset && npm run db:test   # 169 pruebas pgTAP (RLS, permisos, reglas de negocio, controles)
npm run verify:api                    # Realtime + RLS, concurrencia, Storage por la API
npx supabase db lint                  # funciones SQL
npm audit                             # dependencias
npm run build && npx vite preview     # build de producción con las cabeceras reales
```
