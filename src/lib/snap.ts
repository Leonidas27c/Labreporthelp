import type { Editor } from '@tiptap/react'
import { contentWidth, insertPosition } from './insertPosition'

/** Ab diesem Abstand (Pixel) rastet ein Feld an einer Linie ein. */
export const SNAP_DISTANCE = 8

export type SnapAlign = 'left' | 'center' | 'right'

interface Line {
  x: number
  /** Seitenrand/Mitte (zählt mehr) oder Kante eines anderen Feldes */
  page: boolean
}

/**
 * Alles, was beim Verschieben oder Vergrößern eines Feldes zum Einrasten
 * gebraucht wird. Einmal beim Start des Ziehens messen, dann nur noch rechnen.
 */
export interface SnapContext {
  contentLeft: number
  contentWidth: number
  pageTop: number
  pageBottom: number
  lines: Line[]
}

/** Felder auf der Seite, an denen andere Felder einrasten können. */
const BLOCKS = ':scope > .chart-node, :scope > .lab-table'

export function snapContext(editor: Editor, self: HTMLElement): SnapContext {
  const page = editor.view.dom as HTMLElement
  const box = page.getBoundingClientRect()
  const contentLeft = box.left + parseFloat(getComputedStyle(page).paddingLeft)
  const maxW = contentWidth(page)
  const lines: Line[] = [
    { x: 0, page: true },
    { x: maxW / 2, page: true },
    { x: maxW, page: true },
  ]
  page.querySelectorAll<HTMLElement>(BLOCKS).forEach((el) => {
    if (el === self || el.contains(self)) return
    const r = el.getBoundingClientRect()
    if (!r.width) return
    const l = r.left - contentLeft
    lines.push({ x: l, page: false }, { x: l + r.width / 2, page: false }, { x: l + r.width, page: false })
  })
  // Hilfslinien nur im sichtbaren Teil der Seite zeichnen (nicht über der Werkzeugleiste)
  let top = Math.max(0, box.top)
  let bottom = Math.min(window.innerHeight, box.bottom)
  for (let el = page.parentElement; el; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY
    if (o === 'auto' || o === 'scroll') {
      const r = el.getBoundingClientRect()
      top = Math.max(top, r.top)
      bottom = Math.min(bottom, r.bottom)
      break
    }
  }
  return { contentLeft, contentWidth: maxW, pageTop: top, pageBottom: bottom, lines }
}

/** Nächste Linie zu einer der Kanten; Seitenlinien gewinnen bei Gleichstand. */
function nearest(ctx: SnapContext, edges: number[], limit: number) {
  let best: { diff: number; page: boolean } | null = null
  for (const line of ctx.lines) {
    for (const e of edges) {
      const diff = line.x - e
      const d = Math.abs(diff)
      if (d > limit) continue
      if (!best || d < Math.abs(best.diff) - 0.5 || (d <= Math.abs(best.diff) + 0.5 && line.page && !best.page)) {
        best = { diff, page: line.page }
      }
    }
  }
  return best
}

/** Linien, an denen eine der Kanten jetzt genau anliegt (zum Anzeigen). */
function touching(ctx: SnapContext, edges: number[]) {
  const xs = new Set<number>()
  for (const line of ctx.lines) if (edges.some((e) => Math.abs(line.x - e) < 0.75)) xs.add(Math.round(line.x * 2) / 2)
  return [...xs]
}

/**
 * Linke Kante `left` (vom linken Seitenrand gemessen) eines Feldes der Breite
 * `width` an Rändern, Seitenmitte und Kanten anderer Felder einrasten.
 */
export function snapMove(ctx: SnapContext, left: number, width: number, enabled = true) {
  const free = Math.max(0, ctx.contentWidth - width)
  let l = Math.min(Math.max(left, 0), free)
  if (enabled) {
    const hit = nearest(ctx, [l, l + width / 2, l + width], SNAP_DISTANCE)
    if (hit) l = Math.min(Math.max(l + hit.diff, 0), free)
  }
  let align: SnapAlign | null = null
  if (l < 0.5) align = 'left'
  else if (Math.abs(l - free / 2) < 0.5) align = 'center'
  else if (Math.abs(l - free) < 0.5) align = 'right'
  return { left: l, align, guides: enabled ? touching(ctx, [l, l + width / 2, l + width]) : [] }
}

/** Rechte Kante beim Vergrößern einrasten (Seitenrand, Kanten anderer Felder). */
export function snapRight(ctx: SnapContext, left: number, right: number, enabled = true) {
  let r = right
  if (enabled) {
    const hit = nearest(ctx, [r], SNAP_DISTANCE)
    if (hit) r += hit.diff
  }
  r = Math.min(r, ctx.contentWidth)
  return { right: r, guides: enabled ? touching(ctx, [r]).filter((x) => x > left + 1) : [] }
}

/**
 * Hilfslinien über der Seite: senkrechte Linien zum Einrasten und eine
 * waagerechte Linie, die zeigt, wo das Feld im Text landet.
 */
export class SnapOverlay {
  private root: HTMLDivElement
  private drop: HTMLDivElement
  private pool: HTMLDivElement[] = []

  private ctx: SnapContext

  constructor(ctx: SnapContext) {
    this.ctx = ctx
    this.root = document.body.appendChild(document.createElement('div'))
    this.root.className = 'snap-overlay'
    this.drop = this.root.appendChild(document.createElement('div'))
    this.drop.className = 'snap-drop'
    this.drop.hidden = true
  }

  guides(xs: number[]) {
    const { ctx } = this
    const top = ctx.pageTop
    const bottom = ctx.pageBottom
    xs.forEach((x, i) => {
      let g = this.pool[i]
      if (!g) {
        g = this.root.appendChild(document.createElement('div'))
        g.className = 'snap-guide'
        this.pool.push(g)
      }
      g.hidden = false
      g.style.left = `${ctx.contentLeft + x}px`
      g.style.top = `${top}px`
      g.style.height = `${Math.max(0, bottom - top)}px`
    })
    for (let i = xs.length; i < this.pool.length; i++) this.pool[i].hidden = true
  }

  dropAt(y: number | null) {
    if (y === null) {
      this.drop.hidden = true
      return
    }
    this.drop.hidden = false
    this.drop.style.left = `${this.ctx.contentLeft}px`
    this.drop.style.width = `${this.ctx.contentWidth}px`
    this.drop.style.top = `${y}px`
  }

  remove() {
    this.root.remove()
  }
}

/**
 * Bildschirmhöhe der Lücke, in die ein Feld fällt, wenn seine Oberkante bei
 * `clientTop` liegt. null, wenn es an seiner Stelle bleibt.
 */
export function dropLineY(editor: Editor, pos: number, clientTop: number, ctx: SnapContext) {
  const { state, view } = editor
  const node = state.doc.nodeAt(pos)
  if (!node) return null
  const target = insertPosition(editor, clientTop, ctx.contentLeft + 1)
  if (target >= pos && target <= pos + node.nodeSize) return null
  const $t = state.doc.resolve(target)
  const after = $t.nodeAfter ? (view.nodeDOM(target) as HTMLElement | null) : null
  const before = $t.nodeBefore ? (view.nodeDOM(target - $t.nodeBefore.nodeSize) as HTMLElement | null) : null
  const next = after instanceof HTMLElement ? after.getBoundingClientRect().top : null
  const prev = before instanceof HTMLElement ? before.getBoundingClientRect().bottom : null
  if (next !== null && prev !== null) return (next + prev) / 2
  if (next !== null) return next - 3
  if (prev !== null) return prev + 3
  return null
}
