import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import {
  formatSig,
  hasHeaderRow,
  isOutlier,
  pointRowsFromGrid,
  replacePoint,
  tableGrid,
  toggleOutlier,
  type ChartSeries,
  type DocTable,
} from '../lib/chartData'
import { parseNumber } from '../lib/formula'
import { selectPoint, type PointSelection } from '../lib/chartSelection'
import { setCellText } from '../lib/tableModel'
import { computeGrid, formulaColumns } from '../extensions/LabData'

interface Props {
  editor: Editor
  /** Position des Diagramms */
  pos: number
  series: ChartSeries[]
  index: number
  /** verknüpfte Tabelle (null bei Werten von Hand oder gelöschter Tabelle) */
  linked: DocTable | null
  selection: PointSelection | null
  setSeries: (next: ChartSeries[]) => void
}

const show = (v: number) => formatSig(v, 8)

/** Zahl in einer Zelle ersetzen; eine angehängte Einheit („12,5 mA“) bleibt stehen. */
function replaceNumber(text: string, num: string) {
  const m = text.match(/^\s*[-+−]?(\d[\d.]*(,\d*)?|[.,]\d+)(e[-+]?\d+)?/i)
  return m ? num + text.slice(m[0].length) : num
}

/** Eingabefeld, das erst beim Verlassen oder mit Enter übernommen wird. */
function ValueInput({ value, disabled, title, onCommit }: { value: number; disabled?: boolean; title?: string; onCommit: (v: number, text: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = parseNumber(draft)
    setDraft(null)
    if (v !== null && v !== value) onCommit(v, draft.trim())
  }
  return (
    <input
      inputMode="decimal"
      value={draft ?? show(value)}
      disabled={disabled}
      title={title}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(null)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

/**
 * Einzelne Messpunkte der gewählten Reihe: Werte ändern und Ausreißer markieren.
 * Bei verknüpften Reihen wird die Änderung in die Tabelle geschrieben.
 */
export function ChartPointsTable({ editor, pos, series, index, linked, selection, setSeries }: Props) {
  const s = series[index]
  const selIndex = selection && selection.pos === pos && selection.series === s.id ? selection.index : -1
  const listRef = useRef<HTMLDivElement>(null)

  // Im Diagramm angeklickten Punkt in der Liste zeigen
  useEffect(() => {
    if (selIndex < 0) return
    listRef.current?.querySelector(`[data-point="${selIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selIndex, s.id])

  const patch = (p: Partial<ChartSeries>) => setSeries(series.map((x, i) => (i === index ? { ...x, ...p } : x)))
  const outlierCount = s.points.filter((p) => isOutlier(s, p)).length

  // Zu jedem Punkt die Tabellenzeile, damit Änderungen dort landen
  const header = linked ? hasHeaderRow(linked.node) : false
  const rows = linked && s.source
    ? pointRowsFromGrid(computeGrid(tableGrid(linked.node), formulaColumns(linked.node)).slice(header ? 1 : 0), s.source.x, s.source.y).map((r) => r.row + (header ? 1 : 0))
    : null
  const formulaCols = linked ? new Set(formulaColumns(linked.node).map((c) => c.col)) : new Set<number>()

  const setValue = (k: number, axis: 0 | 1, v: number, text: string) => {
    const old = s.points[k]
    const next: [number, number] = axis === 0 ? [v, old[1]] : [old[0], v]
    if (!s.source) {
      patch(replacePoint(s, k, next))
      return
    }
    // Verknüpfte Reihe: in die Tabellenzelle schreiben, das Diagramm wird dann nachgeführt
    const row = rows?.[k]
    const col = axis === 0 ? s.source.x : s.source.y
    if (!linked || row === undefined) return
    const { state, view } = editor
    const map = TableMap.get(linked.node)
    const offset = map.map[row * map.width + col]
    const cell = linked.node.nodeAt(offset)
    if (!cell) return
    const tr = state.tr
    setCellText(tr, state.schema, linked.pos + 1 + offset, replaceNumber(cell.textContent, text))
    // Ausreißer-Markierung mitnehmen (auch wenn sich über eine Formel der andere Wert ändert)
    if (isOutlier(s, old)) {
      const t = tr.doc.nodeAt(tr.mapping.map(linked.pos))
      const chart = tr.doc.nodeAt(tr.mapping.map(pos))
      if (t && chart) {
        const h = hasHeaderRow(t) ? 1 : 0
        const fresh = pointRowsFromGrid(computeGrid(tableGrid(t), formulaColumns(t)).slice(h), s.source.x, s.source.y).find((r) => r.row + h === row)
        if (fresh) {
          const outliers = toggleOutlier({ ...s, outliers: toggleOutlier(s, old, false) }, fresh.point, true)
          tr.setNodeMarkup(tr.mapping.map(pos), undefined, { ...chart.attrs, series: series.map((x, i) => (i === index ? { ...x, outliers } : x)) })
        }
      }
    }
    const chartPos = tr.mapping.map(pos)
    tr.setSelection(NodeSelection.create(tr.doc, chartPos))
    view.dispatch(tr)
    // Die Tabelle steht davor: das Diagramm kann sich verschoben haben
    selectPoint({ pos: chartPos, series: s.id, index: k })
  }

  if (!s.points.length) return null

  return (
    <div className="points-block">
      <div className="points-head">
        <span>Einzelne Messpunkte{outlierCount > 0 ? ` · ${outlierCount} Ausreißer` : ''}</span>
        {outlierCount > 0 && (
          <button className="link" onClick={() => patch({ outliers: [] })} title="Alle Ausreißer-Markierungen dieser Messreihe entfernen">
            Alle aufheben
          </button>
        )}
      </div>
      <div className="points-table" ref={listRef}>
        <table>
          <thead>
            <tr>
              <th>{rows ? 'Zeile' : 'Nr.'}</th>
              <th>x</th>
              <th>y</th>
              <th title="Ausreißer: rot umkreist und nicht in der Ausgleichsgeraden">Ausreißer</th>
            </tr>
          </thead>
          <tbody>
            {s.points.map((p, k) => {
              const outlier = isOutlier(s, p)
              const lockX = !!s.source && (formulaCols.has(s.source.x) || !rows)
              const lockY = !!s.source && (formulaCols.has(s.source.y) || !rows)
              const lockTitle = rows ? 'Formelspalte: wird aus der Tabelle berechnet' : 'Tabelle nicht mehr vorhanden'
              return (
                <tr
                  key={k}
                  data-point={k}
                  className={`${k === selIndex ? 'selected' : ''}${outlier ? ' outlier' : ''}`}
                  onClick={() => selectPoint({ pos, series: s.id, index: k })}
                >
                  <td className="num">{rows ? rows[k] + (header ? 0 : 1) : k + 1}</td>
                  <td>
                    <ValueInput value={p[0]} disabled={lockX} title={lockX ? lockTitle : undefined} onCommit={(v, t) => setValue(k, 0, v, t)} />
                  </td>
                  <td>
                    <ValueInput value={p[1]} disabled={lockY} title={lockY ? lockTitle : undefined} onCommit={(v, t) => setValue(k, 1, v, t)} />
                  </td>
                  <td className="check">
                    <input
                      type="checkbox"
                      checked={outlier}
                      aria-label={`Punkt ${k + 1} als Ausreißer markieren`}
                      onChange={(e) => {
                        patch({ outliers: toggleOutlier(s, p, e.target.checked) })
                        selectPoint({ pos, series: s.id, index: k })
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="help">
        Punkt im Diagramm anklicken, um ihn hier zu bearbeiten. Ausreißer werden rot umkreist
        {s.fit ? ' und nicht für die Ausgleichsgerade verwendet' : ''}.
        {outlierCount > 0 && s.fit ? ` Gerade aus ${s.points.length - outlierCount} von ${s.points.length} Punkten.` : ''}
      </p>
    </div>
  )
}
