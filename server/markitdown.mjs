// Versuchsanleitungen & Co. mit Microsoft markitdown in Markdown umwandeln,
// bevor sie an Claude gehen. markitdown ist ein Python-Programm:
// - Im Windows-Release-Paket liegt ein eigenes Python mit markitdown im Ordner "python".
// - Bei der Entwickler-Installation legt `npm run markitdown-setup` den Ordner ".venv" an.
// - Sonst wird ein Python auf dem Rechner benutzt, falls dort markitdown installiert ist.
// Fehlt markitdown, liest die App die Dateien wie bisher selbst.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const SCRIPT = join(here, 'markitdown_convert.py')
const WORK_DIR = join(tmpdir(), 'labreporthelp-markitdown')
const TIMEOUT_MS = 3 * 60 * 1000
const win = process.platform === 'win32'

/** Mögliche Python-Programme, das mitgelieferte zuerst. */
function candidates() {
  const list = []
  if (process.env.LRH_PYTHON) list.push([process.env.LRH_PYTHON])
  const local = win
    ? [join(ROOT, 'python', 'python.exe'), join(ROOT, '.venv', 'Scripts', 'python.exe')]
    : [join(ROOT, 'python', 'bin', 'python3'), join(ROOT, '.venv', 'bin', 'python')]
  for (const p of local) if (existsSync(p)) list.push([p])
  if (win) list.push(['py', '-3'], ['python'])
  else list.push(['python3'], ['python'])
  return list
}

function run(cmd, args, timeout = TIMEOUT_MS) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd[0], [...cmd.slice(1), ...args], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
      })
    } catch (err) {
      return resolve({ code: -1, stdout: '', stderr: String(err) })
    }
    const out = []
    let stderr = ''
    const timer = setTimeout(() => child.kill(), timeout)
    child.stdout.on('data', (d) => out.push(d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout: '', stderr: String(err) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr })
    })
  })
}

let found = null // { cmd, version }
let lastProbe = 0

/** Sucht ein Python mit markitdown. Ein Fund wird gemerkt, ein Fehlschlag nur 30 s (falls gerade installiert wird). */
export async function findMarkitdown() {
  if (found) return found
  if (Date.now() - lastProbe < 30_000) return null
  lastProbe = Date.now()
  for (const cmd of candidates()) {
    const r = await run(cmd, [SCRIPT, '--check'], 60_000)
    if (r.code === 0 && r.stdout.trim()) {
      found = { cmd, version: r.stdout.trim() }
      return found
    }
  }
  return null
}

const safeName = (name) => String(name).replace(/[^\w.\-äöüÄÖÜß ]/g, '_').slice(0, 120) || 'datei'

/** Wandelt eine Datei in Markdown um. Liefert { markdown } oder { error, available }. */
export async function toMarkdown(name, data) {
  const md = await findMarkitdown()
  if (!md) return { available: false, error: 'markitdown ist nicht installiert.' }
  const dir = join(WORK_DIR, randomUUID())
  const file = join(dir, safeName(name))
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(file, data)
    const r = await run(md.cmd, [SCRIPT, file])
    if (r.code !== 0) return { available: true, error: r.stderr.trim().split('\n').pop()?.slice(0, 300) || `markitdown ist abgebrochen (${r.code}).` }
    return { available: true, markdown: r.stdout }
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
