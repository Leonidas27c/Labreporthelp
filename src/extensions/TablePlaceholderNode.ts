import { Extension, Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import { Plugin, type EditorState, type Transaction } from '@tiptap/pm/state'
import { emptyTable } from '../lib/tableModel'

/**
 * Alter Platzhalter für Tabellen aus früheren Versionen. Er bleibt nur, damit
 * alte Dateien sich öffnen lassen, und wird sofort in eine echte Tabelle
 * gleicher Größe umgewandelt.
 */
export const TablePlaceholderNode = Node.create({
  name: 'tablePlaceholder',
  group: 'block',
  atom: true,

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
})

function convert(state: EditorState): Transaction | null {
  const found: { pos: number; node: PMNode }[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'tablePlaceholder') found.push({ pos, node })
    return node.isBlock && !node.isTextblock
  })
  if (!found.length) return null
  const tr = state.tr
  for (const { pos, node } of found.reverse()) {
    const width = Number(node.attrs.width) || 300
    const height = Number(node.attrs.height) || 150
    const json = emptyTable(Math.max(2, Math.round(width / 110)), Math.max(2, Math.round(height / 32)), {
      width,
      height,
      offsetX: Number(node.attrs.offsetX) || 0,
    })
    tr.replaceWith(pos, pos + node.nodeSize, (state.schema as Schema).nodeFromJSON(json))
  }
  return tr
}

/** Wandelt Platzhalter beim Laden und nach jedem Öffnen einer Datei um. */
export const TablePlaceholderUpgrade = Extension.create({
  name: 'tablePlaceholderUpgrade',
  onCreate() {
    const tr = convert(this.editor.state)
    if (tr) this.editor.view.dispatch(tr)
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? convert(state) : null),
      }),
    ]
  },
})
