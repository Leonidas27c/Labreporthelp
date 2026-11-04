import { useId } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import type { ChartAttrs } from '../extensions/ChartNode'
import { useResize } from './useResize'

const GRID = 20 // Kästchengröße in Pixeln
const MARGIN = { left: 44, bottom: 36, top: 16, right: 16 }

export function ChartView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const a = node.attrs as ChartAttrs
  const maxWidth = contentWidth(editor.view.dom) - a.offsetX
  const { size, resizing, handleProps } = useResize(a.width, a.height, maxWidth, updateAttributes)
  const id = useId().replace(/:/g, '')

  const { width: w, height: h } = size
  const plotW = Math.max(0, w - MARGIN.left - MARGIN.right)
  const plotH = Math.max(0, h - MARGIN.top - MARGIN.bottom)
  const x0 = MARGIN.left
  const y0 = h - MARGIN.bottom

  return (
    <NodeViewWrapper
      className={`chart-node${selected ? ' selected' : ''}${resizing ? ' resizing' : ''}`}
      style={{ width: w, height: h, marginLeft: a.offsetX }}
      contentEditable={false}
    >
      <svg width={w} height={h} className="chart-svg">
        <defs>
          <pattern id={`grid-${id}`} width={GRID} height={GRID} patternUnits="userSpaceOnUse" x={x0} y={y0}>
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#c9d3e3" strokeWidth="1" />
          </pattern>
          <pattern id={`dots-${id}`} width={GRID} height={GRID} patternUnits="userSpaceOnUse" x={x0} y={y0}>
            <circle cx="0" cy="0" r="1.3" fill="#9aa8bf" />
          </pattern>
          <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#1d2330" />
          </marker>
        </defs>

        {/* Hintergrund des Zeichenbereichs: wächst beim Vergrößern einfach mit */}
        {a.background !== 'blank' && (
          <rect
            x={x0}
            y={MARGIN.top}
            width={plotW}
            height={plotH}
            fill={`url(#${a.background === 'dots' ? 'dots' : 'grid'}-${id})`}
          />
        )}

        {/* Achsen */}
        <line x1={x0} y1={y0} x2={w - MARGIN.right + 6} y2={y0} stroke="#1d2330" strokeWidth="1.5" markerEnd={`url(#arrow-${id})`} />
        <line x1={x0} y1={y0} x2={x0} y2={MARGIN.top - 6} stroke="#1d2330" strokeWidth="1.5" markerEnd={`url(#arrow-${id})`} />

        {/* Beschriftungen */}
        <text x={w - MARGIN.right} y={h - 10} textAnchor="end" className="axis-label">
          {axisText(a.xLabel, a.xUnit)}
        </text>
        <text x={x0 - 8} y={MARGIN.top + 4} textAnchor="end" dominantBaseline="hanging" className="axis-label">
          {axisText(a.yLabel, a.yUnit)}
        </text>
      </svg>
      <div className="resize-handle" title="Ziehen zum Vergrößern" {...handleProps} />
      {resizing && <div className="size-badge">{Math.round(w)} × {Math.round(h)} px</div>}
    </NodeViewWrapper>
  )
}

function axisText(label: string, unit: string) {
  return unit ? `${label} [${unit}]` : label
}

/** Breite des beschreibbaren Bereichs der Seite (ohne Seitenränder). */
export function contentWidth(pageEl: HTMLElement) {
  const cs = getComputedStyle(pageEl)
  return pageEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
}
