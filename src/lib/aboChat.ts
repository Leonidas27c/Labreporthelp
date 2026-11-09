import type { Attachment } from './attachments'
import type { DocumentTools } from './documentTools'

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 – schnell, spart Nutzung' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 – gute Mitte' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 – sehr genau (Standard)' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1 – am stärksten, braucht am meisten' },
] as const
export type ModelId = (typeof MODELS)[number]['id']
export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5'

const ACTION_LABELS: Record<string, string> = {
  insert_table: 'Tabelle eingefügt',
  insert_chart: 'Diagramm eingefügt',
  insert_text: 'Text eingefügt',
  delete_blocks: 'Inhalt gelöscht',
  replace_block: 'Absatz ersetzt',
  move_blocks: 'Inhalt verschoben',
  replace_text: 'Text ersetzt',
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'action'; label: string; ok: boolean }

export type AboStatus = { installed: true; version: string; loggedIn: boolean | null } | { installed: false; message: string }

/** Fehler, bei dem die Person sich erst bei Claude anmelden muss. */
export class NeedsLoginError extends Error {}
/** Fehler, bei dem das Konto kein Claude Code hat (z. B. kostenloses Konto). */
export class NeedsDesktopError extends Error {}

/** Trägt Labreporthelp in Claude Desktop ein. Liefert eine Meldung für die Person. */
export async function connectDesktop(): Promise<{ ok: boolean; running?: boolean; text: string }> {
  try {
    const r = await fetch('/api/desktop/connect', { method: 'POST' })
    const data = await r.json()
    if (data.ok) {
      return {
        ok: true,
        text: `Eingetragen in: ${(data.files ?? []).join(', ')}. Jetzt Claude Desktop öffnen. Dann steht oben „Claude Desktop verbunden“, und in Claude Desktop unter Einstellungen → Entwickler „labreporthelp“.`,
      }
    }
    return { ok: false, running: Boolean(data.running), text: (data.messages ?? []).join(' ') || data.error || 'Das hat nicht geklappt.' }
  } catch {
    return { ok: false, text: 'Der lokale Server antwortet nicht.' }
  }
}

/** Öffnet auf diesem Rechner ein Fenster für die Anmeldung bei Claude. */
export async function aboLogin(): Promise<string | null> {
  try {
    const r = await fetch('/api/abo/login', { method: 'POST' })
    const data = await r.json()
    return data.ok ? null : String(data.error ?? 'Das Anmeldefenster konnte nicht geöffnet werden.')
  } catch {
    return 'Der lokale Server antwortet nicht.'
  }
}

/** Prüft, ob Claude Code auf diesem Rechner läuft (über den lokalen Vite-Server). */
export async function aboStatus(): Promise<AboStatus> {
  try {
    const r = await fetch('/api/abo/status')
    if (!r.ok) throw new Error()
    return await r.json()
  } catch {
    return { installed: false, message: 'Der lokale Server antwortet nicht. Bitte die App mit `npm run dev` starten.' }
  }
}

/** Angehängte Datei so aufbereiten, dass der lokale Server sie als Datei speichern kann. */
function toFile(a: Attachment) {
  const b = a.block
  if ((b.type === 'document' || b.type === 'image') && b.source.type === 'base64') {
    const ext = b.source.media_type.split('/')[1]
    const name = a.name.toLowerCase().endsWith(`.${ext}`) || b.type === 'document' ? a.name : `${a.name}.${ext}`
    return { name, encoding: 'base64', data: b.source.data }
  }
  if (b.type === 'document' && b.source.type === 'text') {
    return { name: `${a.name}.txt`, encoding: 'utf8', data: b.source.data }
  }
  return { name: `${a.name}.txt`, encoding: 'utf8', data: '' }
}

const BLOCK = /```labreporthelp\s*([\s\S]*?)```/g

/** Trennt den Antworttext von den Einfüge-Aktionen. */
export function parseReply(text: string): { text: string; actions: { tool: string; input: unknown }[]; broken: boolean } {
  const actions: { tool: string; input: unknown }[] = []
  let broken = false
  for (const m of text.matchAll(BLOCK)) {
    try {
      const list = JSON.parse(m[1])
      for (const a of Array.isArray(list) ? list : [list]) {
        if (a && typeof a.tool === 'string') actions.push({ tool: a.tool, input: a.input ?? {} })
      }
    } catch {
      broken = true
    }
  }
  return { text: text.replace(BLOCK, '').trim(), actions, broken }
}

/**
 * Schickt eine Nachricht über Claude Code (Abo) und fügt die Antwort ins Dokument ein.
 * Gibt die Sitzungs-ID zurück, mit der die Unterhaltung fortgesetzt wird.
 */
export async function runAboChat(opts: {
  message: string
  model: ModelId
  sessionId: string | null
  files: Attachment[]
  tools: DocumentTools
  onEvent: (e: ChatEvent) => void
}): Promise<string | null> {
  const { tools, onEvent } = opts
  tools.begin()
  const r = await fetch('/api/abo/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message,
      model: opts.model,
      sessionId: opts.sessionId,
      document: tools.getDocument(),
      files: opts.files.map(toFile),
    }),
  }).catch(() => {
    throw new Error('Der lokale Server antwortet nicht. Läuft `npm run dev` noch?')
  })
  const data = await r.json().catch(() => ({ error: `Fehler ${r.status}` }))
  if (data.error) throw data.needsLogin ? new NeedsLoginError(data.error) : data.needsDesktop ? new NeedsDesktopError(data.error) : new Error(data.error)

  // Normalfall: festes Format mit Text und Aktionen. Sonst den Text nach einem Aktionsblock durchsuchen.
  const reply = Array.isArray(data.actions)
    ? { text: String(data.text ?? '').trim(), actions: data.actions as { tool: string; input: unknown }[], broken: false }
    : parseReply(String(data.text ?? ''))
  if (reply.text) onEvent({ type: 'text', text: reply.text })
  for (const a of reply.actions) {
    const label = ACTION_LABELS[a.tool] ?? a.tool
    try {
      await tools.run(a.tool, a.input)
      onEvent({ type: 'action', label, ok: true })
    } catch {
      onEvent({ type: 'action', label: `${label} fehlgeschlagen`, ok: false })
    }
  }
  if (reply.broken) onEvent({ type: 'action', label: 'Ein Teil der Antwort konnte nicht eingefügt werden', ok: false })
  return data.sessionId ?? null
}

/** Text für die Claude-Desktop-Konfiguration zum Kopieren (mit den richtigen Pfaden für diesen Rechner). */
export async function desktopSnippet(): Promise<string> {
  try {
    const r = await fetch('/api/desktop/snippet')
    return String((await r.json()).snippet ?? '')
  } catch {
    return ''
  }
}
