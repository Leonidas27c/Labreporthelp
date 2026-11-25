/**
 * Der im Diagramm angeklickte Messpunkt. Diagramm (zeichnet die Auswahl) und
 * Seitenleiste (zeigt den Punkt zum Bearbeiten) teilen sich diesen Zustand.
 * Er gehört nicht ins Dokument und wird deshalb weder gespeichert noch gedruckt.
 */
import { useSyncExternalStore } from 'react'

export interface PointSelection {
  /** Position des Diagramms im Dokument */
  pos: number
  series: string
  index: number
}

let current: PointSelection | null = null
const listeners = new Set<() => void>()

export function selectPoint(sel: PointSelection | null) {
  if (sel === current || (sel && current && sel.pos === current.pos && sel.series === current.series && sel.index === current.index)) return
  current = sel
  listeners.forEach((l) => l())
}

export function usePointSelection() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
