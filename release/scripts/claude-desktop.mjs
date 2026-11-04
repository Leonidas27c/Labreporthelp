// "Claude Desktop verbinden.bat": trägt Labreporthelp in Claude Desktop ein.
// --nur-wenn-installiert: still beenden, wenn Claude Desktop fehlt (für die Einrichtung beim ersten Start).
import { connectClaudeDesktop } from '../server/desktopConfig.mjs'

const r = connectClaudeDesktop()
if (r.notInstalled && process.argv.includes('--nur-wenn-installiert')) process.exit(0)
for (const f of r.files) console.log(`Eingetragen in ${f}`)
for (const m of r.messages) console.log(m)
if (r.ok) {
  console.log('')
  console.log('Claude Desktop ist verbunden. Jetzt Claude Desktop ganz beenden (auch unten rechts')
  console.log('im Infobereich neben der Uhr: Rechtsklick auf das Claude-Symbol, "Beenden") und neu öffnen.')
  console.log('Wenn Labreporthelp läuft, steht oben rechts in der App "Claude Desktop verbunden".')
}
process.exit(r.ok ? 0 : 1)
