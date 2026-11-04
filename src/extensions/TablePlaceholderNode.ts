import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TablePlaceholderView } from '../components/TablePlaceholderView'

/** Platzhalter für eine Tabelle. Die echte Tabelle kommt in einem späteren Schritt. */
export const TablePlaceholderNode = Node.create({
  name: 'tablePlaceholder',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      width: { default: 300 },
      height: { default: 150 },
      offsetX: { default: 0 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="table-placeholder"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'table-placeholder' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TablePlaceholderView)
  },
})
