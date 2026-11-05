/**
 * Términos y condiciones (/legal/terminos).
 *
 * Regulan dos relaciones distintas:
 *   - Plataforma ↔ restaurante (quien crea una cuenta y publica su menú).
 *   - Uso de la tienda por los clientes finales. La compra en sí es entre el cliente y el
 *     restaurante: la plataforma no vende comida ni cobra los pedidos.
 *
 * Base: Ley 19.496 (protección de los derechos de los consumidores) y legislación de
 * datos personales (ver PrivacyPage). BORRADOR: debe revisarlo un abogado antes de publicar.
 */
import { Link } from 'react-router'
import { LegalLayout, PLATFORM, type LegalSection } from './LegalLayout'

const sections: LegalSection[] = [
  {
    id: 'servicio',
    title: 'El servicio',
    body: (
      <>
        <p>
          {PLATFORM.name} ({PLATFORM.legalName}, RUT {PLATFORM.rut}) ofrece a restaurantes una herramienta para
          publicar su menú y recibir pedidos online de retiro o delivery.
        </p>
        <p>
          <strong>La plataforma no vende productos ni cobra pedidos.</strong> Cada pedido es una compra entre el
          cliente y el restaurante, que es el único responsable de los productos, precios, preparación, entrega y
          cobro.
        </p>
      </>
    ),
  },
  {
    id: 'clientes',
    title: 'Para clientes que hacen pedidos',
    body: (
      <ul>
        <li>No necesitas una cuenta. Debes entregar datos reales para que el restaurante pueda entregarte el pedido.</li>
        <li>
          Los precios y el total los calcula el sistema con la información vigente del restaurante. El restaurante
          confirma el pedido al recibirlo y puede rechazarlo (por ejemplo, si se quedó sin un producto).
        </li>
        <li>
          El pago se realiza directamente al restaurante con la forma que elijas (efectivo o transferencia). Ante
          cualquier problema con un pedido (producto, demora, cobro), contacta al restaurante.
        </li>
        <li>
          Guarda el enlace de seguimiento de tu pedido: es personal y permite ver su estado. No lo compartas con
          desconocidos.
        </li>
        <li>Está prohibido hacer pedidos falsos o de broma.</li>
      </ul>
    ),
  },
  {
    id: 'restaurantes',
    title: 'Para restaurantes',
    body: (
      <ul>
        <li>Para registrarte debes ser mayor de edad y tener facultades para representar al restaurante.</li>
        <li>
          Eres responsable de que la información publicada (productos, precios, fotos, horarios, costo de despacho) sea
          veraz y esté actualizada, y de cumplir la normativa sanitaria, tributaria y de protección al consumidor
          aplicable a tu negocio.
        </li>
        <li>
          Eres el responsable de los datos personales de tus clientes: solo puedes usarlos para gestionar sus pedidos
          y debes respetar sus derechos según la{' '}
          <Link to="/legal/privacidad" className="underline">
            Política de privacidad
          </Link>
          .
        </li>
        <li>Debes mantener tu contraseña en secreto y avisarnos si sospechas que alguien accedió a tu cuenta.</li>
        <li>Solo puedes subir imágenes sobre las que tengas derechos.</li>
      </ul>
    ),
  },
  {
    id: 'uso-aceptable',
    title: 'Usos prohibidos',
    body: (
      <ul>
        <li>Usar el servicio para fines ilegales o para vender productos prohibidos.</li>
        <li>Intentar acceder a datos de otros restaurantes o clientes, o vulnerar la seguridad del servicio.</li>
        <li>Automatizar pedidos o registros (bots), o sobrecargar el servicio intencionalmente.</li>
        <li>Publicar contenido falso, ofensivo o que infrinja derechos de terceros.</li>
      </ul>
    ),
  },
  {
    id: 'precio',
    title: 'Precio del servicio',
    body: <p>[CONDICIONES COMERCIALES: plan gratuito o de pago, precio, forma de cobro y facturación.]</p>,
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad y respaldos',
    body: (
      <p>
        Hacemos lo razonable para que el servicio esté disponible y respaldamos la información periódicamente, pero
        puede haber interrupciones por mantención o causas ajenas a nuestro control. Recomendamos a los restaurantes
        tener un canal alternativo para recibir pedidos en caso de una falla.
      </p>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspensión y término',
    body: (
      <p>
        Puedes dejar de usar el servicio y pedir la eliminación de tu cuenta cuando quieras, escribiendo a{' '}
        {PLATFORM.email}. Podemos suspender una cuenta que infrinja estos términos, avisando previamente salvo que se
        trate de un riesgo grave para otros usuarios o para la seguridad del servicio.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Responsabilidad',
    body: (
      <p>
        La plataforma responde por el correcto funcionamiento de la herramienta, no por los productos ni por la
        relación de compra entre clientes y restaurantes. Nada de lo anterior limita los derechos irrenunciables que la
        Ley 19.496 otorga a los consumidores.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a estos términos',
    body: (
      <p>
        Si modificamos estos términos publicaremos la nueva versión con su fecha. Si el cambio es importante, se lo
        avisaremos a los restaurantes registrados con anticipación y les pediremos aceptarlo nuevamente.
      </p>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable y contacto',
    body: (
      <p>
        Estos términos se rigen por las leyes de la República de Chile. Consultas y reclamos: {PLATFORM.email},{' '}
        {PLATFORM.address}.
      </p>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      intro={<p>Estas son las reglas para usar {PLATFORM.name}, tanto si haces un pedido como si tienes un restaurante.</p>}
      sections={sections}
    />
  )
}
