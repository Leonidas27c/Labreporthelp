// Installiert Microsoft markitdown in den Projektordner (.venv), damit hochgeladene
// Versuchsanleitungen (PDF, Word, PowerPoint, Excel) vor dem Chat in Markdown umgewandelt werden.
// Aufruf: npm run markitdown-setup   (braucht Python 3.10 oder neuer)
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MARKITDOWN_SPEC = 'markitdown[pdf,docx,pptx,xlsx]>=0.1.2,<0.2'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const win = process.platform === 'win32'
const venv = join(root, '.venv')
const venvPython = win ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python')

function run(cmd, args, quiet = false) {
  const r = spawnSync(cmd, args, { stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true })
  return { ok: r.status === 0, out: (r.stdout || '').trim() }
}

function findPython() {
  const list = win ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']]
  for (const [cmd, ...pre] of list) {
    const r = run(cmd, [...pre, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], true)
    if (!r.ok) continue
    const [major, minor] = r.out.split('.').map(Number)
    if (major === 3 && minor >= 10) return [cmd, ...pre]
  }
  return null
}

if (!existsSync(venvPython)) {
  const py = findPython()
  if (!py) {
    console.error('Python 3.10 oder neuer wurde nicht gefunden.')
    console.error(win ? 'Installieren: winget install -e --id Python.Python.3.13  (oder von https://www.python.org)' : 'Bitte Python 3 installieren (z. B. über den Paketmanager).')
    console.error('Ohne markitdown liest Labreporthelp angehängte Dateien wie bisher selbst.')
    process.exit(1)
  }
  console.log('Lege .venv an ...')
  if (!run(py[0], [...py.slice(1), '-m', 'venv', venv]).ok) process.exit(1)
}

console.log(`Installiere ${MARKITDOWN_SPEC} ...`)
run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '--upgrade', 'pip'])
if (!run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '--upgrade', MARKITDOWN_SPEC]).ok) {
  console.error('markitdown konnte nicht installiert werden (siehe oben).')
  process.exit(1)
}
const check = run(venvPython, [join(root, 'server', 'markitdown_convert.py'), '--check'], true)
if (!check.ok) {
  console.error('markitdown ist installiert, startet aber nicht.')
  process.exit(1)
}
console.log(`markitdown ${check.out} ist bereit.`)
