import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useRef } from 'react'
import { ColorMenu } from './ColorMenu'
import { SymbolMenu } from './SymbolMenu'
import { BASE_FONT_PT, FONT_SIZES, LINE_HEIGHTS, currentFontPt } from '../extensions/TextFormatting'
import { insertImageFiles } from '../extensions/ImageInsert'
import { editLink } from '../extensions/LinkTools'

/** Schriftarten in der Auswahl; leer = Standard der Seite (Times New Roman). */
const FONTS: { label: string; value: string }[] = [
  { label: 'Times New Roman', value: '' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Carlito, sans-serif' },
  { label: 'Cambria', value: 'Cambria, Caladea, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Consolas', value: 'Consolas, monospace' },
]

type Style = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'code'
const STYLES: { label: string; value: Style }[] = [
  { label: 'Standard', value: 'p' },
  { label: 'Überschrift 1', value: 'h1' },
  { label: 'Überschrift 2', value: 'h2' },
  { label: 'Überschrift 3', value: 'h3' },
  { label: 'Zitat', value: 'quote' },
  { label: 'Code', value: 'code' },
]

const ptLabel = (n: number) => String(n).replace('.', ',')

type Align = 'left' | 'center' | 'right'

/** Ausgewähltes Diagramm (oder null), damit die Ausrichtungs-Buttons es ausrichten. */
function selectedChart(e: Editor) {
  const sel = e.state.selection
  return sel instanceof NodeSelection && sel.node.type.name === 'chart' ? sel : null
}

function chartAlign(e: Editor): Align | null {
  const sel = selectedChart(e)
  if (!sel) return null
  const a = sel.node.attrs
  if (a.align === 'left' || a.align === 'center' || a.align === 'right') return a.align
  return (Number(a.offsetX) || 0) === 0 ? 'left' : null
}

interface ToolbarProps {
  editor: Editor
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onPrint: () => void
  drawing: boolean
  onToggleDraw: () => void
  chatOpen: boolean
  onToggleChat: () => void
  onFind: (replace: boolean) => void
}

export function Toolbar({ editor, onNew, onOpen, onSave, onPrint, drawing, onToggleDraw, chatOpen, onToggleChat, onFind }: ToolbarProps) {
  // Aktiven Zustand der Buttons bei jeder Änderung neu berechnen
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      sup: e.isActive('superscript'),
      sub: e.isActive('subscript'),
      link: e.isActive('link'),
      style: (e.isActive('codeBlock')
        ? 'code'
        : e.isActive('blockquote')
          ? 'quote'
          : e.isActive('heading', { level: 1 })
            ? 'h1'
            : e.isActive('heading', { level: 2 })
              ? 'h2'
              : e.isActive('heading', { level: 3 })
                ? 'h3'
                : 'p') as Style,
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      size: currentFontPt(e),
      lineHeight: (e.getAttributes('paragraph').lineHeight ?? e.getAttributes('heading').lineHeight ?? '') as string,
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      chart: selectedChart(e) !== null,
      left: selectedChart(e) ? chartAlign(e) === 'left' : e.isActive({ textAlign: 'left' }),
      center: selectedChart(e) ? chartAlign(e) === 'center' : e.isActive({ textAlign: 'center' }),
      right: selectedChart(e) ? chartAlign(e) === 'right' : e.isActive({ textAlign: 'right' }),
      justify: !selectedChart(e) && e.isActive({ textAlign: 'justify' }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()
  const imageInput = useRef<HTMLInputElement>(null)

  const setStyle = (value: Style) => {
    const c = chain()
    // Erst Zitat/Code verlassen, dann das neue Format setzen
    if (editor.isActive('blockquote') && value !== 'quote') c.lift('blockquote')
    if (value === 'p') c.setParagraph()
    else if (value === 'h1' || value === 'h2' || value === 'h3') c.setHeading({ level: Number(value[1]) as 1 | 2 | 3 })
    else if (value === 'quote') c.setParagraph().setBlockquote()
    else c.setCodeBlock()
    c.run()
  }
  // Ist ein Diagramm ausgewählt, richten die Buttons das Diagramm aus, sonst den Text
  const align = (value: Align) => {
    const sel = selectedChart(editor)
    if (!sel) return chain().setTextAlign(value).run()
    const { tr } = editor.state
    tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, align: value, offsetX: 0 })
    tr.setSelection(NodeSelection.create(tr.doc, sel.from))
    editor.view.dispatch(tr)
    editor.view.focus()
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Werkzeugleiste">
      <div className="group">
        <button onClick={onNew} title="Neues Dokument">Neu</button>
        <button onClick={onOpen} title="Dokument oder PDF öffnen (Strg+O). Mit Labreporthelp erstellte PDFs öffnen sich wieder vollständig bearbeitbar.">Öffnen</button>
        <button onClick={onSave} title="Dokument speichern (Strg+S), zum späteren Weiterbearbeiten">Speichern</button>
        <button onClick={onPrint} title="Drucken oder als PDF speichern (Strg+P). Die PDF lässt sich später über „Öffnen“ wieder bearbeiten.">Drucken / PDF</button>
      </div>
      <div className="group">
        <button disabled={!s.canUndo} onClick={() => chain().undo().run()} title="Rückgängig (Strg+Z)">↶</button>
        <button disabled={!s.canRedo} onClick={() => chain().redo().run()} title="Wiederholen (Strg+Y)">↷</button>
      </div>
      <div className="group">
        <select
          className="tb-select style-select"
          value={s.style}
          onChange={(e) => setStyle(e.target.value as Style)}
          title="Formatvorlage"
          aria-label="Formatvorlage"
        >
          {STYLES.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="tb-select font-select"
          value={FONTS.some((f) => f.value === s.font) ? s.font : s.font || ''}
          onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
          title="Schriftart"
          aria-label="Schriftart"
          style={{ fontFamily: s.font || "'Times New Roman', serif" }}
        >
          {!FONTS.some((f) => f.value === s.font) && <option value={s.font}>{s.font.split(',')[0].replace(/'/g, '')}</option>}
          {FONTS.map((f) => (
            <option key={f.label} value={f.value} style={{ fontFamily: f.value || "'Times New Roman', serif" }}>{f.label}</option>
          ))}
        </select>
        <select
          className="tb-select size-select"
          value={s.size == null ? '' : String(s.size)}
          onChange={(e) => (e.target.value ? chain().setFontSize(`${e.target.value}pt`).run() : chain().unsetFontSize().run())}
          title="Schriftgröße (Strg+Umschalt+> / <)"
          aria-label="Schriftgröße"
        >
          <option value="">{s.style === 'p' ? ptLabel(BASE_FONT_PT) : 'Auto'}</option>
          {s.size != null && !FONT_SIZES.includes(s.size) && <option value={String(s.size)}>{ptLabel(s.size)}</option>}
          {FONT_SIZES.map((n) => (
            <option key={n} value={String(n)}>{ptLabel(n)}</option>
          ))}
        </select>
      </div>
      <div className="group">
        <button className={s.bold ? 'active' : ''} onClick={() => chain().toggleBold().run()} title="Fett (Strg+B)"><b>F</b></button>
        <button className={s.italic ? 'active' : ''} onClick={() => chain().toggleItalic().run()} title="Kursiv (Strg+I)"><i>K</i></button>
        <button className={s.underline ? 'active' : ''} onClick={() => chain().toggleUnderline().run()} title="Unterstrichen (Strg+U)"><u>U</u></button>
        <button className={s.strike ? 'active' : ''} onClick={() => chain().toggleStrike().run()} title="Durchgestrichen"><s>S</s></button>
        <button className={s.sub ? 'active' : ''} onClick={() => chain().toggleSubscript().run()} title="Tiefgestellt, z. B. H₂O (Strg+#)">x<sub>2</sub></button>
        <button className={s.sup ? 'active' : ''} onClick={() => chain().toggleSuperscript().run()} title="Hochgestellt, z. B. m² (Strg++)">x<sup>2</sup></button>
        <ColorMenu editor={editor} kind="text" />
        <ColorMenu editor={editor} kind="highlight" />
        <button onClick={() => chain().clearFormatting().run()} title="Formatierung löschen (Strg+Leertaste)">A<span className="clear-x">✕</span></button>
      </div>
      <div className="group">
        <button className={s.bullet ? 'active' : ''} onClick={() => chain().toggleBulletList().run()} title="Aufzählung">• Liste</button>
        <button className={s.ordered ? 'active' : ''} onClick={() => chain().toggleOrderedList().run()} title="Nummerierte Liste">1. Liste</button>
        <button onClick={() => chain().outdent().run()} title="Einzug verkleinern (Strg+Umschalt+M)">⇤</button>
        <button onClick={() => chain().indent().run()} title="Einzug vergrößern (Strg+M)">⇥</button>
      </div>
      <div className="group">
        <button className={s.left ? 'active' : ''} onClick={() => align('left')} title={s.chart ? 'Diagramm linksbündig' : 'Linksbündig (Strg+L)'}>⯇</button>
        <button className={s.center ? 'active' : ''} onClick={() => align('center')} title={s.chart ? 'Diagramm zentrieren' : 'Zentriert (Strg+E)'}>≡</button>
        <button className={s.right ? 'active' : ''} onClick={() => align('right')} title={s.chart ? 'Diagramm rechtsbündig' : 'Rechtsbündig (Strg+R)'}>⯈</button>
        <button className={s.justify ? 'active' : ''} disabled={s.chart} onClick={() => chain().setTextAlign('justify').run()} title="Blocksatz (Strg+J)">☰</button>
        <select
          className="tb-select spacing-select"
          value={s.lineHeight}
          disabled={s.chart}
          onChange={(e) => chain().setLineHeight(e.target.value || null).run()}
          title="Zeilenabstand (Standard 1,5)"
          aria-label="Zeilenabstand"
        >
          <option value="">↕ 1,5</option>
          {LINE_HEIGHTS.map((v) => (
            <option key={v} value={v}>↕ {v.replace('.', ',')}</option>
          ))}
          {s.lineHeight === '1.5' && <option value="1.5">↕ 1,5</option>}
        </select>
      </div>
      <div className="group">
        <button className={s.link ? 'active' : ''} onClick={() => editLink(editor)} title="Link einfügen oder ändern (Strg+K). Öffnen mit Strg+Klick.">🔗</button>
        <button onClick={() => imageInput.current?.click()} title="Bild einfügen (oder Bild hineinziehen bzw. mit Strg+V einfügen)">🖼</button>
        <SymbolMenu editor={editor} />
        <button onClick={() => chain().setPageBreak().run()} title="Seitenumbruch einfügen (Strg+Enter)">⤓ Seite</button>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            void insertImageFiles(editor, files)
          }}
        />
      </div>
      <div className="group">
        <button
          className={`draw-tool${drawing ? ' active' : ''}`}
          onClick={onToggleDraw}
          title="Feld aufziehen: danach Diagramm oder Tabelle wählen"
        >
          ⬚ Aufziehen
        </button>
      </div>
      <div className="group">
        <button onClick={() => onFind(false)} title="Suchen (Strg+F) · Ersetzen (Strg+H)">🔍</button>
      </div>
      <div className="group push-right">
        <button className={`claude-btn${chatOpen ? ' active' : ''}`} onClick={onToggleChat} title="Chat mit Claude öffnen">
          ✦ Claude
        </button>
      </div>
    </div>
  )
}
