import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { config, STAGE_BY_ID, FIRST_STAGE } from './config.js'

// Persistence on libSQL (SQLite-compatible). Local dev uses a file DB; on
// Vercel set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN. Clinic Cards is never
// written to — only our board positions, stage transitions and a snapshot cache.
if (config.dbUrl.startsWith('file:')) {
  const p = config.dbUrl.slice('file:'.length)
  const abs = path.isAbsolute(p) ? p : path.resolve(config.root, p)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
}

const client = createClient({ url: config.dbUrl, authToken: config.dbAuthToken })

const POS_COLS = 'patient_id, stage, entered_at, first_seen, hot, reminder_dismissed_at, updated_at'

let initPromise
function init() {
  if (!initPromise) {
    initPromise = client.batch(
      [
        `CREATE TABLE IF NOT EXISTS positions (
          patient_id TEXT PRIMARY KEY,
          stage TEXT NOT NULL,
          entered_at TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          hot INTEGER,
          reminder_dismissed_at TEXT,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS transitions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_id TEXT NOT NULL,
          from_stage TEXT NOT NULL,
          to_stage TEXT NOT NULL,
          at TEXT NOT NULL,
          duration_ms INTEGER,
          on_time INTEGER,
          has_norm INTEGER
        )`,
        `CREATE INDEX IF NOT EXISTS idx_transitions_at ON transitions(at)`,
        `CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          fetched_at TEXT NOT NULL
        )`,
      ],
      'write',
    )
  }
  return initPromise
}

const nowIso = () => new Date().toISOString()
const num = (v) => (typeof v === 'bigint' ? Number(v) : v || 0)

const insertPositionSql = `INSERT OR IGNORE INTO positions (${POS_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?)`
const newPosArgs = (id, stage, at) => [id, stage, at, at, null, null, at]

// ─── positions ────────────────────────────────────────────────────────────────

export async function getAllPositions() {
  await init()
  const rs = await client.execute('SELECT * FROM positions')
  const map = new Map()
  for (const row of rs.rows) map.set(String(row.patient_id), row)
  return map
}

// Bulk-insert positions for patients we haven't seen, anchored to import time.
export async function ensureMissingPositions(seeds, known) {
  await init()
  const at = nowIso()
  const stmts = []
  for (const s of seeds) {
    const id = String(s.id)
    if (known.has(id)) continue
    stmts.push({ sql: insertPositionSql, args: newPosArgs(id, s.defaultStage, at) })
  }
  if (!stmts.length) return 0
  await client.batch(stmts, 'write')
  return stmts.length
}

// Move to a new stage; resets the SLA anchor and logs the transition (with
// whether it beat the from-stage's norm) for conversion stats.
export async function setStage(patientId, stage) {
  await init()
  const at = nowIso()
  const id = String(patientId)
  const prevRs = await client.execute({ sql: 'SELECT stage, entered_at FROM positions WHERE patient_id = ?', args: [id] })
  const prev = prevRs.rows[0]

  const stmts = [{ sql: insertPositionSql, args: newPosArgs(id, stage, at) }]
  if (prev && prev.stage && prev.stage !== stage) {
    const durationMs = Date.parse(at) - Date.parse(prev.entered_at)
    const st = STAGE_BY_ID[prev.stage]
    const hasNorm = st && st.norm != null ? 1 : 0
    const onTime = hasNorm ? (durationMs <= st.norm * 60000 ? 1 : 0) : null
    stmts.push({
      sql: 'INSERT INTO transitions (patient_id, from_stage, to_stage, at, duration_ms, on_time, has_norm) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, prev.stage, stage, at, durationMs, onTime, hasNorm],
    })
  }
  stmts.push({ sql: 'UPDATE positions SET stage = ?, entered_at = ?, updated_at = ? WHERE patient_id = ?', args: [stage, at, at, id] })
  await client.batch(stmts, 'write')
}

export async function setHot(patientId, hot) {
  await init()
  const at = nowIso()
  const id = String(patientId)
  await client.batch(
    [
      { sql: insertPositionSql, args: newPosArgs(id, FIRST_STAGE, at) },
      { sql: 'UPDATE positions SET hot = ?, updated_at = ? WHERE patient_id = ?', args: [hot ? 1 : 0, at, id] },
    ],
    'write',
  )
}

// Dismiss the "відвідав клініку — перемістити" reminder. Stores the dismissed
// visit time; a later visit re-triggers it.
export async function dismissFollowup(patientId, visitAt) {
  await init()
  const at = nowIso()
  const id = String(patientId)
  await client.batch(
    [
      { sql: insertPositionSql, args: newPosArgs(id, FIRST_STAGE, at) },
      { sql: 'UPDATE positions SET reminder_dismissed_at = ?, updated_at = ? WHERE patient_id = ?', args: [visitAt || at, at, id] },
    ],
    'write',
  )
}

// ─── conversion stats ─────────────────────────────────────────────────────────

export async function getConversionStats() {
  await init()
  const sinceIso = new Date(Date.now() - config.conversionWindowDays * 86400000).toISOString()
  const [ot, csCd, csAny] = await Promise.all([
    client.execute({ sql: 'SELECT COUNT(*) total, COALESCE(SUM(on_time),0) ontime FROM transitions WHERE at >= ? AND has_norm = 1', args: [sinceIso] }),
    client.execute({ sql: "SELECT COUNT(*) c FROM transitions WHERE at >= ? AND from_stage = 'consult_scheduled' AND to_stage = 'consult_done'", args: [sinceIso] }),
    client.execute({ sql: "SELECT COUNT(*) c FROM transitions WHERE at >= ? AND from_stage = 'consult_scheduled'", args: [sinceIso] }),
  ])
  const total = num(ot.rows[0].total)
  const ontime = num(ot.rows[0].ontime)
  const appt = num(csCd.rows[0].c)
  const apptAll = num(csAny.rows[0].c)
  return {
    onTimePct: total ? Math.round((100 * ontime) / total) : null,
    onTimeCount: ontime,
    onTimeTotal: total,
    apptToShowCount: appt,
    apptToShowTotal: apptAll,
    apptToShowPct: apptAll ? Math.round((100 * appt) / apptAll) : null,
    windowDays: config.conversionWindowDays,
  }
}

// ─── snapshot cache (Clinic Cards pull) ─────────────────────────────────────────

export async function getCache(key) {
  await init()
  const rs = await client.execute({ sql: 'SELECT value, fetched_at FROM cache WHERE key = ?', args: [key] })
  return rs.rows[0] || null
}

export async function setCache(key, value, fetchedAt) {
  await init()
  await client.execute({
    sql: 'INSERT INTO cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at',
    args: [key, value, fetchedAt],
  })
}

export default client
