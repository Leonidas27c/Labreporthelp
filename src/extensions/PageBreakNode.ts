import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Manuellen Seitenumbruch an der Cursorposition einfügen (Strg+Enter). */
      setPageBreak: () => ReturnType
    }
  }
}

/**
 * Manueller Seitenumbruch wie in Word (Strg+Enter). Im Editor eine dünne Markierung;
 * der folgende Block beginnt auf der nächsten Seite (siehe PageLayout.ts). Beim
 * Drucken ist die Markierung unsichtbar und es entsteht ein echter Seitenumbruch.
 */
export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'manual-page-break', contenteditable: 'false' })]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ tr, state, dispatch }) => {
          const { $from } = state.selection
          // Nur zwischen Absätzen der obersten Ebene (nicht in Tabellen oder Listen)
          if ($from.depth !== 1 || !$from.parent.isTextblock) return false
          if (dispatch) {
            tr.deleteSelection()
            // Absatz an der Cursorposition teilen (am Anfang nicht nötig) und den
            // Umbruch dazwischen setzen; der Cursor steht danach im zweiten Teil.
            if (tr.selection.$from.parentOffset > 0) tr.split(tr.selection.from)
            tr.insert(tr.selection.$from.before(), this.type.create())
            tr.scrollIntoView()
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() }
  },
})
