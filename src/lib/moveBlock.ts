import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { contentWidth, insertPosition } from './insertPosition'
import type { SnapAlign } from './snap'

/** Ergebnis des Einrastens beim Ziehen (siehe BlockDrag). */
export interface MoveSnap {
  /** neue linke Kante, vom linken Seitenrand gemessen */
  left: number
  /** an Rand oder Mitte eingerastet: Ausrichtung statt fester Abstand */
  align: SnapAlign | null
  /** wurde überhaupt waagerecht verschoben? */
  sideways: boolean
}

/**
 * Verschiebt ein Feld (Diagramm, Tabelle) um dx/dy Pixel: waagerecht ändert
 * sich der Abstand vom linken Rand, senkrecht die Stelle im Text.
 * `startTop` ist die Bildschirmhöhe der Oberkante beim Start des Ziehens.
 */
export function moveBlock(editor: Editor, pos: number, width: number, dx: number, dy: number, startTop: number, snap?: MoveSnap) {
  const { state, view } = editor
  const node = state.doc.nodeAt(pos)
  if (!node) return

  const maxW = contentWidth(view.dom)
  const free = Math.max(0, maxW - width)
  // Ausgerichtete Diagramme: vom tatsächlichen Abstand zum linken Rand ausgehen
  const align = node.attrs.align as string | null | undefined
  const offsetX = align === 'center' ? free / 2 : align === 'right' ? free : align === 'left' ? 0 : Number(node.attrs.offsetX) || 0
  const newOffset = Math.round(Math.min(Math.max(snap ? snap.left : offsetX + dx, 0), free))
  const pageBox = view.dom.getBoundingClientRect()
  const padLeft = parseFloat(getComputedStyle(view.dom).paddingLeft)
  const target = insertPosition(editor, startTop + dy, pageBox.left + padLeft + 1)

  // Nur senkrecht verschoben: Ausrichtung bleibt. Waagerecht verschoben: frei platziert.
  // Eingerastet an Rand oder Mitte: Diagramme merken sich die Ausrichtung (bleibt auch bei anderer Breite).
  const hasAlign = align !== undefined
  const keepAlign = align && (snap ? !snap.sideways : Math.abs(dx) < 6)
  const attrs = keepAlign
    ? node.attrs
    : hasAlign && snap?.align
      ? { ...node.attrs, offsetX: 0, align: snap.align }
      : { ...node.attrs, offsetX: newOffset, ...(hasAlign ? { align: null } : {}) }
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
