import { Table, updateColumns } from '@tiptap/extension-table'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import type { NodeView, ViewMutationRecord } from '@tiptap/pm/view'
import { contentWidth } from '../lib/insertPosition'
import { moveBlock } from '../lib/moveBlock'
import {
  DEFAULT_TABLE,
  MIN_COL_WIDTH,
  columnWidths,
  measureColumns,
  normalizeTable,
  scaleWidths,
  setColumnWidths,
  type TableAttrs,
} from '../lib/tableModel'

/** Attribut, das im HTML als data-… mitgeschrieben wird (für Kopieren/Einfügen). */
function attr<T>(name: string, def: T, parse: (v: string) => T = (v) => v as unknown as T) {
  return {
    default: def,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute(`data-${name}`)
      return v === null ? def : parse(v)
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const key = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
      return attrs[key] === def ? {} : { [`data-${name}`]: String(attrs[key]) }
    },
  }
}

/**
 * Tabelle wie im Textprogramm, aber mit Eigenschaften wie beim Diagramm:
 * verschiebbar (Griff oben links), Größe änderbar (Griff unten rechts),
 * Linien, Farben, Beschriftung und Einheiten über die Seitenleiste.
 */
export const LabTable = Table.extend({
  addAttributes() {
    const d = DEFAULT_TABLE
    return {
      ...this.parent?.(),
      offsetX: attr('offset-x', d.offsetX, Number),
      caption: attr('caption', d.caption),
      captionPosition: attr('caption-position', d.captionPosition),
      borders: attr('borders', d.borders),
      borderColor: attr('border-color', d.borderColor),
      borderWidth: attr('border-width', d.borderWidth, Number),
      headerBg: attr('header-bg', d.headerBg),
      striped: attr('striped', d.striped, (v) => v === 'true'),
      stripeColor: attr('stripe-color', d.stripeColor),
      rowHeight: attr('row-height', d.rowHeight, Number),
      fontSize: attr('font-size', d.fontSize, Number),
      unitStyle: attr('unit-style', d.unitStyle),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new LabTableView(node, this.options.cellMinWidth, editor, getPos)
  },
})

class LabTableView implements NodeView {
  node: PMNode
  dom: HTMLDivElement
  frame: HTMLDivElement
  table: HTMLTableElement
  colgroup: HTMLTableColElement
  contentDOM: HTMLTableSectionElement
  caption: HTMLDivElement
  grip: HTMLDivElement
  handle: HTMLDivElement
  badge: HTMLDivElement
  private selected = false
  private busy = false
  private cellMinWidth: number
  private editor: Editor
  private getPos: () => number | undefined

  constructor(node: PMNode, cellMinWidth: number, editor: Editor, getPos: () => number | undefined) {
    this.node = node
    this.cellMinWidth = cellMinWidth
    this.editor = editor
    this.getPos = getPos
    this.dom = document.createElement('div')
    this.caption = document.createElement('div')
    this.caption.className = 'table-caption'
    this.caption.contentEditable = 'false'
    this.frame = this.dom.appendChild(document.createElement('div'))
    this.frame.className = 'lab-table-frame'
    this.table = this.frame.appendChild(document.createElement('table'))
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    this.grip = this.frame.appendChild(document.createElement('div'))
    this.grip.className = 'table-grip'
    this.grip.title = 'Ziehen zum Verschieben · Klicken zum Auswählen'
    this.grip.textContent = '✥'
    this.grip.contentEditable = 'false'

    this.handle = this.frame.appendChild(document.createElement('div'))
    this.handle.className = 'resize-handle'
    this.handle.title = 'Ziehen zum Vergrößern'
    this.handle.contentEditable = 'false'

    this.badge = document.createElement('div')
    this.badge.className = 'size-badge'
    this.badge.contentEditable = 'false'

    this.setupMove()
    this.setupResize()
    this.apply()
  }

  private get attrs(): TableAttrs {
    return normalizeTable(this.node.attrs)
  }

  /** Aussehen aus den Eigenschaften der Tabelle übernehmen. */
  private apply() {
    const a = this.attrs
    this.dom.className = [
      'lab-table',
      `borders-${a.borders}`,
      a.striped ? 'striped' : '',
      this.selected ? 'selected' : '',
    ].filter(Boolean).join(' ')
    const s = this.dom.style
    s.marginLeft = `${a.offsetX}px`
    s.setProperty('--tbl-line', a.borderColor)
    s.setProperty('--tbl-line-w', `${a.borderWidth}px`)
    s.setProperty('--tbl-head', a.headerBg || 'transparent')
    s.setProperty('--tbl-stripe', a.stripeColor)
    s.setProperty('--tbl-row-h', a.rowHeight ? `${a.rowHeight}px` : 'auto')
    s.setProperty('--tbl-font', a.fontSize ? `${a.fontSize}pt` : 'inherit')

    updateColumns(this.node, this.colgroup, this.table, this.cellMinWidth)
    const widths = columnWidths(this.node)
    s.width = widths ? `${widths.reduce((x, y) => x + y, 0)}px` : ''

    // Beschriftung über oder unter der Tabelle, „Tabelle 1:“ fett
    const text = a.caption.trim()
    if (text) {
      const i = text.indexOf(':')
      this.caption.replaceChildren()
      if (i > 0) {
        const b = document.createElement('b')
        b.textContent = text.slice(0, i + 1)
        this.caption.append(b, text.slice(i + 1))
      } else {
        this.caption.textContent = text
      }
      this.caption.classList.toggle('below', a.captionPosition === 'below')
      if (a.captionPosition === 'below') this.dom.append(this.caption)
      else this.dom.prepend(this.caption)
    } else {
      this.caption.remove()
    }
  }

  private pos() {
    const p = this.getPos()
    return typeof p === 'number' ? p : null
  }

  private select() {
    const pos = this.pos()
    if (pos === null) return
    const { state, view } = this.editor
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
  }

  /** Verschieben am Griff oben links: wie beim Diagramm. */
  private setupMove() {
    let start: { x: number; y: number; top: number } | null = null
    let delta: { dx: number; dy: number } | null = null
    const g = this.grip
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      this.select()
      g.setPointerCapture(e.pointerId)
      start = { x: e.clientX, y: e.clientY, top: this.dom.getBoundingClientRect().top }
      delta = null
    })
    g.addEventListener('pointermove', (e) => {
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!delta && Math.hypot(dx, dy) < 4) return
      delta = { dx, dy }
      this.dom.classList.add('moving')
      this.dom.style.transform = `translate(${dx}px, ${dy}px)`
    })
    const end = (e: PointerEvent) => {
      if (!start) return
      const s = start
      const d = delta
      start = null
      delta = null
      if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId)
      this.dom.classList.remove('moving')
      this.dom.style.transform = ''
      const pos = this.pos()
      if (!d || pos === null || e.type === 'pointercancel') return
      moveBlock(this.editor, pos, this.table.getBoundingClientRect().width, d.dx, d.dy, s.top)
    }
    g.addEventListener('pointerup', end)
    g.addEventListener('pointercancel', end)
  }

  /** Größe ändern am Griff unten rechts: Spalten wachsen gleichmäßig mit, die Höhe ergibt die Zeilenhöhe. */
  private setupResize() {
    let start: { x: number; y: number; w: number; h: number; widths: number[]; rows: number; maxW: number } | null = null
    let live: { w: number; h: number } | null = null
    const h = this.handle
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      const pos = this.pos()
      if (pos === null) return
      e.preventDefault()
      e.stopPropagation()
      h.setPointerCapture(e.pointerId)
      const box = this.table.getBoundingClientRect()
      start = {
        x: e.clientX,
        y: e.clientY,
        w: box.width,
        h: box.height,
        widths: measureColumns(this.editor.view, pos, this.node),
        rows: this.node.childCount,
        maxW: contentWidth(this.editor.view.dom) - this.attrs.offsetX,
      }
      live = { w: box.width, h: box.height }
      this.busy = true
      this.dom.classList.add('resizing')
      this.frame.append(this.badge)
    })
    h.addEventListener('pointermove', (e) => {
      if (!start) return
      const minW = MIN_COL_WIDTH * start.widths.length
      const w = Math.min(Math.max(start.w + e.clientX - start.x, minW), Math.max(minW, start.maxW))
      const hh = Math.max(start.rows * 20, start.h + e.clientY - start.y)
      live = { w, h: hh }
      // nur vorläufig zeichnen, gespeichert wird beim Loslassen
      const widths = scaleWidths(start.widths, w)
      Array.from(this.colgroup.children).forEach((col, i) => {
        ;(col as HTMLElement).style.width = `${widths[i] ?? MIN_COL_WIDTH}px`
      })
      this.table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`
      this.dom.style.width = this.table.style.width
      if (Math.abs(e.clientY - start.y) > 3) this.dom.style.setProperty('--tbl-row-h', `${Math.round(hh / start.rows)}px`)
      this.badge.textContent = `${Math.round(w)} × ${Math.round(hh)} px`
    })
    const end = (e: PointerEvent) => {
      if (!start || !live) return
      const s = start
      const l = live
      start = null
      live = null
      this.busy = false
      if (h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId)
      this.dom.classList.remove('resizing')
      this.badge.remove()
      const pos = this.pos()
      if (pos === null || e.type === 'pointercancel') return this.apply()
      const { state, view } = this.editor
      const tr = setColumnWidths(state.tr, pos, scaleWidths(s.widths, l.w))
      if (Math.abs(l.h - s.h) > 3) {
        const node = tr.doc.nodeAt(pos)!
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, rowHeight: Math.round(l.h / s.rows) })
      }
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      view.dispatch(tr)
    }
    h.addEventListener('pointerup', end)
    h.addEventListener('pointercancel', end)
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    if (!this.busy) this.apply()
    return true
  }

  selectNode() {
    this.selected = true
    this.dom.classList.add('selected')
  }

  deselectNode() {
    this.selected = false
    this.dom.classList.remove('selected')
  }

  stopEvent(event: Event) {
    const t = event.target as Node | null
    return !!t && (this.grip.contains(t) || this.handle.contains(t))
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    if (mutation.type === 'selection') return false
    return !this.contentDOM.contains(mutation.target as Node)
  }
}
