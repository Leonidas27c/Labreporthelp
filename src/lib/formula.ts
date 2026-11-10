/**
 * Formeln für Tabellenspalten, z. B. „C = A * B“ oder „E = D / B“.
 * Spalten heißen wie in einer Tabellenkalkulation A, B, C, … (von links gezählt).
 * Erlaubt sind + − · / ^, Klammern, Zahlen (Komma oder Punkt), pi und
 * die Funktionen sqrt, abs, ln, log, exp, sin, cos, tan.
 */

/** Spaltennummer (0-basiert) → Buchstabe: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let s = ''
  let n = index + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Buchstabe → Spaltennummer (0-basiert), A → 0. */
export function columnIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Liest eine Zahl aus einem Zellentext: „1016“, „0,2149“, „-3.5“, „1,2e-3“, „1.016,5“.
 * Text nach der Zahl (z. B. „± 0,5“ oder eine Einheit) wird ignoriert. Leer/kein Wert → null.
 */
export function parseNumber(text: string): number | null {
  let t = text.trim().replace(/[\s  ]/g, '').replace(/[−–]/g, '-')
  if (!t) return null
  // „1.016,5“: Punkte sind Tausendertrennzeichen
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?/.test(t)) t = t.replace(/\./g, '')
  const m = t.match(/^[-+]?(\d+([.,]\d*)?|[.,]\d+)(e[-+]?\d+)?/i)
  if (!m) return null
  const v = Number(m[0].replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

/** Ergebnis einer Formel als Text, mit Dezimalkomma. decimals = null → automatisch (bis 4 Stellen). */
export function formatResult(v: number, decimals: number | null): string {
  if (!Number.isFinite(v)) return '–'
  if (decimals === null) {
    const abs = Math.abs(v)
    // sehr kleine Werte nicht zu 0 runden
    const digits = abs > 0 && abs < 0.001 ? Math.min(12, 3 - Math.floor(Math.log10(abs))) : 4
    return v.toLocaleString('de-DE', { maximumFractionDigits: digits, useGrouping: false })
  }
  const d = Math.max(0, Math.min(12, Math.round(decimals)))
  return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })
}

type Value = (col: (i: number) => number | null) => number | null

export interface CompiledFormula {
  /** Spalten, die in der Formel vorkommen (0-basiert) */
  refs: number[]
  /** Rechnet die Formel für eine Zeile aus. null, wenn ein Wert fehlt. */
  evaluate: (col: (i: number) => number | null) => number | null
}

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  wurzel: Math.sqrt,
  abs: Math.abs,
  betrag: Math.abs,
  ln: Math.log,
  log: Math.log10,
  lg: Math.log10,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
}

/** Übersetzt eine Formel. Wirft einen Fehler mit verständlicher Meldung, wenn sie nicht stimmt. */
export function compileFormula(source: string): CompiledFormula {
  // „= A + B“ und „C = A + B“ erlauben, wie man es gewohnt ist
  const src = source.replace(/^\s*([A-Za-z]{1,2}\s*)?=/, '')
  const refs = new Set<number>()
  let i = 0

  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i++
  }
  const peek = () => {
    skip()
    return src[i] ?? ''
  }
  const fail = (msg: string): never => {
    throw new Error(msg)
  }

  const lift2 = (a: Value, b: Value, op: (x: number, y: number) => number): Value => (col) => {
    const x = a(col)
    const y = b(col)
    return x === null || y === null ? null : op(x, y)
  }

  const expr = (): Value => {
    let left = term()
    for (;;) {
      const c = peek()
      if (c === '+') {
        i++
        left = lift2(left, term(), (x, y) => x + y)
      } else if (c === '-' || c === '−') {
        i++
        left = lift2(left, term(), (x, y) => x - y)
      } else return left
    }
  }

  const term = (): Value => {
    let left = unary()
    for (;;) {
      const c = peek()
      if (c === '*' || c === '·' || c === '×' || c === '⋅') {
        i++
        left = lift2(left, unary(), (x, y) => x * y)
      } else if (c === '/' || c === '÷' || c === ':') {
        i++
        left = lift2(left, unary(), (x, y) => x / y)
      } else return left
    }
  }

  const unary = (): Value => {
    const c = peek()
    if (c === '-' || c === '−') {
      i++
      const v = unary()
      return (col) => {
        const x = v(col)
        return x === null ? null : -x
      }
    }
    if (c === '+') {
      i++
      return unary()
    }
    return power()
  }

  const power = (): Value => {
    const base = primary()
    if (peek() === '^') {
      i++
      return lift2(base, unary(), (x, y) => x ** y)
    }
    if (peek() === '²') {
      i++
      return lift2(base, () => 2, (x, y) => x ** y)
    }
    if (peek() === '³') {
      i++
      return lift2(base, () => 3, (x, y) => x ** y)
    }
    return base
  }

  const primary = (): Value => {
    const c = peek()
    if (!c) fail('Die Formel endet zu früh.')
    if (c === '(') {
      i++
      const v = expr()
      if (peek() !== ')') fail('Es fehlt eine schließende Klammer „)“.')
      i++
      return v
    }
    const num = src.slice(i).match(/^(\d+([.,]\d*)?|[.,]\d+)(e[-+]?\d+)?/i)
    if (num) {
      i += num[0].length
      const v = Number(num[0].replace(',', '.'))
      return () => v
    }
    if (c === 'π') {
      i++
      return () => Math.PI
    }
    const word = src.slice(i).match(/^[A-Za-z]+/)
    if (word) {
      const name = word[0]
      i += name.length
      const fn = FUNCTIONS[name.toLowerCase()]
      if (fn && peek() === '(') {
        i++
        const arg = expr()
        if (peek() !== ')') fail(`Bei ${name}( fehlt die schließende Klammer „)“.`)
        i++
        return (col) => {
          const x = arg(col)
          return x === null ? null : fn(x)
        }
      }
      if (name.toLowerCase() === 'pi') return () => Math.PI
      if (name.length > 2) fail(`„${name}“ kenne ich nicht. Spalten heißen A, B, C …; Funktionen: ${Object.keys(FUNCTIONS).join(', ')}.`)
      const index = columnIndex(name)
      refs.add(index)
      return (col) => col(index)
    }
    return fail(`Unerwartetes Zeichen „${c}“.`)
  }

  if (!src.trim()) fail('Die Formel ist leer.')
  const root = expr()
  if (peek()) fail(`Unerwartetes Zeichen „${peek()}“.`)
  return { refs: [...refs].sort((a, b) => a - b), evaluate: root }
}

/** Wie compileFormula, aber ohne Fehler: null bei ungültiger Formel. */
export function tryCompile(source: string | null | undefined): CompiledFormula | null {
  if (!source || !source.trim()) return null
  try {
    return compileFormula(source)
  } catch {
    return null
  }
}
