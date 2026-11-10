/** Messreihen in Diagrammen: Datenmodell, Verknüpfung mit Tabellen und Hilfsrechnungen. */
import type { Node as PMNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'
import { axisStep, niceStep, snapChartSize, type AxisSettings, type ChartAttrs } from './chartModel'
import { parseNumber } from './formula'
import { splitUnit } from './tableModel'

export type SeriesStyle = 'points' | 'line' | 'both'
export type SeriesMarker = 'circle' | 'square' | 'triangle' | 'cross'
export type LegendPosition = 'none' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

/** Verknüpfung mit einer Tabelle im Dokument: die Werte werden automatisch übernommen. */
export interface SeriesSource {
  /** uid-Attribut der Tabelle */
  table: string
  /** Spalten (0-basiert) für x und y */
  x: number
  y: number
}

export interface ChartSeries {
  id: string
  name: string
  color: string
  /** an welcher y-Achse die Werte abgetragen werden */
  axis: 'y' | 'y2'
  style: SeriesStyle
  marker: SeriesMarker
  /** Ausgleichsgerade (lineare Regression) einzeichnen */
  fit: boolean
  /** null = Werte von Hand eingetragen */
  source: SeriesSource | null
  /** Messpunkte [x, y]. Bei verknüpften Reihen eine Kopie aus der Tabelle. */
  points: [number, number][]
}

/** Gut unterscheidbare, druckfreundliche Farben (beginnt mit Schwarz). */
export const SERIES_COLORS = ['#1d2330', '#1f4e79', '#9b1c1f', '#2e6b30', '#b8641a', '#5b2a6e']

export const newId = () => Math.random().toString(36).slice(2, 10)

export function normalizeSeries(raw: unknown): ChartSeries[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s, i) => {
      const r = s as Partial<ChartSeries>
      const src = r.source as Partial<SeriesSource> | null | undefined
      return {
        id: typeof r.id === 'string' && r.id ? r.id : `s${i}`,
        name: typeof r.name === 'string' ? r.name : `Messreihe ${i + 1}`,
        color: typeof r.color === 'string' && r.color ? r.color : SERIES_COLORS[i % SERIES_COLORS.length],
        axis: r.axis === 'y2' ? 'y2' : 'y',
        style: r.style === 'line' || r.style === 'both' ? r.style : 'points',
        marker: (['circle', 'square', 'triangle', 'cross'] as const).includes(r.marker as SeriesMarker) ? (r.marker as SeriesMarker) : 'circle',
        fit: r.fit === true,
        source:
          src && typeof src.table === 'string' && Number.isInteger(src.x) && Number.isInteger(src.y)
            ? { table: src.table, x: src.x as number, y: src.y as number }
            : null,
        points: Array.isArray(r.points)
          ? r.points.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]] as [number, number])
          : [],
      }
    })
}

export function normalizeLegend(v: unknown): LegendPosition {
  return v === 'topLeft' || v === 'topRight' || v === 'bottomLeft' || v === 'bottomRight' ? v : 'none'
}

/* ---------- Tabellen ---------- */

/** Texte aller Zellen einer Tabelle als Raster (verbundene Zellen wiederholt). */
export function tableGrid(table: PMNode): string[][] {
  const map = TableMap.get(table)
  const grid: string[][] = []
  for (let r = 0; r < map.height; r++) {
    const row: string[] = []
    for (let c = 0; c < map.width; c++) row.push(table.nodeAt(map.map[r * map.width + c])?.textContent ?? '')
    grid.push(row)
  }
  return grid
}

/** Messpunkte aus zwei Spalten: nur Zeilen, in denen beide Zellen eine Zahl enthalten. */
export function pointsFromGrid(grid: string[][], x: number, y: number): [number, number][] {
  const pts: [number, number][] = []
  for (const row of grid) {
    const vx = parseNumber(row[x] ?? '')
    const vy = parseNumber(row[y] ?? '')
    if (vx !== null && vy !== null) pts.push([vx, vy])
  }
  return pts
}

export interface DocTable {
  pos: number
  node: PMNode
  uid: string | null
  /** Anzeigename für die Auswahlliste */
  label: string
  /** Spaltenköpfe (Text der ersten Zeile) */
  headers: string[]
}

/** Alle Tabellen im Dokument (der Reihe nach). */
export function documentTables(doc: PMNode): DocTable[] {
  const list: DocTable[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true
    const grid = tableGrid(node)
    const headers = grid[0] ?? []
    const caption = String(node.attrs.caption ?? '').trim()
    const n = list.length + 1
    const label = caption ? caption.replace(/\s+/g, ' ').slice(0, 60) : `Tabelle ${n} (${headers.filter(Boolean).slice(0, 2).join(', ') || 'ohne Kopfzeile'})`
    list.push({ pos, node, uid: (node.attrs.uid as string | null) ?? null, label, headers })
    return false
  })
  return list
}

/** Spalte, deren Kopf am besten zur Achse passt (Beschriftung oder Einheit). */
export function guessColumn(headers: string[], axis: AxisSettings, fallback: number, avoid = -1): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const label = norm(axis.label)
  const unit = norm(axis.unit)
  const parts = headers.map((h) => {
    const p = splitUnit(h)
    return { label: norm(p.label), unit: norm(p.unit) }
  })
  const pick = (test: (p: { label: string; unit: string }) => boolean) => parts.findIndex((p, i) => i !== avoid && test(p))
  let i = -1
  if (label && label.length > 1) i = pick((p) => p.label === label)
  if (i < 0 && label && label.length > 1) i = pick((p) => p.label.includes(label) || (p.label.length > 2 && label.includes(p.label)))
  if (i < 0 && unit) i = pick((p) => p.unit === unit)
  if (i < 0) i = Math.min(fallback, Math.max(0, headers.length - 1))
  return i
}

/* ---------- Rechnen ---------- */

/** Ausgleichsgerade y = m·x + b mit Bestimmtheitsmaß R². */
export function linearFit(points: [number, number][]) {
  const n = points.length
  if (n < 2) return null
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0
  for (const [x, y] of points) {
    sx += x
    sy += y
    sxx += x * x
    sxy += x * y
    syy += y * y
  }
  const den = n * sxx - sx * sx
  if (Math.abs(den) < 1e-300) return null
  const m = (n * sxy - sx * sy) / den
  const b = (sy - m * sx) / n
  const ssTot = syy - (sy * sy) / n
  const ssRes = points.reduce((acc, [x, y]) => acc + (y - (m * x + b)) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
  return { m, b, r2 }
}

/** Zahl mit wenigen gültigen Stellen für die Legende (z. B. die Geradengleichung). */
export function formatSig(v: number, digits = 4) {
  if (!Number.isFinite(v)) return '–'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e6 || abs < 1e-4) {
    const [mant, exp] = v.toExponential(digits - 1).split('e')
    return `${Number(mant).toLocaleString('de-DE')}·10^${Number(exp)}`
  }
  return Number(v.toPrecision(digits)).toLocaleString('de-DE', { maximumFractionDigits: 10 })
}

/** Umrechnung Messwert → Pixel ab dem Ursprung entlang einer Achse. */
export function axisScale(axis: AxisSettings, lengthPx: number, majorPx: number) {
  const sections = Math.floor(lengthPx / majorPx + 1e-9)
  const step = axisStep(axis, sections) || 1
  return (v: number) => ((v - axis.start) / step) * majorPx
}

/**
 * Wählt Startwert und Endwert einer Achse so, dass alle Werte draufpassen und die
 * Abschnitte runde Zahlen bekommen. Startet bei 0, wenn die Werte nicht weit davon weg sind.
 */
export function fitAxis(axis: AxisSettings, values: number[], sections: number): AxisSettings {
  if (!values.length) return axis
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    min -= pad
    max += pad
  }
  // Nahe an 0 (oder über 0 und Bereich groß gegenüber dem Abstand): bei 0 beginnen
  if (min > 0 && min < (max - min) * 0.5) min = 0
  if (max < 0 && -max < (max - min) * 0.5) max = 0
  sections = Math.max(1, sections)
  let start = min
  for (let k = 0; k < 4; k++) {
    const step = niceStep((max - start) / sections)
    const s = Math.floor(min / step + 1e-9) * step
    if (s === start) break
    start = s
  }
  const round = (v: number) => Math.round(v * 1e9) / 1e9
  return { ...axis, auto: true, start: round(start), max: round(max) }
}

/** Achsen eines Diagramms an alle Messwerte anpassen. */
export function fitAxesToData(a: ChartAttrs, series: ChartSeries[]): ChartAttrs['axes'] {
  const snapped = snapChartSize(a, a.width, a.height)
  const xs = series.flatMap((s) => s.points.map((p) => p[0]))
  const ys = series.filter((s) => s.axis === 'y' || a.axisCount < 3).flatMap((s) => s.points.map((p) => p[1]))
  const y2s = series.filter((s) => s.axis === 'y2' && a.axisCount === 3).flatMap((s) => s.points.map((p) => p[1]))
  const sx = Math.floor(snapped.plotW / snapped.majorPx + 1e-9)
  const sy = Math.floor(snapped.plotH / snapped.majorPx + 1e-9)
  return {
    x: fitAxis(a.axes.x, xs, sx),
    y: fitAxis(a.axes.y, ys, sy),
    y2: fitAxis(a.axes.y2, y2s, sy),
  }
}

/** Werte von Hand: eine Zeile pro Messpunkt, „x; y“, „x y“ oder aus Excel kopiert (Tab). */
export function parsePointsText(text: string): [number, number][] {
  const pts: [number, number][] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    // Trennzeichen: Tab, Semikolon, Leerzeichen; Komma nur, wenn sonst keins da ist und es kein Dezimalkomma sein kann
    let parts = t.split(/\t|;|\s+/).filter(Boolean)
    if (parts.length < 2 && /^\S+,\s*\S+$/.test(t) && (t.match(/,/g) ?? []).length === 1 && /,\s/.test(t)) parts = t.split(/,\s*/)
    if (parts.length < 2) continue
    const x = parseNumber(parts[0])
    const y = parseNumber(parts[1])
    if (x !== null && y !== null) pts.push([x, y])
  }
  return pts
}

export function pointsToText(points: [number, number][]) {
  const f = (v: number) => String(v).replace('.', ',')
  return points.map(([x, y]) => `${f(x)}; ${f(y)}`).join('\n')
}
