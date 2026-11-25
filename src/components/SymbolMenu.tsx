import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

/** Zeichen, die man in Laborprotokollen ständig braucht. */
const GROUPS: { name: string; chars: string }[] = [
  { name: 'Griechisch', chars: 'αβγδεζηθκλμνξπρστφχψωΓΔΘΛΞΠΣΦΨΩ' },
  { name: 'Mathematik', chars: '±∓×·÷≈≠≡≤≥≪≫∞√∑∏∫∂∇∝∈∉∀∃∅∩∪⊂⊆' },
  { name: 'Einheiten', chars: '°′″‰µÅΩ℃²³¹⁰⁻⁺₀₁₂₃' },
  { name: 'Pfeile', chars: '→←↔⇌⇒⇔↑↓⟶' },
  { name: 'Sonstiges', chars: '•…–—„“‚‘«»§©®™†' },
]

/** Knopf „Ω Symbol“ mit Auswahl von Sonderzeichen. */
export function SymbolMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

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

  return (
    <div className="color-menu" ref={box}>
      <button
        className={open ? 'active' : ''}
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        title="Symbol einfügen (griechische Buchstaben, ±, °, µ, → …)"
        aria-haspopup="true"
        aria-expanded={open}
      >
        Ω
      </button>
      {open && (
        <div className="color-pop symbol-pop" role="menu" onMouseDown={(e) => e.preventDefault()}>
          {GROUPS.map((g) => (
            <div key={g.name}>
              <div className="palette-name">{g.name}</div>
              <div className="symbols">
                {Array.from(g.chars).map((c) => (
                  // Klick fügt ein, das Menü bleibt offen, damit man mehrere Zeichen setzen kann
                  <button key={c} className="symbol" title={c} onClick={() => editor.chain().focus().insertContent(c).run()}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
