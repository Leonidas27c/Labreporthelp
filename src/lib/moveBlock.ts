import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { contentWidth, insertPosition } from './insertPosition'

/**
 * Verschiebt ein Feld (Diagramm, Tabelle) um dx/dy Pixel: waagerecht ändert
 * sich der Abstand vom linken Rand, senkrecht die Stelle im Text.
 * `startTop` ist die Bildschirmhöhe der Oberkante beim Start des Ziehens.
 */
export function moveBlock(editor: Editor, pos: number, width: number, dx: number, dy: number, startTop: number) {
  const { state, view } = editor
  const node = state.doc.nodeAt(pos)
  if (!node) return

  const maxW = contentWidth(view.dom)
  const offsetX = Number(node.attrs.offsetX) || 0
  const newOffset = Math.round(Math.min(Math.max(offsetX + dx, 0), Math.max(0, maxW - width)))
  const pageBox = view.dom.getBoundingClientRect()
  const padLeft = parseFloat(getComputedStyle(view.dom).paddingLeft)
  const target = insertPosition(editor, startTop + dy, pageBox.left + padLeft + 1)

  const attrs = { ...node.attrs, offsetX: newOffset }
  let tr = state.tr
  let newPos = pos
  if (target < pos || target > pos + node.nodeSize) {
    // an eine andere Stelle im Text verschieben (Inhalt, z. B. Tabellenzellen, kommt mit)
    tr = tr.delete(pos, pos + node.nodeSize)
    newPos = tr.mapping.map(target)
    tr = tr.insert(newPos, node.type.create(attrs, node.content, node.marks))
  } else {
    tr = tr.setNodeMarkup(pos, undefined, attrs)
  }
  tr = tr.setSelection(NodeSelection.create(tr.doc, newPos))
  view.dispatch(tr)
}
