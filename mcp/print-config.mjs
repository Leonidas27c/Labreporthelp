#!/usr/bin/env node
/** Gibt den Eintrag für die Claude-Desktop-Konfiguration mit dem richtigen Pfad aus. */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs')
const configFile =
  process.platform === 'win32'
    ? path.join(process.env.APPDATA ?? '%APPDATA%', 'Claude', 'claude_desktop_config.json')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json')

const config = { mcpServers: { labreporthelp: { command: 'node', args: [server] } } }

console.log(`
So verbindest du Claude Desktop mit Labreporthelp:

1. In Claude Desktop: Einstellungen → Entwickler → „Konfiguration bearbeiten“.
   (Die Datei liegt hier: ${configFile})
2. Diesen Inhalt eintragen. Falls dort schon "mcpServers" steht, nur den
   Eintrag "labreporthelp" ergänzen:

${JSON.stringify(config, null, 2)}

3. Claude Desktop komplett beenden und neu starten.
4. Labreporthelp mit "npm run dev" starten und im Browser öffnen.
   Oben rechts in der App steht dann „Claude Desktop verbunden“.
5. In Claude Desktop schreiben, z. B.: „Erstelle in Labreporthelp eine
   Messwerttabelle mit Zeit [s] und Temperatur [°C], 10 Zeilen.“
`)
