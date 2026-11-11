import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

const words = (text: string) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,_-]*/gu)?.length ?? 0

/** Wörter und Zeichen unten links unter der Seite (bei Markierung: Anteil der Markierung). */
export function WordCount({ editor }: { editor: Editor }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    let timer = 0
    const count = () => {
      const { doc, selection } = editor.state
      const all = doc.textBetween(0, doc.content.size, ' ', ' ')
      const total = words(all)
      if (!selection.empty) {
        const part = doc.textBetween(selection.from, selection.to, ' ', ' ')
        setLabel(`${words(part)} von ${total} Wörtern · ${part.replace(/\s/g, '').length} Zeichen markiert`)
      } else {
        setLabel(`${total} ${total === 1 ? 'Wort' : 'Wörter'} · ${all.length} Zeichen`)
      }
    }
    // Leicht verzögert, damit das Tippen flüssig bleibt
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(count, 120)
    }
    count()
    editor.on('update', schedule)
    editor.on('selectionUpdate', schedule)
    return () => {
      window.clearTimeout(timer)
      editor.off('update', schedule)
      editor.off('selectionUpdate', schedule)
    }
  }, [editor])

  return <div className="word-count" aria-live="off">{label}</div>
}
