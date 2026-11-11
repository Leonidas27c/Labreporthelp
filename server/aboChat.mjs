// Chat über das Claude-Abo: Die Web-App schickt die Anfrage an den lokalen
// Vite-Server, der startet Claude Code (`claude`) auf diesem Rechner.
// Claude Code ist mit dem Claude-Konto angemeldet, deshalb läuft alles über
// das Abo und es wird kein API-Schlüssel gebraucht.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { connectClaudeDesktop, desktopSnippet } from './desktopConfig.mjs'

const WORK_DIR = join(tmpdir(), 'labreporthelp-chat')
const MODELS = new Set(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'])
const TIMEOUT_MS = 5 * 60 * 1000

// Festes Antwortformat: Claude Code prüft die Antwort gegen dieses Schema, so ist das JSON immer gültig
const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tool: { type: 'string', enum: ['insert_text', 'insert_table', 'insert_chart', 'delete_blocks', 'replace_block', 'move_blocks', 'replace_text'] },
          input: { type: 'object' },
        },
        required: ['tool', 'input'],
      },
    },
  },
  required: ['reply', 'actions'],
})

const SYSTEM_PROMPT = `Du bist der Schreibassistent in „Labreporthelp“, einem Textprogramm für Laborprotokolle und wissenschaftliche Arbeiten.
Die Person schreibt gerade ein Dokument und bittet dich im Chat um Hilfe. Mit jeder Nachricht bekommst du den aktuellen Dokumentinhalt. Jeder Block (Absatz, Überschrift, Liste, Tabelle, Diagramm) beginnt mit seiner Nummer in eckigen Klammern, z. B. „[3]“.

So arbeitest du:
- Wenn die Person eine Tabelle, ein Diagrammfeld oder Text haben möchte, füge es ins Dokument ein, statt es nur im Chat zu zeigen. Eingefügt wird an der Stelle, an der der Cursor steht.
- Du kannst vorhandene Inhalte auch löschen, ersetzen, umformulieren und umsortieren (delete_blocks, replace_block, replace_text, move_blocks). Wenn die Person das möchte, mach es direkt, statt sie zu bitten, es selbst zu tun. Mit after fügst du neue Inhalte gezielt hinter einem bestimmten Block ein.
- Alle Blocknummern in einer Antwort beziehen sich auf den Dokumentinhalt, den du mit dieser Nachricht bekommen hast. Sie bleiben gültig, auch wenn vorherige Aktionen Blöcke löschen, einfügen oder verschieben. Neu eingefügte Blöcke haben noch keine Nummer.
- Angehängte Dateien (z. B. eine Versuchsanleitung) liegen im Arbeitsordner; lies sie mit dem Werkzeug Read. Entnimm ihnen die nötigen Angaben: welche Messgrößen, Einheiten, Messbereiche, Anzahl der Messungen, welche Diagramme mit welchen Achsen verlangt sind. Lege daraus passende Tabellen und Diagrammfelder an und nenne kurz, worauf du dich in der Datei stützt.
- Tabellen: sinnvolle Spaltenköpfe mit Einheit in eckigen Klammern, z. B. „Zeit t [s]“. Zahlen im deutschen Format mit Komma. Erfinde keine Messwerte; wenn Werte fehlen, lege leere Zellen an.
- Diagrammfelder sind leere Koordinatensysteme (Millimeterpapier) zum Einzeichnen. Messpunkte kann das Programm noch nicht zeichnen; sag das kurz, falls danach gefragt wird. Wähle Achsenbereiche, die zu den Daten passen.
- Seitenaufteilung: Eine A4-Seite hat etwa 24 cm nutzbare Höhe (ca. 930 px). Das Programm schiebt Tabellen und Diagramme, die nicht mehr ganz auf die Seite passen, automatisch auf die nächste Seite, und Überschriften wandern mit ihrem Inhalt mit. Im Dokumentinhalt markiert „--- Seite N ---“ die Seitenwechsel. Plane so, dass das Ergebnis ordentlich aussieht: Diagramme meist 250–400 px hoch; zwei Diagramme passen zusammen auf eine Seite, wenn jedes höchstens ca. 400 px hoch ist. Sehr lange Tabellen (mehr als ca. 30 Zeilen) lieber sinnvoll auf mehrere Tabellen aufteilen. Vor jede Tabelle und jedes Diagramm gehört ein kurzer Satz Text, der sie einführt.

Antwortformat (fest vorgegeben):
- reply: höchstens drei kurze Sätze auf Deutsch, was du eingefügt oder geändert hast und worauf du dich stützt. Wiederhole dort NICHT den Inhalt, der eingefügt wird, keine Tabellen, keine Rechnungen, kein Markdown.
- actions: Liste der Änderungen; Einfügungen in der Reihenfolge, in der sie im Dokument stehen sollen. Jede Aktion hat tool und input:
  insert_text:  input = {"blocks": [{"style": "heading1|heading2|heading3|paragraph|bullet", "text": "..."}]}
  insert_table: input = {"caption": "Tabelle 1: ... (oder leer)", "headers": ["..."], "rows": [["...", "..."]]}
  insert_chart: input = {"x_label": "...", "x_unit": "...", "x_start": 0, "x_max": 10, "y_label": "...", "y_unit": "...", "y_start": 0, "y_max": 50, "background": "grid|dots|blank", "width": 500, "height": 350}
  Alle Felder sind Pflicht, Zahlen als Zahlen (mit Punkt). width üblich 300–600, height 250–450.
  Optional bei allen drei insert-Werkzeugen: "after": N fügt hinter Block N ein (0 = ganz am Anfang). Ohne after wird an der Cursorposition eingefügt.
  Wichtig zu after: Gib after nur bei der ERSTEN Einfügung einer zusammenhängenden Folge an. Alle folgenden Einfügungen ohne after landen automatisch der Reihe nach darunter. Gib dieselbe Nummer nicht bei mehreren Einfügungen an. N ist immer eine Nummer aus dem Dokumentinhalt oben: Blöcke, die du in dieser Antwort neu einfügst, haben keine Nummer, und Blöcke, die du in dieser Antwort löschst, kann after nicht mehr verwenden.
  delete_blocks: input = {"blocks": [4, 5, 6]}  löscht diese Blöcke.
  replace_block: input = {"block": 4, "blocks": [{"style": "paragraph", "text": "..."}]}  ersetzt Block 4 durch neuen Text (gleiches Format wie insert_text).
  move_blocks:   input = {"blocks": [7, 8], "after": 2}  verschiebt die Blöcke in dieser Reihenfolge hinter Block 2 (after 0 = an den Anfang).
  replace_text:  input = {"find": "alter Text", "replace": "neuer Text", "block": 4}  ersetzt jedes Vorkommen, Formatierung bleibt erhalten; block ist optional (sonst im ganzen Dokument).
  Hinweise und Annahmen für die Person gehören als insert_text ins Dokument, wenn sie dort hilfreich sind, sonst kurz in reply.
- Wenn nichts geändert werden soll, ist actions leer.`

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

/** Sucht die bash.exe von Git für Windows (ohne sie startet Claude Code unter Windows nicht). */
function findGitBash(pathDirs) {
  const fromEnv = process.env.CLAUDE_CODE_GIT_BASH_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const candidates = []
  // Wie Claude Code selbst: neben einem git.exe im PATH nachsehen (…\Git\cmd\git.exe → …\Git\bin\bash.exe)
  for (const dir of pathDirs) {
    if (dir && existsSync(join(dir, 'git.exe'))) candidates.push(join(dirname(dir), 'bin', 'bash.exe'), join(dir, 'bash.exe'))
  }
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')]) {
    if (base) candidates.push(join(base, 'Git', 'bin', 'bash.exe'))
  }
  return candidates.find((c) => existsSync(c)) ?? null
}

/**
 * Umgebung für Claude Code. Unter Windows kommen die üblichen Installationsordner von Claude Code und
 * Git in den PATH, auch wenn das Fenster, aus dem die App gestartet wurde, sie noch nicht kennt
 * (z. B. direkt nach der Installation oder bei `npm run dev` aus einem älteren Terminal).
 */
function claudeEnv() {
  const env = { ...process.env }
  // Ein gesetzter API-Schlüssel würde nach Verbrauch abrechnen statt über das Abo
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  if (process.platform !== 'win32') return env
  // Unter Windows heißt die Variable oft „Path“; nur eine Schreibweise behalten
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'Path'
  const dirs = String(env[key] ?? '').split(delimiter)
  const extra = [join(homedir(), '.local', 'bin'), process.env.ProgramFiles && join(process.env.ProgramFiles, 'Git', 'cmd'), process.env.APPDATA && join(process.env.APPDATA, 'npm')]
  for (const d of extra) if (d && !dirs.some((x) => x.toLowerCase() === d.toLowerCase())) dirs.push(d)
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'PATH') delete env[k]
  env.Path = dirs.join(delimiter)
  const bash = findGitBash(dirs)
  if (bash) env.CLAUDE_CODE_GIT_BASH_PATH = bash
  return env
}

/** Startet `claude` und liefert stdout/stderr. Die Eingabe kommt über stdin (keine Probleme mit Anführungszeichen). */
function runClaude(args, input, cwd) {
  if (process.platform !== 'win32') return spawnClaude('claude', args, input, cwd)
  // Zuerst claude.exe (normale Installation), sonst claude.cmd (Installation über npm)
  return spawnClaude('claude.exe', args, input, cwd).then((r) => (r.notFound ? spawnClaude('claude', args, input, cwd) : r))
}

/** Argument für cmd.exe in Anführungszeichen setzen. */
function winQuote(a) {
  return /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a
}

function spawnClaude(command, args, input, cwd) {
  return new Promise((resolve) => {
    const env = claudeEnv()
    let child
    try {
      child = spawn(command, command === 'claude' && process.platform === 'win32' ? args.map(winQuote) : args, {
        cwd,
        env,
        // claude.cmd (npm-Installation) braucht unter Windows eine Shell, claude.exe nicht
        shell: command === 'claude' && process.platform === 'win32',
        windowsHide: true,
      })
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: String(err), notFound: true })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: String(err), notFound: err.code === 'ENOENT' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      // Unter Windows meldet die Shell ein fehlendes Programm mit Code 9009
      resolve({ code, stdout, stderr, notFound: code === 9009 || /not recognized|nicht erkannt|command not found/i.test(stderr) })
    })
    // Beendet sich Claude Code sofort (z. B. mit einer Fehlermeldung), darf das Schreiben der Eingabe
    // nicht den ganzen Server abstürzen lassen (EPIPE); die Meldung kommt über stderr/close.
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

const NOT_INSTALLED =
  'Claude Code ist auf diesem Rechner nicht installiert. Einmalig installieren (siehe README, Abschnitt „Chat über das Abo“), ' +
  'dann im Terminal `claude` starten und mit deinem Claude-Konto anmelden. Danach `npm run dev` neu starten.'

const NO_GIT =
  'Claude Code braucht unter Windows „Git für Windows“, das auf diesem Rechner fehlt. Bitte von https://git-scm.com/download/win installieren ' +
  '(alles mit „Weiter“ bestätigen) und Labreporthelp danach neu starten. Alternativ install.bat noch einmal ausführen, das installiert Git mit.'
const GIT_HINT = /git-bash|git bash|CLAUDE_CODE_GIT_BASH_PATH/i

const NOT_LOGGED_IN = 'Du bist bei Claude noch nicht angemeldet. Klicke auf „Bei Claude anmelden“.'
const NO_PLAN =
  'Dein Claude-Konto enthält kein Claude Code (das gibt es ab Pro). Mit dem kostenlosen Konto kannst du stattdessen die Claude-Desktop-App benutzen: oben auf „Mit Claude Desktop verbinden“ klicken.'
const PLAN_HINT = /subscription|pro or max|max plan|pro plan|upgrade|not (?:available|included)|free (?:plan|tier)|does not have access/i
const LOGIN_HINT = /not logged in|\/login|log ?in|authenticat|oauth|credential|anmeld/i

async function status(res) {
  const r = await runClaude(['--version'], '', tmpdir())
  if (r.notFound || r.code !== 0) return send(res, 200, { installed: false, message: NOT_INSTALLED })
  if (process.platform === 'win32' && !claudeEnv().CLAUDE_CODE_GIT_BASH_PATH) return send(res, 200, { installed: false, message: NO_GIT })
  let loggedIn = null
  const a = await runClaude(['auth', 'status', '--json'], '', tmpdir())
  try {
    loggedIn = Boolean(JSON.parse(a.stdout).loggedIn)
  } catch {
    /* ältere Version ohne "auth status": unbekannt lassen */
  }
  send(res, 200, { installed: true, version: r.stdout.trim(), loggedIn })
}

/** Öffnet ein sichtbares Fenster mit der Claude-Anmeldung (der Browser geht dann von selbst auf). */
function login(res) {
  try {
    if (process.platform === 'win32') {
      spawn('start "Bei Claude anmelden" cmd /k "echo Gleich oeffnet sich der Browser. Melde dich dort mit deinem Claude-Konto an. && claude auth login && echo. && echo Fertig! Du kannst dieses Fenster schliessen."', {
        shell: true,
        detached: true,
        stdio: 'ignore',
        env: claudeEnv(),
      }).unref()
    } else if (process.platform === 'darwin') {
      spawn('osascript', ['-e', 'tell application "Terminal" to do script "claude auth login"', '-e', 'tell application "Terminal" to activate'], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    } else {
      return send(res, 200, { ok: false, error: 'Bitte im Terminal `claude auth login` eingeben und dich anmelden.' })
    }
    send(res, 200, { ok: true })
  } catch (e) {
    send(res, 200, { ok: false, error: `Das Anmeldefenster konnte nicht geöffnet werden (${e}).` })
  }
}

/** Dateien aus dem Browser in den Arbeitsordner schreiben, damit Claude sie mit Read lesen kann. */
async function saveFiles(files) {
  if (!files?.length) return { dir: null, names: [] }
  const sub = `anhang-${randomUUID().slice(0, 8)}`
  const dir = join(WORK_DIR, sub)
  await mkdir(dir, { recursive: true })
  const names = []
  for (const f of files) {
    const safe = String(f.name).replace(/[^\w.\-äöüÄÖÜß ]/g, '_').slice(0, 120) || 'datei'
    await writeFile(join(dir, safe), f.encoding === 'base64' ? Buffer.from(f.data, 'base64') : String(f.data), f.encoding === 'base64' ? undefined : 'utf8')
    names.push(`${sub}/${safe}`)
  }
  return { dir, names }
}

async function chat(req, res) {
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return send(res, 400, { error: 'Ungültige Anfrage.' })
  }
  const model = MODELS.has(body.model) ? body.model : 'claude-opus-5-5'
  await mkdir(WORK_DIR, { recursive: true })
  await writeFile(join(WORK_DIR, 'labreporthelp-system.md'), SYSTEM_PROMPT, 'utf8')
  const { names } = await saveFiles(body.files)
  const feedback = Array.isArray(body.feedback) ? body.feedback.map(String).slice(0, 30) : []

  const prompt = [
    'Aktueller Dokumentinhalt (Blocknummer in [ ], Überschriften mit #, Tabellen mit |):',
    '"""',
    String(body.document ?? '').slice(0, 100_000) || '(leer)',
    '"""',
    feedback.length ? `\nRückmeldung zu deinen Aktionen aus der letzten Antwort (bitte berücksichtigen, falls etwas fehlt):\n${feedback.map((f) => `- ${f}`).join('\n')}` : '',
    names.length ? `\nAngehängte Dateien (mit Read lesen):\n${names.map((n) => `- ./${n}`).join('\n')}` : '',
    `\nNachricht der Person:\n${body.message}`,
  ].join('\n')

  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model,
    '--tools', 'Read',
    '--allowedTools', 'Read',
    '--strict-mcp-config',
    '--append-system-prompt-file', 'labreporthelp-system.md',
    '--json-schema', SCHEMA,
  ]
  if (typeof body.sessionId === 'string' && /^[\w-]+$/.test(body.sessionId)) args.push('--resume', body.sessionId)

  const r = await runClaude(args, prompt, WORK_DIR)
  if (r.notFound) return send(res, 200, { error: NOT_INSTALLED })
  let out
  try {
    out = JSON.parse(r.stdout)
  } catch {
    const detail = (r.stderr || r.stdout).trim().slice(0, 500)
    if (GIT_HINT.test(detail)) return send(res, 200, { error: NO_GIT })
    if (PLAN_HINT.test(detail)) return send(res, 200, { error: NO_PLAN, needsDesktop: true })
    if (LOGIN_HINT.test(detail)) return send(res, 200, { error: NOT_LOGGED_IN, needsLogin: true })
    return send(res, 200, { error: `Claude Code hat nicht geantwortet.${detail ? ` (${detail})` : ''}` })
  }
  if (out.is_error) {
    const msg = String(out.result || 'Claude Code meldet einen Fehler.')
    if (GIT_HINT.test(msg)) return send(res, 200, { error: NO_GIT })
    if (PLAN_HINT.test(msg)) return send(res, 200, { error: NO_PLAN, needsDesktop: true })
    if (LOGIN_HINT.test(msg)) return send(res, 200, { error: NOT_LOGGED_IN, needsLogin: true })
    return send(res, 200, { error: msg, sessionId: out.session_id })
  }
  const so = out.structured_output
  if (so && typeof so === 'object') {
    return send(res, 200, { text: String(so.reply ?? ''), actions: Array.isArray(so.actions) ? so.actions : [], sessionId: out.session_id })
  }
  send(res, 200, { text: String(out.result ?? ''), sessionId: out.session_id })
}

export function middleware(req, res, next) {
  const url = req.url?.split('?')[0]
  // Nur Anfragen von dieser Seite selbst annehmen (Schutz vor fremden Webseiten)
  const origin = req.headers.origin
  if ((url?.startsWith('/api/abo/') || url?.startsWith('/api/desktop/')) && origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return send(res, 403, { error: 'Nicht erlaubt.' })
  }
  if (url === '/api/abo/status' && req.method === 'GET') return void status(res).catch((e) => send(res, 500, { error: String(e) }))
  if (url === '/api/abo/login' && req.method === 'POST') {
    // Nur von der eigenen Seite: ohne Origin-Kopf (z. B. direkter Aufruf) wird nichts geöffnet
    if (!origin) return send(res, 403, { error: 'Nicht erlaubt.' })
    return login(res)
  }
  if (url === '/api/desktop/snippet' && req.method === 'GET') return send(res, 200, { snippet: desktopSnippet() })
  if (url === '/api/desktop/connect' && req.method === 'POST') {
    if (!origin) return send(res, 403, { error: 'Nicht erlaubt.' })
    try {
      return send(res, 200, connectClaudeDesktop())
    } catch (e) {
      return send(res, 200, { ok: false, files: [], messages: [`Fehler: ${e}`] })
    }
  }
  if (url === '/api/abo/chat' && req.method === 'POST') return void chat(req, res).catch((e) => send(res, 500, { error: String(e) }))
  next()
}

/** Vite-Plugin: hängt den Abo-Chat an `npm run dev` und `npm run preview`. */
export function aboChat() {
  return {
    name: 'labreporthelp-abo-chat',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

