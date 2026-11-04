import { useId } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import {
  axisTicks,
  axisTitle,
  chartMargins,
  formatNumber,
  normalizeChart,
  snapChartSize,
} from '../lib/chartModel'
import { contentWidth } from '../lib/insertPosition'
import { useResize } from './useResize'
import { useMove } from './useMove'

const INK = '#1d2330'

export function ChartView({ node, updateAttributes, selected, editor, getPos }: ReactNodeViewProps) {
  const a = normalizeChart(node.attrs)
  const maxWidth = contentWidth(editor.view.dom) - a.offsetX
  const { size, resizing, handleProps } = useResize(a.width, a.height, maxWidth, (s) => {
    const snapped = snapChartSize(a, s.width, s.height, maxWidth)
    updateAttributes({ width: snapped.width, height: snapped.height })
  })
  const { moving, moveStyle, moveProps } = useMove(editor, getPos, a.width)
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')

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
      style={{ width: w, height: h, marginLeft: a.offsetX, ...moveStyle }}
      contentEditable={false}
      draggable={false}
      {...moveProps}
    >
      <svg width={w} height={h} className="chart-svg">
        <defs>
          <pattern id={`grid-${id}`} width={cell} height={cell} patternUnits="userSpaceOnUse" x={x0} y={y0}>
            <path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke="#c9d3e3" strokeWidth="1" />
          </pattern>
          <pattern id={`dots-${id}`} width={cell} height={cell} patternUnits="userSpaceOnUse" x={x0} y={y0}>
            <circle cx="0" cy="0" r="1.3" fill="#9aa8bf" />
          </pattern>
          <pattern id={`major-${id}`} width={majorPx} height={majorPx} patternUnits="userSpaceOnUse" x={x0} y={y0}>
            <path d={`M ${majorPx} 0 L 0 0 0 ${majorPx}`} fill="none" stroke="#8d9bb3" strokeWidth="1.6" />
          </pattern>
        </defs>

        {/* Hintergrund des Zeichenbereichs: wächst beim Vergrößern einfach mit */}
        {a.background !== 'blank' && (
          <rect x={x0} y={top} width={plotW} height={plotH} fill={`url(#${a.background === 'dots' ? 'dots' : 'grid'}-${id})`} />
        )}
        {a.showMajorLines && a.background !== 'blank' && (
          <rect x={x0} y={top} width={plotW} height={plotH} fill={`url(#major-${id})`} />
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
      </svg>
      <div className="resize-handle" title="Ziehen zum Vergrößern" {...handleProps} />
      {resizing && <div className="size-badge">{Math.round(w)} × {Math.round(h)} px</div>}
    </NodeViewWrapper>
  )
}
