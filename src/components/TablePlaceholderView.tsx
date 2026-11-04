import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { useResize } from './useResize'
import { contentWidth } from './ChartView'

export function TablePlaceholderView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const { width, height, offsetX } = node.attrs as { width: number; height: number; offsetX: number }
  const maxWidth = contentWidth(editor.view.dom) - offsetX
  const { size, resizing, handleProps } = useResize(width, height, maxWidth, updateAttributes)

  return (
    <NodeViewWrapper
      className={`table-placeholder${selected ? ' selected' : ''}${resizing ? ' resizing' : ''}`}
      style={{ width: size.width, height: size.height, marginLeft: offsetX }}
      contentEditable={false}
    >
      <span>Tabelle (kommt bald)</span>
      <div className="resize-handle" title="Ziehen zum Vergrößern" {...handleProps} />
    </NodeViewWrapper>
  )
}
