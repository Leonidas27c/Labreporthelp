import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { HIGHLIGHT_PALETTES, TEXT_PALETTES } from '../lib/palettes'

/** Knopf mit Farbauswahl für Schriftfarbe oder Textmarker. */
export function ColorMenu({ editor, kind }: { editor: Editor; kind: 'text' | 'highlight' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      kind === 'text'
        ? ((e.getAttributes('textStyle').color as string | undefined) ?? null)
        : ((e.getAttributes('highlight').color as string | undefined) ?? null),
  })

  // Schließen bei Klick außerhalb oder Esc
  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent) => {
      if (!box.current?.contains(ev.target as Node)) setOpen(false)
    }
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const apply = (color: string | null) => {
    const c = editor.chain().focus()
    if (kind === 'text') (color ? c.setColor(color) : c.unsetColor()).run()
    else (color ? c.setHighlight({ color }) : c.unsetHighlight()).run()
    setOpen(false)
  }

  const palettes = kind === 'text' ? TEXT_PALETTES : HIGHLIGHT_PALETTES
  const fallback = kind === 'text' ? '#1f2933' : '#fff3a3'

  return (
    <div className="color-menu" ref={box}>
      <button
        className={`color-btn${open ? ' active' : ''}`}
        // mousedown statt click, damit die Textauswahl erhalten bleibt
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        title={kind === 'text' ? 'Schriftfarbe' : 'Textmarker'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className={kind === 'text' ? 'color-letter' : 'color-letter marker'}>{kind === 'text' ? 'A' : '✎'}</span>
        <span className="color-bar" style={{ background: current ?? (kind === 'text' ? '#1f2933' : 'transparent') }} />
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="color-pop" role="menu" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
          <button className="color-none" onClick={() => apply(null)}>
            {kind === 'text' ? 'Automatisch (Schwarz)' : 'Keine Markierung'}
          </button>
          {palettes.map((p) => (
            <div key={p.name} className="palette">
              <div className="palette-name" title={p.hint}>{p.name}</div>
              <div className="swatches">
                {p.colors.map((c) => (
                  <button
                    key={c.value}
                    className={`swatch${current?.toLowerCase() === c.value ? ' on' : ''}`}
                    style={{ background: c.value }}
                    title={c.name}
                    aria-label={c.name}
                    onClick={() => apply(c.value)}
                  />
                ))}
              </div>
              <div className="palette-hint">{p.hint}</div>
            </div>
          ))}
          <label className="color-custom">
            Eigene Farbe
            <input type="color" defaultValue={current ?? fallback} onChange={(e) => apply(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  )
}
