// Trägt Labreporthelp als MCP-Server in Claude Desktop ein (claude_desktop_config.json).
// Läuft mit dem Node.js aus dem Paket: node\node.exe scripts\claude-desktop.mjs
// Vorhandene Einträge bleiben erhalten, vorher wird eine Sicherung angelegt.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nodeExe = process.platform === 'win32' ? join(root, 'node', 'node.exe') : process.execPath
const server = join(root, 'mcp', 'server.mjs')
const entry = { command: nodeExe, args: [server] }
const quiet = process.argv.includes('--nur-wenn-installiert')

/** Ordner, in denen Claude Desktop seine Konfiguration hat (normale Installation und Microsoft-Store-Version). */
function configDirs() {
  const dirs = []
  const appdata = process.env.APPDATA
  const local = process.env.LOCALAPPDATA
  if (appdata) dirs.push(join(appdata, 'Claude'))
  if (local && existsSync(join(local, 'Packages'))) {
    for (const p of readdirSync(join(local, 'Packages'))) {
      if (/^(AnthropicPBC\.)?Claude_/i.test(p)) dirs.push(join(local, 'Packages', p, 'LocalCache', 'Roaming', 'Claude'))
    }
  }
  if (!appdata && process.env.HOME) dirs.push(join(process.env.HOME, '.config', 'Claude'))
  return dirs
}

const existing = configDirs().filter((d) => existsSync(d))
if (!existing.length) {
  if (quiet) process.exit(0)
  console.log('Claude Desktop wurde auf diesem Rechner nicht gefunden.')
  console.log('Bitte zuerst von https://claude.ai/download installieren, einmal öffnen und anmelden.')
  console.log('Danach "Claude Desktop verbinden.bat" noch einmal doppelklicken.')
  process.exit(1)
}

let failed = false
for (const dir of existing) {
  const file = join(dir, 'claude_desktop_config.json')
  let config = {}
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
    try {
      config = text.trim() ? JSON.parse(text) : {}
    } catch {
      console.log(`Die Datei ${file} ist kein gültiges JSON, ich ändere sie lieber nicht.`)
      console.log('Trage dort von Hand unter "mcpServers" ein:')
      console.log(JSON.stringify({ mcpServers: { labreporthelp: entry } }, null, 2))
      failed = true
      continue
    }
    copyFileSync(file, file + '.sicherung')
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) config = {}
  config.mcpServers = { ...(config.mcpServers ?? {}), labreporthelp: entry }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8')
  console.log(`Eingetragen in ${file}`)
}

if (!failed) {
  console.log('')
  console.log('Claude Desktop ist verbunden. Jetzt Claude Desktop ganz beenden (auch unten rechts')
  console.log('im Infobereich neben der Uhr: Rechtsklick auf das Claude-Symbol, "Beenden") und neu öffnen.')
  console.log('Wenn Labreporthelp läuft, steht oben rechts in der App "Claude Desktop verbunden".')
}
process.exit(failed ? 1 : 0)
