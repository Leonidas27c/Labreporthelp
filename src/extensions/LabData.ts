import { Extension } from '@tiptap/core'
import { TableCell, TableHeader } from '@tiptap/extension-table'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { TableMap } from '@tiptap/pm/tables'
import { formatResult, parseNumber, tryCompile, type CompiledFormula } from '../lib/formula'
import { hasHeaderRow, newId, normalizeSeries, pointsFromGrid, tableGrid } from '../lib/chartData'
import { setCellText } from '../lib/tableModel'

/**
 * Formel einer Spalte. Sie steht in der obersten Zelle (Kopfzeile) der Spalte und wandert
 * deshalb mit, wenn Spalten eingefügt, gelöscht oder verschoben werden.
 */
const formulaAttrs = {
  formula: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-formula'),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.formula ? { 'data-formula': String(attrs.formula) } : {}),
  },
  /** Nachkommastellen des Ergebnisses, null = automatisch */
  decimals: {
    default: null as number | null,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute('data-decimals')
      return v === null || v === '' ? null : Number(v)
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs.decimals == null ? {} : { 'data-decimals': String(attrs.decimals) }),
  },
}

export const LabTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...formulaAttrs }
  },
})

export const LabTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...formulaAttrs }
  },
})

interface FormulaColumn {
  col: number
  formula: CompiledFormula
  decimals: number | null
}

/** Formelspalten einer Tabelle (aus der ersten Zeile). */
export function formulaColumns(table: PMNode): FormulaColumn[] {
  const map = TableMap.get(table)
  const result: FormulaColumn[] = []
  if (map.height < 1) return result
  for (let c = 0; c < map.width; c++) {
    const offset = map.map[c]
    // nur wenn die Zelle genau diese Spalte ist (nicht über mehrere verbunden)
    if (map.colCount(offset) !== c || (table.nodeAt(offset)?.attrs.colspan ?? 1) !== 1) continue
    const cell = table.nodeAt(offset)
    const formula = tryCompile(cell?.attrs.formula as string | null)
    if (formula) result.push({ col: c, formula, decimals: (cell?.attrs.decimals as number | null) ?? null })
  }
  return result
}

/** Rechnet alle Formelspalten im Raster aus (mehrere Durchgänge, damit Formeln aufeinander aufbauen können). */
export function computeGrid(grid: string[][], columns: FormulaColumn[]): string[][] {
  const out = grid.map((row) => [...row])
  if (!columns.length) return out
  for (let pass = 0; pass < Math.min(10, columns.length + 1); pass++) {
    let changed = false
    for (let r = 1; r < out.length; r++) {
      const row = out[r]
      for (const fc of columns) {
        const v = fc.formula.evaluate((i) => (i === fc.col ? null : parseNumber(row[i] ?? '')))
        const text = v === null ? '' : formatResult(v, fc.decimals)
        if (row[fc.col] !== text) {
          row[fc.col] = text
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return out
}

const key = new PluginKey<DecorationSet>('labData')

interface Op {
  pos: number
  run: (tr: Transaction) => void
}

/** Alle nötigen Änderungen: Formelzellen neu berechnen, verknüpfte Diagramme aktualisieren, doppelte Tabellen-ids ersetzen. */
function sync(state: EditorState): Transaction | null {
  const ops: Op[] = []
  // Steht der Cursor in einer Zelle, die neu berechnet wird, bleibt er in dieser Zelle
  let keepCursorIn: number | null = null
  const grids = new Map<string, { grid: string[][]; header: boolean }>()
  const seen = new Set<string>()

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true
    let uid = node.attrs.uid as string | null
    if (uid && seen.has(uid)) {
      // kopierte Tabelle: eigene id, damit Diagramme bei ihrer Tabelle bleiben
      uid = null
      ops.push({ pos, run: (tr) => tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, uid: newId() }) })
    }
    if (uid) seen.add(uid)

    const grid = tableGrid(node)
    const columns = formulaColumns(node)
    const computed = computeGrid(grid, columns)
    if (uid) {
      grids.set(uid, { grid: computed, header: hasHeaderRow(node) })
    }
    if (!columns.length) return false

    const map = TableMap.get(node)
    for (let r = 1; r < map.height; r++) {
      for (const fc of columns) {
        const offset = map.map[r * map.width + fc.col]
        const cell = node.nodeAt(offset)
        // verbundene Zellen nicht überschreiben
        if (!cell || cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1) continue
        const text = computed[r][fc.col]
        if (cell.textContent === text) continue
        const cellPos = pos + 1 + offset
        if (state.selection.from > cellPos && state.selection.from < cellPos + cell.nodeSize) keepCursorIn = cellPos
        ops.push({ pos: cellPos, run: (tr) => setCellText(tr, state.schema, cellPos, text) })
      }
    }
    return false
  })

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'chart') return node.type.name !== 'table'
    const series = normalizeSeries(node.attrs.series)
    let changed = false
    const next = series.map((s) => {
      if (!s.source) return s
      const t = grids.get(s.source.table)
      if (!t) return s // Tabelle gelöscht: letzte Werte behalten
      const points = pointsFromGrid(t.header ? t.grid.slice(1) : t.grid, s.source.x, s.source.y)
      if (JSON.stringify(points) === JSON.stringify(s.points)) return s
      changed = true
      return { ...s, points }
    })
    if (changed) ops.push({ pos, run: (tr) => tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, series: next }) })
    return false
  })

  if (!ops.length) return null
  const tr = state.tr
  // von hinten nach vorne, damit die Positionen davor gültig bleiben
  ops.sort((a, b) => b.pos - a.pos).forEach((op) => op.run(tr))
  if (keepCursorIn !== null) {
    const cell = tr.doc.nodeAt(tr.mapping.map(keepCursorIn))
    const start = tr.mapping.map(keepCursorIn)
    if (cell) tr.setSelection(TextSelection.near(tr.doc.resolve(start + cell.nodeSize - 2), -1))
  }
  tr.setMeta('addToHistory', false)
  tr.setMeta(key, 'sync')
  return tr
}

/** Zellen in Formelspalten markieren (nur auf dem Bildschirm, siehe index.css). */
function decorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true
    const columns = formulaColumns(node)
    if (!columns.length) return false
    const map = TableMap.get(node)
    for (const fc of columns) {
      for (let r = 0; r < map.height; r++) {
        const offset = map.map[r * map.width + fc.col]
        const cell = node.nodeAt(offset)
        if (!cell) continue
        decos.push(Decoration.node(pos + 1 + offset, pos + 1 + offset + cell.nodeSize, { class: r === 0 ? 'formula-head' : 'formula-cell' }))
      }
    }
    return false
  })
  return DecorationSet.create(doc, decos)
}

/**
 * Hält berechnete Werte aktuell: Formelspalten in Tabellen und Diagramme,
 * die ihre Messwerte aus einer Tabelle beziehen.
 */
export const LabData = Extension.create({
  name: 'labData',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => decorations(state.doc),
          apply: (tr, old, _o, state) => (tr.docChanged ? decorations(state.doc) : old),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged || t.getMeta(key) === 'init')) return null
          return sync(state)
        },
      }),
    ]
  },

  onCreate() {
    // Beim Start einmal alles durchrechnen (z. B. Dokument aus dem Zwischenspeicher)
    const { view, state } = this.editor
    view.dispatch(state.tr.setMeta(key, 'init').setMeta('addToHistory', false))
  },
})
