// Startet Labreporthelp ohne Vite: liefert die fertige App aus dem Ordner "app"
// (bzw. "dist") aus und hängt den Abo-Chat an. Braucht nur Node.js, keine Bausteine.
// Wird von "Labreporthelp starten.bat" im Release-Paket benutzt.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { middleware } from './aboChat.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const ROOT = [join(here, '..', 'app'), join(here, '..', 'dist')].find((d) => existsSync(join(d, 'index.html')))
const PORT = Number(process.env.PORT) || 5173
const URL_ = `http://localhost:${PORT}`

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

if (!ROOT) {
  console.error('Die fertige App fehlt (Ordner "app" mit index.html). Bitte das Release-Paket neu entpacken.')
  process.exit(1)
}

async function serveFile(req, res) {
  let path = decodeURIComponent((req.url || '/').split('?')[0])
  if (path.endsWith('/')) path += 'index.html'
  const file = normalize(join(ROOT, path))
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.statusCode = 403
    return res.end()
  }
  try {
    const data = await readFile(file)
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] || 'application/octet-stream')
    res.end(data)
  } catch {
    // Unbekannte Pfade: App-Startseite zeigen
    const data = await readFile(join(ROOT, 'index.html'))
    res.setHeader('Content-Type', TYPES['.html'])
    res.end(data)
  }
}

function openBrowser() {
  if (process.env.LRH_NO_BROWSER) return
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', URL_]] : process.platform === 'darwin' ? ['open', [URL_]] : ['xdg-open', [URL_]]
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref()
  } catch {}
}

const server = createServer((req, res) => {
  middleware(req, res, () => {
    serveFile(req, res).catch(() => {
      res.statusCode = 500
      res.end()
    })
  })
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Labreporthelp läuft schon (Anschluss ${PORT} ist belegt). Der Browser wird geöffnet.`)
    openBrowser()
    setTimeout(() => process.exit(0), 1500)
  } else {
    console.error('Fehler beim Starten:', err.message)
    process.exit(1)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Labreporthelp läuft unter ${URL_}`)
  console.log('Zum Beenden dieses Fenster schließen.')
  openBrowser()
})
