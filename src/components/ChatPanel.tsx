import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DocumentTools } from '../lib/documentTools'
import { DEFAULT_MODEL, MODELS, aboStatus, runAboChat, type AboStatus, type ModelId } from '../lib/aboChat'
import { ACCEPT, readAttachment, type Attachment } from '../lib/attachments'

const MODEL_STORAGE = 'labreporthelp:model'

type Entry =
  | { kind: 'user'; text: string; files?: string[] }
  | { kind: 'assistant'; text: string }
  | { kind: 'action'; text: string; ok: boolean }
  | { kind: 'error'; text: string }

const EXAMPLES = [
  'Erstelle eine Messwerttabelle mit Zeit [s] und Temperatur [°C], 10 Zeilen',
  'Füge ein Diagramm ein: Spannung U [V] von 0 bis 12, Strom I [mA] von 0 bis 50',
  'Lege die Gliederung für ein Versuchsprotokoll an',
]

function loadModel(): ModelId {
  try {
    const m = localStorage.getItem(MODEL_STORAGE)
    return MODELS.some((x) => x.id === m) ? (m as ModelId) : DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

/** **fett** aus der Antwort als fette Schrift anzeigen statt mit Sternchen. */
function withBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))
}

/** Chat mit Claude in der Seitenleiste, über Claude Code und das Claude-Abo. Claude kann Tabellen, Diagramme und Text einfügen. */
export function ChatPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [status, setStatus] = useState<AboStatus | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState<ModelId>(loadModel)
  const [files, setFiles] = useState<Attachment[]>([])
  const [reading, setReading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const sessionId = useRef<string | null>(null)
  const tools = useMemo(() => new DocumentTools(editor), [editor])
  const listEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' })
  }, [entries, busy])

  useEffect(() => {
    aboStatus().then(setStatus)
  }, [])

  const saveModel = (m: ModelId) => {
    setModel(m)
    try {
      localStorage.setItem(MODEL_STORAGE, m)
    } catch {
      /* ignorieren */
    }
  }

  const addFiles = async (list: FileList | File[]) => {
    setReading(true)
    for (const f of Array.from(list)) {
      try {
        const att = await readAttachment(f)
        setFiles((cur) => [...cur, att])
      } catch (err) {
        setEntries((e) => [...e, { kind: 'error', text: err instanceof Error ? err.message : String(err) }])
      }
    }
    setReading(false)
  }

  const send = async (text: string) => {
    const msg = text.trim() || (files.length ? 'Lies die angehängte Datei und fasse kurz zusammen, was für das Protokoll wichtig ist.' : '')
    if (!msg || busy || reading) return
    const attached = files
    setInput('')
    setFiles([])
    setEntries((e) => [...e, { kind: 'user', text: msg, files: attached.map((a) => a.name) }])
    setBusy(true)
    try {
      sessionId.current = await runAboChat({
        message: msg,
        model,
        sessionId: sessionId.current,
        files: attached,
        tools,
        onEvent: (ev) =>
          setEntries((e) => [
            ...e,
            ev.type === 'text' ? { kind: 'assistant', text: ev.text } : { kind: 'action', text: ev.label, ok: ev.ok },
          ]),
      })
    } catch (err) {
      setFiles((cur) => (cur.length ? cur : attached))
      setEntries((e) => [...e, { kind: 'error', text: err instanceof Error ? err.message : String(err) }])
      aboStatus().then(setStatus)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    sessionId.current = null
    setEntries([])
  }

  return (
    <aside className="side-panel chat-panel" aria-label="Claude">
      <div className="chat-head">
        <h2>✦ Claude</h2>
        <div className="chat-head-actions">
          <button title="Neuer Chat" onClick={reset} disabled={busy}>Neu</button>
          <button title="Schließen" onClick={onClose}>✕</button>
        </div>
      </div>

      <label className="model-select">
        Modell
        <select value={model} onChange={(e) => saveModel(e.target.value as ModelId)} disabled={busy}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>

      {status && !status.installed && (
        <section className="chat-settings">
          <p className="help">{status.message}</p>
          <button onClick={() => aboStatus().then(setStatus)}>Erneut prüfen</button>
        </section>
      )}

      <div className="chat-list">
        {entries.length === 0 && (
          <div className="chat-empty">
            <p>Sag mir, was ins Dokument soll. Ich füge es an der Cursorposition ein. Läuft über dein Claude-Abo.</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="example" onClick={() => send(ex)} disabled={busy}>{ex}</button>
            ))}
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className={`chat-msg ${e.kind}${e.kind === 'action' && !e.ok ? ' failed' : ''}`}>
            {e.kind === 'user' && e.files?.length ? (
              <span className="msg-files">{e.files.map((f) => `📎 ${f}`).join('\n')}</span>
            ) : null}
            {e.kind === 'action' ? `${e.ok ? '✓' : '✗'} ${e.text}` : e.kind === 'assistant' ? withBold(e.text) : e.text}
          </div>
        ))}
        {busy && <div className="chat-msg assistant typing">Claude arbeitet …</div>}
        <div ref={listEnd} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }}
      >
        {(files.length > 0 || reading) && (
          <div className="attachments">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="attachment">
                📎 {f.name} <small>{f.kind}</small>
                <button type="button" title="Entfernen" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
            {reading && <span className="attachment reading">Datei wird gelesen …</span>}
          </div>
        )}
        <textarea
          value={input}
          rows={3}
          placeholder="z. B. „Erstelle aus der Versuchsanleitung die Messwerttabellen und Diagramme“"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
        />
        <div className="chat-input-row">
          <button type="button" className="attach-btn" onClick={() => fileInput.current?.click()} disabled={busy} title="PDF, Word, PowerPoint, Bild oder Text anhängen">
            📎 Datei
          </button>
          <button type="submit" className="primary" disabled={busy || reading || (!input.trim() && !files.length)}>Senden</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </form>
    </aside>
  )
}
