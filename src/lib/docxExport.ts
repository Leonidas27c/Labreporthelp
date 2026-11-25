/**
 * Export als Word-Datei (.docx).
 *
 * Ziel: Die Datei öffnet sich in Word ohne Fehlermeldung und bleibt dort bearbeitbar.
 * Deshalb wird alles, was Word selbst kann, als echtes Word-Element geschrieben:
 * - Überschriften, Absätze, Listen, Zitate und Code als Word-Formatvorlagen
 *   („Überschrift 1“ usw.), damit Inhaltsverzeichnis und Navigationsbereich funktionieren
 * - Fett, kursiv, unterstrichen, durchgestrichen, Schriftfarbe, Hervorhebung, Links
 * - Tabellen als echte Word-Tabellen mit Linien, Kopfzeile (wird auf jeder Seite
 *   wiederholt), Zeilenstreifen, Spaltenbreiten und verbundenen Zellen
 * - Tabellenbeschriftungen als Formatvorlage „Beschriftung“ mit Word-Nummerierung
 *   (Feld SEQ), damit ein Tabellenverzeichnis funktioniert
 * - Formelspalten: die berechneten Werte als Text, die Formel als Word-Kommentar
 * - A4 mit denselben Seitenrändern; Seitenumbrüche über „Absätze nicht trennen“ und
 *   „Zeilen nicht trennen“, damit Word Tabellen, Diagramme und Überschriften genauso
 *   zusammenhält wie die App
 * Diagramme gibt es in Word in dieser Form nicht (Karopapier, Ausgleichsgerade, Ausreißer,
 * drei Achsen). Sie kommen deshalb als scharfes Bild in Originalgröße und Ausrichtung.
 *
 * Die Datei wird von Hand als Office-Open-XML zusammengesetzt (JSZip), ohne weitere Bibliothek.
 */
import JSZip from 'jszip'
import type { Editor, JSONContent } from '@tiptap/react'
import { normalizeTable, type TableAttrs } from './tableModel'
import { PAGE_MM } from './print'
import { INDENT_CM } from '../extensions/TextFormatting'

/* ---------- Maßeinheiten ---------- */

/** Word rechnet in Twips (1/20 pt). 1 px (CSS) = 0,75 pt = 15 Twips. */
const PX_TWIP = 15
const MM_TWIP = 1440 / 25.4
/** EMU für Bilder: 1 px = 9525 EMU */
const PX_EMU = 9525
const PAGE_W_TWIP = Math.round(210 * MM_TWIP)
const PAGE_H_TWIP = Math.round(297 * MM_TWIP)
const MARGIN_TOP = Math.round(PAGE_MM.marginTop * MM_TWIP)
const MARGIN_BOTTOM = Math.round(PAGE_MM.marginBottom * MM_TWIP)
const MARGIN_SIDE = Math.round(PAGE_MM.marginSide * MM_TWIP)
/** Breite des Satzspiegels */
const CONTENT_TWIP = PAGE_W_TWIP - 2 * MARGIN_SIDE
/** Tabellen bis zu dieser Zeilenzahl werden wie in der App nicht über einen Seitenumbruch geteilt. */
const KEEP_TABLE_ROWS = 25

/* ---------- XML-Hilfen ---------- */

function esc(text: string) {
  return text
    // Zeichen, die in XML nicht erlaubt sind (Word meldet sonst eine beschädigte Datei)
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Farbe aus CSS (#abc, #aabbcc, rgb(…)) als „AABBCC“, sonst null. */
export function hexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  let m = v.match(/^#([0-9a-f]{3})$/i)
  if (m) return m[1].split('').map((c) => c + c).join('').toUpperCase()
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
  if (m) return m[1].toUpperCase()
  m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (m) return [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase()
  return null
}

const W_NS =
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'mc:Ignorable="w14"'

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/* ---------- Bilder der Diagramme ---------- */

export interface ChartImage {
  png: Uint8Array
  width: number
  height: number
  description: string
}

const SVG_TEXT_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'fill', 'stroke', 'opacity', 'text-anchor', 'dominant-baseline']

/**
 * Zeichnet das Diagramm aus dem Editor als PNG (dreifache Auflösung, also auch gedruckt scharf).
 * Schriften und Farben kommen im Editor aus dem Stylesheet; die Kopie bekommt sie direkt,
 * sonst fehlen sie im Bild.
 */
async function rasterizeSvg(svg: SVGSVGElement, scale = 3): Promise<{ png: Uint8Array; width: number; height: number }> {
  const width = Math.round(Number(svg.getAttribute('width')) || svg.getBoundingClientRect().width)
  const height = Math.round(Number(svg.getAttribute('height')) || svg.getBoundingClientRect().height)
  const clone = svg.cloneNode(true) as SVGSVGElement
  const src = [svg, ...Array.from(svg.querySelectorAll('*'))]
  const dst = [clone, ...Array.from(clone.querySelectorAll('*'))]
  src.forEach((el, i) => {
    const target = dst[i] as SVGElement | undefined
    if (!target || !(el instanceof SVGElement)) return
    const cs = getComputedStyle(el)
    const isText = el instanceof SVGTextElement || el instanceof SVGTSpanElement
    for (const p of SVG_TEXT_PROPS) {
      if (!isText && p.startsWith('font')) continue
      if (!isText && !el.hasAttribute(p) && (p === 'fill' || p === 'stroke')) continue
      const v = cs.getPropertyValue(p)
      if (v) target.style.setProperty(p, v)
    }
  })
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.removeAttribute('class')
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', '#ffffff')
  clone.insertBefore(bg, clone.firstChild)

  const data = new XMLSerializer().serializeToString(clone)
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Diagramm konnte nicht als Bild gespeichert werden.')
    return { png: new Uint8Array(await blob.arrayBuffer()), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function chartDescription(attrs: Record<string, unknown>): string {
  const axes = (attrs.axes ?? {}) as Record<string, { label?: string; unit?: string } | undefined>
  const name = (a?: { label?: string; unit?: string }) => [a?.label, a?.unit ? `[${a.unit}]` : ''].filter(Boolean).join(' ')
  const parts = [name(axes.y), name(axes.x)].filter(Boolean)
  const series = Array.isArray(attrs.series) ? (attrs.series as { name?: string }[]).map((s) => s?.name).filter(Boolean) : []
  let text = parts.length === 2 ? `Diagramm: ${parts[0]} über ${parts[1]}` : 'Diagramm'
  if (series.length) text += ` (Messreihen: ${series.join(', ')})`
  return text
}

/** Alle Diagramme im Dokument als Bilder, in Dokumentreihenfolge. */
async function collectCharts(editor: Editor): Promise<(ChartImage | null)[]> {
  const found: { pos: number; attrs: Record<string, unknown> }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'chart') found.push({ pos, attrs: node.attrs })
    return true
  })
  const out: (ChartImage | null)[] = []
  for (const { pos, attrs } of found) {
    try {
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null
      const svg = dom?.querySelector('svg')
      if (!svg) throw new Error('kein Diagramm gefunden')
      const img = await rasterizeSvg(svg as SVGSVGElement)
      out.push({ ...img, description: chartDescription(attrs) })
    } catch {
      out.push(null)
    }
  }
  return out
}

/** Ein eingefügtes Bild als PNG (Word kennt nicht jedes Format, das der Browser anzeigt). */
async function imageToPng(src: string): Promise<{ png: Uint8Array; width: number; height: number }> {
  const img = new window.Image()
  img.src = src
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Bild konnte nicht umgewandelt werden')
  return { png: new Uint8Array(await blob.arrayBuffer()), width: img.naturalWidth, height: img.naturalHeight }
}

/** Alle eingefügten Bilder als PNG, in Dokumentreihenfolge, mit der Größe wie in der App. */
async function collectImages(editor: Editor): Promise<(ChartImage | null)[]> {
  const found: Record<string, unknown>[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') found.push(node.attrs)
    return true
  })
  const out: (ChartImage | null)[] = []
  for (const attrs of found) {
    try {
      const img = await imageToPng(String(attrs.src ?? ''))
      const w = Number(attrs.width) || img.width
      const h = Number(attrs.height) || Math.round((img.height * w) / img.width)
      out.push({ png: img.png, width: w, height: h, description: String(attrs.alt || attrs.title || 'Bild') })
    } catch {
      out.push(null)
    }
  }
  return out
}

/** Erste Schrift aus einer CSS-Schriftliste, z. B. „Arial, Helvetica, sans-serif“ → „Arial“. */
function fontName(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const first = v.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  return first && !/^(serif|sans-serif|monospace)$/.test(first) ? first : null
}

/** CSS-Schriftgröße („12pt“, „16px“) in halben Punkten für Word. */
function fontHalfPt(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined
  const n = parseFloat(v)
  if (!(n > 0)) return undefined
  return Math.round((v.endsWith('px') ? n * 0.75 : n) * 2)
}

/* ---------- Aufbau des Dokuments ---------- */

interface RunStyle {
  bold?: boolean
  sizeHalfPt?: number
}

interface ParaCtx {
  style?: string
  /** Einzug links in Twips (Zitat) */
  indent?: number
  keepNext?: boolean
  spacingAfter?: number
  run?: RunStyle
  /** Liste: Nummerierung und Ebene des ersten Absatzes */
  num?: { id: number; level: number }
  /** weitere Absätze im selben Listenpunkt */
  listIndent?: number
}

interface Comment {
  id: number
  text: string
}

class DocxWriter {
  rels: { id: string; type: string; target: string; external?: boolean }[] = []
  media: { name: string; data: Uint8Array }[] = []
  comments: Comment[] = []
  /** Nummerierungen der Listen: [numId, abstractNumId, start, level] */
  nums: { id: number; abstract: number; start: number | null; level: number }[] = [{ id: 1, abstract: 0, start: null, level: 0 }]
  private charts: (ChartImage | null)[]
  private chartIndex = 0
  private images: (ChartImage | null)[]
  private imageIndex = 0
  private drawingId = 1

  constructor(charts: (ChartImage | null)[], images: (ChartImage | null)[] = []) {
    this.charts = charts
    this.images = images
  }

  private rel(type: string, target: string, external = false) {
    const id = `rId${this.rels.length + 10}`
    this.rels.push({ id, type, target, external })
    return id
  }

  /* --- Text --- */

  private runProps(marks: JSONContent['marks'], base?: RunStyle): string {
    const p: string[] = []
    const m = new Map((marks ?? []).map((mk) => [mk.type, mk.attrs ?? {}]))
    if (m.has('link')) p.push('<w:rStyle w:val="Hyperlink"/>')
    else if (m.has('code')) p.push('<w:rStyle w:val="HTMLCode"/>')
    if (m.has('bold') || base?.bold) p.push('<w:b/><w:bCs/>')
    if (m.has('italic')) p.push('<w:i/><w:iCs/>')
    if (m.has('strike')) p.push('<w:strike/>')
    const ts = m.get('textStyle')
    const font = fontName(ts?.fontFamily)
    if (font) p.push(`<w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}"/>`)
    const color = hexColor(ts?.color)
    if (color) p.push(`<w:color w:val="${color}"/>`)
    const size = fontHalfPt(ts?.fontSize) ?? base?.sizeHalfPt
    if (size) p.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`)
    if (m.has('underline')) p.push('<w:u w:val="single"/>')
    if (m.has('highlight')) {
      // Beliebige Farbe als Schattierung (Word-Hervorhebung kennt nur 16 grelle Farben)
      const hl = hexColor(m.get('highlight')?.color) ?? 'FFFF00'
      p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hl}"/>`)
    }
    if (m.has('subscript')) p.push('<w:vertAlign w:val="subscript"/>')
    else if (m.has('superscript')) p.push('<w:vertAlign w:val="superscript"/>')
    return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : ''
  }

  private textRun(text: string, rPr: string) {
    return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
  }

  /** Inhalt eines Absatzes (Text, Zeilenumbrüche, Links, Diagramme im Fließtext). */
  private inline(nodes: JSONContent[] | undefined, base?: RunStyle): string {
    let out = ''
    for (const n of nodes ?? []) {
      if (n.type === 'text') {
        const rPr = this.runProps(n.marks, base)
        const run = this.textRun(n.text ?? '', rPr)
        const link = n.marks?.find((mk) => mk.type === 'link')
        const href = link?.attrs?.href
        if (typeof href === 'string' && href) {
          if (href.startsWith('#')) {
            out += `<w:hyperlink w:anchor="${esc(href.slice(1))}" w:history="1">${run}</w:hyperlink>`
          } else {
            const id = this.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', href, true)
            out += `<w:hyperlink r:id="${id}" w:history="1">${run}</w:hyperlink>`
          }
        } else {
          out += run
        }
      } else if (n.type === 'hardBreak') {
        out += `<w:r>${this.runProps(n.marks, base)}<w:br/></w:r>`
      } else if (n.content) {
        out += this.inline(n.content, base)
      }
    }
    return out
  }

  private pPr(ctx: ParaCtx, align?: unknown, extra = ''): string {
    const p: string[] = []
    if (ctx.style) p.push(`<w:pStyle w:val="${ctx.style}"/>`)
    if (ctx.keepNext) p.push('<w:keepNext/>')
    if (ctx.num) p.push(`<w:numPr><w:ilvl w:val="${ctx.num.level}"/><w:numId w:val="${ctx.num.id}"/></w:numPr>`)
    p.push(extra)
    if (ctx.spacingAfter !== undefined) p.push(`<w:spacing w:before="0" w:after="${ctx.spacingAfter}"/>`)
    const left = (ctx.indent ?? 0) + (ctx.listIndent ?? 0)
    if (left && !ctx.num) p.push(`<w:ind w:left="${left}"/>`)
    else if (ctx.indent && ctx.num) {
      const lvl = ctx.num.level
      p.push(`<w:ind w:left="${ctx.indent + 720 * (lvl + 1)}" w:hanging="360"/>`)
    }
    const jc = align === 'center' ? 'center' : align === 'right' ? 'right' : align === 'justify' ? 'both' : null
    if (jc) p.push(`<w:jc w:val="${jc}"/>`)
    const s = p.join('')
    return s ? `<w:pPr>${s}</w:pPr>` : ''
  }

  private paragraph(n: JSONContent, ctx: ParaCtx, extraPPr = '', prefix = '', suffix = '') {
    // Einzug und Zeilenabstand aus der Absatzformatierung
    const steps = Number(n.attrs?.indent) || 0
    if (steps > 0) ctx = { ...ctx, indent: (ctx.indent ?? 0) + Math.round(steps * INDENT_CM * 567) }
    const lh = parseFloat(String(n.attrs?.lineHeight ?? ''))
    if (lh > 0 && ctx.spacingAfter === undefined) extraPPr += `<w:spacing w:line="${Math.round(lh * 240)}" w:lineRule="auto"/>`
    return `<w:p>${this.pPr(ctx, n.attrs?.textAlign, extraPPr)}${prefix}${this.inline(n.content, ctx.run)}${suffix}</w:p>`
  }

  /* --- Blöcke --- */

  blocks(nodes: JSONContent[] | undefined, ctx: ParaCtx = {}): string {
    const list = nodes ?? []
    let out = ''
    for (const n of list) out += this.block(n, ctx)
    return out
  }

  private block(n: JSONContent, ctx: ParaCtx): string {
    switch (n.type) {
      case 'paragraph':
        return this.paragraph(n, ctx)
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1))
        return this.paragraph(n, { ...ctx, style: `Heading${level}`, num: undefined })
      }
      case 'bulletList':
      case 'orderedList':
        return this.list(n, ctx)
      case 'listItem':
        return this.blocks(n.content, ctx)
      case 'blockquote':
        // Die Vorlage „Zitat“ rückt schon ein; verschachtelte Zitate rücken weiter ein
        return this.blocks(n.content, { ...ctx, style: 'Quote', indent: ctx.style === 'Quote' ? (ctx.indent ?? 0) + 567 : ctx.indent })
      case 'codeBlock': {
        const text = (n.content ?? []).map((t) => t.text ?? '').join('')
        const lines = text.split('\n')
        return lines
          .map((line, i) => {
            const last = i === lines.length - 1
            const keep = last ? '' : '<w:keepNext/>'
            return `<w:p><w:pPr><w:pStyle w:val="HTMLPreformatted"/>${keep}${ctx.indent ? `<w:ind w:left="${ctx.indent}"/>` : ''}</w:pPr>${line ? this.textRun(line, '') : ''}</w:p>`
          })
          .join('')
      }
      case 'horizontalRule':
        return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="8D9BB3"/></w:pBdr></w:pPr></w:p>'
      case 'table':
        return this.table(n)
      case 'chart':
        return this.chart(n, ctx)
      case 'tablePlaceholder':
        return ''
      case 'pageBreak':
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
      case 'image':
        return this.picture(this.images[this.imageIndex++], n.attrs?.align, n.attrs?.offsetX, ctx, 'Bild', '[Bild konnte nicht exportiert werden]')
      default:
        // Unbekannter Block: Inhalt übernehmen, statt ihn wegzulassen
        if (n.content?.some((c) => c.type === 'text')) return this.paragraph(n, ctx)
        return n.content ? this.blocks(n.content, ctx) : ''
    }
  }

  private list(n: JSONContent, ctx: ParaCtx): string {
    const level = ctx.num ? Math.min(8, ctx.num.level + 1) : 0
    let numId = 1
    if (n.type === 'orderedList') {
      // Jede nummerierte Liste beginnt neu (bei ihrer Startnummer)
      numId = this.nums.length + 1
      this.nums.push({ id: numId, abstract: 1, start: Number(n.attrs?.start) || 1, level })
    }
    let out = ''
    for (const item of n.content ?? []) {
      let first = true
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          out += this.list(child, { ...ctx, num: { id: numId, level }, listIndent: undefined })
          continue
        }
        if (first && (child.type === 'paragraph' || child.type === 'heading')) {
          out += this.paragraph(child, { ...ctx, style: ctx.style === 'Quote' ? 'Quote' : 'ListParagraph', num: { id: numId, level }, listIndent: undefined })
        } else {
          out += this.block(child, { ...ctx, style: 'ListParagraph', num: undefined, listIndent: 720 * (level + 1) })
        }
        first = false
      }
    }
    return out
  }

  /* --- Tabellen --- */

  private border(tag: string, a: TableAttrs, factor = 1) {
    const color = hexColor(a.borderColor) ?? '8D9BB3'
    const sz = Math.max(2, Math.min(96, Math.round(a.borderWidth * factor * 6)))
    return `<w:${tag} w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/>`
  }

  private none(tag: string) {
    return `<w:${tag} w:val="nil"/>`
  }

  private tableBorders(a: TableAttrs) {
    const sides = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    let b: string[]
    switch (a.borders) {
      case 'all':
        b = sides.map((s) => this.border(s, a))
        break
      case 'rows':
        b = [this.border('top', a), this.none('left'), this.border('bottom', a), this.none('right'), this.border('insideH', a), this.none('insideV')]
        break
      case 'booktabs':
        b = [this.border('top', a, 1.6), this.none('left'), this.border('bottom', a, 1.6), this.none('right'), this.none('insideH'), this.none('insideV')]
        break
      case 'outer':
        b = [this.border('top', a), this.border('left', a), this.border('bottom', a), this.border('right', a), this.none('insideH'), this.none('insideV')]
        break
      default:
        b = sides.map((s) => this.none(s))
    }
    return `<w:tblBorders>${b.join('')}</w:tblBorders>`
  }

  /** Beschriftung „Tabelle 1: …“ mit echter Word-Nummerierung (Feld SEQ). */
  private caption(text: string, below: boolean): string {
    const keep = below ? '' : '<w:keepNext/>'
    const spacing = below ? '<w:spacing w:before="80" w:after="240"/>' : '<w:spacing w:before="240" w:after="80"/>'
    const pPr = `<w:pPr><w:pStyle w:val="Caption"/>${keep}${spacing}</w:pPr>`
    const colon = text.indexOf(':')
    const head = colon > 0 ? text.slice(0, colon + 1) : ''
    const rest = colon > 0 ? text.slice(colon + 1) : text
    const bold = '<w:rPr><w:b/><w:bCs/></w:rPr>'
    let headXml = head ? this.textRun(head, bold) : ''
    const m = head.match(/^(\s*(Tabelle|Tab\.|Table|Abbildung|Abb\.|Figure)\s+)(\d+)(.*)$/)
    if (m) {
      const label = /^(Abbildung|Abb\.|Figure)$/.test(m[2]) ? 'Abbildung' : 'Tabelle'
      const n = Number(m[3])
      headXml =
        this.textRun(m[1], bold) +
        `<w:fldSimple w:instr=" SEQ ${label} \\* ARABIC "><w:r>${bold}<w:t>${n}</w:t></w:r></w:fldSimple>` +
        this.textRun(m[4], bold)
    }
    return `<w:p>${pPr}${headXml}${rest ? this.textRun(rest, '') : ''}</w:p>`
  }

  private table(n: JSONContent): string {
    const a = normalizeTable(n.attrs ?? {})
    const rows = (n.content ?? []).filter((r) => r.type === 'tableRow')
    if (!rows.length) return ''

    // Raster aufbauen (verbundene Zellen über mehrere Zeilen/Spalten)
    type Slot = { cell: JSONContent; row: number; col: number; colspan: number; rowspan: number }
    const grid: (Slot | undefined)[][] = rows.map(() => [])
    const slots: Slot[] = []
    rows.forEach((row, r) => {
      let c = 0
      for (const cell of row.content ?? []) {
        while (grid[r][c]) c++
        const colspan = Math.max(1, Number(cell.attrs?.colspan) || 1)
        const rowspan = Math.max(1, Math.min(rows.length - r, Number(cell.attrs?.rowspan) || 1))
        const slot = { cell, row: r, col: c, colspan, rowspan }
        slots.push(slot)
        for (let dr = 0; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = slot
        c += colspan
      }
    })
    const cols = Math.max(1, ...grid.map((g) => g.length))

    // Spaltenbreiten (in der App in px gespeichert)
    const widthsPx: (number | null)[] = Array(cols).fill(null)
    for (const s of slots) {
      const cw = s.cell.attrs?.colwidth
      if (Array.isArray(cw)) cw.forEach((w, i) => {
        if (typeof w === 'number' && w > 0 && s.col + i < cols && widthsPx[s.col + i] === null) widthsPx[s.col + i] = w
      })
    }
    const known = widthsPx.every((w) => w !== null)
    const indent = Math.round(a.offsetX * PX_TWIP)
    const avail = Math.max(2000, CONTENT_TWIP - indent)
    let widths: number[]
    if (known) {
      widths = widthsPx.map((w) => Math.round((w as number) * PX_TWIP))
      const sum = widths.reduce((x, y) => x + y, 0)
      if (sum > avail) widths = widths.map((w) => Math.floor((w * avail) / sum))
    } else {
      widths = Array(cols).fill(Math.floor(avail / cols))
    }
    const total = widths.reduce((x, y) => x + y, 0)

    const headerRows: boolean[] = rows.map((row) => (row.content ?? []).length > 0 && (row.content ?? []).every((c) => c.type === 'tableHeader'))
    const keep = rows.length <= KEEP_TABLE_ROWS
    const fontHalf = a.fontSize ? Math.round(a.fontSize * 2) : undefined
    const captionText = a.caption.trim()

    let xml = ''
    if (captionText && a.captionPosition === 'above') xml += this.caption(captionText, false)

    const tblPr =
      '<w:tblPr>' +
      `<w:tblW w:w="${known ? total : 5000}" w:type="${known ? 'dxa' : 'pct'}"/>` +
      (indent ? `<w:tblInd w:w="${indent}" w:type="dxa"/>` : '') +
      this.tableBorders(a) +
      '<w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0420" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>' +
      '</w:tblPr>'
    xml += `<w:tbl>${tblPr}<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`

    // Formelspalten: Formel steht in der Kopfzelle
    const letter = (i: number) => {
      let s = ''
      let x = i + 1
      while (x > 0) {
        s = String.fromCharCode(65 + ((x - 1) % 26)) + s
        x = Math.floor((x - 1) / 26)
      }
      return s
    }

    rows.forEach((_row, r) => {
      const isHeader = headerRows[r] && headerRows.slice(0, r).every(Boolean)
      const lastRow = r === rows.length - 1
      const trPr: string[] = []
      if (keep || isHeader) trPr.push('<w:cantSplit/>')
      if (a.rowHeight) trPr.push(`<w:trHeight w:val="${Math.round(a.rowHeight * PX_TWIP)}" w:hRule="atLeast"/>`)
      if (isHeader) trPr.push('<w:tblHeader/>')
      xml += `<w:tr>${trPr.length ? `<w:trPr>${trPr.join('')}</w:trPr>` : ''}`
      let c = 0
      while (c < cols) {
        const slot = grid[r][c]
        if (!slot) {
          // fehlende Zelle (unregelmäßige Tabelle): leer auffüllen, sonst meldet Word Fehler
          xml += `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`
          c++
          continue
        }
        if (slot.col !== c) {
          c++
          continue
        }
        const span = Math.min(slot.colspan, cols - c)
        const w = widths.slice(c, c + span).reduce((x, y) => x + y, 0)
        const isTh = slot.cell.type === 'tableHeader'
        const tcPr: string[] = [`<w:tcW w:w="${w}" w:type="dxa"/>`]
        if (span > 1) tcPr.push(`<w:gridSpan w:val="${span}"/>`)
        if (slot.rowspan > 1) tcPr.push(slot.row === r ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>')
        if (a.borders === 'booktabs' && r === 0) tcPr.push(`<w:tcBorders>${this.border('bottom', a)}</w:tcBorders>`)
        let fill: string | null = null
        if (isTh) fill = hexColor(a.headerBg)
        else if (a.striped && r % 2 === 1) fill = hexColor(a.stripeColor)
        if (fill) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`)
        const cellAlign = slot.cell.attrs?.align
        xml += `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>`
        if (slot.row !== r) {
          xml += '<w:p/>'
        } else {
          const paraCtx: ParaCtx = {
            style: 'TableText',
            keepNext: keep && !lastRow,
            run: { bold: isTh, sizeHalfPt: fontHalf },
            spacingAfter: undefined,
          }
          const formula = slot.cell.attrs?.formula
          let commentStart = ''
          let commentEnd = ''
          if (typeof formula === 'string' && formula.trim()) {
            const id = this.comments.length
            const dec = slot.cell.attrs?.decimals
            const f = formula.includes('=') ? formula.trim() : `${letter(c)} = ${formula.trim()}`
            this.comments.push({
              id,
              text:
                `Formelspalte (Labreporthelp): ${f}` +
                (typeof dec === 'number' ? `, ${dec} Nachkommastellen` : '') +
                '. Die Werte wurden in der App berechnet und stehen hier als feste Zahlen.',
            })
            commentStart = `<w:commentRangeStart w:id="${id}"/>`
            commentEnd = `<w:commentRangeEnd w:id="${id}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r>`
          }
          const content = (slot.cell.content ?? []).length ? slot.cell.content! : [{ type: 'paragraph' }]
          let inner = ''
          content.forEach((child, i) => {
            const withAlign = { ...child, attrs: { ...child.attrs, textAlign: child.attrs?.textAlign ?? cellAlign } }
            if (child.type !== 'paragraph') inner += this.blocks([child], paraCtx)
            // Der Kommentar mit der Formel hängt am ersten Absatz der Kopfzelle
            else if (i === 0 && commentStart) inner += this.paragraph(withAlign, paraCtx, '', commentStart, commentEnd)
            else inner += this.paragraph(withAlign, paraCtx)
          })
          // Eine Zelle muss mit einem Absatz enden
          if (!inner.endsWith('</w:p>')) inner += '<w:p/>'
          xml += inner
        }
        xml += '</w:tc>'
        c += span
      }
      xml += '</w:tr>'
    })
    xml += '</w:tbl>'
    if (captionText && a.captionPosition === 'below') xml += this.caption(captionText, true)
    // Nach jeder Tabelle ein schmaler Absatz: Abstand wie in der App, und zwei Tabellen
    // direkt hintereinander würden in Word sonst zu einer verschmelzen
    else xml += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/></w:pPr></w:p>'
    return xml
  }

  /* --- Diagramme --- */

  private chart(n: JSONContent, ctx: ParaCtx): string {
    return this.picture(this.charts[this.chartIndex++], n.attrs?.align, n.attrs?.offsetX, ctx, 'Diagramm', '[Diagramm konnte nicht exportiert werden]')
  }

  private picture(img: ChartImage | null | undefined, align: unknown, offsetX: unknown, ctx: ParaCtx, label: string, missing: string): string {
    const jc = align === 'center' ? 'center' : align === 'right' ? 'right' : null
    const offset = !align ? Math.max(0, Number(offsetX) || 0) : 0
    const pPr =
      '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/>' +
      (offset || ctx.indent ? `<w:ind w:left="${Math.round(offset * PX_TWIP) + (ctx.indent ?? 0)}"/>` : '') +
      (jc ? `<w:jc w:val="${jc}"/>` : '') +
      '</w:pPr>'
    if (!img) {
      return `<w:p>${pPr}${this.textRun(missing, '<w:rPr><w:i/><w:color w:val="C00000"/></w:rPr>')}</w:p>`
    }
    const name = `${label === 'Bild' ? 'image' : 'chart'}${this.media.length + 1}.png`
    this.media.push({ name, data: img.png })
    const rid = this.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `media/${name}`)
    // Nie breiter als die Seite
    const maxPx = CONTENT_TWIP / PX_TWIP
    const scale = img.width > maxPx ? maxPx / img.width : 1
    const cx = Math.round(img.width * scale * PX_EMU)
    const cy = Math.round(img.height * scale * PX_EMU)
    const id = this.drawingId++
    const descr = esc(img.description)
    const drawing =
      `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${id}" name="${label} ${id}" descr="${descr}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}" descr="${descr}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
    return `<w:p>${pPr}<w:r>${drawing}</w:r></w:p>`
  }
}

/* ---------- feste Teile der Datei ---------- */

function stylesXml() {
  const heading = (level: number, sizePt: number, before: number, after: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="${after}"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:bCs/><w:sz w:val="${sizePt * 2}"/><w:szCs w:val="${sizePt * 2}"/></w:rPr></w:style>`
  return (
    XML_HEAD +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>` +
    `<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="de-DE" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    heading(1, 20, 0, 240) +
    heading(2, 16, 360, 160) +
    heading(3, 13, 280, 120) +
    heading(4, 12, 240, 120) +
    heading(5, 12, 240, 120) +
    heading(6, 12, 240, 120) +
    `<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:unhideWhenUsed/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="240" w:after="80" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="80"/><w:ind w:left="720"/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/>` +
    `<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9D3E3"/></w:pBdr><w:ind w:left="567"/></w:pPr><w:rPr><w:color w:val="404A5A"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Tabellentext"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="HTMLPreformatted"><w:name w:val="HTML Preformatted"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>` +
    `<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F6FA"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
    `<w:style w:type="character" w:styleId="HTMLCode"><w:name w:val="HTML Code"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>` +
    `<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="21"/><w:shd w:val="clear" w:color="auto" w:fill="F0F2F6"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>` +
    `<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>` +
    `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
    `</w:styles>`
  )
}

function numberingXml(nums: DocxWriter['nums']) {
  const bullets = ['•', '◦', '▪']
  const lvl = (i: number, fmt: string, text: string) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>` +
    (fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="default"/></w:rPr>' : '') +
    `</w:lvl>`
  const range = Array.from({ length: 9 }, (_, i) => i)
  const abstractBullet = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${range.map((i) => lvl(i, 'bullet', bullets[i % 3])).join('')}</w:abstractNum>`
  const abstractDecimal = `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${range.map((i) => lvl(i, 'decimal', `%${i + 1}.`)).join('')}</w:abstractNum>`
  const numXml = nums
    .map(
      (n) =>
        `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.abstract}"/>` +
        (n.start !== null ? `<w:lvlOverride w:ilvl="${n.level}"><w:startOverride w:val="${n.start}"/></w:lvlOverride>` : '') +
        `</w:num>`,
    )
    .join('')
  return XML_HEAD + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abstractBullet}${abstractDecimal}${numXml}</w:numbering>`
}

function commentsXml(comments: Comment[], date: string) {
  const items = comments
    .map(
      (c) =>
        `<w:comment w:id="${c.id}" w:author="Labreporthelp" w:date="${date}" w:initials="LRH">` +
        `<w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>` +
        `<w:r><w:t xml:space="preserve">${esc(c.text)}</w:t></w:r></w:p></w:comment>`,
    )
    .join('')
  return XML_HEAD + `<w:comments ${W_NS}>${items}</w:comments>`
}

const SETTINGS_XML =
  XML_HEAD +
  `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/>` +
  `<w:compat><w:doNotExpandShiftReturn/><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
  `<w:themeFontLang w:val="de-DE"/><w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>`

/* ---------- Gesamte Datei ---------- */

/** Baut die .docx-Datei aus dem Dokument im Editor. */
export async function buildDocx(
  content: JSONContent,
  title: string,
  charts: (ChartImage | null)[] = [],
  images: (ChartImage | null)[] = [],
): Promise<Blob> {
  const w = new DocxWriter(charts, images)
  let body = w.blocks(content.content)
  // Das Dokument muss mit einem Absatz enden (sonst hängt Word einen an oder meckert)
  if (!body.endsWith('</w:p>')) body += '<w:p/>'
  const sectPr =
    `<w:sectPr><w:pgSz w:w="${PAGE_W_TWIP}" w:h="${PAGE_H_TWIP}"/>` +
    `<w:pgMar w:top="${MARGIN_TOP}" w:right="${MARGIN_SIDE}" w:bottom="${MARGIN_BOTTOM}" w:left="${MARGIN_SIDE}" w:header="709" w:footer="709" w:gutter="0"/>` +
    `<w:cols w:space="708"/></w:sectPr>`
  const documentXml = XML_HEAD + `<w:document ${W_NS}><w:body>${body}${sectPr}</w:body></w:document>`

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const hasComments = w.comments.length > 0
  const jszip = new JSZip()
  // Ohne Ordner-Einträge im ZIP: Word lehnt solche Dateien in manchen Cloud-Umgebungen ab
  const zip = { file: (name: string, data: string | Uint8Array) => jszip.file(name, data, { createFolders: false }) }

  zip.file(
    '[Content_Types].xml',
    XML_HEAD +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      (hasComments ? `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>` : '') +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
      `</Types>`,
  )
  zip.file(
    '_rels/.rels',
    XML_HEAD +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
      `</Relationships>`,
  )
  zip.file(
    'docProps/core.xml',
    XML_HEAD +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
      `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(title)}</dc:title><dc:language>de-DE</dc:language>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      `</cp:coreProperties>`,
  )
  zip.file(
    'docProps/app.xml',
    XML_HEAD +
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Labreporthelp</Application></Properties>`,
  )

  const rels = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`,
    hasComments ? `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>` : '',
    ...w.rels.map(
      (r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`,
    ),
  ]
  zip.file('word/_rels/document.xml.rels', XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`)
  zip.file('word/document.xml', documentXml)
  zip.file('word/styles.xml', stylesXml())
  zip.file('word/numbering.xml', numberingXml(w.nums))
  zip.file('word/settings.xml', SETTINGS_XML)
  if (hasComments) zip.file('word/comments.xml', commentsXml(w.comments, now))
  for (const m of w.media) zip.file(`word/media/${m.name}`, m.data)

  return jszip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

/** Exportiert das Dokument im Editor als .docx (Diagramme werden dafür als Bilder gezeichnet). */
export async function exportDocx(editor: Editor, title: string): Promise<Blob> {
  const charts = await collectCharts(editor)
  const images = await collectImages(editor)
  return buildDocx(editor.getJSON(), title, charts, images)
}
