import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type Match = { from: number; to: number }
export type SearchOptions = { query: string; caseSensitive: boolean; wholeWord: boolean }
type SearchState = SearchOptions & { matches: Match[]; current: number; decos: DecorationSet }

export const searchKey = new PluginKey<SearchState>('searchReplace')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      /** Suchbegriff setzen; alle Treffer werden markiert. */
      setSearch: (opts: Partial<SearchOptions>) => ReturnType
      /** Zum nächsten (1) bzw. vorherigen (-1) Treffer springen. */
      findStep: (dir: 1 | -1) => ReturnType
      /** Aktuellen Treffer ersetzen und zum nächsten springen. */
      replaceCurrent: (text: string) => ReturnType
      /** Alle Treffer ersetzen. */
      replaceAll: (text: string) => ReturnType
    }
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Alle Treffer im Dokument (auch in Tabellenzellen), Positionen im Dokument. */
export function findMatches(doc: PMNode, { query, caseSensitive, wholeWord }: SearchOptions): Match[] {
  if (!query) return []
  const re = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])${escape(query)}(?![\\p{L}\\p{N}_])` : escape(query), caseSensitive ? 'gu' : 'giu')
  const out: Match[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Text des Absatzes mit Zuordnung Zeichen → Dokumentposition
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      const start = pos + 1 + offset
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) map.push(start + i)
        text += child.text
      } else {
        map.push(start)
        text += '￼'
      }
    })
    for (const m of text.matchAll(re)) {
      if (!m[0].length) continue
      const i = m.index!
      out.push({ from: map[i], to: map[i + m[0].length - 1] + 1 })
    }
    return false
  })
  return out
}

function build(state: EditorState, opts: SearchOptions, near?: number): SearchState {
  const matches = findMatches(state.doc, opts)
  let current = -1
  if (matches.length) {
    const at = near ?? state.selection.from
    current = matches.findIndex((m) => m.from >= at)
    if (current < 0) current = 0
  }
  return { ...opts, matches, current, decos: decorate(state.doc, matches, current) }
}

function decorate(doc: PMNode, matches: Match[], current: number) {
  return DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'search-hit current' : 'search-hit' })),
  )
}

const EMPTY: SearchState = { query: '', caseSensitive: false, wholeWord: false, matches: [], current: -1, decos: DecorationSet.empty }

/** Suchen und Ersetzen wie in Word (Strg+F, Strg+H); die Leiste dazu ist FindBar.tsx. */
export const SearchReplace = Extension.create({
  name: 'searchReplace',

  addCommands() {
    const select = (tr: import('@tiptap/pm/state').Transaction, m: Match | undefined) => {
      if (!m) return
      tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView()
    }
    return {
      setSearch:
        (opts) =>
        ({ state, tr, dispatch }) => {
          const prev = searchKey.getState(state) ?? EMPTY
          const next = build(state, { query: prev.query, caseSensitive: prev.caseSensitive, wholeWord: prev.wholeWord, ...opts })
          if (dispatch) {
            tr.setMeta(searchKey, next).setMeta('addToHistory', false)
            select(tr, next.matches[next.current])
          }
          return true
        },
      findStep:
        (dir) =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state)
          if (!s || !s.matches.length) return false
          const current = (s.current + dir + s.matches.length) % s.matches.length
          if (dispatch) {
            tr.setMeta(searchKey, { ...s, current, decos: decorate(state.doc, s.matches, current) }).setMeta('addToHistory', false)
            select(tr, s.matches[current])
          }
          return true
        },
      replaceCurrent:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state)
          const m = s?.matches[s.current]
          if (!s || !m) return false
          if (dispatch) {
            const marks = state.doc.resolve(m.from + 1).marks()
            if (text) tr.replaceWith(m.from, m.to, state.schema.text(text, marks))
            else tr.delete(m.from, m.to)
            // Treffer neu suchen, ab der Stelle hinter der Ersetzung
            const after = m.from + text.length
            const matches = findMatches(tr.doc, s)
            let current = matches.findIndex((x) => x.from >= after)
            if (current < 0) current = matches.length ? 0 : -1
            tr.setMeta(searchKey, { ...s, matches, current, decos: decorate(tr.doc, matches, current) })
            select(tr, matches[current])
          }
          return true
        },
      replaceAll:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state)
          if (!s || !s.matches.length) return false
          if (dispatch) {
            // Von hinten nach vorn, damit die Positionen gültig bleiben
            for (const m of [...s.matches].reverse()) {
              const marks = state.doc.resolve(m.from + 1).marks()
              if (text) tr.replaceWith(m.from, m.to, state.schema.text(text, marks))
              else tr.delete(m.from, m.to)
            }
            tr.setMeta(searchKey, { ...s, matches: [], current: -1, decos: DecorationSet.empty })
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => EMPTY,
          apply(tr, old, _oldState, newState) {
            const next = tr.getMeta(searchKey) as SearchState | undefined
            if (next) return next
            if (!tr.docChanged || !old.query) return old
            // Nach Änderungen am Text die Treffer neu bestimmen
            const matches = findMatches(newState.doc, old)
            const current = Math.min(old.current, matches.length - 1)
            return { ...old, matches, current, decos: decorate(newState.doc, matches, current) }
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decos,
        },
      }),
    ]
  },
})
