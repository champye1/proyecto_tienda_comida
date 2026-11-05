# Pedidos SaaS — MVP

Plataforma multi-tenant de pedidos online para restaurantes (Chile).

## Qué incluye
- **Tienda pública por restaurante** (`/r/:slug`, mobile-first): menú por categorías, productos con
  opciones (tamaños, agregados), carrito que se guarda, checkout (retiro o delivery, efectivo o
  transferencia) y seguimiento del pedido en vivo. Vista previa al compartir en WhatsApp/Instagram.
- **Panel del restaurante** (`/admin`, pensado para tablet, instalable como PWA): pedidos en tiempo real
  con alerta sonora, edición del menú con fotos, abrir/cerrar el local, reporte de ventas y
  productos más vendidos, configuración del local, cuenta y recuperación de contraseña.
- **Operación diaria:** horario de atención automático (por zona horaria), tiempo estimado al
  confirmar (el cliente lo ve en su seguimiento), comanda imprimible para cocina (impresoras
  térmicas de 80 mm, con impresión automática opcional) y código QR de la tienda (PNG, SVG y cartel).
- **Landing animada** de la plataforma (`/`).
- **Seguridad:** aislamiento por restaurante con RLS, precios calculados en el servidor, CSP estricta,
  CAPTCHA en pedidos y accesos, y más. Ver [SECURITY.md](SECURITY.md).
- **Legal:** Términos y Política de privacidad (borradores para revisión legal) en `/legal/*`.
- **Operación:** CI en GitHub Actions, respaldos cifrados y monitoreo de errores opcional (Sentry).

## Requisitos
- Node 20+
- Docker Desktop abierto (Supabase local corre en Docker)

## Puesta en marcha (local)
```bash
npm install
npm run db:start            # levanta Supabase local (la primera vez descarga imágenes)
cp .env.example .env.local  # pegar API_URL y PUBLISHABLE_KEY de `npx supabase status -o env`
npm run db:reset            # recrea la base desde cero: migraciones + seed
npm run db:types            # regenera src/types/database.types.ts
npm run dev
```

## Puertos locales
Supabase usa el rango **55320–55329** (no el 543xx por defecto): en este equipo Windows
reserva 53927–54426 para Hyper-V/WSL y Supabase no puede usar esos puertos.

| Servicio | URL |
|---|---|
| API | http://127.0.0.1:55321 |
| Studio (panel de la base) | http://127.0.0.1:55323 |
| Correos de prueba (Mailpit) | http://127.0.0.1:55324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:55322/postgres` |
| Pooler (Supavisor) | puerto 55329 |

## Usuarios de prueba (seed)
| Email | Contraseña | Restaurante | Tienda |
|---|---|---|---|
| owner-a@test.cl | password123 | Pizzería Demo (owner) | `/r/pizzeria-demo` |
| owner-b@test.cl | password123 | Sushi Demo (owner) | `/r/sushi-demo` |

## Correos (registro, recuperación de contraseña)
- En local **no se envían correos reales**: todos llegan a Mailpit → http://127.0.0.1:55324
- Plantillas en español: `supabase/templates/` (recuperación, confirmación de cuenta y aviso de
  "tu contraseña fue cambiada"), configuradas en `supabase/config.toml`.
- **Producción:** las plantillas de `config.toml` solo aplican en local. En el proyecto de
  supabase.com hay que copiarlas en *Authentication → Email Templates* (la de recuperación
  usa `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`), agregar la URL del
  sitio en *Authentication → URL Configuration* y configurar un SMTP propio (el de Supabase
  tiene un límite muy bajo de envíos por hora).

Flujo de recuperación: `/admin/recuperar` (pide el email) → correo con enlace →
`/admin/nueva-contrasena` (verifica el enlace y pide la nueva contraseña) → panel.
Con la sesión iniciada también se puede cambiar en `/admin/cuenta` (pide la actual).

## Pruebas
```bash
npm run db:reset     # las pruebas usan los datos del seed
npm run db:test      # pgTAP: RLS, aislamiento, create_order, seguimiento, estados, Storage, seguridad
npm run verify:api   # por la API: Realtime + RLS, concurrencia, Storage, CAPTCHA de pedidos
```
`verify:api` crea pedidos y archivos de prueba: corre `npm run db:reset` después.

El **CI** (`.github/workflows/ci.yml`) corre lo mismo en cada push y PR: audit, build, lint SQL,
pgTAP y `verify:api` contra un Supabase levantado en GitHub Actions.

## CAPTCHA (Cloudflare Turnstile)
En local se usan las claves de **prueba** de Cloudflare (siempre aprueban; ya están en
`.env.example` y `supabase/config.toml`). El widget aparece en login, registro, recuperación,
"Mi cuenta" y checkout, y es invisible salvo que Cloudflare dude.

- Los pedidos pasan por la Edge Function `supabase/functions/place-order`, que verifica el
  token y recién entonces crea el pedido (la RPC `create_order` ya no es pública).
- Para probar el rechazo: cambiar los dos secretos `1x0000…AA` de `config.toml` por
  `2x0000000000000000000000000000000AA` (siempre falla) y reiniciar con `npm run db:stop && npm run db:start`.
- **Producción:** ver el checklist de SECURITY.md (claves reales, secretos y orden de despliegue).

## Respaldos
```bash
npm run db:backup                         # base local
npm run db:backup -- --remote             # producción (SUPABASE_DB_URL + BACKUP_PASSPHRASE en .env.local)
npm run db:backup -- --decrypt backups/<carpeta>   # descifra para restaurar
```
Cada respaldo queda en `backups/<fecha>/` (`roles`, `schema`, `data` + `manifest.json` con SHA-256),
cifrado con AES-256-GCM. **Guarda una copia fuera del equipo** y la contraseña en un gestor de secretos:
sin ella el respaldo no se puede abrir.

**Restaurar en un proyecto Supabase nuevo** (conexión *Session pooler* del dashboard):
```bash
npm run db:backup -- --decrypt backups/<carpeta>
psql "$NUEVA_DB_URL" -v ON_ERROR_STOP=1 -f backups/<carpeta>/roles.sql
psql "$NUEVA_DB_URL" -v ON_ERROR_STOP=1 -f backups/<carpeta>/schema.sql
psql "$NUEVA_DB_URL" -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica" -f backups/<carpeta>/data.sql
# luego: volver a desplegar las Edge Functions y secretos, y BORRAR los .sql descifrados
```
Las imágenes de Storage no van en el respaldo de la base: descargarlas aparte (p. ej. con
`supabase storage cp -r ss:///restaurant-images ./backups/imagenes --experimental`).

## Monitoreo de errores (opcional)
Definir `VITE_SENTRY_DSN` al hacer el build activa el reporte de errores a Sentry; vacío, no se
carga nada. Antes de enviar, se borran emails, teléfonos, tokens y JWT (`src/lib/monitoring.ts`).
En Sentry: región UE, activar *Prevent Storing of IP Addresses* y alertas por correo.
Para saber si el sitio está caído, usar además un monitor externo (UptimeRobot, Better Stack).

## Vista previa al compartir (WhatsApp, Instagram)
Los bots que arman la vista previa no ejecutan JavaScript, así que la tienda (app de una
sola página) no les mostraría el nombre ni el logo. Lo resuelve la Edge Function
`supabase/functions/og`, que devuelve las etiquetas Open Graph de cada restaurante.

- Local: http://127.0.0.1:55321/functions/v1/og/pizzeria-demo
- **Producción:**
  1. `npx supabase functions deploy og --no-verify-jwt`
  2. `npx supabase secrets set SITE_URL=https://tu-dominio.cl`
  3. En el hosting, reenviar a la función **solo las visitas de bots** a `/r/:slug`, según el
     User-Agent (`facebookexternalhit`, `WhatsApp`, `Twitterbot`, `TelegramBot`, `Slackbot`,
     `LinkedInBot`, `Discordbot`). Así el link que se comparte es el normal de la tienda.

## Seguridad
Ver [SECURITY.md](SECURITY.md): modelo de amenazas, controles implementados, riesgos
aceptados y **checklist obligatorio antes de producción**.

## Rutas
- `/` — landing de la plataforma (presentación + registro)
- `/legal/terminos`, `/legal/privacidad` — textos legales
- `/r/:slug` — tienda pública del restaurante (menú y carrito)
- `/r/:slug/checkout` — datos del cliente y confirmación del pedido
- `/r/:slug/pedido/:token` — pedido confirmado y seguimiento (link privado)
- `/admin` — panel del restaurante (instalable como PWA)
- `/admin/pedidos` — pedidos en vivo (tablero por estado, alerta sonora) e historial
- `/admin/reportes` — ventas del día o de un período y productos más vendidos
- `/admin/local` — datos del local: logo, color, delivery/retiro, costo de envío y pedido mínimo
- `/admin/menu` — edición del menú: categorías, productos con foto, grupos de opciones

## Estructura
```
supabase/
  config.toml        configuración local (pooler habilitado, puertos 553xx)
  migrations/        1 tipos · 2 tablas · 3 triggers/helpers · 4 RLS · 5 RPC · 6 Storage · 7 Realtime
                     8 slugs reservados · 9 endurecimiento de seguridad · 10 gestión del menú
                     11 menú público (get_public_menu) · 12 seguimiento en vivo (Broadcast)
                     13 reporte de ventas (get_sales_report) · 14 CAPTCHA de pedidos (create_order
                     solo vía place-order) · 15 operación diaria (horario, zona horaria,
                     tiempo estimado)
  seed.sql           2 usuarios, 2 restaurantes, menús y pedidos de ejemplo
  tests/             pruebas pgTAP
  functions/og/      Edge Function: vista previa al compartir el link de una tienda
  functions/place-order/  Edge Function: verifica el CAPTCHA y crea el pedido
scripts/
  verify-api.mjs     verificaciones por la API pública
  backup-db.mjs      respaldo cifrado de la base (npm run db:backup)
.github/             CI (GitHub Actions) y Dependabot
security/
  headers.ts         cabeceras de seguridad HTTP y CSP (fuente única)
src/
  lib/               cliente Supabase, API pública, QueryClient, env (Zod), formato CLP, monitoreo
  types/             tipos generados desde el esquema
  routes/landing/    landing animada de la plataforma (Motion, solo se carga en /)
  routes/store/      tienda pública: menú, carrito, checkout y pedido
  routes/admin/      panel (menu/: categorías, productos, opciones)
  routes/legal/      Términos y Política de privacidad
  features/          lógica por dominio: auth, restaurants, menu, store (carrito, pedidos)
  components/        componentes compartidos
```
