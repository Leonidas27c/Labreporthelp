import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ChartView } from '../components/ChartView'

export type ChartBackground = 'grid' | 'dots' | 'blank'

export interface ChartAttrs {
  width: number
  height: number
  offsetX: number
  background: ChartBackground
  xLabel: string
  xUnit: string
  yLabel: string
  yUnit: string
}

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
      background: { default: 'grid' },
      xLabel: { default: 'x' },
      xUnit: { default: '' },
      yLabel: { default: 'y' },
      yUnit: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'chart' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartView)
  },

})
