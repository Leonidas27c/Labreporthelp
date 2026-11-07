import type { LabDocument } from './documentFile'

/**
 * Damit sich eine exportierte PDF wieder als bearbeitbares Dokument öffnen lässt, steckt das
 * ganze Dokument (komprimiert) in einem unsichtbaren Link oben links auf der ersten Seite.
 * Chrome und Edge übernehmen Links beim „Als PDF speichern“ als Link-Annotation, auch sehr
 * lange. Beim Öffnen der PDF liest die App den Link wieder aus.
 */
export const EMBED_SCHEME = 'labreporthelp:'
const PREFIX = `${EMBED_SCHEME}v1,`

export async function encodeEmbed(doc: LabDocument): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(doc))
  const packed = await transform(bytes, new CompressionStream('deflate-raw'))
  return PREFIX + toBase64Url(packed)
}

export async function decodeEmbed(uri: string): Promise<unknown | null> {
  if (!uri.startsWith(PREFIX)) return null
  const packed = fromBase64Url(uri.slice(PREFIX.length))
  const bytes = await transform(packed, new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
