import type { Editor, JSONContent } from '@tiptap/react'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { DEFAULT_CHART, defaultAxis, normalizeChart, snapChartSize, type ChartBackground } from './chartModel'
import { contentWidth } from './insertPosition'
import { MM } from './print'
import { BOTTOM_RESERVE_MM, freeSpaceAt, pageInfo, relayout } from '../extensions/PageLayout'

/** Abstand ober- und unterhalb eines Diagramms (12 pt, siehe index.css). */
const CHART_MARGIN_PX = 16
/** Ein Diagramm wird höchstens so stark verkleinert, damit es noch auf die Seite passt. */
const MAX_SHRINK = 0.75

type TextBlock = { style: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bullet'; text: string }

/**
 * Werkzeuge, mit denen Claude das Dokument liest, Inhalte einfügt und vorhandene
 * Inhalte löscht, ersetzt oder verschiebt.
 * Eingefügt wird hinter dem Absatz, in dem der Cursor steht (oder hinter einem
 * angegebenen Block); mehrere Einfügungen landen der Reihe nach untereinander.
 *
 * get_document nummeriert die Blöcke ([1], [2], …). Die Nummern bleiben gültig,
 * bis get_document das nächste Mal aufgerufen wird, auch wenn zwischendurch
 * Blöcke gelöscht, eingefügt oder verschoben werden. So kann Claude in einer
 * Antwort mehrere Änderungen mit den Nummern aus demselben Stand planen.
 */
export class DocumentTools {
  private pos: number | null = null
  private editor: Editor
  /** Startpositionen der Blöcke beim letzten get_document (null = gelöscht). */
  private blocks: (number | null)[] = []
  /** after-Wert der letzten Einfügung dieser Folge (siehe placeAfter). */
  private anchor: number | null = null

  constructor(editor: Editor) {
    this.editor = editor
    // Positionen bei jeder Änderung nachführen, auch bei Eingaben der Person
    editor.on('transaction', ({ transaction }) => this.track(transaction))
  }

  private track(tr: Transaction) {
    if (!tr.docChanged) return
    this.blocks = this.blocks.map((p) => {
      if (p == null) return null
      const r = tr.mapping.mapResult(p, 1)
      return r.deletedAfter ? null : r.pos
    })
    if (this.pos != null) this.pos = tr.mapping.map(this.pos, 1)
  }

  /** Block mit der Nummer aus get_document suchen. */
  private block(n: unknown): { node: PMNode; pos: number } {
    const i = Number(n)
    if (!Number.isInteger(i) || i < 1 || i > this.blocks.length) {
      throw new Error(`Block ${String(n)} gibt es nicht. Erlaubt sind die Nummern 1 bis ${this.blocks.length} aus get_document.`)
    }
    const pos = this.blocks[i - 1]
    const node = pos == null ? null : this.editor.state.doc.nodeAt(pos)
    if (pos == null || !node) throw new Error(`Block ${i} wurde schon gelöscht oder ersetzt.`)
    return { node, pos }
  }

  private dispatch(tr: Transaction) {
    this.editor.view.dispatch(tr)
    relayout(this.editor.view)
  }

  /** Startpunkt für eine neue Chat-Anfrage festlegen (hinter dem aktuellen Absatz). */
  begin() {
    const { state } = this.editor
    const $to = state.doc.resolve(state.selection.to)
    this.pos = $to.depth >= 1 ? $to.after(1) : state.selection.to
    this.anchor = null
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
      case 'delete_blocks':
        return this.deleteBlocks(input)
      case 'replace_block':
        return this.replaceBlock(input)
      case 'move_blocks':
        return this.moveBlocks(input)
      case 'replace_text':
        return this.replaceText(input)
      default:
        throw new Error(`Unbekanntes Werkzeug: ${name}`)
    }
  }

  getDocument(): string {
    const lines: string[] = []
    let page = 1
    this.blocks = []
    this.editor.state.doc.forEach((node, pos) => {
      // Seitenwechsel markieren, damit Claude die Aufteilung planen kann
      const info = pageInfo(this.editor.view, pos)
      if (info && info.page > page) {
        page = info.page
        lines.push(`--- Seite ${page} ---`)
      }
      this.blocks.push(pos)
      const own = describe(node)
      own[0] = `[${this.blocks.length}] ${own[0]}`
      lines.push(...own)
    })
    return lines.join('\n') || '(Das Dokument ist leer.)'
  }

  /** Einfügeposition auf „hinter Block n“ setzen (0 = Anfang des Dokuments). */
  /**
   * Einfügestelle aus `after` bestimmen. Gibt einen Hinweis für die Rückmeldung zurück,
   * wenn `after` nicht wörtlich befolgt wurde.
   *
   * Claude gibt `after` oft bei mehreren Einfügungen einer Folge mit derselben Nummer an
   * oder verweist auf einen Block, der vorher in derselben Antwort gelöscht wurde. Beides
   * soll nicht dazu führen, dass Inhalte in umgekehrter Reihenfolge landen oder die
   * Einfügung (z. B. eines Diagramms) ganz ausfällt: dann geht es an der laufenden Stelle
   * unter der vorigen Einfügung weiter.
   */
  private placeAfter(after: unknown): string {
    if (after === undefined || after === null || after === '') return ''
    const n = Number(after)
    // Dieselbe Nummer wie bei der vorigen Einfügung: darunter weitermachen
    if (this.anchor !== null && n === this.anchor && this.pos != null) return ''
    if (n === 0) {
      this.pos = 0
      this.anchor = 0
      return ''
    }
    try {
      const { node, pos } = this.block(after)
      this.pos = pos + node.nodeSize
      this.anchor = n
      return ''
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      return ` Hinweis: ${why} Deshalb unter der vorigen Einfügung eingefügt.`
    }
  }

  async deleteBlocks(input: { blocks: number[] }) {
    const nums = [...new Set((input.blocks ?? []).map(Number))]
    if (!nums.length) return 'Nichts gelöscht.'
    const found = nums.map((n) => this.block(n)).sort((a, b) => b.pos - a.pos)
    const { state } = this.editor
    const tr = state.tr
    if (found.length === state.doc.childCount) {
      // Ein Dokument braucht mindestens einen Absatz
      tr.replaceWith(0, state.doc.content.size, state.schema.nodes.paragraph.create())
    } else {
      for (const b of found) tr.delete(b.pos, b.pos + b.node.nodeSize)
    }
    this.dispatch(tr)
    return `${found.length} Block/Blöcke gelöscht (${nums.join(', ')}). Die übrigen Nummern bleiben gültig.`
  }

  async replaceBlock(input: { block: number; blocks: TextBlock[] }) {
    const { node, pos } = this.block(input.block)
    const content = textContent(input.blocks ?? [])
    const { state } = this.editor
    const tr = state.tr
    if (content.length) {
      const nodes = content.map((c) => state.schema.nodeFromJSON(c))
      tr.replaceWith(pos, pos + node.nodeSize, Fragment.from(nodes))
    } else {
      tr.delete(pos, pos + node.nodeSize)
    }
    this.dispatch(tr)
    // Die Nummer zeigt danach auf den ersten neuen Block
    if (content.length) this.blocks[Number(input.block) - 1] = pos
    return content.length ? `Block ${input.block} ersetzt.` : `Block ${input.block} gelöscht.`
  }

  async moveBlocks(input: { blocks: number[]; after: number }) {
    const nums = [...new Set((input.blocks ?? []).map(Number))]
    if (!nums.length) return 'Nichts verschoben.'
    if (nums.includes(Number(input.after))) throw new Error('Ein Block kann nicht hinter sich selbst verschoben werden.')
    const moved = nums.map((n) => ({ n, ...this.block(n) }))
    const target = Number(input.after) === 0 ? 0 : (() => {
      const t = this.block(input.after)
      return t.pos + t.node.nodeSize
    })()
    const tr = this.editor.state.tr
    for (const b of [...moved].sort((a, c) => c.pos - a.pos)) tr.delete(b.pos, b.pos + b.node.nodeSize)
    const at = tr.mapping.map(target, -1)
    tr.insert(at, Fragment.from(moved.map((b) => b.node)))
    this.dispatch(tr)
    // Verschobene Blöcke behalten ihre Nummern
    let p = at
    for (const b of moved) {
      this.blocks[b.n - 1] = p
      p += b.node.nodeSize
    }
    return `Block/Blöcke ${nums.join(', ')} ${Number(input.after) === 0 ? 'an den Anfang' : `hinter Block ${input.after}`} verschoben. Die Nummern bleiben gültig.`
  }

  async replaceText(input: { find: string; replace: string; block?: number }) {
    const find = String(input.find ?? '')
    const replace = String(input.replace ?? '')
    if (!find) throw new Error('find darf nicht leer sein.')
    const { doc } = this.editor.state
    let from = 0
    let to = doc.content.size
    if (input.block !== undefined && input.block !== null) {
      const b = this.block(input.block)
      from = b.pos
      to = b.pos + b.node.nodeSize
    }
    const ranges: [number, number][] = []
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true
      // Text des Absatzes mit den Positionen jedes Zeichens; andere Inline-Knoten trennen
      let text = ''
      const at: number[] = []
      node.forEach((child, offset) => {
        const start = pos + 1 + offset
        if (child.isText) {
          for (let i = 0; i < child.text!.length; i++) at.push(start + i)
          text += child.text
        } else {
          at.push(start)
          text += '\uFFFC'
        }
      })
      for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + find.length)) {
        ranges.push([at[i], at[i + find.length - 1] + 1])
      }
      return false
    })
    if (!ranges.length) return `„${find}“ kommt ${input.block ? `in Block ${input.block} ` : ''}nicht vor. Nichts geändert.`
    const tr = this.editor.state.tr
    for (const [a, b] of ranges.reverse()) {
      if (replace) tr.insertText(replace, a, b)
      else tr.delete(a, b)
    }
    this.dispatch(tr)
    return `${ranges.length}× ersetzt.`
  }

  async insertTable(input: { caption: string; headers: string[]; rows: string[][]; after?: number }) {
    const note = this.placeAfter(input.after)
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
    return `Tabelle mit ${cols} Spalten und ${input.rows.length} Zeilen eingefügt.${this.where(pos)}${note}`
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
    after?: number
  }) {
    const note = this.placeAfter(input.after)
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
    return `Diagrammfeld eingefügt (${width} × ${height} px)${shrunk ? ', etwas verkleinert, damit es noch auf die Seite passt' : ''}.${this.where(pos)}${note}`
  }

  async insertText(input: { blocks: TextBlock[]; after?: number }) {
    const note = this.placeAfter(input.after)
    const content = textContent(input.blocks ?? [])
    if (!content.length) return 'Nichts eingefügt.'
    await this.insert(content)
    return `${input.blocks.length} Textblöcke eingefügt.${note}`
  }
}

/** Textblöcke (Absatz, Überschrift, Aufzählungspunkt) in Editor-Inhalt umwandeln. */
function textContent(blocks: TextBlock[]): JSONContent[] {
  const content: JSONContent[] = []
  let bullets: JSONContent[] = []
  const flush = () => {
    if (bullets.length) content.push({ type: 'bulletList', content: bullets })
    bullets = []
  }
  for (const b of blocks) {
    const text = b.text ? [{ type: 'text', text: b.text }] : []
    if (b.style === 'bullet') {
      bullets.push({ type: 'listItem', content: [{ type: 'paragraph', content: text }] })
      continue
    }
    flush()
    if (b.style?.startsWith('heading')) {
      content.push({ type: 'heading', attrs: { level: Number(b.style.slice(-1)) }, content: text })
    } else {
      content.push({ type: 'paragraph', content: text })
    }
  }
  flush()
  return content
}

/** Ein Block als Textzeilen für get_document. */
function describe(node: PMNode): string[] {
  switch (node.type.name) {
    case 'heading':
      return [`${'#'.repeat(node.attrs.level)} ${node.textContent}`]
    case 'table': {
      const lines: string[] = node.attrs.caption ? [String(node.attrs.caption)] : []
      node.forEach((row) => {
        const cells: string[] = []
        row.forEach((cell) => cells.push(cell.textContent.replace(/\|/g, '/')))
        lines.push(`| ${cells.join(' | ')} |`)
      })
      return lines.length ? lines : ['(leere Tabelle)']
    }
    case 'chart': {
      const ax = node.attrs.axes ?? DEFAULT_CHART.axes
      const series = Array.isArray(node.attrs.series) ? (node.attrs.series as { name?: string; points?: unknown[] }[]) : []
      const data = series.length ? `, Messreihen: ${series.map((x) => `${x.name || 'ohne Namen'} (${x.points?.length ?? 0} Punkte)`).join('; ')}` : ''
      return [`[Diagramm: x = ${ax.x.label} ${ax.x.unit}, y = ${ax.y.label} ${ax.y.unit}${data}]`]
    }
    case 'bulletList':
    case 'orderedList': {
      const items: string[] = []
      node.forEach((item) => items.push(`- ${item.textContent}`))
      return items.length ? items : ['(leere Liste)']
    }
    default:
      return [node.textContent || (node.type.name === 'paragraph' ? '(leere Zeile)' : `(${node.type.name})`)]
  }
}
