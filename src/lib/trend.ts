/**
 * Reihen in Tabellenspalten fortsetzen: erkennt gleichmäßige Schritte
 * (293,15 → 303,15 → 313,15 …) oder einen festen Faktor (1, 2, 4, 8 …)
 * und schlägt die nächsten Werte vor.
 */
import type { Node as PMNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'
import { parseNumber } from './formula'

export interface Trend {
  kind: 'step' | 'factor'
  /** Schrittweite bzw. Faktor */
  by: number
  /** letzter bekannter Wert */
  last: number
  decimals: number
  comma: boolean
  /** Anzahl der Werte, aus denen der Trend erkannt wurde */
  basis: number
}

/** Nur reine Zahlen (keine Einheiten, keine ± …), damit nichts Falsches fortgesetzt wird. */
const PLAIN = /^\s*[-+−]?(\d+([.,]\d+)?|[.,]\d+)\s*$/

function decimalsOf(text: string) {
  const m = text.trim().match(/[.,](\d+)\s*$/)
  return m ? m[1].length : 0
}

/** Erkennt einen Trend in einer Folge von Zellentexten (alle gefüllt, mindestens 2). */
export function detectTrend(texts: string[]): Trend | null {
  if (texts.length < 2 || !texts.every((t) => PLAIN.test(t))) return null
  const values = texts.map((t) => parseNumber(t)!)
  const decimals = Math.max(...texts.map(decimalsOf))
  const comma = texts.some((t) => t.includes(',')) || !texts.some((t) => t.includes('.'))
  const scale = Math.max(...values.map(Math.abs), 1)
  const tol = Math.max(scale * 1e-9, 0.5 * 10 ** -decimals)
  const last = values[values.length - 1]

  const diffs = values.slice(1).map((v, i) => v - values[i])
  const step = diffs[diffs.length - 1]
  if (step !== 0 && diffs.every((d) => Math.abs(d - step) <= tol)) {
    return { kind: 'step', by: step, last, decimals, comma, basis: values.length }
  }
  // Fester Faktor erst ab 3 Werten, sonst wäre jede Zweierfolge ein „Faktor“
  if (values.length >= 3 && values.every((v) => v !== 0)) {
    const ratios = values.slice(1).map((v, i) => v / values[i])
    const f = ratios[ratios.length - 1]
    if (f !== 1 && ratios.every((r) => Math.abs(r - f) <= Math.abs(f) * 1e-6)) {
      return { kind: 'factor', by: f, last, decimals, comma, basis: values.length }
    }
  }
  return null
}

/** Der n-te Wert nach dem letzten bekannten (n = 1, 2, …) als Text. */
export function trendValue(t: Trend, n: number): string {
  const v = t.kind === 'step' ? t.last + t.by * n : t.last * t.by ** n
  const d = t.kind === 'step' ? t.decimals : Math.max(t.decimals, Math.abs(v) < 1 ? 4 : 0)
  const s = v.toFixed(Math.min(12, d))
  return t.comma ? s.replace('.', ',') : s
}

export function describeTrend(t: Trend) {
  const fmt = (v: number) => {
    const s = String(Math.round(v * 1e9) / 1e9)
    return t.comma ? s.replace('.', ',') : s
  }
  return t.kind === 'step' ? `${t.by > 0 ? '+' : '−'}${fmt(Math.abs(t.by))} pro Zeile` : `×${fmt(t.by)} pro Zeile`
}

interface CellRef {
  pos: number
  text: string
}

/** Zellen einer Spalte unter der Kopfzeile (verbundene Zellen beenden die Spalte). */
export function bodyColumn(table: PMNode, tablePos: number, col: number): CellRef[] {
  const map = TableMap.get(table)
  const cells: CellRef[] = []
  for (let r = 1; r < map.height; r++) {
    const offset = map.map[r * map.width + col]
    const cell = table.nodeAt(offset)
    if (!cell || cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1) break
    cells.push({ pos: tablePos + 1 + offset, text: cell.textContent })
  }
  return cells
}

export interface Continuation {
  trend: Trend
  /** leere Zellen direkt unter den erkannten Werten, die gefüllt werden können */
  targets: CellRef[]
}

/**
 * Sucht in einer Spalte die Stelle, an der eine erkannte Reihe endet und leere
 * Zellen folgen. Mit `row` (Index unter der Kopfzeile) nur genau für diese Zelle.
 */
export function findContinuation(cells: CellRef[], row?: number): Continuation | null {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].text.trim() !== '') continue
    if (row !== undefined && i !== row) continue
    // gefüllte Zellen direkt darüber
    let start = i
    while (start > 0 && cells[start - 1].text.trim() !== '') start--
    const trend = detectTrend(cells.slice(start, i).map((c) => c.text))
    if (trend) {
      const targets: CellRef[] = []
      for (let k = i; k < cells.length && cells[k].text.trim() === ''; k++) targets.push(cells[k])
      return { trend, targets }
    }
    if (row !== undefined) return null
  }
  return null
}
