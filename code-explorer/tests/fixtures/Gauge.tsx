// A sample component for the highlighter tests: a gauge that fills as a reading arrives.
import type { ReactNode } from "react"

interface Reading {
  label: string
  value: number
  max?: number
}

interface GaugeProps<T> {
  part: { id: string; data: T }
  footer?: ReactNode
}

const isReading = (data: unknown): data is Reading =>
  typeof data === "object" && data !== null && "value" in data

export function Gauge({ part }: GaugeProps<Reading>) {
  if (!isReading(part.data)) return null
  const { label, value, max = 100 } = part.data
  const share = Math.min(1, value / max)
  return (
    <figure className="gauge" aria-label={label}>
      <div className="gauge-fill" style={{ width: `${share * 100}%` }} />
      <figcaption>{label}: {value}</figcaption>
    </figure>
  )
}
