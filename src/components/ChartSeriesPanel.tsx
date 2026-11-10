import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import type { ChartAttrs } from '../lib/chartModel'
import {
  SERIES_COLORS,
  documentTables,
  fitAxesToData,
  guessColumn,
  hasHeaderRow,
  newId,
  normalizeLegend,
  normalizeSeries,
  parsePointsText,
  pointsFromGrid,
  pointsToText,
  tableGrid,
  type ChartSeries,
  type DocTable,
  type LegendPosition,
  type SeriesMarker,
  type SeriesStyle,
} from '../lib/chartData'
import { columnLetter } from '../lib/formula'
import { splitUnit } from '../lib/tableModel'
import { computeGrid, formulaColumns } from '../extensions/LabData'
import { usePointSelection } from '../lib/chartSelection'
import { ChartPointsTable } from './ChartPointsTable'

export type ChartPatch = { series?: ChartSeries[]; legend?: LegendPosition; axes?: ChartAttrs['axes'] }

interface Props {
  editor: Editor
  pos: number
  chart: ChartAttrs
  rawSeries: unknown
  legend: unknown
  update: (patch: ChartPatch) => void
}

const LEGEND: { key: LegendPosition; label: string }[] = [
  { key: 'none', label: 'Aus' },
  { key: 'topLeft', label: '↖' },
  { key: 'topRight', label: '↗' },
  { key: 'bottomLeft', label: '↙' },
  { key: 'bottomRight', label: '↘' },
]

const MARKERS: { key: SeriesMarker; label: string }[] = [
  { key: 'circle', label: '●' },
  { key: 'square', label: '■' },
  { key: 'triangle', label: '▲' },
  { key: 'cross', label: '✕' },
]

/** Spaltenname für Auswahllisten: „B – Volumen V [ml]“ */
const colName = (headers: string[], i: number) => `${columnLetter(i)} – ${headers[i] || '(ohne Kopf)'}`

/** Werte einer Tabelle mit ausgerechneten Formelspalten. */
function computedPoints(t: DocTable, x: number, y: number) {
  const grid = computeGrid(tableGrid(t.node), formulaColumns(t.node))
  return pointsFromGrid(hasHeaderRow(t.node) ? grid.slice(1) : grid, x, y)
}

/** Abschnitt „Messwerte“ in der Diagramm-Seitenleiste. */
export function SeriesSection({ editor, pos, chart, rawSeries, legend, update }: Props) {
  const series = normalizeSeries(rawSeries)
  const [active, setActive] = useState(0)
  const [manualText, setManualText] = useState<{ id: string; text: string } | null>(null)
  const pointSel = usePointSelection()
  // Punkt im Diagramm angeklickt: dessen Messreihe zeigen
  const pickedSeries = pointSel && pointSel.pos === pos ? series.findIndex((x) => x.id === pointSel.series) : -1
  const [seenSel, setSeenSel] = useState(pointSel)
  if (pointSel !== seenSel) {
    setSeenSel(pointSel)
    if (pickedSeries >= 0) setActive(pickedSeries)
  }
  const index = Math.min(active, series.length - 1)
  const s = index >= 0 ? series[index] : null
  const tables = documentTables(editor.state.doc)
  const linked = s?.source ? tables.find((t) => t.uid === s.source!.table) ?? null : null

  const setSeries = (next: ChartSeries[], extra: ChartPatch = {}) => update({ series: next, ...extra })
  const patch = (p: Partial<ChartSeries>) => s && setSeries(series.map((x, i) => (i === index ? { ...x, ...p } : x)))

  /** Reihe mit einer Tabelle verknüpfen; die Tabelle bekommt dabei eine Kennung, falls sie noch keine hat. */
  const link = (t: DocTable, x: number, y: number, base: ChartSeries, mode: 'add' | 'replace') => {
    const { state, view } = editor
    const uid = t.uid ?? newId()
    const name = mode === 'replace' && base.name ? base.name : splitUnit(t.headers[y] ?? '').label || base.name || 'Messreihe'
    const item: ChartSeries = { ...base, name, source: { table: uid, x, y }, points: computedPoints(t, x, y) }
    const next = mode === 'add' ? [...series, item] : series.map((v, i) => (i === index ? item : v))
    let tr = state.tr
    if (!t.uid) tr = tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, uid })
    const node = tr.doc.nodeAt(pos)
    if (!node) return
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, series: next })
    tr = tr.setSelection(NodeSelection.create(tr.doc, pos))
    view.dispatch(tr)
    if (mode === 'add') setActive(next.length - 1)
  }

  /** Neue Messreihe: nimmt die nächste Tabelle oberhalb des Diagramms und rät passende Spalten. */
  const add = () => {
    const base: ChartSeries = {
      id: newId(),
      name: `Messreihe ${series.length + 1}`,
      color: SERIES_COLORS[series.length % SERIES_COLORS.length],
      axis: 'y',
      style: 'points',
      marker: (['circle', 'square', 'triangle', 'cross'] as const)[series.length % 4],
      fit: false,
      source: null,
      points: [],
      outliers: [],
    }
    const before = tables.filter((t) => t.pos < pos)
    const t = before[before.length - 1] ?? tables[0]
    if (t) {
      const x = guessColumn(t.headers, chart.axes.x, 0)
      const y = guessColumn(t.headers, chart.axes.y, x === 0 ? 1 : 0, x)
      link(t, x, y, base, 'add')
    } else {
      setSeries([...series, base])
      setActive(series.length)
    }
  }

  const remove = () => {
    setSeries(series.filter((_, i) => i !== index))
    setActive(Math.max(0, index - 1))
  }

  const fitAxes = () => update({ axes: fitAxesToData(chart, series) })
  const legendPos = normalizeLegend(legend)
  const shownText = s && manualText?.id === s.id ? manualText.text : s ? pointsToText(s.points) : ''

  return (
    <section>
      <h3>Messwerte</h3>
      {series.length > 0 && (
        <div className="series-list">
          {series.map((x, i) => (
            <button key={x.id} className={i === index ? 'active' : ''} onClick={() => setActive(i)} title={`${x.points.length} Messpunkte`}>
              <span className="dot" style={{ background: x.color }} />
              {x.name || `Messreihe ${i + 1}`}
              <span className="count">{x.points.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="button-grid" style={{ marginTop: 8 }}>
        <button onClick={add}>+ Messreihe</button>
        <button onClick={fitAxes} disabled={!series.some((x) => x.points.length)} title="Startwert und Endwert der Achsen so wählen, dass alle Punkte zu sehen sind">
          Achsen anpassen
        </button>
      </div>
      {!series.length && (
        <p className="help">Messreihe hinzufügen: Die Werte kommen aus einer Tabelle im Dokument (und bleiben aktuell) oder werden von Hand eingetragen.</p>
      )}

      {s && (
        <div className="fields">
          <div className="fields two" style={{ marginTop: 0 }}>
            <label>
              Name
              <input value={s.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>
            <label style={{ flex: '0 0 auto' }}>
              Farbe
              <input type="color" value={s.color} onChange={(e) => patch({ color: e.target.value })} />
            </label>
          </div>

          <div className="segmented">
            <button
              className={s.source ? 'active' : ''}
              disabled={!tables.length}
              title={tables.length ? 'Werte aus einer Tabelle im Dokument' : 'Im Dokument gibt es noch keine Tabelle'}
              onClick={() => {
                if (s.source || !tables.length) return
                const before = tables.filter((t) => t.pos < pos)
                const t = before[before.length - 1] ?? tables[0]
                const x = guessColumn(t.headers, chart.axes.x, 0)
                link(t, x, guessColumn(t.headers, chart.axes.y, x === 0 ? 1 : 0, x), s, 'replace')
              }}
            >
              Aus Tabelle
            </button>
            <button className={!s.source ? 'active' : ''} onClick={() => s.source && patch({ source: null })}>
              Von Hand
            </button>
          </div>

          {s.source ? (
            <>
              <label>
                Tabelle
                <select
                  value={linked ? String(tables.indexOf(linked)) : ''}
                  onChange={(e) => {
                    const t = tables[Number(e.target.value)]
                    if (!t) return
                    const x = guessColumn(t.headers, chart.axes.x, 0)
                    link(t, x, guessColumn(t.headers, chart.axes.y, x === 0 ? 1 : 0, x), { ...s, name: '' }, 'replace')
                  }}
                >
                  {!linked && <option value="">(Tabelle gelöscht)</option>}
                  {tables.map((t, i) => (
                    <option key={i} value={i}>{t.label}</option>
                  ))}
                </select>
              </label>
              {linked && (
                <>
                  <label>
                    x-Werte aus Spalte
                    <select value={s.source.x} onChange={(e) => link(linked, Number(e.target.value), s.source!.y, s, 'replace')}>
                      {linked.headers.map((_, i) => (
                        <option key={i} value={i}>{colName(linked.headers, i)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    y-Werte aus Spalte
                    <select value={s.source.y} onChange={(e) => link(linked, s.source!.x, Number(e.target.value), { ...s, name: '' }, 'replace')}>
                      {linked.headers.map((_, i) => (
                        <option key={i} value={i}>{colName(linked.headers, i)}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <p className="help">
                {s.points.length} Messpunkte. Ändert sich die Tabelle, wird das Diagramm automatisch nachgeführt. Zeilen ohne Zahl in beiden Spalten werden übersprungen.
              </p>
            </>
          ) : (
            <label>
              Messpunkte (eine Zeile pro Punkt: x; y)
              <textarea
                rows={6}
                value={shownText}
                placeholder={'1016; 50\n1046; 48\n…\n(auch aus Excel einfügbar)'}
                onChange={(e) => {
                  setManualText({ id: s.id, text: e.target.value })
                  patch({ points: parsePointsText(e.target.value) })
                }}
                onBlur={() => setManualText(null)}
              />
            </label>
          )}

          <label>
            Darstellung
            <div className="segmented">
              {(['points', 'line', 'both'] as SeriesStyle[]).map((k) => (
                <button key={k} className={s.style === k ? 'active' : ''} onClick={() => patch({ style: k })}>
                  {k === 'points' ? 'Punkte' : k === 'line' ? 'Linie' : 'Beides'}
                </button>
              ))}
            </div>
          </label>
          {s.style !== 'line' && (
            <label>
              Punktform
              <div className="segmented">
                {MARKERS.map((m) => (
                  <button key={m.key} className={s.marker === m.key ? 'active' : ''} onClick={() => patch({ marker: m.key })}>{m.label}</button>
                ))}
              </div>
            </label>
          )}
          {chart.axisCount === 3 && (
            <label>
              Abtragen an
              <div className="segmented">
                <button className={s.axis === 'y' ? 'active' : ''} onClick={() => patch({ axis: 'y' })}>y-Achse (links)</button>
                <button className={s.axis === 'y2' ? 'active' : ''} onClick={() => patch({ axis: 'y2' })}>y₂-Achse (rechts)</button>
              </div>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={s.fit} onChange={(e) => patch({ fit: e.target.checked })} />
            Ausgleichsgerade (lineare Regression)
          </label>
          <ChartPointsTable editor={editor} pos={pos} series={series} index={index} linked={linked} selection={pointSel} setSeries={setSeries} />
          <button className="danger" onClick={remove}>Messreihe entfernen</button>
        </div>
      )}

      {series.length > 0 && (
        <label style={{ marginTop: 10 }}>
          Legende
          <div className="segmented">
            {LEGEND.map((l) => (
              <button key={l.key} className={legendPos === l.key ? 'active' : ''} title={l.key === 'none' ? 'Keine Legende' : 'Legende in diese Ecke'} onClick={() => update({ legend: l.key })}>
                {l.label}
              </button>
            ))}
          </div>
        </label>
      )}
    </section>
  )
}
