import { useId } from 'react'
import type { ChartAttrs } from '../lib/chartModel'
import {
  axisScale,
  formatSig,
  linearFit,
  normalizeLegend,
  normalizeSeries,
  type ChartSeries,
  type SeriesMarker,
} from '../lib/chartData'

interface Props {
  attrs: ChartAttrs & { series?: unknown; legend?: unknown }
  /** linke untere Ecke des Zeichenbereichs */
  x0: number
  y0: number
  plotW: number
  plotH: number
  majorPx: number
}

function Marker({ kind, x, y, color }: { kind: SeriesMarker; x: number; y: number; color: string }) {
  const r = 3.5
  if (kind === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={color} />
  if (kind === 'triangle') return <path d={`M${x} ${y - r * 1.2}L${x + r * 1.1} ${y + r * 0.8}L${x - r * 1.1} ${y + r * 0.8}Z`} fill={color} />
  if (kind === 'cross') return <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x - r} ${y + r}L${x + r} ${y - r}`} stroke={color} strokeWidth="1.6" />
  return <circle cx={x} cy={y} r={r} fill={color} />
}

/** Messpunkte, Verbindungslinien, Ausgleichsgeraden und Legende eines Diagramms. */
export function ChartSeriesLayer({ attrs, x0, y0, plotW, plotH, majorPx }: Props) {
  const clipId = `clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const series = normalizeSeries(attrs.series).filter((s) => s.points.length)
  if (!series.length) return null

  const sx = axisScale(attrs.axes.x, plotW, majorPx)
  const sy = axisScale(attrs.axes.y, plotH, majorPx)
  const sy2 = axisScale(attrs.axes.y2, plotH, majorPx)
  const px = (v: number) => x0 + sx(v)
  const py = (s: ChartSeries, v: number) => y0 - (s.axis === 'y2' && attrs.axisCount === 3 ? sy2 : sy)(v)
  const top = y0 - plotH
  // Wert am linken und rechten Rand (für die Ausgleichsgerade über die ganze Breite)
  const xAt = (pxFromOrigin: number) => {
    const a = sx(0)
    const b = sx(1)
    return (pxFromOrigin - a) / (b - a || 1)
  }

  const fits = series.map((s) => (s.fit ? linearFit(s.points) : null))
  const legend = normalizeLegend(attrs.legend)

  return (
    <g className="chart-series">
      <defs>
        <clipPath id={clipId}>
          {/* etwas Luft, damit Punkte auf dem Rand ganz zu sehen sind */}
          <rect x={x0 - 5} y={top - 5} width={plotW + 10} height={plotH + 10} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {series.map((s, i) => {
          const fit = fits[i]
          const line = s.style !== 'points'
          const marks = s.style !== 'line'
          const sorted = [...s.points].sort((a, b) => a[0] - b[0])
          return (
            <g key={s.id}>
              {fit && (
                <line
                  x1={x0}
                  y1={py(s, fit.m * xAt(0) + fit.b)}
                  x2={x0 + plotW}
                  y2={py(s, fit.m * xAt(plotW) + fit.b)}
                  stroke={s.color}
                  strokeWidth="1.2"
                  strokeDasharray="6 4"
                />
              )}
              {line && (
                <polyline points={sorted.map(([x, y]) => `${px(x)},${py(s, y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="1.5" />
              )}
              {marks && s.points.map(([x, y], k) => <Marker key={k} kind={s.marker} x={px(x)} y={py(s, y)} color={s.color} />)}
            </g>
          )
        })}
      </g>
      {legend !== 'none' && <Legend series={series} fits={fits} x0={x0} y0={y0} plotW={plotW} plotH={plotH} position={legend} />}
    </g>
  )
}

function Legend({
  series,
  fits,
  x0,
  y0,
  plotW,
  plotH,
  position,
}: {
  series: ChartSeries[]
  fits: (ReturnType<typeof linearFit> | null)[]
  x0: number
  y0: number
  plotW: number
  plotH: number
  position: string
}) {
  const rows: { s: ChartSeries; text: string; fitLine: boolean }[] = []
  series.forEach((s, i) => {
    rows.push({ s, text: s.name || `Messreihe ${i + 1}`, fitLine: false })
    const f = fits[i]
    if (f) {
      const sign = f.b < 0 ? '−' : '+'
      rows.push({ s, text: `y = ${formatSig(f.m)}·x ${sign} ${formatSig(Math.abs(f.b))}  (R² = ${formatSig(f.r2, 4)})`, fitLine: true })
    }
  })
  const lineH = 15
  // Breite grob aus der Textlänge schätzen (11 px Schrift)
  const w = Math.min(plotW - 8, 30 + Math.max(...rows.map((r) => r.text.length)) * 6.1)
  const h = rows.length * lineH + 8
  const left = position.endsWith('Left') ? x0 + 6 : x0 + plotW - w - 6
  const top = position.startsWith('top') ? y0 - plotH + 6 : y0 - h - 6
  return (
    <g className="chart-legend" fontSize="11">
      <rect x={left} y={top} width={w} height={h} fill="#fff" stroke="#8d9bb3" strokeWidth="0.8" />
      {rows.map((r, k) => {
        const cy = top + 4 + lineH * k + lineH / 2
        return (
          <g key={k}>
            {r.fitLine ? (
              <line x1={left + 6} y1={cy} x2={left + 22} y2={cy} stroke={r.s.color} strokeWidth="1.2" strokeDasharray="4 3" />
            ) : (
              <>
                {r.s.style !== 'points' && <line x1={left + 6} y1={cy} x2={left + 22} y2={cy} stroke={r.s.color} strokeWidth="1.5" />}
                {r.s.style !== 'line' && <Marker kind={r.s.marker} x={left + 14} y={cy} color={r.s.color} />}
              </>
            )}
            <text x={left + 28} y={cy + 4} fill="#1d2330">{r.text}</text>
          </g>
        )
      })}
    </g>
  )
}
