/**
 * Política de privacidad (/legal/privacidad).
 *
 * Base: Ley 19.628 y Ley 21.719 de protección de datos personales de Chile (esta última
 * entra en plena vigencia el 1 de diciembre de 2026). Describe lo que el sistema hace
 * REALMENTE con los datos; si el código cambia (nuevos datos, nuevos proveedores, otros
 * plazos), este texto debe actualizarse y subir LEGAL_VERSION.
 *
 * Roles: el RESTAURANTE es el responsable de los datos de sus clientes (decide para qué
 * los usa); la plataforma es el encargado que los trata por su cuenta. Para los datos de
 * los dueños de restaurantes, la plataforma es la responsable.
 *
 * BORRADOR: debe revisarlo un abogado antes de publicar.
 */
import { LegalLayout, PLATFORM, type LegalSection } from './LegalLayout'

const sections: LegalSection[] = [
  {
    id: 'quienes',
    title: 'Quién trata tus datos',
    body: (
      <>
        <p>
          {PLATFORM.name} es una plataforma que permite a restaurantes recibir pedidos online. Su titular es{' '}
          {PLATFORM.legalName}, RUT {PLATFORM.rut}, con domicilio en {PLATFORM.address} (en adelante, «la plataforma»).
        </p>
        <ul>
          <li>
            <strong>Si haces un pedido como cliente:</strong> el responsable de tus datos es el restaurante al que le
            compras. La plataforma los trata por cuenta del restaurante, solo para que el pedido llegue y se pueda
            seguir.
          </li>
          <li>
            <strong>Si tienes una cuenta de restaurante:</strong> la plataforma es la responsable de los datos de tu
            cuenta.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos recolectamos',
    body: (
      <>
        <p>
          <strong>Clientes que hacen un pedido</strong> (no necesitan crear una cuenta):
        </p>
        <ul>
          <li>Nombre y teléfono, para que el restaurante pueda identificarte y contactarte.</li>
          <li>Dirección de entrega, solo si eliges delivery.</li>
          <li>Notas que escribas en el pedido, y el detalle del pedido (productos, montos, forma de pago).</li>
        </ul>
        <p>
          <strong>Dueños de restaurantes:</strong> email, contraseña (guardada cifrada; nadie puede verla), datos del
          local (nombre, dirección, teléfono, horarios, logo y fotos de productos) y el registro de cuándo aceptaste
          estos textos.
        </p>
        <p>
          <strong>Datos técnicos:</strong> para protegerte de fraudes y bots, el servicio registra la dirección IP y
          datos del navegador de forma temporal. No usamos cookies de publicidad ni herramientas de seguimiento.
        </p>
        <p>No pedimos datos sensibles ni datos bancarios: los pagos se coordinan directamente con el restaurante.</p>
      </>
    ),
  },
  {
    id: 'finalidad',
    title: 'Para qué los usamos',
    body: (
      <ul>
        <li>Recibir, preparar y entregar tu pedido, y mostrarte su estado en la página de seguimiento.</li>
        <li>Que el restaurante vea sus ventas y sus productos más vendidos.</li>
        <li>Administrar las cuentas de los restaurantes (inicio de sesión, recuperación de contraseña).</li>
        <li>Prevenir abusos: pedidos falsos, intentos de adivinar contraseñas y otros usos automatizados.</li>
      </ul>
    ),
  },
  {
    id: 'base-legal',
    title: 'Base legal',
    body: (
      <ul>
        <li>
          <strong>Ejecución del contrato:</strong> sin tu nombre, teléfono y (en delivery) dirección no es posible
          entregar el pedido que solicitas.
        </li>
        <li>
          <strong>Consentimiento:</strong> al crear una cuenta de restaurante aceptas expresamente estos textos.
          Recordar tus datos en el dispositivo es opcional y viene desactivado.
        </li>
        <li>
          <strong>Interés legítimo:</strong> la seguridad del servicio y la prevención de fraudes.
        </li>
        <li>
          <strong>Obligación legal:</strong> conservar información cuando la ley lo exija (por ejemplo, tributaria).
        </li>
      </ul>
    ),
  },
  {
    id: 'compartir',
    title: 'Con quién los compartimos',
    body: (
      <>
        <p>Tus datos de pedido solo los ve el restaurante al que le compras. Nunca vendemos datos personales.</p>
        <p>Para funcionar usamos estos proveedores, que tratan datos solo por nuestra cuenta:</p>
        <ul>
          <li>
            <strong>Supabase</strong>: base de datos, cuentas de usuario y almacenamiento de imágenes. Los servidores
            están en [REGIÓN DEL PROYECTO], fuera de Chile.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong>: verificación de que quien usa el formulario es una persona y no un
            bot. Procesa la IP y datos técnicos del navegador.
          </li>
          <li>[PROVEEDOR DE HOSTING] y [PROVEEDOR DE CORREO] — completar al elegirlos.</li>
        </ul>
        <p>
          Algunos de estos proveedores están fuera de Chile. Solo trabajamos con proveedores que ofrecen garantías
          adecuadas de protección (cláusulas contractuales y medidas de seguridad).
        </p>
      </>
    ),
  },
  {
    id: 'plazos',
    title: 'Cuánto tiempo los guardamos',
    body: (
      <ul>
        <li>
          <strong>Pedidos:</strong> [PLAZO, p. ej. 24 meses] desde su creación, para el historial y los reportes del
          restaurante; luego se eliminan o se anonimizan.
        </li>
        <li>
          <strong>Cuentas de restaurante:</strong> mientras la cuenta esté activa. Si se elimina, sus datos se borran
          en un plazo de [PLAZO, p. ej. 30 días], salvo lo que la ley obligue a conservar.
        </li>
        <li>
          <strong>Respaldos:</strong> las copias de seguridad se conservan hasta [PLAZO] y luego se destruyen.
        </li>
      </ul>
    ),
  },
  {
    id: 'dispositivo',
    title: 'Datos guardados en tu dispositivo',
    body: (
      <>
        <p>
          La aplicación guarda algunos datos en el almacenamiento local de tu navegador (no son cookies de
          seguimiento y no salen de tu dispositivo):
        </p>
        <ul>
          <li>El carrito de compras, para que no lo pierdas si cierras la página.</li>
          <li>Tu nombre, teléfono y dirección, solo si marcas «Recordar mis datos». Si lo desmarcas, se borran.</li>
          <li>En el panel: la sesión iniciada, el restaurante elegido y la preferencia de sonido.</li>
        </ul>
        <p>Puedes borrarlos en cualquier momento desde la configuración de tu navegador.</p>
      </>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <p>Puedes ejercer, en forma gratuita, los siguientes derechos sobre tus datos:</p>
        <ul>
          <li>
            <strong>Acceso:</strong> saber qué datos tuyos tenemos.
          </li>
          <li>
            <strong>Rectificación:</strong> corregir datos inexactos o incompletos.
          </li>
          <li>
            <strong>Supresión:</strong> pedir que se eliminen.
          </li>
          <li>
            <strong>Oposición:</strong> oponerte a ciertos usos.
          </li>
          <li>
            <strong>Portabilidad:</strong> recibir tus datos en un formato electrónico de uso común.
          </li>
          <li>
            <strong>Bloqueo:</strong> pedir que se suspenda temporalmente su uso.
          </li>
        </ul>
        <p>
          Escríbenos a {PLATFORM.email} indicando tu nombre, el teléfono o email asociado y qué solicitas. Si tu
          solicitud es sobre un pedido, también puedes dirigirte directamente al restaurante. Responderemos dentro
          del plazo legal. Si no quedas conforme, puedes reclamar ante la Agencia de Protección de Datos Personales.
        </p>
      </>
    ),
  },
  {
    id: 'seguridad',
    title: 'Cómo protegemos tus datos',
    body: (
      <ul>
        <li>Toda la comunicación viaja cifrada (HTTPS).</li>
        <li>
          Cada restaurante solo puede ver sus propios pedidos: el aislamiento lo aplica la base de datos misma, no solo
          la aplicación.
        </li>
        <li>Las contraseñas se guardan cifradas y el inicio de sesión está protegido contra bots.</li>
        <li>
          La página de seguimiento de un pedido usa un enlace secreto e imposible de adivinar; compártelo solo con
          quien quieras.
        </li>
        <li>
          Si ocurriera una filtración que afecte tus datos, lo informaremos a la autoridad y a los afectados según lo
          que exige la ley.
        </li>
      </ul>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    body: <p>El servicio no está dirigido a menores de 14 años y no recolectamos sus datos de forma intencional.</p>,
  },
  {
    id: 'cambios',
    title: 'Cambios a esta política',
    body: (
      <p>
        Si cambiamos esta política, publicaremos la nueva versión con su fecha en esta página. Si el cambio es
        importante, se lo avisaremos a los restaurantes registrados antes de que entre en vigencia.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de privacidad"
      intro={
        <p>
          Aquí explicamos qué datos personales se recolectan cuando usas {PLATFORM.name}, para qué se usan, con quién
          se comparten y cómo puedes ejercer tus derechos, de acuerdo con la legislación chilena de protección de datos
          personales.
        </p>
      }
      sections={sections}
    />
  )
}
