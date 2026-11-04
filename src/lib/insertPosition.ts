import type { Editor } from '@tiptap/react'

/**
 * Findet die Stelle zwischen zwei Absätzen, die der Bildschirmhöhe `clientTop`
 * am nächsten liegt. Dort wird ein Feld eingefügt bzw. hin verschoben.
 */
export function insertPosition(editor: Editor, clientTop: number, clientLeft: number) {
  const { view, state } = editor
  const hit = view.posAtCoords({ left: clientLeft, top: clientTop })
  if (!hit) {
    const first = view.dom.firstElementChild?.getBoundingClientRect()
    return first && clientTop < first.top ? 0 : state.doc.content.size
  }
  const $pos = state.doc.resolve(hit.pos)
  if ($pos.depth === 0) {
    // Direkt auf einem Feld gelandet: davor oder dahinter
    const node = state.doc.nodeAt(hit.pos)
    const dom = view.nodeDOM(hit.pos) as HTMLElement | null
    const box = dom?.getBoundingClientRect()
    if (node && box && clientTop >= box.top + box.height / 2) return hit.pos + node.nodeSize
    return hit.pos
  }
  const before = $pos.before(1)
  const dom = view.nodeDOM(before) as HTMLElement | null
  const box = dom?.getBoundingClientRect()
  return box && clientTop < box.top + box.height / 2 ? before : $pos.after(1)
}

/** Breite des beschreibbaren Bereichs der Seite (ohne Seitenränder). */
export function contentWidth(pageEl: HTMLElement) {
  const cs = getComputedStyle(pageEl)
  return pageEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
}
