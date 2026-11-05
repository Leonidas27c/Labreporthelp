// Beim Start: auf GitHub nachsehen, ob es eine neuere Version gibt, und sie herunterladen.
// Nutzt nur die öffentliche GitHub-Schnittstelle, kein Konto und kein Schlüssel nötig.
// Ergebnis (Exit-Code): 0 = normal weiterstarten, 10 = neue Version liegt in ".update\Labreporthelp" bereit.
// Jeder Fehler (kein Internet, GitHub nicht erreichbar, ...) führt still zu 0: Labreporthelp startet wie bisher.
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = 'Leonidas27c/Labreporthelp'
const ASSET = 'Labreporthelp-windows.zip'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const headers = { 'User-Agent': 'Labreporthelp-Updater', Accept: 'application/vnd.github+json' }

function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim())
  return m ? m.slice(1).map(Number) : null
}
function newer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

async function main() {
  if (existsSync(join(root, '.keine-updates'))) return 0
  let current
  try { current = readFileSync(join(root, 'VERSION.txt'), 'utf8').trim() } catch { return 0 }
  const cur = parse(current)
  if (!cur) return 0 // Entwicklerversion ohne Versionsnummer: nicht prüfen

  let release
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, signal: AbortSignal.timeout(6000) })
    if (!r.ok) return 0
    release = await r.json()
  } catch { return 0 }
  const latest = parse(release.tag_name)
  if (!latest || !newer(latest, cur)) return 0
  const asset = (release.assets || []).find((a) => a.name === ASSET)
  if (!asset) return 0

  console.log(`Neue Version ${release.tag_name} gefunden (installiert: ${current}). Sie wird jetzt geladen ...`)
  const work = join(root, '.update')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const zip = join(work, ASSET)
  try {
    const r = await fetch(asset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] }, signal: AbortSignal.timeout(15 * 60 * 1000) })
    if (!r.ok || !r.body) throw new Error(`Download fehlgeschlagen (${r.status})`)
    const total = Number(r.headers.get('content-length')) || asset.size || 0
    const hash = createHash('sha256')
    let done = 0
    let shown = -1
    const progress = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk)
        done += chunk.length
        const pct = total ? Math.floor((done / total) * 100) : -1
        if (pct >= 0 && pct !== shown && pct % 10 === 0) { shown = pct; process.stdout.write(`  ${pct} %\r`) }
        cb(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(r.body), progress, createWriteStream(zip))
    console.log('')
    // GitHub gibt eine Prüfsumme mit; stimmt sie nicht, ist der Download kaputt.
    const want = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '')
    if (want && want[1].toLowerCase() !== hash.digest('hex')) throw new Error('Die heruntergeladene Datei ist beschädigt.')

    const out = join(work, 'neu')
    mkdirSync(out)
    try {
      execFileSync('tar', ['-xf', zip, '-C', out], { stdio: 'ignore' })
    } catch {
      execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', zip, out], { stdio: 'ignore' })
    }
    const pkg = join(out, 'Labreporthelp')
    if (!existsSync(join(pkg, 'node', 'node.exe')) || !existsSync(join(pkg, 'Labreporthelp starten.bat'))) {
      throw new Error('Das neue Paket ist unvollständig.')
    }
    rmSync(zip, { force: true })
    return 10
  } catch (e) {
    console.log(`Update übersprungen: ${e.message}`)
    console.log('Labreporthelp startet mit der bisherigen Version.')
    rmSync(work, { recursive: true, force: true })
    return 0
  }
}

// Auch unerwartete Fehler dürfen den Start nie verhindern.
function abbrechen() {
  try { rmSync(join(root, '.update'), { recursive: true, force: true }) } catch { /* egal */ }
  console.log('Update übersprungen. Labreporthelp startet mit der bisherigen Version.')
  process.exit(0)
}
process.on('uncaughtException', abbrechen)
process.on('unhandledRejection', abbrechen)
main().then((code) => process.exit(code), abbrechen)
