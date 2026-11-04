import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { moveBlock } from '../lib/moveBlock'

/**
 * Feld mit gedrückter Maustaste verschieben: waagerecht ändert den Abstand
 * vom linken Rand, senkrecht die Stelle im Text. Ein einfacher Klick wählt
 * das Feld nur aus.
 */
export function useMove(editor: Editor, getPos: () => number | undefined, width: number) {
  const [delta, setDelta] = useState<{ dx: number; dy: number } | null>(null)
  const start = useRef<{ x: number; y: number; top: number } | null>(null)

  const select = () => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // verhindert das eingebaute Ziehen des Browsers (das hat die Achsen-Texte kopiert)
    e.preventDefault()
    select()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, top: el.getBoundingClientRect().top }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!delta && Math.hypot(dx, dy) < 4) return
    setDelta({ dx, dy })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current
    start.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (!s || !delta) return
    setDelta(null)

    const pos = getPos()
    if (typeof pos !== 'number') return
    moveBlock(editor, pos, width, delta.dx, delta.dy, s.top)
  }

  return {
    moving: delta !== null,
    moveStyle: delta ? { transform: `translate(${delta.dx}px, ${delta.dy}px)` } : undefined,
    moveProps: { onPointerDown, onPointerMove, onPointerUp, onDragStart: (e: React.DragEvent) => e.preventDefault() },
  }
}
