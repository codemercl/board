import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config, STAGE_BY_ID, FIRST_STAGE } from './config.js'

// Our own persistence: where each patient sits on the board, and when they
// entered that stage (the SLA anchor). Clinic Cards is never written to.
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })

const db = new Database(config.dbPath)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    patient_id TEXT PRIMARY KEY,
    stage      TEXT NOT NULL,
    entered_at TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    hot        INTEGER,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transitions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT NOT NULL,
    from_stage  TEXT NOT NULL,
    to_stage    TEXT NOT NULL,
    at          TEXT NOT NULL,
    duration_ms INTEGER,
    on_time     INTEGER,
    has_norm    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_transitions_at ON transitions(at);
`)

// Migration: dismissed-reminder marker (the visit time whose "visited — move me"
// reminder was closed). A newer visit re-triggers the reminder.
const posCols = db.prepare('PRAGMA table_info(positions)').all().map((c) => c.name)
if (!posCols.includes('reminder_dismissed_at')) {
  db.exec('ALTER TABLE positions ADD COLUMN reminder_dismissed_at TEXT')
}

const stmts = {
  all: db.prepare('SELECT * FROM positions'),
  get: db.prepare('SELECT * FROM positions WHERE patient_id = ?'),
  insert: db.prepare(`
    INSERT INTO positions (patient_id, stage, entered_at, first_seen, hot, updated_at)
    VALUES (@patient_id, @stage, @entered_at, @first_seen, @hot, @updated_at)
    ON CONFLICT(patient_id) DO NOTHING
  `),
  setStage: db.prepare(`
    UPDATE positions
    SET stage = @stage, entered_at = @entered_at, updated_at = @updated_at
    WHERE patient_id = @patient_id
  `),
  setHot: db.prepare('UPDATE positions SET hot = @hot, updated_at = @updated_at WHERE patient_id = @patient_id'),
  setDismiss: db.prepare('UPDATE positions SET reminder_dismissed_at = @v, updated_at = @u WHERE patient_id = @id'),
  insertTransition: db.prepare(`
    INSERT INTO transitions (patient_id, from_stage, to_stage, at, duration_ms, on_time, has_norm)
    VALUES (@patient_id, @from_stage, @to_stage, @at, @duration_ms, @on_time, @has_norm)
  `),
}

// Bumped on every write so callers can cache derived data cheaply.
let version = 1
export const getPositionsVersion = () => version

export function getAllPositions() {
  const map = new Map()
  for (const row of stmts.all.all()) map.set(String(row.patient_id), row)
  return map
}

// Insert a row the first time we ever see a patient. Idempotent.
export function ensurePosition(patientId, stage, enteredAt) {
  const now = new Date().toISOString()
  const info = stmts.insert.run({
    patient_id: String(patientId),
    stage,
    entered_at: enteredAt || now,
    first_seen: now,
    hot: null,
    updated_at: now,
  })
  if (info.changes) version++
}

// Bulk-insert positions for any patients we haven't seen yet, in one
// transaction. New patients land in `defaultStage` with the SLA clock anchored
// to import time (now), not their Clinic Cards creation date.
const insertManyTx = db.transaction((rows) => {
  let inserted = 0
  for (const r of rows) inserted += stmts.insert.run(r).changes
  return inserted
})

export function ensureMissingPositions(seeds, known) {
  const now = new Date().toISOString()
  const rows = []
  for (const s of seeds) {
    const id = String(s.id)
    if (known.has(id)) continue
    rows.push({ patient_id: id, stage: s.defaultStage, entered_at: now, first_seen: now, hot: null, updated_at: now })
  }
  if (!rows.length) return 0
  const inserted = insertManyTx(rows)
  if (inserted) version++
  return inserted
}

export function getPosition(patientId) {
  return stmts.get.get(String(patientId)) || null
}

// Move a patient to a new stage; resets the SLA anchor to now and logs the
// transition (with whether it was within the from-stage's norm) for conversion
// stats.
export function setStage(patientId, stage) {
  const now = new Date().toISOString()
  const id = String(patientId)
  const prev = getPosition(id) // may be null (never seen)
  ensurePosition(id, stage, now)

  if (prev && prev.stage && prev.stage !== stage) {
    const durationMs = Date.parse(now) - Date.parse(prev.entered_at)
    const st = STAGE_BY_ID[prev.stage]
    const hasNorm = st && st.norm != null ? 1 : 0
    const onTime = hasNorm ? (durationMs <= st.norm * 60000 ? 1 : 0) : null
    stmts.insertTransition.run({
      patient_id: id, from_stage: prev.stage, to_stage: stage,
      at: now, duration_ms: durationMs, on_time: onTime, has_norm: hasNorm,
    })
  }

  stmts.setStage.run({ patient_id: id, stage, entered_at: now, updated_at: now })
  version++
  return getPosition(id)
}

export function setHot(patientId, hot) {
  const now = new Date().toISOString()
  const id = String(patientId)
  ensurePosition(id, FIRST_STAGE, now)
  stmts.setHot.run({ patient_id: id, hot: hot ? 1 : 0, updated_at: now })
  version++
  return getPosition(id)
}

// Dismiss the "пацієнт відвідав клініку — перемістити" reminder for a patient.
// Stores the visit time that was dismissed; a later visit re-triggers it.
export function dismissFollowup(patientId, visitAt) {
  const now = new Date().toISOString()
  const id = String(patientId)
  ensurePosition(id, FIRST_STAGE, now)
  stmts.setDismiss.run({ id, v: visitAt || now, u: now })
  version++
  return getPosition(id)
}

// Real conversion metrics from the transitions log (trailing window):
//  - onTimePct: share of stage advances that happened within the from-stage's norm
//  - apptToShow: consult_scheduled → consult_done advances
export function getConversionStats() {
  const sinceIso = new Date(Date.now() - config.conversionWindowDays * 86400000).toISOString()
  const ot = db
    .prepare('SELECT COUNT(*) total, COALESCE(SUM(on_time), 0) ontime FROM transitions WHERE at >= ? AND has_norm = 1')
    .get(sinceIso)
  const csCd = db
    .prepare("SELECT COUNT(*) c FROM transitions WHERE at >= ? AND from_stage = 'consult_scheduled' AND to_stage = 'consult_done'")
    .get(sinceIso).c
  const csAny = db
    .prepare("SELECT COUNT(*) c FROM transitions WHERE at >= ? AND from_stage = 'consult_scheduled'")
    .get(sinceIso).c
  return {
    onTimePct: ot.total ? Math.round((100 * ot.ontime) / ot.total) : null,
    onTimeCount: ot.ontime,
    onTimeTotal: ot.total,
    apptToShowCount: csCd,
    apptToShowTotal: csAny,
    apptToShowPct: csAny ? Math.round((100 * csCd) / csAny) : null,
    windowDays: config.conversionWindowDays,
  }
}

export default db
