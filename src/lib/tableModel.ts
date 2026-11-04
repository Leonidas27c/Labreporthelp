/** Datenmodell einer Tabelle (Aussehen) und Hilfsfunktionen zum Umbauen. */
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { NodeSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { CellSelection, TableMap, addColumn, addRow, removeColumn, removeRow } from '@tiptap/pm/tables'
import type { JSONContent } from '@tiptap/react'

/** all = alle Linien, rows = nur waagerecht, booktabs = wissenschaftlich (3 Linien), outer = nur Rahmen */
export type TableBorders = 'all' | 'rows' | 'booktabs' | 'outer' | 'none'
export type UnitStyle = 'brackets' | 'slash' | 'in'
export type CaptionPosition = 'above' | 'below'

export interface TableAttrs {
  offsetX: number
  caption: string
  captionPosition: CaptionPosition
  borders: TableBorders
  borderColor: string
  borderWidth: number
  /** Hintergrund der Kopfzeile, leer = keiner */
  headerBg: string
  striped: boolean
  stripeColor: string
  /** Mindesthöhe einer Zeile in px, 0 = automatisch */
  rowHeight: number
  /** Schriftgröße in pt, 0 = wie der Text */
  fontSize: number
  unitStyle: UnitStyle
}

export const DEFAULT_TABLE: TableAttrs = {
  offsetX: 0,
  caption: '',
  captionPosition: 'above',
  borders: 'all',
  borderColor: '#8d9bb3',
  borderWidth: 1,
  headerBg: '#eef2f8',
  striped: false,
  stripeColor: '#f4f6fa',
  rowHeight: 0,
  fontSize: 0,
  unitStyle: 'brackets',
}

export const MIN_COL_WIDTH = 40

/** Ergänzt fehlende Felder (z. B. bei Tabellen aus älteren Dateien). */
export function normalizeTable(raw: Record<string, unknown>): TableAttrs {
  const r = raw as Partial<TableAttrs>
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d)
  return {
    offsetX: Math.max(0, num(r.offsetX, 0)),
    caption: typeof r.caption === 'string' ? r.caption : '',
    captionPosition: r.captionPosition === 'below' ? 'below' : 'above',
    borders: (['all', 'rows', 'booktabs', 'outer', 'none'] as const).includes(r.borders as TableBorders)
      ? (r.borders as TableBorders)
      : DEFAULT_TABLE.borders,
    borderColor: r.borderColor || DEFAULT_TABLE.borderColor,
    borderWidth: Math.min(6, Math.max(0.5, num(r.borderWidth, DEFAULT_TABLE.borderWidth))),
    headerBg: typeof r.headerBg === 'string' ? r.headerBg : DEFAULT_TABLE.headerBg,
    striped: r.striped === true,
    stripeColor: r.stripeColor || DEFAULT_TABLE.stripeColor,
    rowHeight: Math.max(0, num(r.rowHeight, 0)),
    fontSize: Math.max(0, num(r.fontSize, 0)),
    unitStyle: r.unitStyle === 'slash' || r.unitStyle === 'in' ? r.unitStyle : 'brackets',
  }
}

/* ---------- Kopfzeile: Größe und Einheit ---------- */

/** Zerlegt „Zeit t [s]“, „Zeit t / s“ oder „Zeit t in s“ in Größe und Einheit. */
export function splitUnit(text: string): { label: string; unit: string } {
  const t = text.trim()
  const m = t.match(/^(.*?)\s*\[([^\]]*)\]$/) ?? t.match(/^(.*?)\s+\/\s+(\S.*)$/) ?? t.match(/^(.*?)\s+in\s+(\S+)$/)
  return m ? { label: m[1], unit: m[2] } : { label: t, unit: '' }
}

export function joinUnit(label: string, unit: string, style: UnitStyle) {
  if (!unit.trim()) return label
  if (style === 'slash') return `${label} / ${unit}`
  if (style === 'in') return `${label} in ${unit}`
  return `${label} [${unit}]`
}

/* ---------- Tabelle im Dokument finden ---------- */

export interface TableInfo {
  pos: number
  attrs: Record<string, unknown>
  rows: number
  cols: number
  /** Spalte und Zeile, in der der Cursor steht */
  col: number
  row: number
  headerRow: boolean
  headerCol: boolean
  /** Breiten aller Spalten, falls alle festgelegt sind */
  widths: number[] | null
}

/** Liefert die Tabelle, in der die Auswahl gerade steht (oder die ausgewählt ist). */
export function findTable(state: EditorState): TableInfo | null {
  const sel = state.selection
  let pos: number | null = null
  let cellPos: number | null = null
  if (sel instanceof NodeSelection && sel.node.type.name === 'table') {
    pos = sel.from
  } else {
    const $from = sel instanceof CellSelection ? sel.$anchorCell : sel.$from
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d)
      if ((n.type.spec.tableRole === 'cell' || n.type.spec.tableRole === 'header_cell') && cellPos === null) {
        cellPos = $from.before(d)
      }
      if (n.type.name === 'table') {
        pos = $from.before(d)
        break
      }
    }
    if (sel instanceof CellSelection) cellPos = sel.$anchorCell.pos
  }
  if (pos === null) return null
  const table = state.doc.nodeAt(pos)
  if (!table) return null
  const map = TableMap.get(table)
  let col = 0
  let row = 0
  if (cellPos !== null) {
    try {
      const rect = map.findCell(cellPos - pos - 1)
      col = rect.left
      row = rect.top
    } catch {
      /* Cursor steht nicht in einer Zelle dieser Tabelle */
    }
  }
  const isHeader = (r: number, c: number) => table.nodeAt(map.map[r * map.width + c])?.type.name === 'tableHeader'
  let headerRow = map.height > 0
  for (let c = 0; c < map.width; c++) if (!isHeader(0, c)) headerRow = false
  let headerCol = map.height > 0
  for (let r = headerRow ? 1 : 0; r < map.height; r++) if (!isHeader(r, 0)) headerCol = false
  if (headerRow && map.height === 1) headerCol = false
  return { pos, attrs: table.attrs, rows: map.height, cols: map.width, col, row, headerRow, headerCol, widths: columnWidths(table) }
}

/** Gespeicherte Spaltenbreiten, oder null wenn nicht alle festgelegt sind. */
export function columnWidths(table: PMNode): number[] | null {
  const map = TableMap.get(table)
  const widths: number[] = []
  for (let c = 0; c < map.width; c++) {
    const offset = map.map[c]
    const cell = table.nodeAt(offset)
    if (!cell) return null
    const startCol = map.colCount(offset)
    const w = (cell.attrs.colwidth as number[] | null)?.[c - startCol]
    if (!w) return null
    widths.push(w)
  }
  return widths
}

/** Spaltenbreiten, wie sie gerade auf dem Bildschirm zu sehen sind. */
export function measureColumns(view: EditorView, pos: number, table: PMNode): number[] {
  const stored = columnWidths(table)
  if (stored) return stored
  const map = TableMap.get(table)
  const result: number[] = []
  for (let c = 0; c < map.width; c++) {
    let w = 0
    for (let r = 0; r < map.height && !w; r++) {
      const offset = map.map[r * map.width + c]
      const cell = table.nodeAt(offset)
      if (!cell || cell.attrs.colspan !== 1) continue
      const dom = view.nodeDOM(pos + 1 + offset) as HTMLElement | null
      w = dom?.getBoundingClientRect().width ?? 0
    }
    result.push(Math.round(w) || 100)
  }
  return result
}

/** Schreibt neue Spaltenbreiten in alle Zellen der Tabelle. */
export function setColumnWidths(tr: Transaction, pos: number, widths: number[]) {
  const table = tr.doc.nodeAt(pos)
  if (!table) return tr
  const map = TableMap.get(table)
  const done = new Set<number>()
  for (const offset of map.map) {
    if (done.has(offset)) continue
    done.add(offset)
    const cell = table.nodeAt(offset)
    if (!cell) continue
    const start = map.colCount(offset)
    const span = cell.attrs.colspan as number
    const colwidth = widths.slice(start, start + span).map((w) => Math.max(MIN_COL_WIDTH, Math.round(w)))
    tr.setNodeMarkup(pos + 1 + offset, undefined, { ...cell.attrs, colwidth })
  }
  return tr
}

/** Skaliert alle Spalten gleichmäßig auf eine Gesamtbreite. */
export function scaleWidths(widths: number[], total: number) {
  const sum = widths.reduce((a, b) => a + b, 0) || 1
  const min = MIN_COL_WIDTH * widths.length
  const target = Math.max(min, total)
  return widths.map((w) => Math.max(MIN_COL_WIDTH, Math.round((w / sum) * target)))
}

function rect(tr: Transaction, pos: number) {
  const table = tr.doc.nodeAt(pos)!
  const map = TableMap.get(table)
  return { map, table, tableStart: pos + 1, left: 0, top: 0, right: map.width, bottom: map.height }
}

/** Zeilen und Spalten am Ende anfügen oder entfernen. */
export function resizeGrid(tr: Transaction, pos: number, rows: number, cols: number, maxWidth: number) {
  const before = tr.doc.nodeAt(pos)
  if (!before) return tr
  const oldWidths = columnWidths(before)
  rows = Math.max(1, Math.min(200, Math.round(rows)))
  cols = Math.max(1, Math.min(30, Math.round(cols)))
  while (rect(tr, pos).map.height < rows) addRow(tr, rect(tr, pos), rect(tr, pos).map.height)
  while (rect(tr, pos).map.height > rows) removeRow(tr, rect(tr, pos), rect(tr, pos).map.height - 1)
  while (rect(tr, pos).map.width < cols) addColumn(tr, rect(tr, pos), rect(tr, pos).map.width)
  while (rect(tr, pos).map.width > cols) removeColumn(tr, rect(tr, pos), rect(tr, pos).map.width - 1)
  if (oldWidths && oldWidths.length !== cols) {
    // Feste Breiten: neue Spalten bekommen die mittlere Breite, alles passt weiter auf die Seite
    const avg = oldWidths.reduce((a, b) => a + b, 0) / oldWidths.length
    let widths = Array.from({ length: cols }, (_, i) => oldWidths[i] ?? avg)
    const sum = widths.reduce((a, b) => a + b, 0)
    if (sum > maxWidth) widths = scaleWidths(widths, maxWidth)
    setColumnWidths(tr, pos, widths)
  }
  return tr
}

/** Alle Zellen einer Spalte (Positionen im Dokument). */
export function columnCells(table: PMNode, pos: number, col: number) {
  const map = TableMap.get(table)
  const cells = new Set<number>()
  for (let r = 0; r < map.height; r++) cells.add(pos + 1 + map.map[r * map.width + col])
  return [...cells]
}

/** Ersetzt den Text einer Zelle durch einfachen Text (Absatzformat bleibt erhalten). */
export function setCellText(tr: Transaction, schema: Schema, cellPos: number, text: string) {
  const cell = tr.doc.nodeAt(cellPos)
  if (!cell) return
  const para = cell.firstChild?.type.name === 'paragraph' ? cell.firstChild : null
  const p = schema.nodes.paragraph.create(para?.attrs ?? null, text ? schema.text(text) : null)
  tr.replaceWith(cellPos + 1, cellPos + cell.nodeSize - 1, p)
}

/** Leere Tabelle mit Kopfzeile (für das Aufziehen-Werkzeug und alte Platzhalter). */
export function emptyTable(cols: number, rows: number, opts: { width?: number; height?: number; offsetX?: number } = {}): JSONContent {
  const colwidth = opts.width ? [Math.max(MIN_COL_WIDTH, Math.round(opts.width / cols))] : null
  const rowHeight = opts.height ? Math.max(0, Math.round(opts.height / rows)) : 0
  const cell = (type: string) => ({ type, attrs: { colwidth }, content: [{ type: 'paragraph' }] })
  return {
    type: 'table',
    attrs: { offsetX: opts.offsetX ?? 0, rowHeight: rowHeight > 30 ? rowHeight : 0 },
    content: Array.from({ length: rows }, (_, r) => ({
      type: 'tableRow',
      content: Array.from({ length: cols }, () => cell(r === 0 ? 'tableHeader' : 'tableCell')),
    })),
  }
}
