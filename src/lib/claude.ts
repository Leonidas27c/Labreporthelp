import Anthropic from '@anthropic-ai/sdk'
import type { DocumentTools } from './documentTools'

export const MODEL = 'claude-opus-5-5'

const SYSTEM_PROMPT = `Du bist der Schreibassistent in „Labreporthelp“, einem Textprogramm für Laborprotokolle und wissenschaftliche Arbeiten.
Die Person schreibt gerade ein Dokument und bittet dich im Chat um Hilfe.

So arbeitest du:
- Wenn die Person eine Tabelle, ein Diagrammfeld oder Text haben möchte, füge es mit den Werkzeugen direkt ins Dokument ein, statt es nur im Chat zu zeigen. Eingefügt wird an der Stelle, an der der Cursor steht.
- Wenn sich die Bitte auf vorhandenen Inhalt bezieht („die Messwerte oben“, „mein Text“), lies zuerst das Dokument mit get_document.
- Tabellen: sinnvolle Spaltenköpfe mit Einheit in eckigen Klammern, z. B. „Zeit t [s]“. Zahlen im deutschen Format mit Komma. Erfinde keine Messwerte; wenn Werte fehlen, lege leere Zellen an.
- Diagrammfelder sind leere Koordinatensysteme (Millimeterpapier) zum Einzeichnen. Messpunkte kann das Programm noch nicht zeichnen; sag das kurz, falls danach gefragt wird. Wähle Achsenbereiche, die zu den Daten passen.
- Antworte danach kurz auf Deutsch (ein bis zwei Sätze), was du eingefügt hast.`

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_document',
    description: 'Liefert den aktuellen Inhalt des Dokuments als Text (Überschriften mit #, Tabellen mit |).',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'insert_table',
    description: 'Fügt eine Tabelle an der Cursorposition ins Dokument ein.',
    input_schema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'Tabellenüberschrift, z. B. „Tabelle 1: Messwerte“. Leer lassen, wenn keine gewünscht.' },
        headers: { type: 'array', items: { type: 'string' }, description: 'Spaltenköpfe' },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Zeilen, jede Zeile eine Liste von Zellen' },
      },
      required: ['caption', 'headers', 'rows'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'insert_chart',
    description: 'Fügt ein leeres Diagrammfeld (Koordinatensystem mit Raster) an der Cursorposition ein. Die Achsen werden automatisch in runde Abschnitte bis zum Endwert eingeteilt.',
    input_schema: {
      type: 'object',
      properties: {
        x_label: { type: 'string' },
        x_unit: { type: 'string', description: 'Einheit, z. B. „s“. Leer, wenn keine.' },
        x_start: { type: 'number' },
        x_max: { type: 'number' },
        y_label: { type: 'string' },
        y_unit: { type: 'string' },
        y_start: { type: 'number' },
        y_max: { type: 'number' },
        background: { type: 'string', enum: ['grid', 'dots', 'blank'], description: 'grid = kariert, dots = punktiert, blank = blanko' },
        width: { type: 'number', description: 'Breite in Pixeln, üblich 300–600' },
        height: { type: 'number', description: 'Höhe in Pixeln, üblich 250–450' },
      },
      required: ['x_label', 'x_unit', 'x_start', 'x_max', 'y_label', 'y_unit', 'y_start', 'y_max', 'background', 'width', 'height'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'insert_text',
    description: 'Fügt Text (Absätze, Überschriften, Aufzählungspunkte) an der Cursorposition ein.',
    input_schema: {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              style: { type: 'string', enum: ['paragraph', 'heading1', 'heading2', 'heading3', 'bullet'] },
              text: { type: 'string' },
            },
            required: ['style', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['blocks'],
      additionalProperties: false,
    },
    strict: true,
  },
]

const ACTION_LABELS: Record<string, string> = {
  get_document: 'Dokument gelesen',
  insert_table: 'Tabelle eingefügt',
  insert_chart: 'Diagramm eingefügt',
  insert_text: 'Text eingefügt',
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'action'; label: string; ok: boolean }

/**
 * Schickt die Unterhaltung an Claude und führt die Werkzeugaufrufe aus,
 * bis Claude fertig ist. `history` wird dabei fortgeschrieben.
 */
export async function runChat(
  apiKey: string,
  history: Anthropic.Beta.BetaMessageParam[],
  tools: DocumentTools,
  onEvent: (e: ChatEvent) => void,
) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  tools.begin()

  for (let step = 0; step < 10; step++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: history,
      output_config: { effort: 'medium' },
      // Falls eine Anfrage abgelehnt wird, übernimmt automatisch ein passendes anderes Modell
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })

    history.push({ role: 'assistant', content: response.content })
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) onEvent({ type: 'text', text: block.text })
    }

    if (response.stop_reason === 'refusal') {
      onEvent({ type: 'text', text: 'Claude hat diese Anfrage abgelehnt.' })
      return
    }
    if (response.stop_reason === 'max_tokens') {
      onEvent({ type: 'text', text: 'Die Antwort war zu lang und wurde abgebrochen.' })
      return
    }
    if (response.stop_reason === 'pause_turn') continue
    if (response.stop_reason !== 'tool_use') return

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      try {
        const out = tools.run(block.name, block.input)
        results.push({ type: 'tool_result', tool_use_id: block.id, content: out })
        if (block.name !== 'get_document') onEvent({ type: 'action', label: ACTION_LABELS[block.name] ?? block.name, ok: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ type: 'tool_result', tool_use_id: block.id, content: msg, is_error: true })
        onEvent({ type: 'action', label: `${ACTION_LABELS[block.name] ?? block.name} fehlgeschlagen`, ok: false })
      }
    }
    history.push({ role: 'user', content: results })
  }
}

/** Verständliche Fehlermeldung für die Oberfläche. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Der API-Schlüssel ist ungültig. Bitte in den Einstellungen prüfen.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'Dieser API-Schlüssel hat keinen Zugriff auf das Modell.'
  if (err instanceof Anthropic.RateLimitError) return 'Zu viele Anfragen. Bitte kurz warten und noch einmal versuchen.'
  if (err instanceof Anthropic.BadRequestError) return `Anfrage abgelehnt: ${err.message}`
  if (err instanceof Anthropic.APIConnectionError) return 'Keine Verbindung zu Claude. Bist du online?'
  if (err instanceof Anthropic.APIError) return `Fehler ${err.status}: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}
