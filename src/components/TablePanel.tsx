import type { Editor } from '@tiptap/react'
import type { Transaction } from '@tiptap/pm/state'
import { contentWidth } from '../lib/insertPosition'
import {
  columnCells,
  joinUnit,
  measureColumns,
  normalizeTable,
  resizeGrid,
  scaleWidths,
  setCellText,
  setColumnWidths,
  splitUnit,
  type TableAttrs,
  type TableBorders,
  type TableInfo,
  type UnitStyle,
} from '../lib/tableModel'
import { NumberInput, TextInput } from './PanelInputs'

const LINE_COLORS = ['#000000', '#1f2933', '#5f6b76', '#8d9bb3', '#1f4e79', '#17696f', '#2e6b30', '#9b1c1f']
const FILL_COLORS = ['', '#eef2f8', '#e6e9ed', '#d8e8fb', '#d3f2dc', '#fff3a3', '#fde3c8', '#fbdde2']
const STRIPE_COLORS = ['#f4f6fa', '#f2f2f2', '#eef5fd', '#eff9f1', '#fffbe0', '#fdf3ea']

const BORDERS: { key: TableBorders; label: string; title: string }[] = [
  { key: 'all', label: 'Gitter', title: 'Gitter: alle Linien' },
  { key: 'rows', label: 'Quer', title: 'Nur waagerechte Linien' },
  { key: 'booktabs', label: '3 Linien', title: 'Wissenschaftlich: oben, unter der Kopfzeile und unten' },
  { key: 'outer', label: 'Rahmen', title: 'Nur Außenrahmen' },
  { key: 'none', label: 'Keine', title: 'Keine Linien' },
]

/** Seitenleiste „Tabelle formatieren“, sichtbar solange der Cursor in einer Tabelle steht. */
export function TablePanel({ editor, info }: { editor: Editor; info: TableInfo }) {
  const a = normalizeTable(info.attrs)
  const { pos } = info
  const col = Math.min(info.col, info.cols - 1)
  const maxW = contentWidth(editor.view.dom)

  /** Änderung an der Tabelle ausführen, ohne die Auswahl zu verlieren. */
  const change = (fn: (tr: Transaction) => void) => {
    const { state, view } = editor
    if (!state.doc.nodeAt(pos)) return
    const tr = state.tr
    fn(tr)
    if (tr.docChanged) view.dispatch(tr)
  }
  const update = (patch: Partial<TableAttrs>) =>
    change((tr) => {
      const node = tr.doc.nodeAt(pos)!
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch })
    })

  // Spaltenbreiten (gemessen, falls noch nicht festgelegt)
  const widths = () => measureColumns(editor.view, pos, editor.state.doc.nodeAt(pos)!)
  const total = info.widths ? info.widths.reduce((x, y) => x + y, 0) : Math.round(widths().reduce((x, y) => x + y, 0))
  const setTotal = (w: number) =>
    change((tr) => setColumnWidths(tr, pos, scaleWidths(widths(), Math.min(w, maxW - a.offsetX))))
  const colWidth = info.widths?.[col] ?? Math.round(widths()[col] ?? 0)
  const setColWidth = (w: number) =>
    change((tr) => {
      const ws = widths()
      ws[col] = w
      setColumnWidths(tr, pos, ws)
    })

  // Kopfzeile der aktuellen Spalte: Größe und Einheit
  const table = editor.state.doc.nodeAt(pos)!
  const cells = columnCells(table, pos, col)
  const headCell = info.headerRow ? editor.state.doc.nodeAt(cells[0]) : null
  const head = splitUnit(headCell?.textContent ?? '')
  const setHead = (label: string, unit: string) =>
    change((tr) => setCellText(tr, editor.schema, cells[0], joinUnit(label, unit, a.unitStyle)))

  const setUnitStyle = (style: UnitStyle) =>
    change((tr) => {
      const node = tr.doc.nodeAt(pos)!
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, unitStyle: style })
      if (!info.headerRow) return
      for (let c = 0; c < info.cols; c++) {
        const cellPos = columnCells(tr.doc.nodeAt(pos)!, pos, c)[0]
        const parts = splitUnit(tr.doc.nodeAt(cellPos)?.textContent ?? '')
        if (parts.unit) setCellText(tr, editor.schema, cellPos, joinUnit(parts.label, parts.unit, style))
      }
    })

  // Ausrichtung der Spalte (gilt für alle Zellen darin)
  const bodyCell = editor.state.doc.nodeAt(cells[info.headerRow && cells.length > 1 ? 1 : 0])
  const align = (bodyCell?.firstChild?.attrs.textAlign as string | null) ?? (bodyCell?.attrs.align as string | null) ?? 'left'
  const setAlign = (value: 'left' | 'center' | 'right') =>
    change((tr) => {
      for (const cellPos of cells) {
        const cell = tr.doc.nodeAt(cellPos)
        if (!cell) continue
        tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, align: value })
        cell.forEach((child, offset) => {
          if (child.type.name === 'paragraph') tr.setNodeMarkup(cellPos + 1 + offset, undefined, { ...child.attrs, textAlign: value })
        })
      }
    })

  const cmd = () => editor.chain().focus()
  const remove = () => editor.chain().focus().deleteTable().run()

  return (
    <aside className="side-panel" aria-label="Tabelle formatieren">
      <h2>Tabelle formatieren</h2>

      <section>
        <h3>Beschriftung</h3>
        <div className="fields">
          <label>
            Text
            <TextInput value={a.caption} placeholder="z. B. Tabelle 1: Messwerte" onChange={(v) => update({ caption: v })} />
          </label>
          <div className="segmented">
            <button className={a.captionPosition === 'above' ? 'active' : ''} onClick={() => update({ captionPosition: 'above' })}>Über der Tabelle</button>
            <button className={a.captionPosition === 'below' ? 'active' : ''} onClick={() => update({ captionPosition: 'below' })}>Darunter</button>
          </div>
        </div>
      </section>

      <section>
        <h3>Aufbau</h3>
        <div className="fields two">
          <label>
            Zeilen
            <Stepper value={info.rows} min={1} max={200} onChange={(n) => change((tr) => resizeGrid(tr, pos, n, info.cols, maxW - a.offsetX))} />
          </label>
          <label>
            Spalten
            <Stepper value={info.cols} min={1} max={30} onChange={(n) => change((tr) => resizeGrid(tr, pos, info.rows, n, maxW - a.offsetX))} />
          </label>
        </div>
        <div className="fields">
          <label className="check">
            <input type="checkbox" checked={info.headerRow} onChange={() => cmd().toggleHeaderRow().run()} />
            Erste Zeile ist Kopfzeile
          </label>
          <label className="check">
            <input type="checkbox" checked={info.headerCol} onChange={() => cmd().toggleHeaderColumn().run()} />
            Erste Spalte hervorheben
          </label>
          <div className="button-grid">
            <button onClick={() => cmd().addRowBefore().run()}>Zeile darüber</button>
            <button onClick={() => cmd().addRowAfter().run()}>Zeile darunter</button>
            <button onClick={() => cmd().addColumnBefore().run()}>Spalte links</button>
            <button onClick={() => cmd().addColumnAfter().run()}>Spalte rechts</button>
            <button onClick={() => cmd().deleteRow().run()} disabled={info.rows < 2}>Zeile löschen</button>
            <button onClick={() => cmd().deleteColumn().run()} disabled={info.cols < 2}>Spalte löschen</button>
            <button onClick={() => cmd().mergeCells().run()} disabled={!editor.can().mergeCells()}>Zellen verbinden</button>
            <button onClick={() => cmd().splitCell().run()} disabled={!editor.can().splitCell()}>Zelle teilen</button>
          </div>
          <p className="help">Einfügen und Löschen gilt für die Zeile/Spalte, in der der Cursor steht.</p>
        </div>
      </section>

      <section>
        <h3>Spalte {col + 1} von {info.cols}</h3>
        <p className="help" style={{ marginTop: 0 }}>Klicke in eine andere Spalte, um sie hier einzustellen.</p>
        <div className="fields">
          {info.headerRow ? (
            <div className="fields two" style={{ marginTop: 0 }}>
              <label>
                Größe
                <TextInput key={`l${pos}-${col}`} value={head.label} placeholder="z. B. Zeit t" onChange={(v) => setHead(v, head.unit)} />
              </label>
              <label>
                Einheit
                <TextInput key={`u${pos}-${col}`} value={head.unit} placeholder="z. B. s" onChange={(v) => setHead(head.label, v)} />
              </label>
            </div>
          ) : (
            <p className="help">Für Größe und Einheit braucht die Tabelle eine Kopfzeile.</p>
          )}
          <label>
            Ausrichtung
            <div className="segmented">
              <button className={align === 'left' ? 'active' : ''} onClick={() => setAlign('left')}>Links</button>
              <button className={align === 'center' ? 'active' : ''} onClick={() => setAlign('center')}>Mitte</button>
              <button className={align === 'right' ? 'active' : ''} onClick={() => setAlign('right')}>Rechts</button>
            </div>
          </label>
          <label>
            Spaltenbreite (px)
            <NumberInput lazy key={`w${pos}-${col}`} value={colWidth} min={40} max={maxW} onChange={(v) => setColWidth(Math.round(v))} />
          </label>
        </div>
        <fieldset style={{ marginTop: 10 }}>
          <legend>Einheiten schreiben als</legend>
          <div className="segmented">
            <button className={a.unitStyle === 'brackets' ? 'active' : ''} onClick={() => setUnitStyle('brackets')}>t [s]</button>
            <button className={a.unitStyle === 'slash' ? 'active' : ''} onClick={() => setUnitStyle('slash')}>t / s</button>
            <button className={a.unitStyle === 'in' ? 'active' : ''} onClick={() => setUnitStyle('in')}>t in s</button>
          </div>
          <p className="help">Gilt für alle Spalten dieser Tabelle.</p>
        </fieldset>
      </section>

      <section>
        <h3>Linien</h3>
        <div className="segmented small">
          {BORDERS.map((b) => (
            <button key={b.key} title={b.title} className={a.borders === b.key ? 'active' : ''} onClick={() => update({ borders: b.key })}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="fields">
          <label>
            Linienstärke (px)
            <NumberInput value={a.borderWidth} min={0.5} max={6} onChange={(v) => update({ borderWidth: v })} />
          </label>
          <ColorRow label="Linienfarbe" colors={LINE_COLORS} value={a.borderColor} onChange={(c) => update({ borderColor: c || '#000000' })} />
        </div>
      </section>

      <section>
        <h3>Farben und Schrift</h3>
        <div className="fields">
          <ColorRow label="Kopfzeile Hintergrund" colors={FILL_COLORS} value={a.headerBg} onChange={(c) => update({ headerBg: c })} />
          <label className="check">
            <input type="checkbox" checked={a.striped} onChange={(e) => update({ striped: e.target.checked })} />
            Jede zweite Zeile einfärben
          </label>
          {a.striped && (
            <ColorRow label="Streifenfarbe" colors={STRIPE_COLORS} value={a.stripeColor} onChange={(c) => update({ stripeColor: c || STRIPE_COLORS[0] })} />
          )}
          <label>
            Schriftgröße (pt, 0 = wie der Text)
            <NumberInput value={a.fontSize} min={0} max={24} onChange={(v) => update({ fontSize: v })} />
          </label>
        </div>
      </section>

      <section>
        <h3>Größe und Lage</h3>
        <div className="fields two">
          <label>
            Breite (px)
            <NumberInput lazy value={total} min={40 * info.cols} max={maxW} onChange={(v) => setTotal(Math.round(v))} />
          </label>
          <label>
            Zeilenhöhe (px)
            <NumberInput value={a.rowHeight} min={0} max={300} onChange={(v) => update({ rowHeight: Math.round(v) })} />
          </label>
        </div>
        <div className="fields">
          <label>
            Abstand vom linken Rand (px)
            <NumberInput value={a.offsetX} min={0} max={Math.max(0, maxW - total)} onChange={(v) => update({ offsetX: Math.round(v) })} />
          </label>
          <div className="button-grid">
            <button onClick={() => change((tr) => {
              setColumnWidths(tr, pos, scaleWidths(widths(), maxW))
              tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, offsetX: 0 })
            })}>Seitenbreite</button>
            <button onClick={() => update({ offsetX: Math.max(0, Math.round((maxW - total) / 2)) })}>Zentrieren</button>
            <button onClick={() => change((tr) => setColumnWidths(tr, pos, scaleWidths(widths().map(() => 1), total)))}>Spalten gleich breit</button>
            <button onClick={() => update({ rowHeight: 0 })}>Höhe automatisch</button>
          </div>
          <p className="help">Mit der Maus: Griff ✥ oben links zum Verschieben, Ecke unten rechts zum Vergrößern, Spaltenlinien ziehen für einzelne Breiten.</p>
        </div>
      </section>

      <button className="danger" onClick={remove}>Tabelle löschen</button>
    </aside>
  )
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="weniger">−</button>
      <NumberInput lazy value={value} min={min} max={max} onChange={(v) => onChange(Math.round(v))} />
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="mehr">+</button>
    </div>
  )
}

function ColorRow({ label, colors, value, onChange }: { label: string; colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-row">
      <span>{label}</span>
      <div className="swatches">
        {colors.map((c) => (
          <button
            key={c || 'none'}
            className={`swatch${(value || '') === c ? ' on' : ''}${c ? '' : ' none'}`}
            style={c ? { background: c } : undefined}
            title={c || 'Keine Farbe'}
            onClick={() => onChange(c)}
          />
        ))}
        <input type="color" value={value || '#ffffff'} title="Eigene Farbe" onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )
}
