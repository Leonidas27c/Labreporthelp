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

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: PORT,
  verifyClient: ({ origin }) => !origin || ALLOWED_ORIGIN.test(origin),
})
wss.on('error', (err) => console.error(`[labreporthelp] Brücke konnte nicht starten: ${err.message}`))
wss.on('listening', () => console.error(`[labreporthelp] Warte auf die App unter ws://127.0.0.1:${PORT}`))
wss.on('connection', (socket) => {
  app?.close()
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
    if (app === socket) app = null
    console.error('[labreporthelp] App getrennt')
  })
})

function callApp(tool, input) {
  if (!app || app.readyState !== app.OPEN) {
    return Promise.reject(
      new Error('Labreporthelp ist nicht geöffnet. Bitte die App starten (npm run dev) und im Browser öffnen.'),
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

bridged('get_document', {
  title: 'Dokument lesen',
  description:
    'Liefert den aktuellen Inhalt des in Labreporthelp geöffneten Dokuments als Text (Überschriften mit #, Tabellen mit |).',
  inputSchema: {},
})

bridged('insert_table', {
  title: 'Tabelle einfügen',
  description:
    'Fügt in Labreporthelp an der Cursorposition eine Tabelle ein. Spaltenköpfe mit Einheit in eckigen Klammern, z. B. „Zeit t [s]“. Zahlen im deutschen Format. Keine Messwerte erfinden; fehlende Werte als leere Zellen.',
  inputSchema: {
    caption: z.string().describe('Tabellenüberschrift, z. B. „Tabelle 1: Messwerte“. Leer, wenn keine gewünscht.'),
    headers: z.array(z.string()).describe('Spaltenköpfe'),
    rows: z.array(z.array(z.string())).describe('Zeilen, jede Zeile eine Liste von Zellen'),
  },
})

bridged('insert_chart', {
  title: 'Diagrammfeld einfügen',
  description:
    'Fügt in Labreporthelp an der Cursorposition ein leeres Diagrammfeld (Koordinatensystem mit Raster zum Einzeichnen) ein. Die Achsen werden automatisch in runde Abschnitte bis zum Endwert eingeteilt. Messpunkte kann das Programm noch nicht zeichnen.',
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
    height: z.number().describe('Höhe in Pixeln, üblich 250–450'),
  },
})

bridged('insert_text', {
  title: 'Text einfügen',
  description: 'Fügt in Labreporthelp an der Cursorposition Absätze, Überschriften oder Aufzählungspunkte ein.',
  inputSchema: {
    blocks: z.array(
      z.object({
        style: z.enum(['paragraph', 'heading1', 'heading2', 'heading3', 'bullet']),
        text: z.string(),
      }),
    ),
  },
})

await server.connect(new StdioServerTransport())
