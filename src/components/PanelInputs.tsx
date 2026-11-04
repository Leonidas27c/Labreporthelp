import { useState } from 'react'

/**
 * Zahlenfeld, das Komma und Punkt akzeptiert und erst gültige Zahlen übernimmt.
 * Mit `lazy` wird erst beim Verlassen des Feldes oder mit Enter übernommen
 * (z. B. bei der Spaltenzahl, damit beim Tippen nichts gelöscht wird).
 */
export function NumberInput(props: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  disabled?: boolean
  lazy?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? String(props.value).replace('.', ',')
  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'))
    if (raw.trim() === '' || !Number.isFinite(v)) return
    const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, v))
    if (clamped !== props.value) props.onChange(clamped)
  }
  return (
    <input
      inputMode="decimal"
      value={shown}
      disabled={props.disabled}
      onChange={(e) => {
        setText(e.target.value)
        if (!props.lazy) commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && props.lazy && text !== null) commit(text)
      }}
      onBlur={() => {
        if (props.lazy && text !== null) commit(text)
        setText(null)
      }}
    />
  )
}

/** Textfeld, das beim Tippen sofort übernimmt, aber den getippten Text behält. */
export function TextInput(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      value={text ?? props.value}
      placeholder={props.placeholder}
      onChange={(e) => {
        setText(e.target.value)
        props.onChange(e.target.value)
      }}
      onBlur={() => setText(null)}
    />
  )
}
