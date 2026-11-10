import type { CSSProperties } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import {
  axisTicks,
  axisTitle,
  chartMargins,
  formatNumber,
  normalizeChart,
  snapChartSize,
  type ChartAlign,
} from '../lib/chartModel'
import { contentWidth } from '../lib/insertPosition'
import { useResize } from './useResize'
import { useMove } from './useMove'
import { ChartSeriesLayer } from './ChartSeriesLayer'

const INK = '#1d2330'

/** Senkrechte und waagerechte Rasterlinien im Abstand `step`, ausgehend von der linken unteren Ecke. */
function gridPath(x0: number, top: number, w: number, h: number, step: number) {
  if (step <= 0) return ''
  const y0 = top + h
  let d = ''
  for (let x = step; x < w - 0.5; x += step) d += `M${x0 + x} ${top}V${y0}`
  for (let y = step; y < h - 0.5; y += step) d += `M${x0} ${y0 - y}H${x0 + w}`
  return d
}

/** Schnittpunkte des Rasters (für das Punktraster). */
function gridPoints(x0: number, top: number, w: number, h: number, step: number) {
  const y0 = top + h
  const pts: [number, number][] = []
  if (step <= 0) return pts
  for (let x = 0; x <= w + 0.5; x += step) for (let y = 0; y <= h + 0.5; y += step) pts.push([x0 + x, y0 - y])
  return pts
}

/** Linker/rechter Rand: über auto-Ränder, damit es im Editor und im Druck gleich sitzt. */
function alignStyle(align: ChartAlign | null, offsetX: number): CSSProperties {
  if (align === 'center') return { marginLeft: 'auto', marginRight: 'auto' }
  if (align === 'right') return { marginLeft: 'auto', marginRight: 0 }
  if (align === 'left') return { marginLeft: 0 }
  return { marginLeft: offsetX }
}

export function ChartView({ node, updateAttributes, selected, editor, getPos }: ReactNodeViewProps) {
  const a = normalizeChart(node.attrs)
  // Ausgerichtete Diagramme dürfen die ganze Breite nutzen; frei verschobene nur bis zum rechten Rand
  const maxWidth = contentWidth(editor.view.dom) - (a.align ? 0 : a.offsetX)
  const { size, resizing, handleProps } = useResize(a.width, a.height, maxWidth, (s) => {
    const snapped = snapChartSize(a, s.width, s.height, maxWidth)
    updateAttributes({ width: snapped.width, height: snapped.height })
  })
  const { moving, moveStyle, moveProps } = useMove(editor, getPos, a.width)

  // Auf ganze Abschnitte einrasten: das Raster endet oben und rechts an einer dicken Linie
  const { plotW, plotH, majorPx, width: w, height: h } = snapChartSize(a, size.width, size.height, maxWidth)
  const m = chartMargins(a)
  const cell = Math.max(4, a.cellSize)
  const x0 = m.left
  const y0 = h - m.bottom
  const xEnd = x0 + plotW
  const top = y0 - plotH

  const xt = axisTicks(a.axes.x, plotW, majorPx)
  const yt = axisTicks(a.axes.y, plotH, majorPx)
  const y2t = axisTicks(a.axes.y2, plotH, majorPx)

  return (
    <NodeViewWrapper
      className={`chart-node${selected ? ' selected' : ''}${resizing ? ' resizing' : ''}${moving ? ' moving' : ''}`}
      style={{ width: w, height: h, ...alignStyle(a.align, a.offsetX), ...moveStyle }}
      contentEditable={false}
      draggable={false}
      {...moveProps}
    >
      <svg width={w} height={h} className="chart-svg">
        {/* Raster als echte Linien statt SVG-Muster: Muster werden beim Drucken und in vielen
            PDF-Programmen gerastert oder weggelassen, dann fehlen die Kästchen. */}
        {a.background === 'grid' && (
          <path className="chart-grid-minor" d={gridPath(x0, top, plotW, plotH, cell)} fill="none" stroke="#c9d3e3" strokeWidth="1" />
        )}
        {a.background === 'dots' && (
          <g className="chart-grid-dots" fill="#9aa8bf">
            {gridPoints(x0, top, plotW, plotH, cell).map(([cx, cy]) => (
              <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="1.3" />
            ))}
          </g>
        )}
        {a.showMajorLines && a.background !== 'blank' && (
          <path className="chart-grid-major" d={gridPath(x0, top, plotW, plotH, majorPx)} fill="none" stroke="#8d9bb3" strokeWidth="1.6" />
        )}

        {/* Achsen und Rahmen: das Diagramm ist ringsum geschlossen */}
        <rect x={x0} y={top} width={plotW} height={plotH} fill="none" stroke={INK} strokeWidth="1.5" />

        {/* Abschnitte mit Zahlen */}
        <g className="tick-label">
          {xt.ticks.map((t) => (
            <g key={`x${t.px}`}>
              <line x1={x0 + t.px} y1={y0} x2={x0 + t.px} y2={y0 + 5} stroke={INK} />
              <text x={x0 + t.px} y={y0 + 17} textAnchor="middle">{formatNumber(t.value)}</text>
            </g>
          ))}
          {yt.ticks.map((t) => (
            <g key={`y${t.px}`}>
              <line x1={x0 - 5} y1={y0 - t.px} x2={x0} y2={y0 - t.px} stroke={INK} />
              <text x={x0 - 8} y={y0 - t.px + 4} textAnchor="end">{formatNumber(t.value)}</text>
            </g>
          ))}
          {a.axisCount === 3 &&
            y2t.ticks.map((t) => (
              <g key={`y2${t.px}`}>
                <line x1={xEnd} y1={y0 - t.px} x2={xEnd + 5} y2={y0 - t.px} stroke={INK} />
                <text x={xEnd + 8} y={y0 - t.px + 4} textAnchor="start">{formatNumber(t.value)}</text>
              </g>
            ))}
        </g>

        {/* Achsentitel */}
        <text x={xEnd} y={h - 6} textAnchor="end" className="axis-label">{axisTitle(a.axes.x)}</text>
        <text x={x0 + 8} y={top - 14} textAnchor="start" className="axis-label">{axisTitle(a.axes.y)}</text>
        {a.axisCount === 3 && (
          <text x={xEnd - 8} y={top - 14} textAnchor="end" className="axis-label">{axisTitle(a.axes.y2)}</text>
        )}

        {/* Messwerte */}
        <ChartSeriesLayer attrs={{ ...a, series: node.attrs.series, legend: node.attrs.legend }} x0={x0} y0={y0} plotW={plotW} plotH={plotH} majorPx={majorPx} />
      </svg>
      <div className="resize-handle" title="Ziehen zum Vergrößern" {...handleProps} />
      {resizing && <div className="size-badge">{Math.round(w)} × {Math.round(h)} px</div>}
    </NodeViewWrapper>
  )
}
