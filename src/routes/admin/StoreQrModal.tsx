/**
 * Código QR de la tienda (desde el inicio del panel).
 *
 * - Muestra el QR con el link de la tienda para escanearlo con el celular.
 * - Descargas: PNG (WhatsApp, Instagram, flyers) y SVG (imprenta, se agranda sin perder calidad).
 * - "Imprimir cartel": hoja con el logo, el nombre, el QR grande y "Escanea para pedir",
 *   lista para pegar en mesas, la caja o la vitrina.
 * El QR apunta al link normal de la tienda (/r/:slug): si se cambia el menú, el QR sigue sirviendo.
 */
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { usePrint } from '@/components/Print'
import { downloadQrPng, downloadQrSvg, QrCode } from '@/components/QrCode'
import type { MyRestaurant } from '@/features/restaurants/api'

type StoreQrModalProps = { open: boolean; onClose: () => void; restaurant: MyRestaurant; storeUrl: string }

/** Ventana con el QR de la tienda: descargas PNG/SVG y cartel para imprimir. */
export function StoreQrModal({ open, onClose, restaurant, storeUrl }: StoreQrModalProps) {
  const { print, portal } = usePrint()
  const file = `qr-${restaurant.slug}`

  return (
    <Modal open={open} onClose={onClose} title="Código QR de tu tienda" size="md">
      <div className="flex flex-col items-center gap-4 text-center">
        <QrCode value={storeUrl} size={220} title={`Código QR de ${storeUrl}`} />
        <p className="break-all text-sm text-zinc-600">{storeUrl}</p>
        <p className="text-sm text-zinc-500">
          Imprímelo para tus mesas, la caja o la vitrina: tus clientes lo escanean con la cámara y llegan directo a tu menú.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {/* Falso positivo del linter: es un elemento JSX pasado a print(), no un componente nuevo. */}
          {/* oxlint-disable-next-line react/no-unstable-nested-components */}
          <Button onClick={() => print(<QrPoster restaurant={restaurant} storeUrl={storeUrl} />)}>Imprimir cartel</Button>
          <Button variant="secondary" onClick={() => downloadQrPng(storeUrl, `${file}.png`)}>
            Descargar PNG
          </Button>
          <Button variant="secondary" onClick={() => downloadQrSvg(storeUrl, `${file}.svg`)}>
            Descargar SVG
          </Button>
        </div>
      </div>
      {portal}
    </Modal>
  )
}

/** Cartel tamaño carta/A4 con el QR grande. Solo se ve al imprimir. */
function QrPoster({ restaurant, storeUrl }: { restaurant: MyRestaurant; storeUrl: string }) {
  return (
    <div className="mx-auto flex max-w-[170mm] flex-col items-center gap-6 pt-10 text-center text-black">
      {restaurant.logo_url && <img src={restaurant.logo_url} alt="" className="size-28 rounded-2xl object-cover" />}
      <h1 className="text-5xl font-black">{restaurant.name}</h1>
      <p className="text-3xl font-semibold">Escanea y haz tu pedido</p>
      <QrCode value={storeUrl} size={420} title={`Código QR de ${storeUrl}`} />
      <p className="text-xl">{storeUrl.replace(/^https?:\/\//, '')}</p>
      <p className="text-lg text-zinc-600">Abre la cámara de tu celular y apunta al código</p>
    </div>
  )
}
