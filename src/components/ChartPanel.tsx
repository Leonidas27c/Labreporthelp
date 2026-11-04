import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import {
  axisTicks,
  chartMargins,
  formatNumber,
  normalizeChart,
  type AxisKey,
  type AxisSettings,
  type ChartAttrs,
} from '../lib/chartModel'

interface ChartPanelProps {
  editor: Editor
  pos: number
  attrs: Record<string, unknown>
}

const AXIS_NAMES: Record<AxisKey, string> = { x: 'x-Achse', y: 'y-Achse', y2: 'y₂-Achse (rechts)' }

/** Seitenleiste „Diagramm formatieren“, sichtbar solange ein Diagramm ausgewählt ist. */
export function ChartPanel({ editor, pos, attrs }: ChartPanelProps) {
  const a = normalizeChart(attrs)
  const [tab, setTab] = useState<AxisKey>('x')
  const axisKey: AxisKey = tab === 'y2' && a.axisCount < 3 ? 'x' : tab
  const axis = a.axes[axisKey]

  const update = (patch: Partial<ChartAttrs>) => {
    const { state, view } = editor
    const node = state.doc.nodeAt(pos)
    if (!node) return
    let tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...a, ...patch, xLabel: null, xUnit: null, yLabel: null, yUnit: null })
    tr = tr.setSelection(NodeSelection.create(tr.doc, pos))
    view.dispatch(tr)
  }
  const updateAxis = (patch: Partial<AxisSettings>) =>
    update({ axes: { ...a.axes, [axisKey]: { ...axis, ...patch } } })

  const remove = () => editor.chain().focus().deleteSelection().run()

  // Vorschau der Abschnitte der gerade gewählten Achse
  const m = chartMargins(a)
  const cell = Math.max(4, a.cellSize)
  const majorPx = cell * Math.max(1, a.majorEvery)
  const raw = axisKey === 'x' ? a.width - m.left - m.right : a.height - m.top - m.bottom
  const length = Math.floor(raw / cell) * cell
  const { ticks } = axisTicks(axis, length, majorPx)
  const preview = ticks.length > 6
    ? [...ticks.slice(0, 4).map((t) => formatNumber(t.value)), '…', formatNumber(ticks[ticks.length - 1].value)]
    : ticks.map((t) => formatNumber(t.value))

  return (
    <aside className="side-panel" aria-label="Diagramm formatieren">
      <h2>Diagramm formatieren</h2>

      <section>
        <h3>Achsen</h3>
        <div className="segmented">
          <button className={a.axisCount === 2 ? 'active' : ''} onClick={() => update({ axisCount: 2 })}>2 Achsen</button>
          <button className={a.axisCount === 3 ? 'active' : ''} onClick={() => update({ axisCount: 3 })}>3 Achsen</button>
        </div>
        <p className="help">3 Achsen: zusätzliche y-Achse rechts</p>

        <div className="tabs">
          {(['x', 'y', 'y2'] as AxisKey[])
            .filter((k) => k !== 'y2' || a.axisCount === 3)
            .map((k) => (
              <button key={k} className={axisKey === k ? 'active' : ''} onClick={() => setTab(k)}>
                {k === 'y2' ? 'y₂' : k}
              </button>
            ))}
        </div>

        <div className="fields">
          <p className="axis-name">{AXIS_NAMES[axisKey]}</p>
          <label>
            Beschriftung
            <input value={axis.label} onChange={(e) => updateAxis({ label: e.target.value })} />
          </label>
          <label>
            Einheit
            <input value={axis.unit} placeholder="z. B. s, °C, mA" onChange={(e) => updateAxis({ unit: e.target.value })} />
          </label>
          <label>
            Startwert
            <NumberInput value={axis.start} onChange={(v) => updateAxis({ start: v })} />
          </label>

          <fieldset>
            <legend>Abschnitte</legend>
            <label className="radio">
              <input type="radio" checked={!axis.auto} onChange={() => updateAxis({ auto: false })} />
              Feste Schrittweite
              <NumberInput value={axis.step} disabled={axis.auto} min={0} onChange={(v) => updateAxis({ step: v })} />
            </label>
            <label className="radio">
              <input type="radio" checked={axis.auto} onChange={() => updateAxis({ auto: true })} />
              Automatisch bis
              <NumberInput value={axis.max} disabled={!axis.auto} onChange={(v) => updateAxis({ max: v })} />
            </label>
            <p className="help">Ergibt: {preview.join(', ')}</p>
          </fieldset>
        </div>
      </section>

      <section>
        <h3>Hintergrund</h3>
        <div className="segmented">
          <button className={a.background === 'grid' ? 'active' : ''} onClick={() => update({ background: 'grid' })}>Kariert</button>
          <button className={a.background === 'dots' ? 'active' : ''} onClick={() => update({ background: 'dots' })}>Punktiert</button>
          <button className={a.background === 'blank' ? 'active' : ''} onClick={() => update({ background: 'blank' })}>Blanko</button>
        </div>
        <div className="fields">
          <label>
            Kästchengröße (px)
            <NumberInput value={a.cellSize} min={4} max={100} onChange={(v) => update({ cellSize: v })} />
          </label>
          <label>
            Abschnitt alle … Kästchen
            <NumberInput value={a.majorEvery} min={1} max={50} onChange={(v) => update({ majorEvery: Math.round(v) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={a.showMajorLines} onChange={(e) => update({ showMajorLines: e.target.checked })} />
            Dicke Linie bei jedem Abschnitt
          </label>
        </div>
      </section>

      <section>
        <h3>Größe</h3>
        <div className="fields two">
          <label>
            Breite (px)
            <NumberInput value={a.width} min={80} onChange={(v) => update({ width: Math.round(v) })} />
          </label>
          <label>
            Höhe (px)
            <NumberInput value={a.height} min={80} onChange={(v) => update({ height: Math.round(v) })} />
          </label>
        </div>
      </section>

      <button className="danger" onClick={remove}>Diagramm löschen</button>
    </aside>
  )
}

/** Zahlenfeld, das Komma und Punkt akzeptiert und erst gültige Zahlen übernimmt. */
function NumberInput(props: { value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? String(props.value).replace('.', ',')
  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'))
    if (raw.trim() === '' || !Number.isFinite(v)) return
    const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, v))
    props.onChange(clamped)
  }
  return (
    <input
      inputMode="decimal"
      value={shown}
      disabled={props.disabled}
      onChange={(e) => {
        setText(e.target.value)
        commit(e.target.value)
      }}
      onBlur={() => setText(null)}
    />
  )
}
