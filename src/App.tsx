import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { Toolbar } from './components/Toolbar'
import { DrawLayer } from './components/DrawLayer'
import { ChartNode } from './extensions/ChartNode'
import { TablePlaceholderNode } from './extensions/TablePlaceholderNode'
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
  const fileInput = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ChartNode,
      TablePlaceholderNode,
    ],
    content: autosaved.current?.content ?? EMPTY_CONTENT,
    editorProps: { attributes: { class: 'page', spellcheck: 'true' } },
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
      const doc = parseDocument(await file.text())
      editor.commands.setContent(doc.content)
      setTitle(doc.title)
      flash(`„${doc.title}“ geöffnet`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Datei konnte nicht geöffnet werden.')
    }
  }

  // Tastenkürzel Strg+S und Strg+O
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave, handleOpen])

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
      </header>
      <Toolbar
        editor={editor}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        drawing={drawing}
        onToggleDraw={() => setDrawing((d) => !d)}
      />
      <main className="workspace">
        <div className={`page-wrap${drawing ? ' drawing' : ''}`}>
          <EditorContent editor={editor} />
          <DrawLayer editor={editor} active={drawing} onDone={stopDrawing} />
        </div>
        {drawing && <div className="hint">Feld mit gedrückter linker Maustaste aufziehen · Esc zum Abbrechen</div>}
      </main>
      <input ref={fileInput} type="file" accept=".json,.lrh.json" hidden onChange={handleFile} />
    </div>
  )
}
