/** Eine Datei, wie sie der lokale Server in den Arbeitsordner für Claude schreibt. */
export interface AttachmentFile {
  name: string
  encoding: 'base64' | 'utf8'
  data: string
}

/** Eine an den Chat angehängte Datei, fertig aufbereitet für Claude. */
export interface Attachment {
  name: string
  kind: 'PDF' | 'Word' | 'PowerPoint' | 'Excel' | 'Webseite' | 'Bild' | 'Text'
  /** true, wenn die Datei mit markitdown in Markdown umgewandelt wurde */
  markdown: boolean
  files: AttachmentFile[]
}

export const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.html,.htm,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp'
const MAX_BYTES = 25 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

/** Diese Formate wandelt markitdown in Markdown um (Überschriften, Listen und Tabellen bleiben erhalten). */
const MARKITDOWN: Record<string, Attachment['kind']> = {
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PowerPoint',
  xlsx: 'Excel',
  html: 'Webseite',
  htm: 'Webseite',
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const textFile = (name: string, text: string): AttachmentFile => ({
  name,
  encoding: 'utf8',
  data: text.trim() || '(Die Datei enthält keinen Text.)',
})

/** Liest den Text aller Folien einer PowerPoint-Datei (.pptx). */
async function pptxText(buf: ArrayBuffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buf)
  const slides = Object.keys(zip.files)
    .map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  const parts: string[] = []
  for (const m of slides) {
    const xml = await zip.file(m[0])!.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    // Jeder Absatz <a:p> wird eine Zeile, die Textstücke <a:t> darin werden aneinandergehängt
    const lines = [...doc.getElementsByTagNameNS('*', 'p')]
      .map((p) => [...p.getElementsByTagNameNS('*', 't')].map((t) => t.textContent ?? '').join(''))
      .filter((l) => l.trim())
    parts.push(`Folie ${m[1]}:\n${lines.join('\n')}`)
  }
  return parts.join('\n\n')
}

type MarkdownResult = { markdown: string } | { error: string; available: boolean }

/** Lässt die Datei vom lokalen Server mit markitdown in Markdown umwandeln. */
async function viaMarkitdown(name: string, base64: string): Promise<MarkdownResult> {
  try {
    const r = await fetch('/api/markitdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: base64 }),
    })
    const data = await r.json()
    if (typeof data.markdown === 'string') return { markdown: data.markdown }
    return { error: String(data.error ?? `Fehler ${r.status}`), available: data.available !== false }
  } catch {
    return { error: 'Der lokale Server antwortet nicht.', available: false }
  }
}

/** Ohne markitdown: so wie bisher selbst lesen. */
async function fallback(file: File, ext: string, base64: string): Promise<AttachmentFile[] | null> {
  if (ext === 'pdf') return [{ name: file.name, encoding: 'base64', data: base64 }]
  if (ext === 'docx') {
    const { default: mammoth } = await import('mammoth')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return [textFile(`${file.name}.txt`, value)]
  }
  if (ext === 'pptx') return [textFile(`${file.name}.txt`, await pptxText(await file.arrayBuffer()))]
  if (ext === 'html' || ext === 'htm') {
    const doc = new DOMParser().parseFromString(await file.text(), 'text/html')
    return [textFile(`${file.name}.txt`, doc.body?.innerText || doc.body?.textContent || '')]
  }
  return null // .xlsx geht nur mit markitdown
}

export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_BYTES) throw new Error(`„${file.name}“ ist größer als 25 MB.`)
  const name = file.name
  const ext = name.toLowerCase().split('.').pop() ?? ''

  const kind = MARKITDOWN[ext]
  if (kind) {
    const base64 = toBase64(await file.arrayBuffer())
    const md = await viaMarkitdown(name, base64)
    if ('markdown' in md && md.markdown.trim()) {
      const files = [textFile(`${name}.md`, md.markdown)]
      // Bei PDFs auch das Original mitgeben: Abbildungen und Schaltskizzen fehlen im Markdown
      if (ext === 'pdf') files.push({ name, encoding: 'base64', data: base64 })
      return { name, kind, markdown: true, files }
    }
    const own = await fallback(file, ext, base64)
    if (own) return { name, kind, markdown: false, files: own }
    throw new Error(
      'markdown' in md || md.available
        ? `„${name}“ konnte nicht gelesen werden${'error' in md ? ` (${md.error})` : ''}.`
        : `Excel-Dateien kann Labreporthelp nur mit markitdown lesen, und das ist nicht installiert. Bitte die Einrichtung wiederholen oder die Tabelle als CSV speichern.`,
    )
  }

  const imageType = IMAGE_TYPES.find((t) => t === file.type)
  if (imageType) {
    return { name, kind: 'Bild', markdown: false, files: [{ name, encoding: 'base64', data: toBase64(await file.arrayBuffer()) }] }
  }
  if (['txt', 'md', 'csv'].includes(ext)) {
    return { name, kind: 'Text', markdown: false, files: [textFile(name, await file.text())] }
  }
  if (ext === 'doc' || ext === 'ppt' || ext === 'xls') {
    throw new Error(`„${name}“ ist im alten Format. Bitte in Word, PowerPoint bzw. Excel als .docx/.pptx/.xlsx oder als PDF speichern.`)
  }
  throw new Error(`„${name}“ kann ich nicht lesen. Möglich sind PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), HTML, Bilder und Text.`)
}
