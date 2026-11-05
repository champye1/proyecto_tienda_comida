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
| Bot / spam | Inundar la cocina con pedidos falsos; probar contraseñas; crear cuentas falsas | CAPTCHA (Turnstile) verificado en el servidor en checkout, login, registro y recuperación; límite de pedidos por teléfono; límites de Auth por IP |
| Otro restaurante (tenant) | Leer o modificar menú, pedidos o clientes de la competencia | RLS por `restaurant_id` en todas las tablas; FKs compuestas; Storage por carpeta |
| Personal (staff) | Cambiar montos, editar el local, agregar miembros | Rol `staff` limitado; montos inmutables (trigger); solo el dueño gestiona local y equipo |
| Atacante con XSS | Robar la sesión o los datos de clientes | CSP estricta (sin scripts inline; de terceros solo el CAPTCHA; `connect-src` solo a Supabase y, si está activo, Sentry); React escapa todo el HTML |
| Sitio malicioso | Clickjacking del panel | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Tablet robada o compartida | Usar la sesión abierta | Cambiar contraseña exige la actual + sesión reciente; logout limpia la caché |
| Error humano / falla del proveedor | Perder pedidos, menús o cuentas | Respaldos propios cifrados (`npm run db:backup`) + backups/PITR de Supabase; restauración probada |
| Fuga por herramientas de terceros | Que datos de clientes terminen en servicios externos | Monitoreo opcional con limpieza de datos personales antes de enviar (probado); sin analytics |

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
| Horario de atención: pedidos fuera de horario rechazados por trigger en `orders` (cualquier camino de inserción); horario validado por trigger (7 días, máx. 3 tramos, `HH:MM`, sin campos extra); zonas horarias en lista blanca; solo el dueño lo edita | `…daily_operations` (15) | `tests/015` |
| Tiempo estimado: solo por `confirm_order` / `set_order_estimate` (miembros del restaurante, 1–240 min); la guardia de `orders` solo admite cambiarlo en pedidos confirmados o en preparación, incluso a service_role | `…daily_operations` (15) | `tests/015` |
| Reporte de ventas por `get_sales_report`: SECURITY INVOKER + verificación explícita de membresía (error claro, no un reporte vacío), rango máx. 31 días | `…0100_sales_report` | `tests/013` |
| Menú público por `get_public_menu`: SECURITY INVOKER (aplica RLS), solo lo publicado y sin campos internos | `…0100_public_menu` | `tests/011` |
| Reordenar el menú por RPC: tipo validado con lista blanca antes del SQL dinámico (`%I`), ids de un solo restaurante y membresía verificada | `reorder_menu_items` (`…1000`) | `tests/010` |
| Errores de negocio con mensajes pensados para el usuario; los errores internos no se muestran | RPCs + `src/lib/errors.ts` | — |

### CAPTCHA (Cloudflare Turnstile)
La verificación siempre ocurre **en el servidor**: quitar el widget del HTML o llamar a la API a mano no sirve.
| Dónde | Cómo se exige | Prueba |
|---|---|---|
| Login, registro, recuperar contraseña y verificación de la contraseña actual en "Mi cuenta" | Supabase Auth (`[auth.captcha]` en `config.toml`): rechaza con `captcha_failed` sin token válido | `verify:api` (login con token), prueba con el secreto "siempre falla" |
| Checkout | `create_order` **ya no es ejecutable** por `anon`/`authenticated` (migración `…order_captcha_gate`). Solo la Edge Function `place-order` (con `service_role`) la llama, después de validar el token con `siteverify` | `tests/014`, `verify:api` sección 4 |

`place-order` además: limita el cuerpo a 32 KB (413), valida la forma del pedido antes de reenviarlo, solo acepta POST
(405), reenvía únicamente los errores de negocio (`P0001`, `P0002`, `22023`) y oculta el resto tras un mensaje genérico.
Los tokens son de un solo uso: el frontend pide uno nuevo después de cada intento.

### Privacidad y textos legales
- `/legal/terminos` y `/legal/privacidad` (Ley 19.628 / Ley 21.719, Ley 19.496). **Borradores**: deben revisarlos un abogado
  (aviso visible mientras `LEGAL_DRAFT = true`, en `src/routes/legal/LegalLayout.tsx`).
- El registro exige aceptarlos y guarda la versión y fecha (`terms_version`, `terms_accepted_at`) en los metadatos del usuario.
- El checkout informa antes de confirmar que los datos se comparten con el restaurante, con enlaces a ambos textos.
- Si cambia lo que el sistema hace con los datos (nuevos datos, proveedores o plazos), actualizar la política y `LEGAL_VERSION`.

### Respaldos
- **Supabase:** backups diarios automáticos (plan Pro: 7 días) y, opcionalmente, PITR (restaurar a cualquier segundo).
- **Copia propia:** `npm run db:backup -- --remote` genera roles, estructura y datos con `supabase db dump`, **cifrados con
  AES-256-GCM** (clave derivada con scrypt desde `BACKUP_PASSPHRASE`; obligatoria para producción) y un `manifest.json` con
  SHA-256. Borra automáticamente los respaldos de más de `BACKUP_KEEP_DAYS`. La carpeta `backups/` está en `.gitignore`.
- **Restauración probada** (simulacro local): se borraron todas las tablas del respaldo y se restauró `data.sql`; coinciden
  conteos, la huella MD5 de los pedidos y el correlativo. Contraseña incorrecta o archivo alterado → el descifrado falla.
- Procedimiento de restauración: ver README → "Respaldos".

### Monitoreo de errores (opcional)
- Sentry, **desactivado** si `VITE_SENTRY_DSN` está vacío (no se descarga el SDK). Se carga después del primer render y su
  archivo no se precachea en la PWA.
- Sin datos del usuario, cookies, cabeceras, cuerpos de peticiones, parámetros de URL ni variables locales (`dataCollection`),
  sin Session Replay ni trazas; las migas de consola se descartan.
- `beforeSend` reemplaza en todos los textos: JWT, tokens de seguimiento, emails y teléfonos (`src/lib/monitoring.ts`).
  **Probado en el navegador** contra un servidor Sentry falso: el reporte llega y no contiene ninguno de esos datos.

### Integración continua (GitHub Actions)
- En cada push y PR: `npm audit --audit-level=high`, build con TypeScript, `supabase db lint`, las pruebas pgTAP y `verify:api`
  contra un Supabase levantado en el runner. Permisos del workflow de solo lectura.
- Dependabot semanal para npm y GitHub Actions.

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
- **CSP** estricta: `script-src 'self' https://challenges.cloudflare.com` (CAPTCHA), `frame-src` solo Turnstile, `style-src 'self'`,
  `connect-src` solo a Supabase (+ el host de Sentry si `VITE_SENTRY_DSN` está definido), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
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
- El QR de la tienda se genera en el navegador (`uqr`, sin servicios externos) y se dibuja con React, sin HTML inyectado.
- La comanda impresa contiene datos del cliente: se imprime solo desde el panel (sesión de un miembro) y nunca se guarda.
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
| El límite de pedidos se evade rotando teléfonos falsos | Mitigado por el CAPTCHA obligatorio en `place-order`. Falta: límite por IP en el hosting/WAF |
| CAPTCHA: un humano (o un servicio de resolución de CAPTCHAs pagado) puede seguir enviando pedidos | Turnstile encarece el abuso, no lo hace imposible. El límite por teléfono y el WAF siguen siendo necesarios |
| CORS de `place-order`: en local el gateway (Kong) agrega `Access-Control-Allow-Origin: *` a todas las respuestas | CORS no es una barrera de seguridad para este endpoint (es público); la barrera es el CAPTCHA. En producción la función responde con `SITE_URL` |
| El script de Turnstile se carga desde Cloudflare (tercero con ejecución de JS en la página) | Proveedor necesario para el CAPTCHA; limitado por CSP a ese único origen |
| `npm audit` reporta vulnerabilidades moderadas/bajas en la cadena de build de `vite-plugin-pwa` (workbox-build, glob, ejs…) | Solo se ejecutan en el build, no llegan al navegador. La única corrección es bajar de versión mayor; se revisan con Dependabot |
| El simulacro de restauración se hizo en local (mismo esquema) | Repetirlo contra un proyecto Supabase nuevo antes del lanzamiento y luego cada 6 meses |
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
- [ ] **CAPTCHA:** crear el widget en Cloudflare → Turnstile con el dominio real. Poner la *site key* en `VITE_TURNSTILE_SITE_KEY`,
      y la *secret key* en Auth → Bot and Abuse Protection (Turnstile) **y** como secreto de la función:
      `supabase secrets set TURNSTILE_SECRET_KEY=… SITE_URL=https://…` (sin `ALLOW_LOCALHOST_ORIGINS`).
- [ ] Desplegar la función: `supabase functions deploy place-order --no-verify-jwt` y aplicar la migración `order_captcha_gate`
      **después** (si no, la tienda queda sin poder crear pedidos).
- [ ] Activar **protección de contraseñas filtradas** (HaveIBeenPwned; plan Pro).
- [ ] Revisar el **Security Advisor** y el **Performance Advisor**: deben quedar sin alertas.
- [ ] Activar **SSL enforcement** y **Network restrictions** para conexiones directas a Postgres.
- [ ] Plan Pro con backups diarios; evaluar **PITR**. Hacer un simulacro de restauración en un proyecto nuevo.
- [ ] Guardar la `service_role` y la contraseña de la base en un gestor de secretos; nunca en el repositorio.

**Legal y privacidad:**
- [ ] Revisión de `/legal/terminos` y `/legal/privacidad` por un abogado; completar los `[CORCHETES]` (`PLATFORM` en `LegalLayout.tsx`).
- [ ] Luego `LEGAL_DRAFT = false` y actualizar `LEGAL_VERSION`.
- [ ] Contrato de encargo de tratamiento con cada restaurante (la plataforma es encargada de los datos de sus clientes).
- [ ] Definir plazos de conservación y automatizar el borrado/anonimización de pedidos antiguos.

**Hosting del frontend:**
- [ ] Servir **todas** las cabeceras de `securityHeaders()` (`security/headers.ts`) como cabeceras HTTP, incluida HSTS.
- [ ] Forzar HTTPS y redirigir `http://` → `https://`.
- [ ] Límite de peticiones por IP / WAF (Cloudflare, Vercel Firewall, etc.).
- [ ] Verificar con https://securityheaders.com y https://observatory.mozilla.org (objetivo: A+).

**Operación:**
- [ ] `npm audit` sin vulnerabilidades altas antes de cada despliegue (lo verifica el CI).
- [ ] GitHub: proteger `main` (exigir que el CI pase antes de fusionar) y activar *secret scanning*.
- [ ] Respaldo propio semanal: `npm run db:backup -- --remote`, guardado fuera del equipo; la `BACKUP_PASSPHRASE` en el gestor de secretos.
- [ ] Monitoreo: proyecto en Sentry (región UE) con "Prevent Storing of IP Addresses" activado y alertas por correo; poner el DSN en `VITE_SENTRY_DSN`.
- [ ] Monitor de disponibilidad externo (p. ej. UptimeRobot o Better Stack) sobre la landing y una tienda de prueba.
- [ ] Alertas por picos de errores 4xx/5xx y de pedidos por restaurante.

## 5. Reglas para las próximas etapas

1. **Toda tabla nueva:** RLS + políticas por operación y rol + `revoke` + prueba pgTAP de aislamiento.
2. **Toda función nueva:** `set search_path = ''`, nombres calificados, `revoke execute … from public, anon, authenticated` y `grant` explícito. La lista blanca de `tests/001` debe actualizarse a propósito.
3. **Nunca** confiar en datos del cliente para precios, permisos o `restaurant_id`.
4. **Seguimiento de pedidos (etapa 6):** usar `Referrer-Policy: no-referrer` en esa página y no enviar el token a servicios de terceros (analytics).
5. **No** agregar scripts de terceros (analytics, chat, etc.) sin revisar la CSP y su impacto en la privacidad, y sin
   agregarlos a la Política de privacidad (hoy: Turnstile y, opcional, Sentry).
6. Los mensajes de error al usuario nunca deben incluir detalles internos (SQL, stack traces).
7. **Toda escritura pública nueva** (formularios sin login): detrás de CAPTCHA verificado en el servidor, como `place-order`.

## 6. Cómo verificar

```bash
npm run db:reset && npm run db:test   # 206 pruebas pgTAP (RLS, permisos, reglas de negocio, controles)
npm run verify:api                    # Realtime + RLS, concurrencia, Storage y CAPTCHA de pedidos por la API
npm run db:backup                     # respaldo local (con BACKUP_PASSPHRASE, cifrado)
npx supabase db lint                  # funciones SQL
npm audit                             # dependencias
npm run build && npx vite preview     # build de producción con las cabeceras reales
```
