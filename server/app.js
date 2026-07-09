import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { config, isLive, STAGE_IDS, adminToken } from './config.js'
import { getBoard } from './store.js'
import { setStage, setHot, setFrozen, dismissFollowup } from './db.js'

// The Express app, without listen(). server/index.js listens (local/Node host);
// api/index.js exports it for Vercel serverless.
const app = express()
app.use(compression()) // gzip — the board JSON for thousands of patients is large
app.use(cors())
app.use(express.json())

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e)
  res.status(500).json({ result: 'fail', error: e.message })
})

// Admin gate for mutations (manual card moves). Login returns a bearer token
// derived from the credentials; mutations must present it.
app.post('/api/login', (req, res) => {
  const { user, password } = req.body || {}
  if (user === config.adminUser && password === config.adminPassword) {
    return res.json({ result: 'success', data: { token: adminToken } })
  }
  res.status(401).json({ result: 'fail', error: 'Невірний логін або пароль' })
})

// Admin token still gates free-form drag-and-drop on the client. The guided
// manual actions below (single-step move, freeze, dismiss) are open to all staff.

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
  await setStage(id, stage)
  const board = await getBoard(false) // reuse cached CC snapshot; positions are fresh
  res.json({ result: 'success', data: board })
}))

// Toggle a patient's "hot" flag (stored locally; reserved for future UI).
app.post('/api/patients/:id/hot', wrap(async (req, res) => {
  const { id } = req.params
  await setHot(id, !!(req.body && req.body.hot))
  const board = await getBoard(false)
  res.json({ result: 'success', data: board })
}))

// Freeze / unfreeze a patient (put on hold — pauses attention flags).
app.post('/api/patients/:id/frozen', wrap(async (req, res) => {
  const { id } = req.params
  await setFrozen(id, !!(req.body && req.body.frozen))
  const board = await getBoard(false)
  res.json({ result: 'success', data: board })
}))

// Dismiss the "visited — move me" reminder for a patient.
app.post('/api/patients/:id/dismiss-followup', wrap(async (req, res) => {
  const { id } = req.params
  await dismissFollowup(id, (req.body && req.body.visitAt) || null)
  const board = await getBoard(false)
  res.json({ result: 'success', data: board })
}))

app.get('/api/health', (_req, res) => {
  res.json({ result: 'success', data: { ok: true, mode: isLive ? 'live' : 'mock' } })
})

// In production on a single Node host, serve the built frontend from the same
// origin. On Vercel the static `dist` is served by the CDN, not this function.
const distDir = path.resolve(config.root, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

export default app
