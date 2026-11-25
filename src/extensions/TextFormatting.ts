import { Extension } from '@tiptap/core'
import type { CommandProps, Editor } from '@tiptap/core'

/** Einzug pro Stufe (wie in Word: 1,25 cm). */
export const INDENT_CM = 1.25
const MAX_INDENT = 8

/** Schriftgrößen in der Auswahlliste (pt), wie in Word. */
export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]
/** Grundschriftgröße der Seite (siehe index.css). */
export const BASE_FONT_PT = 12

/** Zeilenabstände in der Auswahlliste; der Standard der Seite ist 1,5 (siehe index.css). */
export const LINE_HEIGHTS = ['1', '1.15', '2', '2.5', '3']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textFormatting: {
      /** Einzug vergrößern (in Listen: Listenpunkt eine Ebene tiefer). */
      indent: () => ReturnType
      /** Einzug verkleinern (in Listen: Listenpunkt eine Ebene höher). */
      outdent: () => ReturnType
      /** Zeilenabstand der ausgewählten Absätze (null = Standard). */
      setLineHeight: (value: string | null) => ReturnType
      /** Schrift eine Stufe größer bzw. kleiner (Strg+Umschalt+> / <). */
      growFont: (direction: 1 | -1) => ReturnType
      /** Alle Zeichenformate und Absatzformate entfernen (Strg+Leertaste). */
      clearFormatting: () => ReturnType
    }
  }
}

const BLOCKS = ['paragraph', 'heading']

/** Aktuelle Schriftgröße an der Auswahl in pt (null = Standard der Seite bzw. Überschrift). */
export function currentFontPt(editor: Editor): number | null {
  const size = editor.getAttributes('textStyle').fontSize as string | undefined
  if (!size) return null
  const n = parseFloat(size)
  if (!Number.isFinite(n)) return null
  return size.endsWith('px') ? Math.round(n * 0.75 * 2) / 2 : n
}

/** Tatsächliche Schriftgröße am Cursor in pt (auch in Überschriften ohne eigene Größe). */
function effectiveFontPt(editor: Editor): number {
  const own = currentFontPt(editor)
  if (own != null) return own
  try {
    const { node } = editor.view.domAtPos(editor.state.selection.from)
    const el = node instanceof HTMLElement ? node : node.parentElement
    const px = el ? parseFloat(getComputedStyle(el).fontSize) : NaN
    if (Number.isFinite(px)) return Math.round(px * 0.75 * 2) / 2
  } catch {
    /* ohne Ansicht: Standardgröße */
  }
  return BASE_FONT_PT
}

/**
 * Absatzformate wie in Word: Einzug, Zeilenabstand, schrittweise Schriftgröße und
 * „Formatierung löschen“. Einzug und Zeilenabstand sind Attribute von Absatz und
 * Überschrift und landen als style im HTML, damit sie beim Drucken erhalten bleiben.
 */
export const TextFormatting = Extension.create({
  name: 'textFormatting',

  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const m = parseFloat(el.style.marginLeft)
              return Number.isFinite(m) && el.style.marginLeft.endsWith('cm') ? Math.round(m / INDENT_CM) : 0
            },
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * INDENT_CM}cm` } : {}),
          },
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    /** Einzug aller ausgewählten Absätze ändern. */
    const shiftIndent = ({ tr, state }: CommandProps, delta: 1 | -1) => {
      let changed = false
      state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
        if (!BLOCKS.includes(node.type.name)) return true
        const next = Math.max(0, Math.min(MAX_INDENT, (node.attrs.indent ?? 0) + delta))
        if (next !== node.attrs.indent) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
          changed = true
        }
        return false
      })
      return changed
    }

    return {
      indent:
        () =>
        (props) => {
          if (props.editor.isActive('listItem')) return props.commands.sinkListItem('listItem')
          return shiftIndent(props, 1)
        },
      outdent:
        () =>
        (props) => {
          if (props.editor.isActive('listItem')) return props.commands.liftListItem('listItem')
          return shiftIndent(props, -1)
        },
      setLineHeight:
        (value) =>
        ({ tr, state }) => {
          let changed = false
          state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
            if (!BLOCKS.includes(node.type.name)) return true
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: value })
            changed = true
            return false
          })
          return changed
        },
      growFont:
        (direction) =>
        ({ editor, commands }) => {
          const now = effectiveFontPt(editor)
          const next =
            direction > 0 ? (FONT_SIZES.find((s) => s > now) ?? now + 10) : ([...FONT_SIZES].reverse().find((s) => s < now) ?? Math.max(1, now - 1))
          return commands.setFontSize(`${next}pt`)
        },
      clearFormatting:
        () =>
        ({ chain }) =>
          chain()
            .unsetAllMarks()
            .setLineHeight(null)
            .command(({ tr, state }) => {
              state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
                if (!BLOCKS.includes(node.type.name)) return true
                if (node.attrs.indent) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: 0 })
                return false
              })
              return true
            })
            .run(),
    }
  },

  addKeyboardShortcuts() {
    return {
      // Word: Strg+Umschalt+> bzw. < (auf deutschen Tastaturen kommt e.key als ">" bzw. "<")
      'Mod->': () => this.editor.commands.growFont(1),
      'Mod-<': () => this.editor.commands.growFont(-1),
      'Mod-Shift->': () => this.editor.commands.growFont(1),
      'Mod-Shift-<': () => this.editor.commands.growFont(-1),
      'Mod-]': () => this.editor.commands.growFont(1),
      'Mod-[': () => this.editor.commands.growFont(-1),
      'Mod-Space': () => this.editor.commands.clearFormatting(),
      // Word: Strg+M bzw. Strg+Umschalt+M für den Einzug
      'Mod-m': () => this.editor.commands.indent(),
      'Mod-Shift-m': () => this.editor.commands.outdent(),
      // Word: Strg+L/E/R/J für die Ausrichtung
      'Mod-l': () => this.editor.commands.setTextAlign('left'),
      'Mod-e': () => this.editor.commands.setTextAlign('center'),
      'Mod-r': () => this.editor.commands.setTextAlign('right'),
      'Mod-j': () => this.editor.commands.setTextAlign('justify'),
      // Word (deutsch): Strg+# tiefgestellt, Strg++ hochgestellt
      'Mod-#': () => this.editor.commands.toggleSubscript(),
      'Mod-+': () => this.editor.commands.toggleSuperscript(),
    }
  },
})
