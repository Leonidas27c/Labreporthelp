import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { MM, USABLE_MM } from '../lib/print'

/**
 * Seitenaufteilung wie in einem Textprogramm:
 * - Tabellen und Diagramme werden nicht von einem Seitenumbruch zerschnitten. Passen sie
 *   nicht mehr auf die Seite, rutschen sie an den Anfang der nächsten Seite.
 * - Am Seitenende bleibt ein kleiner Sicherheitsabstand frei, damit nichts bis zum letzten
 *   Millimeter gequetscht wird.
 * - Eine Überschrift bleibt nicht allein unten auf der Seite stehen, sondern wandert mit
 *   dem folgenden Inhalt auf die nächste Seite.
 *
 * Umgesetzt mit einem zusätzlichen Abstand oberhalb des Blocks (ProseMirror-Dekoration).
 * Beim Drucken wird daraus ein echter Seitenumbruch (siehe index.css).
 */

/** Sicherheitsabstand zum unteren Seitenrand für Tabellen und Diagramme. */
export const BOTTOM_RESERVE_MM = 4
/** So viel Platz muss unter einer Überschrift noch frei sein (ca. zwei Textzeilen). */
const HEADING_KEEP_MM = 16

const key = new PluginKey<DecorationSet>('pageLayout')
const PAGE = () => USABLE_MM * MM

type Push = { pos: number; delta: number; margin: number }

/** Blöcke, die nicht über einen Seitenumbruch laufen sollen. */
function keepTogether(node: PMNode) {
  return node.type.name === 'table' || node.type.name === 'chart' || node.type.name === 'image'
}

function isHeading(node: PMNode) {
  return node.type.name === 'heading'
}

type Block = { node: PMNode; pos: number; top: number; bottom: number; gap: number }

/**
 * Misst alle Blöcke, so als gäbe es die bisherigen Verschiebungen nicht.
 * Die Verschiebungen sind genau bekannt (delta), deshalb muss nichts zurückgesetzt werden.
 */
function measure(view: EditorView): Block[] | null {
  const el = view.dom as HTMLElement
  const decos = key.getState(view.state) ?? DecorationSet.empty
  const cs = getComputedStyle(el)
  const origin = el.getBoundingClientRect().top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth || '0')
  const blocks: Block[] = []
  let shift = 0
  let prevBottom = 0
  let ok = true
  view.state.doc.forEach((node, pos) => {
    if (!ok) return
    const dom = view.nodeDOM(pos) as HTMLElement | null
    if (!dom || !(dom instanceof HTMLElement)) {
      ok = false
      return
    }
    const deco = decos.find(pos, pos + node.nodeSize, (spec) => spec.pageLayout === true).find((d) => d.from === pos)
    const delta = deco ? (deco.spec.delta as number) : 0
    shift += delta
    const r = dom.getBoundingClientRect()
    const top = r.top - origin - shift
    const bottom = r.bottom - origin - shift
    blocks.push({ node, pos, top, bottom, gap: top - prevBottom })
    prevBottom = bottom
  })
  return ok ? blocks : null
}

/** Berechnet, welche Blöcke auf die nächste Seite rutschen. */
function plan(blocks: Block[]): Push[] {
  const page = PAGE()
  const reserve = BOTTOM_RESERVE_MM * MM
  const pushes: Push[] = []
  let shift = 0
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const top = b.top + shift
    const bottom = b.bottom + shift
    const height = b.bottom - b.top
    const p = Math.floor((top + 0.5) / page)
    const pageStart = p * page
    const pageEnd = (p + 1) * page
    if (top <= pageStart + 1) continue // steht schon oben auf der Seite

    let push = false
    if (keepTogether(b.node)) {
      // Nur verschieben, wenn der Block auf einer leeren Seite auch ganz Platz hat
      push = bottom > pageEnd - reserve && height <= page - reserve
    } else if (isHeading(b.node)) {
      // Leere Absätze zwischen Überschrift und Inhalt überspringen
      let j = i + 1
      while (j < blocks.length && blocks[j].node.type.name === 'paragraph' && blocks[j].node.content.size === 0) j++
      const next = blocks[j]
      let need = bottom
      if (next) {
        const nextTop = next.top + shift
        const nextH = next.bottom - next.top
        if (keepTogether(next.node) && nextTop + nextH - top <= page - reserve) {
          need = nextTop + nextH + reserve
        } else {
          need = nextTop + Math.min(nextH, HEADING_KEEP_MM * MM)
        }
      }
      push = bottom > pageEnd || need > pageEnd
    }
    if (!push) continue
    const delta = pageEnd - top
    pushes.push({ pos: b.pos, delta, margin: b.gap + delta })
    shift += delta
  }
  return pushes
}

function same(a: Push[], decos: DecorationSet) {
  const old = decos.find()
  if (old.length !== a.length) return false
  return a.every((p) => old.some((d) => d.from === p.pos && Math.abs((d.spec.delta as number) - p.delta) < 1))
}

/** Seitenaufteilung jetzt neu berechnen (synchron). */
export function relayout(view: EditorView) {
  if (view.isDestroyed) return
  const el = view.dom as HTMLElement
  if (el.querySelector('.moving, .resizing')) return // während des Ziehens nicht springen
  const blocks = measure(view)
  if (!blocks) return
  const pushes = plan(blocks)
  const current = key.getState(view.state) ?? DecorationSet.empty
  if (same(pushes, current)) return
  const decos = DecorationSet.create(
    view.state.doc,
    pushes.map((p) => {
      const node = view.state.doc.nodeAt(p.pos)!
      return Decoration.node(
        p.pos,
        p.pos + node.nodeSize,
        { 'data-page-push': '', style: `--page-push: ${Math.round(p.margin * 10) / 10}px` },
        { pageLayout: true, delta: p.delta },
      )
    }),
  )
  view.dispatch(view.state.tr.setMeta(key, decos).setMeta('addToHistory', false))
}

/** Auf welcher Seite steht der Block an `pos`, und wie viel Platz ist unter ihm noch frei? (in mm) */
export function pageInfo(view: EditorView, pos: number): { page: number; freeBelowMm: number; topMm: number } | null {
  const dom = view.nodeDOM(pos) as HTMLElement | null
  if (!dom || !(dom instanceof HTMLElement)) return null
  const el = view.dom as HTMLElement
  const cs = getComputedStyle(el)
  const origin = el.getBoundingClientRect().top + parseFloat(cs.paddingTop)
  const r = dom.getBoundingClientRect()
  const page = PAGE()
  const p = Math.floor((r.top - origin + 0.5) / page)
  return {
    page: p + 1,
    topMm: (r.top - origin - p * page) / MM,
    freeBelowMm: ((p + 1) * page - (r.bottom - origin)) / MM,
  }
}

/** Freier Platz (mm) auf der Seite an der Einfügestelle `pos` (zwischen zwei Blöcken). */
export function freeSpaceAt(view: EditorView, pos: number): { page: number; freeMm: number } {
  const $pos = view.state.doc.resolve(pos)
  const before = $pos.nodeBefore
  if (!before) return { page: 1, freeMm: USABLE_MM }
  const info = pageInfo(view, pos - before.nodeSize)
  if (!info) return { page: 1, freeMm: USABLE_MM }
  return { page: info.page, freeMm: Math.max(0, info.freeBelowMm) }
}

export const PageLayout = Extension.create({
  name: 'pageLayout',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const next = tr.getMeta(key) as DecorationSet | undefined
            if (next) return next
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)
          },
        },
        view(view) {
          let frame = 0
          const schedule = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => relayout(view))
          }
          const ro = new ResizeObserver(schedule)
          ro.observe(view.dom)
          // Bilder und Diagramme können ihre Größe ändern, ohne dass sich das Dokument ändert
          const mo = new MutationObserver(schedule)
          mo.observe(view.dom, { attributes: true, attributeFilter: ['style', 'width', 'height'], subtree: true })
          schedule()
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc)) schedule()
            },
            destroy() {
              cancelAnimationFrame(frame)
              ro.disconnect()
              mo.disconnect()
            },
          }
        },
      }),
    ]
  },
})
