import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { ColorMenu } from './ColorMenu'

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
}

export function Toolbar({ editor, onNew, onOpen, onSave, onPrint, drawing, onToggleDraw, chatOpen, onToggleChat }: ToolbarProps) {
  // Aktiven Zustand der Buttons bei jeder Änderung neu berechnen
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
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
        <button className={s.bold ? 'active' : ''} onClick={() => chain().toggleBold().run()} title="Fett (Strg+B)"><b>F</b></button>
        <button className={s.italic ? 'active' : ''} onClick={() => chain().toggleItalic().run()} title="Kursiv (Strg+I)"><i>K</i></button>
        <button className={s.underline ? 'active' : ''} onClick={() => chain().toggleUnderline().run()} title="Unterstrichen (Strg+U)"><u>U</u></button>
        <button className={s.strike ? 'active' : ''} onClick={() => chain().toggleStrike().run()} title="Durchgestrichen"><s>S</s></button>
        <ColorMenu editor={editor} kind="text" />
        <ColorMenu editor={editor} kind="highlight" />
      </div>
      <div className="group">
        <button className={s.h1 ? 'active' : ''} onClick={() => chain().toggleHeading({ level: 1 }).run()} title="Überschrift 1">Ü1</button>
        <button className={s.h2 ? 'active' : ''} onClick={() => chain().toggleHeading({ level: 2 }).run()} title="Überschrift 2">Ü2</button>
        <button className={s.h3 ? 'active' : ''} onClick={() => chain().toggleHeading({ level: 3 }).run()} title="Überschrift 3">Ü3</button>
      </div>
      <div className="group">
        <button className={s.bullet ? 'active' : ''} onClick={() => chain().toggleBulletList().run()} title="Aufzählung">• Liste</button>
        <button className={s.ordered ? 'active' : ''} onClick={() => chain().toggleOrderedList().run()} title="Nummerierte Liste">1. Liste</button>
      </div>
      <div className="group">
        <button className={s.left ? 'active' : ''} onClick={() => align('left')} title={s.chart ? 'Diagramm linksbündig' : 'Linksbündig'}>⯇</button>
        <button className={s.center ? 'active' : ''} onClick={() => align('center')} title={s.chart ? 'Diagramm zentrieren' : 'Zentriert'}>≡</button>
        <button className={s.right ? 'active' : ''} onClick={() => align('right')} title={s.chart ? 'Diagramm rechtsbündig' : 'Rechtsbündig'}>⯈</button>
        <button className={s.justify ? 'active' : ''} disabled={s.chart} onClick={() => chain().setTextAlign('justify').run()} title="Blocksatz">☰</button>
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
      <div className="group push-right">
        <button className={`claude-btn${chatOpen ? ' active' : ''}`} onClick={onToggleChat} title="Chat mit Claude öffnen">
          ✦ Claude
        </button>
      </div>
    </div>
  )
}
