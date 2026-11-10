import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TableMap } from '@tiptap/pm/tables'
import { setCellText } from '../lib/tableModel'
import { bodyColumn, describeTrend, findContinuation, trendValue, type Continuation } from '../lib/trend'

export interface FillSuggestion {
  cont: Continuation
  /** Position der Zelle, in der der Cursor steht */
  cellPos: number
  value: string
}

/** Vorschlag für die leere Zelle, in der der Cursor steht (oder null). */
export function fillSuggestion(state: EditorState): FillSuggestion | null {
  const sel = state.selection
  if (!sel.empty) return null
  const $from = sel.$from
  let cellDepth = -1
  let tableDepth = -1
  for (let d = $from.depth; d > 0; d--) {
    const role = $from.node(d).type.spec.tableRole
    if (cellDepth < 0 && (role === 'cell' || role === 'header_cell')) cellDepth = d
    if ($from.node(d).type.name === 'table') {
      tableDepth = d
      break
    }
  }
  if (cellDepth < 0 || tableDepth < 0) return null
  const cell = $from.node(cellDepth)
  if (cell.textContent.trim() !== '') return null
  const table = $from.node(tableDepth)
  const tablePos = $from.before(tableDepth)
  const cellPos = $from.before(cellDepth)
  const map = TableMap.get(table)
  let rect
  try {
    rect = map.findCell(cellPos - tablePos - 1)
  } catch {
    return null
  }
  if (rect.top === 0) return null
  // Formelspalten rechnen selbst
  const head = table.nodeAt(map.map[rect.left])
  if (head?.attrs.formula) return null
  const cells = bodyColumn(table, tablePos, rect.left)
  const cont = findContinuation(cells, rect.top - 1)
  if (!cont) return null
  return { cont, cellPos, value: trendValue(cont.trend, 1) }
}

/** Füllt alle leeren Zellen unter einer erkannten Reihe. */
export function fillAll(state: EditorState, cont: Continuation): Transaction {
  const tr = state.tr
  // von unten nach oben, damit die Positionen davor gültig bleiben
  for (let i = cont.targets.length - 1; i >= 0; i--) {
    setCellText(tr, state.schema, cont.targets[i].pos, trendValue(cont.trend, i + 1))
  }
  return tr
}

const key = new PluginKey('tableFill')

/**
 * Zeigt in einer leeren Tabellenzelle den nächsten Wert einer erkannten Reihe
 * (z. B. 313,15 nach 293,15 und 303,15) grau an. Tab übernimmt ihn und
 * springt in die Zelle darunter.
 */
export const TableFill = Extension.create({
  name: 'tableFill',
  // vor der Tabellen-Tastenbelegung (Tab = nächste Zelle)
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const s = fillSuggestion(editor.state)
        if (!s) return false
        const { state, view } = editor
        const tr = state.tr
        setCellText(tr, state.schema, s.cellPos, s.value)
        // Cursor in die Zelle darunter, damit man mit Tab weiterfüllen kann
        const next = s.cont.targets[1]
        if (next) {
          const pos = tr.mapping.map(next.pos)
          tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)))
        } else {
          const end = tr.mapping.map(s.cellPos) + (tr.doc.nodeAt(tr.mapping.map(s.cellPos))?.nodeSize ?? 2) - 2
          tr.setSelection(TextSelection.near(tr.doc.resolve(end), -1))
        }
        view.dispatch(tr.scrollIntoView())
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations: (state) => {
            const s = fillSuggestion(state)
            if (!s) return null
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                state.selection.from,
                () => {
                  const el = document.createElement('span')
                  el.className = 'fill-ghost'
                  el.contentEditable = 'false'
                  el.textContent = s.value
                  const hint = document.createElement('kbd')
                  hint.textContent = 'Tab'
                  hint.title = `Reihe fortsetzen (${describeTrend(s.cont.trend)})`
                  el.append(hint)
                  return el
                },
                { side: 1, key: `fill-${s.value}`, ignoreSelection: true },
              ),
            ])
          },
        },
      }),
    ]
  },
})
