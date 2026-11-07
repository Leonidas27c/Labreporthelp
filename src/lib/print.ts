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
export function printDocument(source: HTMLElement, title: string, embedUri?: string) {
  document.getElementById('print-root')?.remove()
  const root = document.createElement('div')
  root.id = 'print-root'
  const content = source.cloneNode(true) as HTMLElement
  content.removeAttribute('contenteditable')
  content.classList.remove('ProseMirror-focused')
  content.querySelectorAll('.ProseMirror-selectednode').forEach((el) => el.classList.remove('ProseMirror-selectednode'))
  // Die Diagramme verweisen auf ihr Karo-/Punkt-Raster über eine id (fill="url(#grid-…)").
  // Die Kopie hätte dieselben ids wie das Original im Editor; der Browser nimmt dann das
  // erste Element mit der id, und das liegt im ausgeblendeten Editor: das Raster fehlt im
  // Druck. Deshalb bekommt die Kopie eigene ids.
  uniquifyIds(content, 'print-')
  // Tabellen, die länger als eine Seite sind, dürfen beim Drucken umbrechen
  const tables = source.querySelectorAll<HTMLElement>('.lab-table')
  content.querySelectorAll<HTMLElement>('.lab-table').forEach((el, i) => {
    if ((tables[i]?.offsetHeight ?? 0) > USABLE_MM * MM * 0.95) el.setAttribute('data-long', '')
  })
  root.innerHTML = `<table class="print-frame"><thead><tr><td><div class="print-top"></div></td></tr></thead>
<tfoot><tr><td><div class="print-bottom"></div></td></tr></tfoot><tbody><tr><td class="print-body"></td></tr></tbody></table>`
  root.querySelector('.print-body')!.appendChild(content)
  if (embedUri) {
    // Unsichtbarer Link mit dem ganzen Dokument, damit die PDF wieder bearbeitbar geöffnet
    // werden kann (siehe pdfEmbed.ts). Durchsichtig statt opacity: 0, sonst lässt Chrome ihn weg.
    const link = document.createElement('a')
    link.className = 'print-embed'
    link.href = embedUri
    link.setAttribute('aria-hidden', 'true')
    root.prepend(link)
  }
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

/** Benennt alle ids im Teilbaum um und passt Verweise (url(#…), href="#…") an. */
function uniquifyIds(root: HTMLElement, prefix: string) {
  const ids = new Set<string>()
  root.querySelectorAll<HTMLElement>('[id]').forEach((el) => {
    ids.add(el.id)
    el.id = prefix + el.id
  })
  if (!ids.size) return
  const fix = (value: string) =>
    value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (m, q, id) => (ids.has(id) ? `url(${q}#${prefix}${id}${q})` : m))
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes('url(')) attr.value = fix(attr.value)
      else if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#') && ids.has(attr.value.slice(1))) {
        attr.value = '#' + prefix + attr.value.slice(1)
      }
    }
  })
}
