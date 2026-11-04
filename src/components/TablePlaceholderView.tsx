import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { useResize } from './useResize'
import { useMove } from './useMove'
import { contentWidth } from '../lib/insertPosition'

export function TablePlaceholderView({ node, updateAttributes, selected, editor, getPos }: ReactNodeViewProps) {
  const { width, height, offsetX } = node.attrs as { width: number; height: number; offsetX: number }
  const maxWidth = contentWidth(editor.view.dom) - offsetX
  const { size, resizing, handleProps } = useResize(width, height, maxWidth, updateAttributes)
  const { moving, moveStyle, moveProps } = useMove(editor, getPos, offsetX, width)

  return (
    <NodeViewWrapper
      className={`table-placeholder${selected ? ' selected' : ''}${resizing ? ' resizing' : ''}${moving ? ' moving' : ''}`}
      style={{ width: size.width, height: size.height, marginLeft: offsetX, ...moveStyle }}
      contentEditable={false}
      draggable={false}
      {...moveProps}
    >
      <span>Tabelle (kommt bald)</span>
      <div className="resize-handle" title="Ziehen zum Vergrößern" {...handleProps} />
    </NodeViewWrapper>
  )
}
