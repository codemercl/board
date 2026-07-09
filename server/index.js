import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { config, isLive, STAGE_IDS } from './config.js'
import { getBoard } from './store.js'
import { setStage, setHot, dismissFollowup } from './db.js'

const app = express()
app.use(compression()) // gzip — the board JSON for thousands of patients is large
app.use(cors())
app.use(express.json())

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e)
  res.status(500).json({ result: 'fail', error: e.message })
})

// Board state: mapped Clinic Cards patients merged with our saved positions.
// ?refresh=1 forces a fresh Clinic Cards pull (bypasses the cache).
app.get('/api/board', wrap(async (req, res) => {
  const force = req.query.refresh === '1' || req.query.refresh === 'true'
  const board = await getBoard(force)
  res.json({ result: 'success', data: board })
}))

// Force a fresh pull from Clinic Cards.
app.post('/api/refresh', wrap(async (_req, res) => {
  const board = await getBoard(true)
  res.json({ result: 'success', data: board })
}))

// Move a patient to a new stage (persisted in our DB, never written to CC).
app.post('/api/patients/:id/stage', wrap(async (req, res) => {
  const { id } = req.params
  const { stage } = req.body || {}
  if (!stage || !STAGE_IDS.has(stage)) {
    return res.status(400).json({ result: 'fail', error: `Unknown stage: ${stage}` })
  }
  setStage(id, stage)
  const board = await getBoard(false) // reuse cached CC snapshot; positions are fresh
  res.json({ result: 'success', data: board })
}))

// Toggle a patient's "hot" flag (stored locally; reserved for future UI).
app.post('/api/patients/:id/hot', wrap(async (req, res) => {
  const { id } = req.params
  setHot(id, !!(req.body && req.body.hot))
  const board = await getBoard(false)
  res.json({ result: 'success', data: board })
}))

// Dismiss the "visited — move me" reminder for a patient.
app.post('/api/patients/:id/dismiss-followup', wrap(async (req, res) => {
  const { id } = req.params
  dismissFollowup(id, (req.body && req.body.visitAt) || null)
  const board = await getBoard(false)
  res.json({ result: 'success', data: board })
}))

app.get('/api/health', (_req, res) => {
  res.json({ result: 'success', data: { ok: true, mode: isLive ? 'live' : 'mock' } })
})

// In production, serve the built frontend from the same origin.
const distDir = path.resolve(config.root, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(config.port, () => {
  console.log(`[board] API on http://localhost:${config.port}  (mode: ${isLive ? 'LIVE Clinic Cards' : 'MOCK / demo'})`)
  if (!isLive) {
    console.log('[board] No CLINIC_CARDS_API_KEY set — serving demo data. Add the key to .env for live patients.')
  }
})
