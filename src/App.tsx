import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextFormatting } from './extensions/TextFormatting'
import { PageBreakNode } from './extensions/PageBreakNode'
import { ImagePaste, LabImage } from './extensions/ImageInsert'
import { LinkTools } from './extensions/LinkTools'
import { SearchReplace } from './extensions/SearchReplace'
import { FindBar } from './components/FindBar'
import { WordCount } from './components/WordCount'
import Highlight from '@tiptap/extension-highlight'
import { Toolbar } from './components/Toolbar'
import { PageBreaks } from './components/PageBreaks'
import { printDocument } from './lib/print'
import { encodeEmbed } from './lib/pdfEmbed'
import { importPdf } from './lib/pdfImport'
import { DrawLayer } from './components/DrawLayer'
import { ChartPanel } from './components/ChartPanel'
import { ChatPanel } from './components/ChatPanel'
import { useDesktopBridge } from './lib/desktopBridge'
import { ChartNode } from './extensions/ChartNode'
import { TablePlaceholderNode, TablePlaceholderUpgrade } from './extensions/TablePlaceholderNode'
import { LabTable } from './extensions/LabTable'
import { LabData, LabTableCell, LabTableHeader } from './extensions/LabData'
import { TableFill } from './extensions/TableFill'
import { PageLayout } from './extensions/PageLayout'
import { TablePanel } from './components/TablePanel'
import { findTable } from './lib/tableModel'
import {
  createDocument,
  downloadDocument,
  loadAutosave,
  parseDocument,
  saveAutosave,
} from './lib/documentFile'

const EMPTY_CONTENT = '<h1>Versuchsprotokoll</h1><p></p>'

export default function App() {
  const autosaved = useRef(loadAutosave())
  const [title, setTitle] = useState(autosaved.current?.title ?? 'Unbenannt')
  const [status, setStatus] = useState('')
  const [drawing, setDrawing] = useState(false)
  const stopDrawing = useCallback(() => setDrawing(false), [])
  const [chatOpen, setChatOpen] = useState(false)
  // Suchleiste: null = zu, sonst mit oder ohne „Ersetzen“
  const [find, setFind] = useState<{ replace: boolean; n: number } | null>(null)
  const openFind = useCallback((replace: boolean) => setFind((f) => ({ replace: replace || (f?.replace ?? false), n: (f?.n ?? 0) + 1 })), [])
  const fileInput = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: false, tableCell: false, tableHeader: false }),
      LabTableCell,
      LabTableHeader,
      LabTable.configure({ resizable: true, allowTableNodeSelection: true, cellMinWidth: 40 }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      Subscript,
      Superscript,
      TextFormatting,
      PageBreakNode,
      LabImage,
      ImagePaste,
      LinkTools,
      SearchReplace,
      ChartNode,
      TablePlaceholderNode,
      TablePlaceholderUpgrade,
      PageLayout,
      LabData,
      TableFill,
    ],
    content: autosaved.current?.content ?? EMPTY_CONTENT,
    // Abstand beim Scrollen zur Auswahl, damit Treffer nicht unter der Suchleiste landen
    editorProps: { attributes: { class: 'page', spellcheck: 'true' }, scrollMargin: { top: 90, bottom: 40, left: 0, right: 0 }, scrollThreshold: { top: 90, bottom: 40, left: 0, right: 0 } },
  })

  // Automatisch im Browser zwischenspeichern, damit nichts verloren geht
  useEffect(() => {
    if (!editor) return
    const save = () => saveAutosave(createDocument(title, editor.getJSON()))
    save()
    editor.on('update', save)
    return () => {
      editor.off('update', save)
    }
  }, [editor, title])

  const flash = (msg: string) => {
    setStatus(msg)
    window.setTimeout(() => setStatus(''), 2500)
  }

  const handleNew = useCallback(() => {
    if (!editor) return
    if (!window.confirm('Neues Dokument anlegen? Nicht gespeicherte Änderungen gehen verloren.')) return
    editor.commands.setContent(EMPTY_CONTENT)
    setTitle('Unbenannt')
  }, [editor])

  const handleSave = useCallback(() => {
    if (!editor) return
    downloadDocument(createDocument(title, editor.getJSON()))
    flash('Gespeichert')
  }, [editor, title])

  const handleOpen = useCallback(() => fileInput.current?.click(), [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !editor) return
    try {
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        if (!window.confirm('PDF öffnen? Das aktuelle Dokument wird ersetzt. Nicht gespeicherte Änderungen gehen verloren.')) return
        flash('PDF wird gelesen …')
        const { doc, exact } = await importPdf(file)
        editor.commands.setContent(doc.content)
        setTitle(doc.title)
        flash(`„${doc.title}“ geöffnet`)
        if (!exact) {
          window.alert(
            'Diese PDF wurde nicht mit Labreporthelp erstellt (oder mit einem Browser, der die Projektdaten nicht übernimmt). ' +
              'Der Text wurde übernommen und ist jetzt bearbeitbar. Formatierung, Tabellen und Diagramme bitte prüfen; Bilder und Diagramme fremder PDFs werden nicht übernommen.',
          )
        }
        return
      }
      const doc = parseDocument(await file.text())
      editor.commands.setContent(doc.content)
      setTitle(doc.title)
      flash(`„${doc.title}“ geöffnet`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Datei konnte nicht geöffnet werden.')
    }
  }

  // Drucken bzw. als PDF speichern über den Druckdialog des Browsers
  const handlePrint = useCallback(() => {
    if (!editor) return
    // Auswahl aufheben, damit kein Auswahlrahmen mitgedruckt wird
    editor.commands.setTextSelection(editor.state.selection.to)
    // Das Dokument kommt mit in die PDF, damit man sie später wieder in der App bearbeiten kann
    const embed = encodeEmbed(createDocument(title, editor.getJSON())).catch(() => undefined)
    window.setTimeout(async () => printDocument(editor.view.dom as HTMLElement, title, await embed), 50)
  }, [editor, title])

  // Tastenkürzel Strg+S, Strg+O, Strg+P, Strg+F und Strg+H
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        handleSave()
      } else if (key === 'o') {
        e.preventDefault()
        handleOpen()
      } else if (key === 'p') {
        e.preventDefault()
        handlePrint()
      } else if ((key === 'f' || key === 'h') && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        openFind(key === 'h')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave, handleOpen, handlePrint, openFind])

  const desktopConnected = useDesktopBridge(editor)

  // Ist gerade ein Diagramm ausgewählt? Dann die Seitenleiste zeigen.
  const selectedChart = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const sel = e?.state.selection
      if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'chart') return null
      return { pos: sel.from, attrs: sel.node.attrs }
    },
  })

  // Steht der Cursor in einer Tabelle? Dann „Tabelle formatieren“ zeigen.
  const selectedTable = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? findTable(e.state) : null),
  })

  if (!editor) return null

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">Labreporthelp</span>
        <input
          className="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Dokumenttitel"
        />
        <span className="status" aria-live="polite">{status}</span>
        <span
          className={`desktop-status${desktopConnected ? ' on' : ''}`}
          title={
            desktopConnected
              ? 'Claude Desktop kann in dieses Dokument schreiben'
              : 'Claude Desktop ist nicht verbunden. Einrichtung: im Chat (✦ Claude) „Stattdessen Claude Desktop benutzen“'
          }
        >
          {desktopConnected ? 'Claude Desktop verbunden' : 'Claude Desktop nicht verbunden'}
        </span>
      </header>
      <Toolbar
        editor={editor}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onPrint={handlePrint}
        drawing={drawing}
        onToggleDraw={() => setDrawing((d) => !d)}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((c) => !c)}
        onFind={openFind}
      />
      <div className="body">
      <main className="workspace">
        {find && <FindBar key="find" editor={editor} replace={find.replace} focusToken={find.n} onToggleReplace={() => setFind((f) => f && { ...f, replace: !f.replace })} onClose={() => setFind(null)} />}
        <div className={`page-wrap${drawing ? ' drawing' : ''}`}>
          <EditorContent editor={editor} />
          <PageBreaks editor={editor} />
          <WordCount editor={editor} />
          <DrawLayer editor={editor} active={drawing} onDone={stopDrawing} />
        </div>
        {drawing && <div className="hint">Feld mit gedrückter linker Maustaste aufziehen · Esc zum Abbrechen</div>}
      </main>
      {selectedChart && <ChartPanel editor={editor} pos={selectedChart.pos} attrs={selectedChart.attrs} />}
      {!selectedChart && selectedTable && <TablePanel editor={editor} info={selectedTable} />}
      {chatOpen && <ChatPanel editor={editor} desktopConnected={desktopConnected} onClose={() => setChatOpen(false)} />}
      </div>
      <input ref={fileInput} type="file" accept=".json,.lrh.json,.pdf" hidden onChange={handleFile} />
    </div>
  )
}
