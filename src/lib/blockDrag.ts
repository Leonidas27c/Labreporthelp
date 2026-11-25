import type { Editor } from '@tiptap/react'
import { moveBlock } from './moveBlock'
import { SnapOverlay, dropLineY, snapContext, snapMove, type SnapAlign, type SnapContext } from './snap'

/** Ab so viel Pixel Mausweg beginnt das Verschieben (darunter ist es ein Klick). */
const START_DISTANCE = 4
/** Erst ab so viel Pixel waagerecht verlässt ein Feld seine Spalte (senkrechtes Ziehen bleibt gerade). */
const SIDEWAYS_DISTANCE = 6

/**
 * Ein Feld (Diagramm, Tabelle) mit der Maus verschieben. Während des Ziehens
 * wird nur `transform` gesetzt (einmal pro Bild), das Dokument ändert sich
 * erst beim Loslassen. Das Feld rastet an Seitenrändern, der Seitenmitte und
 * den Kanten anderer Felder ein; Hilfslinien zeigen, woran, und eine Linie
 * zeigt, wo es im Text landet. Mit gedrückter Alt-Taste rastet nichts ein.
 */
export class BlockDrag {
  private x: number
  private y: number
  private top: number
  private left = 0
  private width = 0
  private ctx: SnapContext | null = null
  private overlay: SnapOverlay | null = null
  private last: { x: number; y: number; alt: boolean }
  private frame = 0
  private sideways = false
  private result: { dx: number; dy: number; left: number; align: SnapAlign | null } | null = null

  private editor: Editor
  private el: HTMLElement
  private getPos: () => number | undefined

  constructor(editor: Editor, el: HTMLElement, getPos: () => number | undefined, e: PointerEvent | React.PointerEvent) {
    this.editor = editor
    this.el = el
    this.getPos = getPos
    this.x = e.clientX
    this.y = e.clientY
    this.top = el.getBoundingClientRect().top
    this.last = { x: e.clientX, y: e.clientY, alt: e.altKey }
  }

  /** true, sobald wirklich verschoben wird (nicht nur geklickt). */
  get active() {
    return this.ctx !== null
  }

  move(e: PointerEvent | React.PointerEvent) {
    this.last = { x: e.clientX, y: e.clientY, alt: e.altKey }
    if (!this.ctx && Math.hypot(e.clientX - this.x, e.clientY - this.y) < START_DISTANCE) return false
    if (!this.frame) this.frame = requestAnimationFrame(() => this.render())
    return !this.ctx
  }

  private begin() {
    const r = this.el.getBoundingClientRect()
    this.ctx = snapContext(this.editor, this.el)
    this.left = r.left - this.ctx.contentLeft
    this.width = r.width
    this.overlay = new SnapOverlay(this.ctx)
    this.el.classList.add('moving')
  }

  private render() {
    this.frame = 0
    if (!this.ctx) this.begin()
    const ctx = this.ctx!
    const rawDx = this.last.x - this.x
    const dy = this.last.y - this.y
    if (Math.abs(rawDx) >= SIDEWAYS_DISTANCE) this.sideways = true
    const snap = snapMove(ctx, this.left + (this.sideways ? rawDx : 0), this.width, !this.last.alt)
    const dx = this.sideways ? snap.left - this.left : 0
    this.result = { dx, dy, left: snap.left, align: snap.align }
    this.el.style.transform = `translate(${dx}px, ${dy}px)`
    this.overlay!.guides(snap.guides)
    const pos = this.getPos()
    this.overlay!.dropAt(typeof pos === 'number' ? dropLineY(this.editor, pos, this.top + dy, ctx) : null)
  }

  /** Loslassen (commit) oder abbrechen. */
  end(commit: boolean) {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    const wasActive = this.ctx !== null
    if (wasActive && commit) this.render()
    this.overlay?.remove()
    this.overlay = null
    this.el.classList.remove('moving')
    this.el.style.transform = ''
    const r = this.result
    const pos = this.getPos()
    if (!wasActive || !commit || !r || typeof pos !== 'number') return
    moveBlock(this.editor, pos, this.width, r.dx, r.dy, this.top, {
      left: r.left,
      align: r.align,
      sideways: this.sideways,
    })
  }
}
