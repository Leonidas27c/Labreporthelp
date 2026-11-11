import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { BlockDrag } from '../lib/blockDrag'

/**
 * Feld mit gedrückter Maustaste verschieben: waagerecht ändert den Abstand
 * vom linken Rand, senkrecht die Stelle im Text. Ein einfacher Klick wählt
 * das Feld nur aus. Während des Ziehens rendert React nicht neu, das Feld
 * folgt der Maus direkt (siehe BlockDrag).
 */
export function useMove(editor: Editor, getPos: () => number | undefined) {
  const [moving, setMoving] = useState(false)
  const drag = useRef<BlockDrag | null>(null)

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
    drag.current = new BlockDrag(editor, el, getPos, e)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current?.move(e)) setMoving(true)
  }

  const finish = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    setMoving(false)
    d?.end(e.type === 'pointerup')
  }

  return {
    moving,
    moveProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
    },
  }
}
