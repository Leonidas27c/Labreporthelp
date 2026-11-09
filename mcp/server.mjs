#!/usr/bin/env node
/**
 * MCP-Server für Claude Desktop.
 *
 * Claude Desktop startet dieses Programm (siehe README, „Claude Desktop verbinden“).
 * Es stellt Claude Werkzeuge wie „insert_table“ bereit und leitet jeden Aufruf
 * über eine lokale WebSocket-Verbindung an die geöffnete Labreporthelp-App
 * weiter. Die App führt den Aufruf im Dokument aus und schickt das Ergebnis zurück.
 *
 * Wichtig: stdout gehört dem MCP-Protokoll, Meldungen deshalb nur über console.error.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { WebSocketServer } from 'ws'
import { z } from 'zod'

const PORT = Number(process.env.LABREPORTHELP_BRIDGE_PORT) || 5174
const TIMEOUT_MS = 20000
// Nur die App selbst darf sich verbinden, keine fremden Webseiten
const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

let app = null // aktuell verbundene App
const pending = new Map()
let nextId = 1
// Für verständliche Fehlermeldungen festhalten, was mit der Brücke los ist
let bridgeState = 'startet'
let lastRejectedOrigin = null

/** Startet die WebSocket-Brücke. Ist der Anschluss belegt, wird es alle 5 s erneut versucht. */
function startBridge() {
  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: PORT,
    verifyClient: ({ origin }) => {
      const ok = !origin || ALLOWED_ORIGIN.test(origin)
      if (!ok) {
        lastRejectedOrigin = origin
        console.error(`[labreporthelp] Verbindung von ${origin} abgelehnt (nur localhost erlaubt)`)
      }
      return ok
    },
  })
  wss.on('error', (err) => {
    bridgeState = `Anschluss ${PORT} nicht verfügbar (${err.code ?? err.message})`
    console.error(`[labreporthelp] Brücke konnte nicht starten: ${err.message}. Neuer Versuch in 5 s.`)
    wss.close()
    setTimeout(startBridge, 5000)
  })
  wss.on('listening', () => {
    bridgeState = 'bereit'
    console.error(`[labreporthelp] Warte auf die App unter ws://127.0.0.1:${PORT}`)
  })
  wss.on('connection', onConnection)
}

// Mehrere offene Tabs dürfen gleichzeitig verbunden sein. Früher hat jede neue Verbindung die alte
// geschlossen; zwei Tabs haben sich dann alle paar Sekunden gegenseitig rausgeworfen (Anzeige flackerte).
// Werkzeugaufrufe gehen an den zuletzt verbundenen Tab.
const apps = []

function onConnection(socket) {
  apps.push(socket)
  app = socket
  console.error('[labreporthelp] App verbunden')
  socket.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    clearTimeout(p.timer)
    msg.error ? p.reject(new Error(msg.error)) : p.resolve(String(msg.result ?? ''))
  })
  socket.on('close', () => {
    const i = apps.indexOf(socket)
    if (i >= 0) apps.splice(i, 1)
    if (app === socket) app = apps.at(-1) ?? null
    console.error('[labreporthelp] App getrennt')
  })
}
startBridge()

function callApp(tool, input) {
  if (!app || app.readyState !== app.OPEN) {
    let detail = `Brücke: ${bridgeState}.`
    if (lastRejectedOrigin) detail += ` Zuletzt abgelehnte Verbindung von ${lastRejectedOrigin}.`
    return Promise.reject(
      new Error(
        `Labreporthelp ist nicht verbunden. Bitte die App starten (npm run dev), unter http://localhost:5173 öffnen und die Seite neu laden. (${detail})`,
      ),
    )
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Die App hat nicht rechtzeitig geantwortet.'))
    }, TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    app.send(JSON.stringify({ id, tool, input }))
  })
}

const server = new McpServer({ name: 'labreporthelp', version: '0.1.0' })

/** Werkzeug registrieren, das an die App weitergereicht wird. */
function bridged(name, config) {
  server.registerTool(name, config, async (input) => {
    try {
      const text = await callApp(name, input ?? {})
      return { content: [{ type: 'text', text }] }
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true }
    }
  })
}

const AFTER =
  'Hinter diesem Block (Nummer aus get_document) einfügen, 0 = ganz am Anfang. Ohne: an der Cursorposition bzw. unter der vorigen Einfügung. ' +
  'Nur bei der ersten Einfügung einer Folge angeben; folgende Einfügungen ohne after landen der Reihe nach darunter. Neu eingefügte Blöcke haben noch keine Nummer, gelöschte Nummern gelten nicht mehr.'

bridged('get_document', {
  title: 'Dokument lesen',
  description:
    'Liefert den aktuellen Inhalt des in Labreporthelp geöffneten Dokuments als Text (Überschriften mit #, Tabellen mit |). „--- Seite N ---“ markiert, wo eine neue A4-Seite beginnt. ' +
    'Jeder Block beginnt mit seiner Nummer, z. B. „[3]“. Diese Nummern brauchen delete_blocks, replace_block, move_blocks, replace_text und after. Sie bleiben gültig, bis get_document erneut aufgerufen wird, auch wenn zwischendurch Blöcke gelöscht oder verschoben werden.',
  inputSchema: {},
})

bridged('insert_table', {
  title: 'Tabelle einfügen',
  description:
    'Fügt in Labreporthelp an der Cursorposition eine Tabelle ein. Spaltenköpfe mit Einheit in eckigen Klammern, z. B. „Zeit t [s]“. Zahlen im deutschen Format. Keine Messwerte erfinden; fehlende Werte als leere Zellen. ' +
    'Passt die Tabelle nicht mehr ganz auf die Seite, rutscht sie automatisch auf die nächste; die Antwort nennt die Seite und den restlichen Platz. Sehr lange Tabellen (mehr als ca. 30 Zeilen) lieber aufteilen.',
  inputSchema: {
    caption: z.string().describe('Tabellenüberschrift, z. B. „Tabelle 1: Messwerte“. Leer, wenn keine gewünscht.'),
    headers: z.array(z.string()).describe('Spaltenköpfe'),
    rows: z.array(z.array(z.string())).describe('Zeilen, jede Zeile eine Liste von Zellen'),
    after: z.number().optional().describe(AFTER),
  },
})

bridged('insert_chart', {
  title: 'Diagrammfeld einfügen',
  description:
    'Fügt in Labreporthelp an der Cursorposition ein leeres Diagrammfeld (Koordinatensystem mit Raster zum Einzeichnen) ein. Die Achsen werden automatisch in runde Abschnitte bis zum Endwert eingeteilt. Messpunkte kann das Programm noch nicht zeichnen. ' +
    'Eine A4-Seite hat ca. 930 px nutzbare Höhe. Passt das Diagramm nur knapp nicht mehr, wird es etwas verkleinert, sonst rutscht es auf die nächste Seite; die Antwort nennt die Seite und den restlichen Platz. Nutze das, um die nächsten Einfügungen zu planen.',
  inputSchema: {
    x_label: z.string(),
    x_unit: z.string().describe('Einheit, z. B. „s“. Leer, wenn keine.'),
    x_start: z.number(),
    x_max: z.number(),
    y_label: z.string(),
    y_unit: z.string(),
    y_start: z.number(),
    y_max: z.number(),
    background: z.enum(['grid', 'dots', 'blank']).describe('grid = kariert, dots = punktiert, blank = blanko'),
    width: z.number().describe('Breite in Pixeln, üblich 300–600'),
    height: z.number().describe('Höhe in Pixeln, üblich 250–400 (zwei Diagramme à 400 px passen auf eine Seite)'),
    after: z.number().optional().describe(AFTER),
  },
})

bridged('insert_text', {
  title: 'Text einfügen',
  description: 'Fügt in Labreporthelp an der Cursorposition (oder hinter einem Block) Absätze, Überschriften oder Aufzählungspunkte ein.',
  inputSchema: {
    blocks: z.array(
      z.object({
        style: z.enum(['paragraph', 'heading1', 'heading2', 'heading3', 'bullet']),
        text: z.string(),
      }),
    ),
    after: z.number().optional().describe(AFTER),
  },
})

bridged('delete_blocks', {
  title: 'Inhalte löschen',
  description: 'Löscht Blöcke (Absätze, Überschriften, Listen, Tabellen, Diagramme) aus dem Dokument. Nummern aus get_document.',
  inputSchema: {
    blocks: z.array(z.number()).describe('Nummern der zu löschenden Blöcke'),
  },
})

bridged('replace_block', {
  title: 'Block ersetzen',
  description: 'Ersetzt einen Block durch neuen Text (Absätze, Überschriften, Aufzählungspunkte). Leere Liste = Block löschen.',
  inputSchema: {
    block: z.number().describe('Nummer des Blocks aus get_document'),
    blocks: z.array(
      z.object({
        style: z.enum(['paragraph', 'heading1', 'heading2', 'heading3', 'bullet']),
        text: z.string(),
      }),
    ),
  },
})

bridged('move_blocks', {
  title: 'Inhalte verschieben',
  description: 'Verschiebt Blöcke an eine andere Stelle. Sie landen in der angegebenen Reihenfolge hinter dem Zielblock.',
  inputSchema: {
    blocks: z.array(z.number()).describe('Nummern der zu verschiebenden Blöcke, in der gewünschten Reihenfolge'),
    after: z.number().describe('Hinter diesen Block verschieben, 0 = ganz an den Anfang'),
  },
})

bridged('replace_text', {
  title: 'Text ersetzen',
  description: 'Sucht einen Text und ersetzt jedes Vorkommen (auch in Tabellen). Die Formatierung drumherum bleibt erhalten. Leeres replace löscht den Text.',
  inputSchema: {
    find: z.string(),
    replace: z.string(),
    block: z.number().optional().describe('Nur in diesem Block suchen (Nummer aus get_document). Ohne: im ganzen Dokument.'),
  },
})

await server.connect(new StdioServerTransport())
