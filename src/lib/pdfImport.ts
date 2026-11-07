import type { JSONContent } from '@tiptap/react'
import { createDocument, type LabDocument } from './documentFile'
import { decodeEmbed, EMBED_SCHEME } from './pdfEmbed'

export interface PdfImport {
  doc: LabDocument
  /** true: Original-Dokument aus der PDF (mit Tabellen, Diagrammen, Formatierung). */
  exact: boolean
}

/**
 * Öffnet eine PDF als bearbeitbares Dokument.
 * Wurde die PDF mit Labreporthelp erzeugt, steckt das Original darin und wird 1:1 geladen.
 * Sonst wird der Text ausgelesen und daraus Überschriften, Absätze, Listen und einfache
 * Tabellen gebaut. Diagramme und Bilder fremder PDFs lassen sich so nicht übernehmen.
 */
export async function importPdf(file: File): Promise<PdfImport> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  const title = file.name.replace(/\.pdf$/i, '')
  try {
    // 1. Eingebettetes Labreporthelp-Dokument suchen (steht auf Seite 1)
    const first = await pdf.getPage(1)
    for (const a of await first.getAnnotations()) {
      const uri: unknown = a.url ?? a.unsafeUrl
      if (typeof uri !== 'string' || !uri.startsWith(EMBED_SCHEME)) continue
      try {
        const data = (await decodeEmbed(uri)) as LabDocument | null
        if (data?.format === 'labreporthelp' && typeof data.content === 'object') return { doc: data, exact: true }
      } catch {
        /* beschädigt: mit dem Text weitermachen */
      }
    }

    // 2. Sonst den Text auslesen
    const lines: Line[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const text = await page.getTextContent()
      lines.push(...groupLines(text.items as PdfItem[], n))
    }
    const content = buildContent(lines)
    if (!content.length) {
      throw new Error('In dieser PDF ist kein Text zu finden (vermutlich eingescannt). Sie lässt sich nicht als Text bearbeiten.')
    }
    return { doc: createDocument(title, { type: 'doc', content }), exact: false }
  } finally {
    void task.destroy()
  }
}

interface PdfItem {
  str: string
  transform: number[]
  width: number
  height: number
}

interface Line {
  page: number
  y: number
  size: number
  /** Textstücke der Zeile; mehrere, wenn große Lücken dazwischen liegen (Tabellenspalten). */
  cells: string[]
  /** Linker Rand jeder Zelle (für die Spaltenzuordnung). */
  xs: number[]
}

function groupLines(items: PdfItem[], page: number): Line[] {
  const parts = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: (typeof parts)[] = []
  for (const p of parts) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - p.y) < Math.min(row[0].size, p.size) * 0.5) row.push(p)
    else rows.push([p])
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    const size = Math.max(...row.map((p) => p.size))
    const cells: string[] = []
    const xs: number[] = []
    let end = -Infinity
    for (const p of row) {
      const gap = p.x - end
      if (!cells.length || gap > size * 1.2) {
        cells.push(p.str)
        xs.push(p.x)
      } else {
        const prev = cells[cells.length - 1]
        cells[cells.length - 1] = prev + (gap > size * 0.15 && !/\s$/.test(prev) && !/^\s/.test(p.str) ? ' ' : '') + p.str
      }
      end = p.x + p.w
    }
    return { page, y: row[0].y, size, cells: cells.map((c) => c.replace(/\s+/g, ' ').trim()), xs }
  })
}

const BULLET = /^[•◦▪‣∙·–-]\s+/
const NUMBERED = /^\d{1,2}[.)]\s+/

function buildContent(lines: Line[]): JSONContent[] {
  if (!lines.length) return []
  // Fließtext-Größe: die Schriftgröße mit den meisten Zeichen
  const weight = new Map<number, number>()
  for (const l of lines) {
    const k = Math.round(l.size * 2) / 2
    weight.set(k, (weight.get(k) ?? 0) + l.cells.join('').length)
  }
  const body = [...weight].sort((a, b) => b[1] - a[1])[0][0]
  const headingLevel = (size: number) => (size >= body * 1.6 ? 1 : size >= body * 1.3 ? 2 : size >= body * 1.12 ? 3 : 0)

  const out: JSONContent[] = []
  let para: string[] = []
  let paraLevel = 0
  let list: { ordered: boolean; items: string[] } | null = null
  let table: string[][] | null = null
  let tableXs: number[] = []

  const flushPara = () => {
    if (!para.length) return
    const text = joinLines(para)
    out.push(
      paraLevel
        ? { type: 'heading', attrs: { level: paraLevel }, content: [{ type: 'text', text }] }
        : { type: 'paragraph', content: [{ type: 'text', text }] },
    )
    para = []
  }
  const flushList = () => {
    if (!list) return
    out.push({
      type: list.ordered ? 'orderedList' : 'bulletList',
      content: list.items.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
    })
    list = null
  }
  const flushTable = () => {
    if (!table) return
    if (table.length < 2) {
      // Eine einzelne Zeile mit Lücken ist eher Text als eine Tabelle
      para = [table[0].join('   ')]
      paraLevel = 0
      table = null
      flushPara()
      return
    }
    const cols = Math.max(...table.map((r) => r.length))
    const cell = (type: string, text: string): JSONContent => ({
      type,
      content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
    })
    out.push({
      type: 'table',
      attrs: { caption: '' },
      content: table.map((r, i) => ({
        type: 'tableRow',
        content: Array.from({ length: cols }, (_, c) => cell(i === 0 ? 'tableHeader' : 'tableCell', r[c] ?? '')),
      })),
    })
    table = null
  }
  const flushAll = () => {
    flushPara()
    flushList()
    flushTable()
  }

  let prev: Line | null = null
  for (const line of lines) {
    // Über einen Seitenwechsel hinweg darf ein Absatz weiterlaufen
    const samePage = !!prev && prev.page === line.page
    const gap = prev && samePage ? prev.y - line.y : 0
    const newBlock = !prev || (samePage && gap > Math.max(prev.size, line.size) * 1.65)
    const level = headingLevel(line.size)

    if (table && newBlock && gap > line.size * 3) flushTable()
    // Zeilen mit leeren Zellen haben nur ein Textstück; passen sie zu den Spalten der
    // laufenden Tabelle, gehören sie trotzdem dazu
    const fitsTable =
      !!table && samePage && line.cells.every((c) => c.length <= 40) && (line.cells.length >= 2 || level === 0)
    if (line.cells.length >= 2 || fitsTable) {
      flushPara()
      flushList()
      if (!table) {
        table = [line.cells]
        tableXs = line.xs
      } else {
        const row: string[] = Array.from({ length: tableXs.length }, () => '')
        line.cells.forEach((c, i) => {
          const col = columnOf(tableXs, line.xs[i], line.size)
          row[col] = row[col] ? `${row[col]} ${c}` : c
        })
        if (table.length === 1 && gap < line.size * 1.8) {
          // zweite Zeile der Kopfzeile, z. B. die Einheit unter dem Spaltennamen
          table[0] = table[0].map((h, i) => (row[i] ? `${h} ${row[i]}` : h))
        } else table.push(row)
      }
      prev = line
      continue
    }
    flushTable()

    const text = line.cells[0]
    const bullet = BULLET.test(text)
    const numbered = NUMBERED.test(text)
    if (!level && (bullet || numbered)) {
      flushPara()
      const ordered = numbered && !bullet
      if (list && (list.ordered !== ordered || (newBlock && gap > line.size * 3))) flushList()
      ;(list ??= { ordered, items: [] }).items.push(text.replace(bullet ? BULLET : NUMBERED, ''))
    } else if (list && !level && !newBlock) {
      // Fortsetzungszeile eines Listenpunkts
      const items = list.items
      items[items.length - 1] = joinLines([items[items.length - 1], text])
    } else {
      flushList()
      if (para.length && (newBlock || level !== paraLevel)) flushPara()
      if (!para.length) paraLevel = level
      para.push(text)
    }
    prev = line
  }
  flushAll()
  return dropChartLabels(out)
}

const NUMBER = /^[-−+]?\d[\d.,\s]*$/

/**
 * Diagramme fremder PDFs kommen nur als lose Achsenbeschriftungen an (eine Zahl je Zeile oder
 * eine Zeile voller Zahlen). Diese Reste werden entfernt, damit das Dokument lesbar bleibt.
 */
function dropChartLabels(blocks: JSONContent[]) {
  const text = (n: JSONContent): string => n.text ?? (n.content ?? []).map(text).join(' ')
  const isNumberPara = (n: JSONContent) => n.type === 'paragraph' && NUMBER.test(text(n).trim())
  const isAxisTable = (n: JSONContent) =>
    n.type === 'table' && (n.content?.[0]?.content ?? []).every((c) => NUMBER.test(text(c).trim()) || !text(c).trim())
  const keep = blocks.map(() => true)
  // eine Zeile aus mehreren Spalten, die meisten davon Zahlen (Beschriftung der x-Achse)
  const isAxisLine = (n: JSONContent) => {
    if (n.type !== 'paragraph') return false
    const parts = text(n).split(/\s{3,}/)
    return parts.length >= 3 && parts.filter((t) => NUMBER.test(t.trim())).length >= parts.length - 1
  }
  blocks.forEach((n, i) => {
    if (isAxisTable(n) || isAxisLine(n)) keep[i] = false
  })
  for (let i = 0; i < blocks.length; ) {
    let j = i
    while (j < blocks.length && isNumberPara(blocks[j])) j++
    if (j - i >= 3) for (let k = i; k < j; k++) keep[k] = false
    i = Math.max(j, i + 1)
  }
  return blocks.filter((_, i) => keep[i])
}

/** Spalte, in die ein Textstück an Position x gehört (Spaltenanfänge aus der Kopfzeile). */
function columnOf(xs: number[], x: number, size: number) {
  let col = 0
  for (let i = 0; i < xs.length; i++) if (xs[i] - size * 2 <= x) col = i
  return col
}

/** Fügt umbrochene Zeilen wieder zusammen und entfernt Trennstriche am Zeilenende. */
function joinLines(lines: string[]) {
  return lines.reduce((acc, l) => {
    if (!acc) return l
    if (/[a-zäöüß]-$/.test(acc) && /^[a-zäöüß]/.test(l)) return acc.slice(0, -1) + l
    return `${acc} ${l}`
  }, '')
}
