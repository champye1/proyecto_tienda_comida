/**
 * Propina opcional del checkout (solo si el local la acepta): 0, 5, 10 o 15 % del subtotal.
 * El monto se calcula con tipAmount (pricing.ts) y el servidor rechaza propinas si el local
 * no las acepta (trigger a_orders_tip_allowed).
 */
import { Card } from './parts'

/** Porcentajes ofrecidos. */
const TIP_OPTIONS = [0, 5, 10, 15]

/** Botones de propina (0, 5, 10, 15 %). */
export function TipPicker({ percent, onChange }: { percent: number; onChange: (percent: number) => void }) {
  return (
    <Card title="¿Dejas propina? (opcional)">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Propina">
        {TIP_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={percent === p}
            onClick={() => onChange(p)}
            className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${
              percent === p ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
            }`}
          >
            {p === 0 ? 'Sin propina' : `${p}%`}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">La propina va completa para el equipo del local.</p>
    </Card>
  )
}
