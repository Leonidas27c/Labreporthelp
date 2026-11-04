/** Seitenmaße A4 in Millimetern; gleiche Ränder wie die Seite im Editor. */
export const PAGE_MM = { height: 297, marginTop: 25, marginBottom: 25, marginSide: 20 }
export const MM = 96 / 25.4 // Pixel pro Millimeter
export const USABLE_MM = PAGE_MM.height - PAGE_MM.marginTop - PAGE_MM.marginBottom

/**
 * Druckt eine Kopie des Dokuments.
 * Die Seitenränder kommen aus Kopf- und Fußzeilen einer Tabelle, die der Browser auf jeder
 * Seite wiederholt. Der eigentliche Druckrand ist 0, deshalb druckt der Browser keine
 * eigenen Kopf- und Fußzeilen (Adresse, Titel, Datum).
 */
export function printDocument(source: HTMLElement, title: string) {
  document.getElementById('print-root')?.remove()
  const root = document.createElement('div')
  root.id = 'print-root'
  const content = source.cloneNode(true) as HTMLElement
  content.removeAttribute('contenteditable')
  content.classList.remove('ProseMirror-focused')
  content.querySelectorAll('.ProseMirror-selectednode').forEach((el) => el.classList.remove('ProseMirror-selectednode'))
  root.innerHTML = `<table class="print-frame"><thead><tr><td><div class="print-top"></div></td></tr></thead>
<tfoot><tr><td><div class="print-bottom"></div></td></tr></tfoot><tbody><tr><td class="print-body"></td></tr></tbody></table>`
  root.querySelector('.print-body')!.appendChild(content)
  document.body.appendChild(root)

  const previous = document.title
  document.title = title || 'Labreporthelp' // Vorschlag für den Dateinamen des PDFs
  const cleanup = () => {
    document.title = previous
    root.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}
