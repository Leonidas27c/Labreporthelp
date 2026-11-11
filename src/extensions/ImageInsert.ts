import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { contentWidth } from '../lib/insertPosition'

/** Größere Bilder werden verkleinert, damit Dokument und Zwischenspeicher klein bleiben. */
const MAX_SIDE = 1800
const MAX_BYTES = 400_000

/** Bild als Teil des Dokuments (data-URL), per Griff in der Größe änderbar. */
export const LabImage = Image.configure({
  allowBase64: true,
  inline: false,
  resize: { enabled: true, directions: ['bottom-right', 'bottom-left'], minWidth: 40, minHeight: 30, alwaysPreserveAspectRatio: true },
})

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('Bild konnte nicht gelesen werden.'))
    r.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Dieses Bildformat wird nicht unterstützt.'))
    img.src = src
  })
}

/** Liest eine Bilddatei und verkleinert sie bei Bedarf. */
async function prepare(file: File): Promise<{ src: string; width: number; height: number }> {
  const original = await readAsDataUrl(file)
  const img = await loadImage(original)
  let { naturalWidth: w, naturalHeight: h } = img
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  if (scale === 1 && file.size <= MAX_BYTES) return { src: original, width: w, height: h }
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  // Fotos als JPEG, Grafiken mit Transparenz (PNG, GIF, SVG) bleiben PNG
  const photo = /jpe?g|webp|heic/i.test(file.type)
  const src = canvas.toDataURL(photo ? 'image/jpeg' : 'image/png', 0.85)
  return { src: src.length < original.length ? src : original, width: w, height: h }
}

/** Fügt Bilddateien an der Position `pos` (oder an der Auswahl) ein. */
export async function insertImageFiles(editor: Editor, files: File[], pos?: number) {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) return false
  const maxWidth = Math.round(contentWidth(editor.view.dom as HTMLElement))
  for (const file of images) {
    try {
      const { src, width, height } = await prepare(file)
      const w = Math.min(width, maxWidth)
      const content = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, ''), width: w, height: Math.round((height * w) / width) } }
      if (pos != null) editor.chain().focus().insertContentAt(pos, content).run()
      else editor.chain().focus().insertContent(content).run()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Bild konnte nicht eingefügt werden.')
    }
  }
  return true
}

/** Bilder per Einfügen (Strg+V) oder Hineinziehen ins Dokument übernehmen. */
export const ImagePaste = Extension.create({
  name: 'imagePaste',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('imagePaste'),
        props: {
          handlePaste(_view, event) {
            const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
            if (!files.length) return false
            // Kommt zusätzlich Text/HTML mit (z. B. aus Word), den normalen Weg nehmen
            if (event.clipboardData?.getData('text/html')) return false
            event.preventDefault()
            void insertImageFiles(editor, files)
            return true
          },
          handleDrop(view, event) {
            const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
            if (!files.length) return false
            event.preventDefault()
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
            void insertImageFiles(editor, files, at?.pos)
            return true
          },
        },
      }),
    ]
  },
})
