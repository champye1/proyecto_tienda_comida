/**
 * Pago por transferencia en la tienda (etapa E).
 *
 *   TransferDetails  datos bancarios del local, con botón para copiarlos todos juntos
 *                    (listos para pegar en la app del banco).
 *   PaymentBox       en el seguimiento: datos + estado del pago. El cliente puede avisar
 *                    "Ya transferí" y/o subir la foto del comprobante. La foto se re-codifica
 *                    en el navegador (sin metadatos) antes de enviarla a la Edge Function
 *                    upload-receipt, que la guarda en un bucket privado.
 */
import { useRef, useState, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TransferInfo } from '@/features/store/menu'
import type { TrackedOrder } from '@/features/store/orders'
import { dbErrorMessage } from '@/lib/errors'
import { formatCLP } from '@/lib/format'
import { processImage, validateImageFile } from '@/lib/imageProcessing'
import { publicRpc, publicUpload } from '@/lib/publicApi'

/** Texto plano con los datos (para copiar y pegar en el banco). */
function transferText(info: TransferInfo, amount?: number): string {
  return [
    info.holder,
    info.rut && `RUT: ${info.rut}`,
    info.bank,
    info.account_type,
    `N.º de cuenta: ${info.account_number}`,
    info.email && `Email: ${info.email}`,
    amount !== undefined && `Monto: ${formatCLP(amount)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Datos bancarios del local con botón para copiarlos (checkout y seguimiento). */
export function TransferDetails({ info, amount }: { info: TransferInfo; amount?: number }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(transferText(info, amount))
      setCopied(true)
    } catch {
      /* los datos quedan visibles para copiarlos a mano */
    }
  }
  return (
    <div className="space-y-2 rounded-xl bg-zinc-50 p-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-zinc-500">Titular</dt>
        <dd className="font-medium text-zinc-900">{info.holder}</dd>
        {info.rut && (
          <>
            <dt className="text-zinc-500">RUT</dt>
            <dd className="font-medium text-zinc-900">{info.rut}</dd>
          </>
        )}
        <dt className="text-zinc-500">Banco</dt>
        <dd className="font-medium text-zinc-900">
          {info.bank}
          {info.account_type && ` · ${info.account_type}`}
        </dd>
        <dt className="text-zinc-500">Cuenta</dt>
        <dd className="font-mono font-medium text-zinc-900">{info.account_number}</dd>
        {info.email && (
          <>
            <dt className="text-zinc-500">Email</dt>
            <dd className="break-all font-medium text-zinc-900">{info.email}</dd>
          </>
        )}
        {amount !== undefined && (
          <>
            <dt className="text-zinc-500">Monto</dt>
            <dd className="font-semibold text-zinc-900">{formatCLP(amount)}</dd>
          </>
        )}
      </dl>
      <button type="button" onClick={copy} className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 font-semibold hover:bg-zinc-100">
        {copied ? 'Datos copiados ✓' : 'Copiar datos'}
      </button>
    </div>
  )
}

/** Sección de pago por transferencia del seguimiento: estado, "Ya transferí" y comprobante. */
export function PaymentBox({ order, token }: { order: TrackedOrder; token: string }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'report' | 'upload' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['store', 'order', token] })
  const info = order.restaurant.transfer
  const canReport = order.status !== 'cancelled' && order.payment_status !== 'verified'

  async function report() {
    setBusy('report')
    setError(null)
    try {
      await publicRpc('report_payment_public', { p_token: token })
      await refresh()
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) return setError('El comprobante debe ser una foto o captura (JPG, PNG o WebP).')
    setBusy('upload')
    setError(null)
    try {
      // Re-codificada en el navegador: WebP liviano, sin metadatos (ubicación, etc.).
      const blob = await processImage(file, 1600)
      await publicUpload('upload-receipt', blob, { 'x-order-token': token })
      await refresh()
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : dbErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5" aria-labelledby="payment-title">
      <h2 id="payment-title" className="font-semibold text-zinc-900">
        Pago por transferencia
      </h2>
      {order.payment_status === 'verified' ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">✓ El local confirmó tu pago.</p>
      ) : order.payment_status === 'reported' ? (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Avisaste que transferiste{order.has_receipt ? ' y enviaste el comprobante' : ''}. El local lo confirmará pronto.
        </p>
      ) : (
        <p className="text-sm text-zinc-600">Transfiere el total y avísanos aquí. Puedes adjuntar una foto del comprobante.</p>
      )}
      {info && order.payment_status !== 'verified' && <TransferDetails info={info} amount={order.total} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {canReport && (
        <div className="flex flex-wrap gap-2">
          {order.payment_status === 'unpaid' && (
            <button type="button" onClick={report} disabled={busy !== null} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-contrast disabled:opacity-50">
              {busy === 'report' ? 'Enviando…' : 'Ya transferí'}
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPick} aria-label="Elegir foto del comprobante" />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy === 'upload' ? 'Subiendo…' : order.has_receipt ? 'Cambiar comprobante' : 'Subir comprobante'}
          </button>
        </div>
      )}
    </section>
  )
}
