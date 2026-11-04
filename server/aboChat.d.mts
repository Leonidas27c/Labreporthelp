import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
export function aboChat(): Plugin
export function middleware(req: IncomingMessage, res: ServerResponse, next: () => void): void
