import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { contentWidth, insertPosition } from '../lib/insertPosition'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface DrawLayerProps {
  editor: Editor
  active: boolean
  onDone: () => void
}

const MIN_DRAG = 20

/**
 * Durchsichtige Ebene über der Seite. Wenn das Werkzeug aktiv ist, zieht man
 * mit gedrückter linker Maustaste ein Feld auf. Beim Loslassen erscheint ein
 * Menü, in dem man „Diagramm“ oder „Tabelle“ wählt.
 */
export function DrawLayer({ editor, active, onDone }: DrawLayerProps) {
  const layer = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const reset = () => {
    start.current = null
    setRect(null)
    setMenuOpen(false)
  }

  // Escape bricht ab
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      reset()
      onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onDone])

  if (!active) return null

  const local = (e: React.PointerEvent) => {
    const r = layer.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || menuOpen) return
    e.preventDefault()
    layer.current!.setPointerCapture(e.pointerId)
    start.current = local(e)
    setRect({ ...start.current, w: 0, h: 0 })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const p = local(e)
    const s = start.current
    setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return
    layer.current!.releasePointerCapture(e.pointerId)
    start.current = null
    if (!rect || rect.w < MIN_DRAG || rect.h < MIN_DRAG) {
      setRect(null)
      return
    }
    setMenuOpen(true)
  }

  const insert = (type: 'chart' | 'tablePlaceholder') => {
    if (!rect) return
    const layerBox = layer.current!.getBoundingClientRect()
    const page = editor.view.dom
    const pageBox = page.getBoundingClientRect()
    const padLeft = parseFloat(getComputedStyle(page).paddingLeft)
    const maxW = contentWidth(page)
    const contentLeft = pageBox.left + padLeft

    const width = Math.round(Math.min(rect.w, maxW))
    const offsetX = Math.round(clamp(layerBox.left + rect.x - contentLeft, 0, maxW - width))
    const pos = insertPosition(editor, layerBox.top + rect.y, contentLeft + 1)
    const atEnd = pos >= editor.state.doc.content.size

    editor
      .chain()
      .insertContentAt(pos, [
        { type, attrs: { width, height: Math.round(rect.h), offsetX } },
        ...(atEnd ? [{ type: 'paragraph' }] : []),
      ])
      .run()
    reset()
    onDone()
  }

  return (
    <div
      ref={layer}
      className="draw-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {rect && (
        <div className="draw-rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          {!menuOpen && rect.w > 40 && <span className="size-badge">{Math.round(rect.w)} × {Math.round(rect.h)} px</span>}
        </div>
      )}
      {menuOpen && rect && (
        <div
          className="draw-menu"
          style={{ left: rect.x + rect.w + 8, top: rect.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button onClick={() => insert('chart')}>📈 Diagramm</button>
          <button onClick={() => insert('tablePlaceholder')}>▦ Tabelle</button>
          <button className="cancel" onClick={reset}>Abbrechen</button>
        </div>
      )}
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max))
}
