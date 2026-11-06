import type { Editor, JSONContent } from '@tiptap/react'
import { DEFAULT_CHART, defaultAxis, normalizeChart, snapChartSize, type ChartBackground } from './chartModel'
import { contentWidth } from './insertPosition'
import { MM } from './print'
import { BOTTOM_RESERVE_MM, freeSpaceAt, pageInfo, relayout } from '../extensions/PageLayout'

/** Abstand ober- und unterhalb eines Diagramms (12 pt, siehe index.css). */
const CHART_MARGIN_PX = 16
/** Ein Diagramm wird höchstens so stark verkleinert, damit es noch auf die Seite passt. */
const MAX_SHRINK = 0.75

/**
 * Werkzeuge, mit denen Claude das Dokument liest und Inhalte einfügt.
 * Alles wird hinter dem Absatz eingefügt, in dem der Cursor steht; mehrere
 * Einfügungen in einer Antwort landen der Reihe nach untereinander.
 */
export class DocumentTools {
  private pos: number | null = null
  private editor: Editor

  constructor(editor: Editor) {
    this.editor = editor
  }

  /** Startpunkt für eine neue Chat-Anfrage festlegen (hinter dem aktuellen Absatz). */
  begin() {
    const { state } = this.editor
    const $to = state.doc.resolve(state.selection.to)
    this.pos = $to.depth >= 1 ? $to.after(1) : state.selection.to
  }

  /** Fügt ein und gibt die Position des ersten eingefügten Blocks zurück. */
  private async insert(content: JSONContent[]) {
    const before = this.editor.state.doc.content.size
    const pos = Math.min(this.pos ?? before, before)
    this.editor.chain().insertContentAt(pos, content).run()
    this.pos = pos + (this.editor.state.doc.content.size - before)
    // Diagramme werden von React erst kurz danach gezeichnet. Danach die Seitenaufteilung
    // aktualisieren, damit die Rückmeldung und die nächste Einfügung mit echten Größen rechnen.
    await new Promise((r) => setTimeout(r, 30))
    relayout(this.editor.view)
    return pos
  }

  private nextPos() {
    const size = this.editor.state.doc.content.size
    return Math.min(this.pos ?? size, size)
  }

  /** Kurzer Hinweis für Claude, wo der Block gelandet ist (hilft beim Planen der nächsten Einfügung). */
  private where(pos: number) {
    const info = pageInfo(this.editor.view, pos)
    if (!info) return ''
    const free = Math.max(0, Math.round(info.freeBelowMm / 10))
    const start = info.topMm < 1 && info.page > 1 ? ' (oben auf der Seite, weil es auf der vorigen nicht mehr ganz Platz hatte)' : ''
    return ` Steht auf Seite ${info.page}${start}; darunter sind auf dieser Seite noch etwa ${free} cm frei.`
  }

  /** Führt ein Werkzeug anhand seines Namens aus (für Claude-Chat und Claude Desktop). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async run(name: string, input: any): Promise<string> {
    switch (name) {
      case 'get_document':
        return this.getDocument()
      case 'insert_table':
        return this.insertTable(input)
      case 'insert_chart':
        return this.insertChart(input)
      case 'insert_text':
        return this.insertText(input)
      default:
        throw new Error(`Unbekanntes Werkzeug: ${name}`)
    }
  }

  getDocument(): string {
    const lines: string[] = []
    let page = 1
    this.editor.state.doc.forEach((node, pos) => {
      // Seitenwechsel markieren, damit Claude die Aufteilung planen kann
      const info = pageInfo(this.editor.view, pos)
      if (info && info.page > page) {
        page = info.page
        lines.push(`--- Seite ${page} ---`)
      }
      switch (node.type.name) {
        case 'heading':
          lines.push(`${'#'.repeat(node.attrs.level)} ${node.textContent}`)
          break
        case 'table':
          if (node.attrs.caption) lines.push(String(node.attrs.caption))
          node.forEach((row) => {
            const cells: string[] = []
            row.forEach((cell) => cells.push(cell.textContent.replace(/\|/g, '/')))
            lines.push(`| ${cells.join(' | ')} |`)
          })
          break
        case 'chart': {
          const a = node.attrs
          const ax = a.axes ?? DEFAULT_CHART.axes
          lines.push(`[Diagramm: x = ${ax.x.label} ${ax.x.unit}, y = ${ax.y.label} ${ax.y.unit}]`)
          break
        }
        case 'bulletList':
        case 'orderedList':
          node.forEach((item) => lines.push(`- ${item.textContent}`))
          break
        default:
          if (node.textContent) lines.push(node.textContent)
      }
    })
    return lines.join('\n') || '(Das Dokument ist leer.)'
  }

  async insertTable(input: { caption: string; headers: string[]; rows: string[][] }) {
    input = { caption: input.caption ?? '', headers: input.headers ?? [], rows: input.rows ?? [] }
    const cols = Math.max(input.headers.length, ...input.rows.map((r) => r.length), 1)
    const cell = (type: 'tableHeader' | 'tableCell', text: string): JSONContent => ({
      type,
      content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
    })
    const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => String(r[i] ?? ''))
    const table: JSONContent = {
      type: 'table',
      // Die Beschriftung gehört zur Tabelle und wandert beim Verschieben mit
      attrs: { caption: (input.caption ?? '').trim() },
      content: [
        { type: 'tableRow', content: pad(input.headers).map((t) => cell('tableHeader', t)) },
        ...input.rows.map((r) => ({ type: 'tableRow', content: pad(r).map((t) => cell('tableCell', t)) })),
      ],
    }
    const pos = await this.insert([table])
    return `Tabelle mit ${cols} Spalten und ${input.rows.length} Zeilen eingefügt.${this.where(pos)}`
  }

  async insertChart(input: {
    x_label: string
    x_unit: string
    x_start: number
    x_max: number
    y_label: string
    y_unit: string
    y_start: number
    y_max: number
    background: ChartBackground
    width: number
    height: number
  }) {
    const maxW = contentWidth(this.editor.view.dom)
    let width = Math.round(Math.min(Math.max(input.width || 400, 120), maxW))
    let height = Math.round(Math.min(Math.max(input.height || 300, 120), 900))
    const axis = (label: string, unit: string, start: number, max: number) => ({
      ...defaultAxis(label),
      unit,
      start: Number(start) || 0,
      max: Number(max) || 100,
      auto: true,
    })
    const attrs = {
      ...DEFAULT_CHART,
      width,
      height,
      offsetX: 0,
      background: input.background ?? 'grid',
      axes: {
        x: axis(input.x_label, input.x_unit, input.x_start, input.x_max),
        y: axis(input.y_label, input.y_unit, input.y_start, input.y_max),
        y2: DEFAULT_CHART.axes.y2,
      },
    }

    // Passt das Diagramm nur knapp nicht mehr auf die Seite, etwas kleiner machen statt eine
    // halbe Seite leer zu lassen. Sonst rutscht es auf die nächste Seite (PageLayout).
    let shrunk = false
    const free = freeSpaceAt(this.editor.view, this.nextPos()).freeMm * MM - BOTTOM_RESERVE_MM * MM - 2 * CHART_MARGIN_PX
    const snapped = (w: number, h: number) => snapChartSize(normalizeChart({ ...attrs, width: w, height: h }), w, h, maxW)
    if (snapped(width, height).height > free && free >= 150 && free >= height * MAX_SHRINK) {
      const w = Math.round((width * free) / height) // Seitenverhältnis beibehalten
      let h = Math.floor(free)
      while (h > 120 && snapped(w, h).height > free) h -= 4
      const s = snapped(w, h)
      if (s.height <= free) {
        width = s.width
        height = s.height
        shrunk = true
      }
    }

    const pos = await this.insert([{ type: 'chart', attrs: { ...attrs, width, height } }])
    return `Diagrammfeld eingefügt (${width} × ${height} px)${shrunk ? ', etwas verkleinert, damit es noch auf die Seite passt' : ''}.${this.where(pos)}`
  }

  async insertText(input: { blocks: { style: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bullet'; text: string }[] }) {
    const content: JSONContent[] = []
    let bullets: JSONContent[] = []
    const flush = () => {
      if (bullets.length) content.push({ type: 'bulletList', content: bullets })
      bullets = []
    }
    for (const b of input.blocks) {
      const text = b.text ? [{ type: 'text', text: b.text }] : []
      if (b.style === 'bullet') {
        bullets.push({ type: 'listItem', content: [{ type: 'paragraph', content: text }] })
        continue
      }
      flush()
      if (b.style.startsWith('heading')) {
        content.push({ type: 'heading', attrs: { level: Number(b.style.slice(-1)) }, content: text })
      } else {
        content.push({ type: 'paragraph', content: text })
      }
    }
    flush()
    if (!content.length) return 'Nichts eingefügt.'
    await this.insert(content)
    return `${input.blocks.length} Textblöcke eingefügt.`
  }
}
