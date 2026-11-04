import { useEffect, useMemo, useRef, useState } from 'react'
import type Anthropic from '@anthropic-ai/sdk'
import type { Editor } from '@tiptap/react'
import { DocumentTools } from '../lib/documentTools'
import { describeError, runChat } from '../lib/claude'

const KEY_STORAGE = 'labreporthelp:anthropic-key'

type Entry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'action'; text: string; ok: boolean }
  | { kind: 'error'; text: string }

const EXAMPLES = [
  'Erstelle eine Messwerttabelle mit Zeit [s] und Temperatur [°C], 10 Zeilen',
  'Füge ein Diagramm ein: Spannung U [V] von 0 bis 12, Strom I [mA] von 0 bis 50',
  'Lege die Gliederung für ein Versuchsprotokoll an',
]

function loadKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

/** Chat mit Claude in der Seitenleiste. Claude kann Tabellen, Diagramme und Text einfügen. */
export function ChatPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [apiKey, setApiKey] = useState(loadKey)
  const [showSettings, setShowSettings] = useState(() => !loadKey())
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const history = useRef<Anthropic.Beta.BetaMessageParam[]>([])
  const tools = useMemo(() => new DocumentTools(editor), [editor])
  const listEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' })
  }, [entries, busy])

  const saveKey = (k: string) => {
    setApiKey(k)
    try {
      localStorage.setItem(KEY_STORAGE, k)
    } catch {
      /* ignorieren */
    }
  }

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || busy) return
    if (!apiKey) {
      setShowSettings(true)
      return
    }
    setInput('')
    setEntries((e) => [...e, { kind: 'user', text: msg }])
    setBusy(true)
    const before = history.current.length
    history.current.push({ role: 'user', content: msg })
    try {
      await runChat(apiKey, history.current, tools, (ev) =>
        setEntries((e) => [
          ...e,
          ev.type === 'text' ? { kind: 'assistant', text: ev.text } : { kind: 'action', text: ev.label, ok: ev.ok },
        ]),
      )
    } catch (err) {
      // Unterhaltung auf den Stand vor der Anfrage zurücksetzen, damit sie gültig bleibt
      history.current.length = before
      setEntries((e) => [...e, { kind: 'error', text: describeError(err) }])
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    history.current = []
    setEntries([])
  }

  return (
    <aside className="side-panel chat-panel" aria-label="Claude">
      <div className="chat-head">
        <h2>✦ Claude</h2>
        <div className="chat-head-actions">
          <button title="Neuer Chat" onClick={reset} disabled={busy}>Neu</button>
          <button title="Einstellungen" onClick={() => setShowSettings((s) => !s)}>⚙</button>
          <button title="Schließen" onClick={onClose}>✕</button>
        </div>
      </div>

      {showSettings && (
        <section className="chat-settings">
          <label>
            Anthropic API-Schlüssel
            <input
              type="password"
              value={apiKey}
              placeholder="sk-ant-…"
              autoComplete="off"
              onChange={(e) => saveKey(e.target.value.trim())}
            />
          </label>
          <p className="help">
            Den Schlüssel bekommst du unter{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
            Er wird nur in diesem Browser gespeichert und direkt an Anthropic geschickt. Jede Anfrage kostet ein paar Cent.
          </p>
          {apiKey && <button className="primary" onClick={() => setShowSettings(false)}>Fertig</button>}
        </section>
      )}

      <div className="chat-list">
        {entries.length === 0 && (
          <div className="chat-empty">
            <p>Sag mir, was ins Dokument soll. Ich füge es an der Cursorposition ein.</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="example" onClick={() => send(ex)} disabled={busy}>{ex}</button>
            ))}
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className={`chat-msg ${e.kind}${e.kind === 'action' && !e.ok ? ' failed' : ''}`}>
            {e.kind === 'action' ? `${e.ok ? '✓' : '✗'} ${e.text}` : e.text}
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
      >
        <textarea
          value={input}
          rows={3}
          placeholder="z. B. „Erstelle eine Tabelle für 8 Messungen von Weg und Zeit“"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
        />
        <button type="submit" className="primary" disabled={busy || !input.trim()}>Senden</button>
      </form>
    </aside>
  )
}
