import type { Editor, JSONContent } from '@tiptap/react'
import { DEFAULT_CHART, defaultAxis, type ChartBackground } from './chartModel'
import { contentWidth } from './insertPosition'

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

  private insert(content: JSONContent[]) {
    const before = this.editor.state.doc.content.size
    const pos = Math.min(this.pos ?? before, before)
    this.editor.chain().insertContentAt(pos, content).run()
    this.pos = pos + (this.editor.state.doc.content.size - before)
  }

  getDocument(): string {
    const lines: string[] = []
    this.editor.state.doc.forEach((node) => {
      switch (node.type.name) {
        case 'heading':
          lines.push(`${'#'.repeat(node.attrs.level)} ${node.textContent}`)
          break
        case 'table':
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

  insertTable(input: { caption: string; headers: string[]; rows: string[][] }) {
    const cols = Math.max(input.headers.length, ...input.rows.map((r) => r.length), 1)
    const cell = (type: 'tableHeader' | 'tableCell', text: string): JSONContent => ({
      type,
      content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
    })
    const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => String(r[i] ?? ''))
    const table: JSONContent = {
      type: 'table',
      content: [
        { type: 'tableRow', content: pad(input.headers).map((t) => cell('tableHeader', t)) },
        ...input.rows.map((r) => ({ type: 'tableRow', content: pad(r).map((t) => cell('tableCell', t)) })),
      ],
    }
    const content: JSONContent[] = []
    if (input.caption.trim()) {
      content.push({ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: input.caption.trim() }] })
    }
    content.push(table)
    this.insert(content)
    return `Tabelle mit ${cols} Spalten und ${input.rows.length} Zeilen eingefügt.`
  }

  insertChart(input: {
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
    const width = Math.round(Math.min(Math.max(input.width || 400, 120), maxW))
    const height = Math.round(Math.min(Math.max(input.height || 300, 120), 900))
    const axis = (label: string, unit: string, start: number, max: number) => ({
      ...defaultAxis(label),
      unit,
      start: Number(start) || 0,
      max: Number(max) || 100,
      auto: true,
    })
    this.insert([
      {
        type: 'chart',
        attrs: {
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
        },
      },
    ])
    return 'Diagrammfeld eingefügt.'
  }

  insertText(input: { blocks: { style: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bullet'; text: string }[] }) {
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
    this.insert(content)
    return `${input.blocks.length} Textblöcke eingefügt.`
  }
}
