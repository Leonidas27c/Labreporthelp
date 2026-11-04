import type Anthropic from '@anthropic-ai/sdk'

/** Eine an den Chat angehängte Datei, fertig als Inhaltsblock für Claude. */
export interface Attachment {
  name: string
  kind: 'PDF' | 'Word' | 'PowerPoint' | 'Bild' | 'Text'
  block: Anthropic.Beta.BetaContentBlockParam
}

export const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp'
const MAX_BYTES = 25 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const textDoc = (name: string, text: string): Anthropic.Beta.BetaContentBlockParam => ({
  type: 'document',
  title: name,
  source: { type: 'text', media_type: 'text/plain', data: text.trim() || '(Die Datei enthält keinen Text.)' },
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

export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_BYTES) throw new Error(`„${file.name}“ ist größer als 25 MB.`)
  const name = file.name
  const ext = name.toLowerCase().split('.').pop() ?? ''

  if (ext === 'pdf') {
    return {
      name,
      kind: 'PDF',
      block: { type: 'document', title: name, source: { type: 'base64', media_type: 'application/pdf', data: toBase64(await file.arrayBuffer()) } },
    }
  }
  if (ext === 'docx') {
    const { default: mammoth } = await import('mammoth')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { name, kind: 'Word', block: textDoc(name, value) }
  }
  if (ext === 'pptx') {
    return { name, kind: 'PowerPoint', block: textDoc(name, await pptxText(await file.arrayBuffer())) }
  }
  const imageType = IMAGE_TYPES.find((t) => t === file.type)
  if (imageType) {
    return {
      name,
      kind: 'Bild',
      block: { type: 'image', source: { type: 'base64', media_type: imageType, data: toBase64(await file.arrayBuffer()) } },
    }
  }
  if (['txt', 'md', 'csv'].includes(ext)) {
    return { name, kind: 'Text', block: textDoc(name, await file.text()) }
  }
  if (ext === 'doc' || ext === 'ppt') {
    throw new Error(`„${name}“ ist im alten Format. Bitte in Word bzw. PowerPoint als .docx/.pptx oder als PDF speichern.`)
  }
  throw new Error(`„${name}“ kann ich nicht lesen. Möglich sind PDF, Word (.docx), PowerPoint (.pptx), Bilder und Text.`)
}
