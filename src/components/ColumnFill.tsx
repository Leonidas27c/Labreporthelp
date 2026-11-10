import { useEditorState, type Editor } from '@tiptap/react'
import { bodyColumn, describeTrend, findContinuation, trendValue } from '../lib/trend'
import { fillAll } from '../extensions/TableFill'

/** Knopf „Reihe fortsetzen“ für die aktuelle Spalte, sobald dort ein Trend erkannt wird. */
export function ColumnFill({ editor, pos, col }: { editor: Editor; pos: number; col: number }) {
  const found = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const table = e.state.doc.nodeAt(pos)
      if (!table || table.type.name !== 'table') return null
      if (table.firstChild?.maybeChild(col)?.attrs.formula) return null
      const cont = findContinuation(bodyColumn(table, pos, col))
      if (!cont) return null
      const preview = cont.targets.slice(0, 3).map((_, i) => trendValue(cont.trend, i + 1))
      return { count: cont.targets.length, preview: preview.join('; ') + (cont.targets.length > 3 ? ' …' : ''), how: describeTrend(cont.trend) }
    },
  })
  if (!found) return null
  const run = () => {
    const table = editor.state.doc.nodeAt(pos)
    const cont = table && findContinuation(bodyColumn(table, pos, col))
    if (cont) editor.view.dispatch(fillAll(editor.state, cont))
  }
  return (
    <div className="fill-offer">
      <p>
        Reihe erkannt ({found.how}). Fortsetzen mit {found.preview}
      </p>
      <button onClick={run}>{found.count === 1 ? '1 leere Zelle füllen' : `${found.count} leere Zellen füllen`}</button>
      <p className="help">Oder in der leeren Zelle Tab drücken: übernimmt den grauen Vorschlag.</p>
    </div>
  )
}
