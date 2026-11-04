// Trägt Labreporthelp als MCP-Server in Claude Desktop ein (claude_desktop_config.json).
// Wird vom Knopf in der App und von "Claude Desktop verbinden.bat" im Release-Paket benutzt.
// Vorhandene Einträge bleiben erhalten, vorher wird eine Sicherung angelegt.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Ordner, in denen Claude Desktop seine Konfiguration hat (normale Installation und Microsoft-Store-Version). */
function configDirs() {
  const dirs = []
  if (process.platform === 'win32') {
    if (process.env.APPDATA) dirs.push(join(process.env.APPDATA, 'Claude'))
    const local = process.env.LOCALAPPDATA
    if (local && existsSync(join(local, 'Packages'))) {
      for (const p of readdirSync(join(local, 'Packages'))) {
        if (/^(AnthropicPBC\.)?Claude_/i.test(p)) dirs.push(join(local, 'Packages', p, 'LocalCache', 'Roaming', 'Claude'))
      }
    }
  } else if (process.platform === 'darwin') {
    dirs.push(join(homedir(), 'Library', 'Application Support', 'Claude'))
  } else {
    dirs.push(join(process.env.APPDATA || join(homedir(), '.config'), 'Claude'))
  }
  return dirs
}

/**
 * Trägt den Server ein. Ergebnis: { ok, notInstalled?, files, messages }.
 * Befehl ist das Node.js, mit dem gerade gearbeitet wird (im Release-Paket node\node.exe).
 */
export function connectClaudeDesktop() {
  const entry = { command: process.execPath, args: [join(ROOT, 'mcp', 'server.mjs')] }
  const existing = configDirs().filter((d) => existsSync(d))
  if (!existing.length) {
    return {
      ok: false,
      notInstalled: true,
      files: [],
      messages: ['Claude Desktop wurde auf diesem Rechner nicht gefunden. Bitte von https://claude.ai/download installieren, einmal öffnen und anmelden, dann noch einmal verbinden.'],
    }
  }
  const files = []
  const messages = []
  let ok = true
  for (const dir of existing) {
    const file = join(dir, 'claude_desktop_config.json')
    let config = {}
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
      try {
        config = text.trim() ? JSON.parse(text) : {}
      } catch {
        ok = false
        messages.push(`${file} ist kein gültiges JSON und wurde nicht verändert. Bitte dort von Hand unter "mcpServers" eintragen: ${JSON.stringify({ labreporthelp: entry })}`)
        continue
      }
      copyFileSync(file, file + '.sicherung')
    }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) config = {}
    config.mcpServers = { ...(config.mcpServers ?? {}), labreporthelp: entry }
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8')
    files.push(file)
  }
  return { ok, files, messages }
}
