import { useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { columnLetter, compileFormula } from '../lib/formula'
import { splitUnit } from '../lib/tableModel'

interface Props {
  editor: Editor
  /** Position der Tabelle */
  pos: number
  /** aktuelle Spalte (0-basiert) */
  col: number
  cols: number
  /** Position der obersten Zelle dieser Spalte (dort steht die Formel) */
  cellPos: number
}

const OPERATORS = [
  { op: '+', label: '+  plus' },
  { op: '-', label: '−  minus' },
  { op: '*', label: '·  mal' },
  { op: '/', label: '/  geteilt durch' },
  { op: '^', label: '^  hoch' },
]

/** „Formel“ im Abschnitt Spalte der Tabellen-Seitenleiste: Spalte = A Operator B oder freie Formel. */
export function FormulaSection({ editor, pos, col, cols, cellPos }: Props) {
  // eigener Abo auf den Editor, damit Formel und Spaltenköpfe nach jeder Änderung aktuell sind
  const { stored, decimals, headers } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const cell = e.state.doc.nodeAt(cellPos)
      const table = e.state.doc.nodeAt(pos)
      const heads: string[] = []
      table?.firstChild?.forEach((c) => {
        for (let k = 0; k < (c.attrs.colspan as number); k++) heads.push(c.textContent)
      })
      return {
        stored: (cell?.attrs.formula as string | null) ?? '',
        decimals: (cell?.attrs.decimals as number | null) ?? null,
        headers: heads,
      }
    },
  })
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? stored
  const [a, setA] = useState(col > 0 ? 0 : Math.min(1, cols - 1))
  const [op, setOp] = useState('*')
  const [b, setB] = useState(col > 1 ? 1 : Math.min(2, cols - 1))

  const name = (i: number) => {
    const h = splitUnit(headers[i] ?? '').label
    return `${columnLetter(i)}${h ? ` – ${h}` : ''}`
  }

  let error = ''
  let selfRef = false
  if (shown.trim()) {
    try {
      const f = compileFormula(shown)
      const bad = f.refs.find((r) => r >= cols)
      if (bad !== undefined) error = `Spalte ${columnLetter(bad)} gibt es in dieser Tabelle nicht.`
      selfRef = f.refs.includes(col)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Formel ungültig.'
    }
  }

  const save = (formula: string | null, dec: number | null = decimals) => {
    const { state, view } = editor
    const node = state.doc.nodeAt(cellPos)
    if (!node) return
    view.dispatch(state.tr.setNodeMarkup(cellPos, undefined, { ...node.attrs, formula: formula?.trim() || null, decimals: dec }))
  }

  const letter = columnLetter(col)
  return (
    <fieldset style={{ marginTop: 10 }}>
      <legend>Formel für Spalte {letter}</legend>
      <div className="formula-builder">
        <select value={a} onChange={(e) => setA(Number(e.target.value))} aria-label="erste Spalte">
          {Array.from({ length: cols }, (_, i) => (
            <option key={i} value={i}>{name(i)}</option>
          ))}
        </select>
        <select value={op} onChange={(e) => setOp(e.target.value)} aria-label="Rechenzeichen">
          {OPERATORS.map((o) => (
            <option key={o.op} value={o.op}>{o.label}</option>
          ))}
        </select>
        <select value={b} onChange={(e) => setB(Number(e.target.value))} aria-label="zweite Spalte">
          {Array.from({ length: cols }, (_, i) => (
            <option key={i} value={i}>{name(i)}</option>
          ))}
        </select>
        <button
          onClick={() => {
            const f = `${columnLetter(a)} ${op} ${columnLetter(b)}`
            setText(null)
            save(f)
          }}
        >
          Übernehmen
        </button>
      </div>
      <label>
        {letter} =
        <input
          value={shown}
          placeholder="z. B. B * C, (D - 1013) / B, sqrt(A)"
          onChange={(e) => {
            setText(e.target.value)
            // gültige Formeln sofort übernehmen, ungültige erst beim Verlassen (bleiben dann wirkungslos)
            try {
              compileFormula(e.target.value)
              save(e.target.value)
            } catch {
              if (!e.target.value.trim()) save(null)
            }
          }}
          onBlur={() => {
            if (text !== null && text !== stored) save(text)
            setText(null)
          }}
        />
      </label>
      {error && <p className="help error">{error}</p>}
      {selfRef && !error && <p className="help error">Die Formel verwendet ihre eigene Spalte {letter}; dieser Wert zählt als leer.</p>}
      <label>
        Nachkommastellen
        <select value={decimals === null ? 'auto' : String(decimals)} onChange={(e) => save(stored || shown, e.target.value === 'auto' ? null : Number(e.target.value))}>
          <option value="auto">automatisch</option>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>
      {stored && <button onClick={() => { setText(null); save(null) }}>Formel entfernen (Werte bleiben stehen)</button>}
      <p className="help">
        Spalten heißen von links A, B, C … Erlaubt: + − * / ^, Klammern, Zahlen (z. B. 1013,25), pi und sqrt, abs, ln, log, exp, sin, cos, tan.
        Die Werte unter der Kopfzeile werden automatisch ausgerechnet, sobald sich eine Zahl ändert.
      </p>
    </fieldset>
  )
}
