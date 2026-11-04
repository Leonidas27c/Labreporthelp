import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ChartView } from '../components/ChartView'
import { DEFAULT_CHART } from '../lib/chartModel'

export type { ChartAttrs, ChartBackground } from '../lib/chartModel'

/** Ein Diagrammfeld als eigener Block im Dokument. */
export const ChartNode = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      width: { default: 300 },
      height: { default: 300 },
      offsetX: { default: 0 },
      background: { default: DEFAULT_CHART.background },
      cellSize: { default: DEFAULT_CHART.cellSize },
      majorEvery: { default: DEFAULT_CHART.majorEvery },
      showMajorLines: { default: DEFAULT_CHART.showMajorLines },
      axisCount: { default: DEFAULT_CHART.axisCount },
      axes: { default: DEFAULT_CHART.axes },
      // aus Schritt 2, werden beim Öffnen übernommen
      xLabel: { default: null },
      xUnit: { default: null },
      yLabel: { default: null },
      yUnit: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'chart' }, { 'data-width': HTMLAttributes.width })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartView)
  },
})
