import { useRef, useState } from 'react'

const MIN_SIZE = 80

/**
 * Größe eines Feldes per Ziehen am Griff unten rechts ändern.
 * Während des Ziehens wird nur lokal neu gezeichnet; beim Loslassen
 * wird die neue Größe im Dokument gespeichert.
 */
export function useResize(
  width: number,
  height: number,
  maxWidth: number,
  onCommit: (size: { width: number; height: number }) => void,
) {
  const [live, setLive] = useState<{ width: number; height: number } | null>(null)
  const start = useRef({ x: 0, y: 0, width, height })

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    start.current = { x: e.clientX, y: e.clientY, width, height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setLive({ width, height })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!live) return
    const s = start.current
    setLive({
      width: clamp(s.width + e.clientX - s.x, MIN_SIZE, maxWidth),
      height: Math.max(MIN_SIZE, s.height + e.clientY - s.y),
    })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!live) return
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    onCommit({ width: Math.round(live.width), height: Math.round(live.height) })
    setLive(null)
  }

  return {
    size: live ?? { width, height },
    resizing: live !== null,
    handleProps: { onPointerDown, onPointerMove, onPointerUp },
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max))
}
