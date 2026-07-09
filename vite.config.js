import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API key lives on the backend only. The frontend talks to our own
// Express API (server/), which proxies Clinic Cards and stores board positions.
// In dev, Vite proxies /api -> the backend so the browser stays same-origin.
const API_TARGET = process.env.API_TARGET || 'http://localhost:8787'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})

