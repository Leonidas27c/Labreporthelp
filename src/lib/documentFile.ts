import type { JSONContent } from '@tiptap/react'

/** Format einer gespeicherten Dokumentdatei (*.lrh.json). */
export interface LabDocument {
  format: 'labreporthelp'
  version: 1
  title: string
  content: JSONContent
  savedAt: string
}

const AUTOSAVE_KEY = 'labreporthelp:autosave'

export function createDocument(title: string, content: JSONContent): LabDocument {
  return { format: 'labreporthelp', version: 1, title, content, savedAt: new Date().toISOString() }
}

export function parseDocument(text: string): LabDocument {
  const data = JSON.parse(text)
  if (data?.format !== 'labreporthelp' || typeof data.content !== 'object') {
    throw new Error('Das ist keine Labreporthelp-Datei.')
  }
  return data as LabDocument
}

/** Lädt das Dokument als Datei herunter (funktioniert in jedem Browser). */
export function downloadDocument(doc: LabDocument) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(doc.title)}.lrh.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function safeFileName(title: string) {
  return (title.trim() || 'Unbenannt').replace(/[\\/:*?"<>|]+/g, '_')
}

export function saveAutosave(doc: LabDocument) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc))
  } catch {
    /* Speicher voll oder gesperrt: ignorieren */
  }
}

export function loadAutosave(): LabDocument | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY)
    return text ? parseDocument(text) : null
  } catch {
    return null
  }
}
