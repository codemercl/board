import app from './app.js'
import { config, isLive } from './config.js'

// Local dev / single Node host (Railway, Render, a VPS, `npm start`).
app.listen(config.port, () => {
  console.log(`[board] API on http://localhost:${config.port}  (mode: ${isLive ? 'LIVE Clinic Cards' : 'MOCK / demo'})`)
  if (!isLive) {
    console.log('[board] No CLINIC_CARDS_API_KEY set — serving demo data. Add the key to .env for live patients.')
  }
})
