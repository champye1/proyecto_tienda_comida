/**
 * Hora actual que se actualiza sola cada `intervalMs` (por defecto 30 s).
 * Sirve para textos relativos como "hace 3 min" sin recalcular en cada render.
 */
import { useEffect, useState } from 'react'

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
