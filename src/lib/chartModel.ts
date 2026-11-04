/** Datenmodell eines Diagrammfeldes und die Berechnung der Achsen-Abschnitte. */

export type ChartBackground = 'grid' | 'dots' | 'blank'
export type AxisKey = 'x' | 'y' | 'y2'

export interface AxisSettings {
  label: string
  unit: string
  /** Wert am Ursprung */
  start: number
  /** Abschnitte automatisch so wählen, dass die Achse bis `max` reicht */
  auto: boolean
  /** Gewünschter Endwert (nur bei auto) */
  max: number
  /** Wert pro Abschnitt (nur ohne auto) */
  step: number
}

export interface ChartAttrs {
  width: number
  height: number
  offsetX: number
  background: ChartBackground
  /** Kantenlänge eines Kästchens in Pixeln */
  cellSize: number
  /** Alle N Kästchen eine dicke Linie und eine Beschriftung */
  majorEvery: number
  showMajorLines: boolean
  /** 2 = x und y, 3 = zusätzlich zweite y-Achse rechts */
  axisCount: 2 | 3
  axes: Record<AxisKey, AxisSettings>
}

export const defaultAxis = (label: string): AxisSettings => ({
  label,
  unit: '',
  start: 0,
  auto: false,
  max: 100,
  step: 10,
})

export const DEFAULT_CHART: Omit<ChartAttrs, 'width' | 'height' | 'offsetX'> = {
  background: 'grid',
  cellSize: 20,
  majorEvery: 5,
  showMajorLines: true,
  axisCount: 2,
  axes: { x: defaultAxis('x'), y: defaultAxis('y'), y2: defaultAxis('y₂') },
}

/** Ränder um den Zeichenbereich, damit Zahlen und Titel Platz haben. */
export function chartMargins(a: ChartAttrs) {
  return { left: 52, bottom: 44, top: 28, right: a.axisCount === 3 ? 52 : 20 }
}

/** Schöne Schrittweite (1, 2, 2,5, 5 × 10^k), die mindestens `raw` groß ist. */
export function niceStep(raw: number) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const exp = Math.floor(Math.log10(raw))
  const base = 10 ** exp
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * base >= raw - 1e-12) return m * base
  }
  return 10 * base
}

/** Wert pro Abschnitt für eine Achse mit `sections` Abschnitten. */
export function axisStep(axis: AxisSettings, sections: number) {
  if (!axis.auto) return axis.step > 0 ? axis.step : 1
  const range = axis.max - axis.start
  return niceStep(Math.abs(range) / Math.max(1, sections)) * (range < 0 ? -1 : 1)
}

/** Liste der Abschnitte (Position in Pixeln ab Ursprung und Wert). */
export function axisTicks(axis: AxisSettings, lengthPx: number, majorPx: number) {
  const sections = Math.floor(lengthPx / majorPx + 1e-9)
  const step = axisStep(axis, sections)
  const ticks: { px: number; value: number }[] = []
  for (let k = 0; k <= sections; k++) ticks.push({ px: k * majorPx, value: round(axis.start + k * step) })
  return { step, ticks }
}

function round(v: number) {
  return Math.round(v * 1e9) / 1e9
}

export function formatNumber(v: number) {
  return v.toLocaleString('de-DE', { maximumFractionDigits: 6 })
}

export function axisTitle(axis: AxisSettings) {
  return axis.unit ? `${axis.label} [${axis.unit}]` : axis.label
}

/** Ergänzt fehlende Felder (z. B. bei Dateien aus älteren Versionen). */
export function normalizeChart(raw: Record<string, unknown>): ChartAttrs {
  const r = raw as Partial<ChartAttrs> & Record<string, unknown>
  const axes = (r.axes ?? {}) as Partial<Record<AxisKey, Partial<AxisSettings>>>
  const legacy = (key: string) => (typeof r[key] === 'string' ? (r[key] as string) : undefined)
  return {
    width: Number(r.width) || 300,
    height: Number(r.height) || 300,
    offsetX: Number(r.offsetX) || 0,
    background: r.background ?? DEFAULT_CHART.background,
    cellSize: Number(r.cellSize) || DEFAULT_CHART.cellSize,
    majorEvery: Number(r.majorEvery) || DEFAULT_CHART.majorEvery,
    showMajorLines: r.showMajorLines ?? DEFAULT_CHART.showMajorLines,
    axisCount: r.axisCount === 3 ? 3 : 2,
    axes: {
      x: { ...DEFAULT_CHART.axes.x, label: legacy('xLabel') ?? 'x', unit: legacy('xUnit') ?? '', ...axes.x },
      y: { ...DEFAULT_CHART.axes.y, label: legacy('yLabel') ?? 'y', unit: legacy('yUnit') ?? '', ...axes.y },
      y2: { ...DEFAULT_CHART.axes.y2, ...axes.y2 },
    },
  }
}

/**
 * Rastet die Größe des Zeichenbereichs auf ganze Abschnitte ein, damit das
 * Diagramm oben und rechts immer an einer dicken Linie endet. Die Kästchen
 * bleiben dabei quadratisch (nichts wird gestaucht oder gestreckt), nur das
 * Feld wird um höchstens einen halben Abschnitt größer oder kleiner.
 */
export function snapChartSize(a: ChartAttrs, width: number, height: number, maxWidth = Infinity) {
  const m = chartMargins(a)
  const majorPx = Math.max(4, a.cellSize) * Math.max(1, a.majorEvery)
  const fit = (avail: number, limit: number) => {
    let n = Math.max(1, Math.round(avail / majorPx))
    if (n * majorPx > limit) n = Math.max(1, Math.floor(limit / majorPx))
    return n * majorPx
  }
  const plotW = fit(width - m.left - m.right, maxWidth - m.left - m.right)
  const plotH = fit(height - m.top - m.bottom, Infinity)
  return { plotW, plotH, majorPx, width: plotW + m.left + m.right, height: plotH + m.top + m.bottom }
}
