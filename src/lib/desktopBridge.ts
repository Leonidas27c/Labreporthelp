import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DocumentTools } from './documentTools'

const BRIDGE_URL = 'ws://127.0.0.1:5174'
const RETRY_MS = 3000
/** Aufrufe, die kurz nacheinander kommen, landen untereinander statt alle am Cursor */
const SEQUENCE_MS = 15000

/**
 * Verbindung zu Claude Desktop. Der MCP-Server (mcp/server.mjs), den
 * Claude Desktop startet, schickt Werkzeugaufrufe hierher; die App führt sie
 * im Dokument aus und antwortet mit dem Ergebnis.
 */
export function useDesktopBridge(editor: Editor | null) {
  const [connected, setConnected] = useState(false)
  const tools = useMemo(() => (editor ? new DocumentTools(editor) : null), [editor])

  useEffect(() => {
    if (!tools) return
    let socket: WebSocket | null = null
    let retry: number | undefined
    let stopped = false
    let lastCall = 0

    const connect = () => {
      socket = new WebSocket(BRIDGE_URL)
      socket.onopen = () => setConnected(true)
      socket.onclose = () => {
        setConnected(false)
        if (!stopped) retry = window.setTimeout(connect, RETRY_MS)
      }
      socket.onerror = () => socket?.close()
      socket.onmessage = async (ev) => {
        let msg: { id: number; tool: string; input: unknown }
        try {
          msg = JSON.parse(String(ev.data))
        } catch {
          return
        }
        const now = Date.now()
        if (now - lastCall > SEQUENCE_MS) tools.begin()
        lastCall = now
        try {
          const result = await tools.run(msg.tool, msg.input)
          socket?.send(JSON.stringify({ id: msg.id, result }))
        } catch (err) {
          socket?.send(JSON.stringify({ id: msg.id, error: err instanceof Error ? err.message : String(err) }))
        }
      }
    }
    connect()
    return () => {
      stopped = true
      window.clearTimeout(retry)
      socket?.close()
    }
  }, [tools])

  return connected
}
