import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { aboChat } from './server/aboChat.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aboChat()],
})
