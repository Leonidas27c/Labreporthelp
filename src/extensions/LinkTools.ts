import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/** Link setzen, ändern oder entfernen (Strg+K). Fragt nach der Adresse. */
export function editLink(editor: Editor) {
  const current = (editor.getAttributes('link').href as string | undefined) ?? ''
  const { empty } = editor.state.selection
  if (empty && !current) {
    window.alert('Bitte zuerst den Text markieren, der zum Link werden soll.')
    return
  }
  const url = window.prompt('Link-Adresse (leer lassen, um den Link zu entfernen):', current || 'https://')
  if (url === null) return editor.commands.focus()
  const chain = editor.chain().focus().extendMarkRange('link')
  const clean = url.trim()
  if (!clean || clean === 'https://') chain.unsetLink().run()
  else chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(clean) ? clean : `https://${clean}` }).run()
}

/**
 * Wie in Word: Links öffnen sich im Dokument nur mit Strg+Klick (sonst setzt ein Klick
 * den Cursor), und Strg+K setzt einen Link.
 */
export const LinkTools = Extension.create({
  name: 'linkTools',

  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        editLink(this.editor)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkTools'),
        props: {
          handleClick(_view, _pos, event) {
            if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false
            const a = (event.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
            if (!a) return false
            window.open(a.href, '_blank', 'noopener,noreferrer')
            event.preventDefault()
            return true
          },
        },
      }),
    ]
  },
})
