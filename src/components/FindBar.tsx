import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { searchKey } from '../extensions/SearchReplace'

/** Leiste „Suchen und Ersetzen“ (Strg+F bzw. Strg+H). */
export function FindBar({
  editor,
  replace: showReplace,
  focusToken,
  onToggleReplace,
  onClose,
}: {
  editor: Editor
  replace: boolean
  focusToken: number
  onToggleReplace: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(() => {
    const { from, to } = editor.state.selection
    const picked = editor.state.doc.textBetween(from, to, ' ')
    return picked && !picked.includes('\n') && picked.length < 80 ? picked : ''
  })
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const st = searchKey.getState(e.state)
      return { count: st?.matches.length ?? 0, current: st?.current ?? -1 }
    },
  })
  const { count, current } = s

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focusToken])

  useEffect(() => {
    editor.commands.setSearch({ query, caseSensitive, wholeWord })
  }, [editor, query, caseSensitive, wholeWord])

  // Aktuellen Treffer in die Mitte holen (der Editor scrollt nicht von selbst, solange die Suchleiste den Fokus hat)
  useEffect(() => {
    if (current < 0) return
    const hit = (editor.view.dom as HTMLElement).querySelector('.search-hit.current')
    if (!hit) return
    const r = hit.getBoundingClientRect()
    const ws = hit.closest('.workspace')?.getBoundingClientRect()
    if (!ws || r.top < ws.top + 70 || r.bottom > ws.bottom - 30) hit.scrollIntoView({ block: 'center' })
  }, [editor, current, count, query])

  // Beim Schließen die Markierungen entfernen
  useEffect(() => () => void editor.commands.setSearch({ query: '' }), [editor])

  const close = () => {
    onClose()
    editor.commands.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter' && e.target === input.current) {
      e.preventDefault()
      editor.commands.findStep(e.shiftKey ? -1 : 1)
    }
  }

  const info = !query ? '' : s.count === 0 ? 'Keine Treffer' : `${s.current + 1} von ${s.count}`

  return (
    <div className="find-wrap">
    <div className="find-bar" role="search" onKeyDown={onKey}>
      <div className="find-row">
        <button
          className="find-toggle"
          onClick={onToggleReplace}
          title={showReplace ? 'Ersetzen ausblenden' : 'Ersetzen einblenden (Strg+H)'}
          aria-expanded={showReplace}
        >
          {showReplace ? '▾' : '▸'}
        </button>
        <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen" aria-label="Suchen" />
        <span className={`find-info${query && s.count === 0 ? ' none' : ''}`} aria-live="polite">{info}</span>
        <button onClick={() => editor.commands.findStep(-1)} disabled={!s.count} title="Vorheriger Treffer (Umschalt+Enter)">↑</button>
        <button onClick={() => editor.commands.findStep(1)} disabled={!s.count} title="Nächster Treffer (Enter)">↓</button>
        <button className={caseSensitive ? 'active' : ''} onClick={() => setCaseSensitive((c) => !c)} title="Groß-/Kleinschreibung beachten">Aa</button>
        <button className={wholeWord ? 'active' : ''} onClick={() => setWholeWord((w) => !w)} title="Nur ganzes Wort">„ab“</button>
        <button onClick={close} title="Schließen (Esc)" aria-label="Schließen">✕</button>
      </div>
      {showReplace && (
        <div className="find-row">
          <span className="find-toggle-space" />
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Ersetzen durch" aria-label="Ersetzen durch" />
          <button onClick={() => editor.commands.replaceCurrent(replacement)} disabled={!s.count}>Ersetzen</button>
          <button onClick={() => editor.commands.replaceAll(replacement)} disabled={!s.count}>Alle ersetzen</button>
        </div>
      )}
    </div>
    </div>
  )
}
