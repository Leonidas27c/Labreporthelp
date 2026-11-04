import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { MM, PAGE_MM, USABLE_MM } from '../lib/print'

/** Zeigt im Editor gestrichelt an, wo beim Drucken eine neue A4-Seite beginnt (ungefähr). */
export function PageBreaks({ editor }: { editor: Editor }) {
  const [pages, setPages] = useState(1)

  useEffect(() => {
    const el = editor.view.dom as HTMLElement
    const measure = () => {
      const style = getComputedStyle(el)
      const content = el.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      setPages(Math.max(1, Math.ceil(content / (USABLE_MM * MM) - 0.001)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    editor.on('update', measure)
    return () => {
      ro.disconnect()
      editor.off('update', measure)
    }
  }, [editor])

  return (
    <>
      {Array.from({ length: pages - 1 }, (_, i) => (
        <div key={i} className="page-break" style={{ top: `${PAGE_MM.marginTop + (i + 1) * USABLE_MM}mm` }} aria-hidden="true">
          <span>Seite {i + 2}</span>
        </div>
      ))}
      <div className="page-count" aria-hidden="true">{pages === 1 ? '1 Seite' : `${pages} Seiten`}</div>
    </>
  )
}
