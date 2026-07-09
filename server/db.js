import postgres from 'postgres'
import { config, STAGE_BY_ID, FIRST_STAGE } from './config.js'

// Persistence. With DATABASE_URL set → Supabase/Postgres. Empty → in-memory
// (dev/demo, not persisted across restarts). Both expose the same async API.
// Clinic Cards is never written to — only our board positions, stage
// transitions and a snapshot cache.

const nowIso = () => new Date().toISOString()

function transitionFor(prev, toStage, at) {
  const durationMs = Date.parse(at) - Date.parse(prev.entered_at)
  const st = STAGE_BY_ID[prev.stage]
  const hasNorm = st && st.norm != null ? 1 : 0
  const onTime = hasNorm ? (durationMs <= st.norm * 60000 ? 1 : 0) : null
  return { durationMs, hasNorm, onTime }
}

// ─── in-memory backend ──────────────────────────────────────────────────────

function createMemoryBackend() {
  const positions = new Map()
  const transitions = []
  const cache = new Map()
  const ensureRow = (id, at) => positions.get(id) || { patient_id: id, stage: FIRST_STAGE, entered_at: at, first_seen: at, hot: null, reminder_dismissed_at: null, updated_at: at }

  return {
    async getAllPositions() {
      return new Map(positions)
    },
    async ensureMissingPositions(seeds, known) {
      const at = nowIso()
      let n = 0
      for (const s of seeds) {
        const id = String(s.id)
        if (known.has(id) || positions.has(id)) continue
        positions.set(id, { patient_id: id, stage: s.defaultStage, entered_at: at, first_seen: at, hot: null, reminder_dismissed_at: null, updated_at: at })
        n++
      }
      return n
    },
    async setStage(patientId, stage) {
      const id = String(patientId)
      const at = nowIso()
      const prev = positions.get(id)
      if (prev && prev.stage && prev.stage !== stage) {
        const { durationMs, hasNorm, onTime } = transitionFor(prev, stage, at)
        transitions.push({ patient_id: id, from_stage: prev.stage, to_stage: stage, at, duration_ms: durationMs, on_time: onTime, has_norm: hasNorm })
      }
      positions.set(id, { ...ensureRow(id, at), patient_id: id, stage, entered_at: at, updated_at: at })
    },
    async setHot(patientId, hot) {
      const id = String(patientId)
      const at = nowIso()
      positions.set(id, { ...ensureRow(id, at), hot: hot ? 1 : 0, updated_at: at })
    },
    async dismissFollowup(patientId, visitAt) {
      const id = String(patientId)
      const at = nowIso()
      positions.set(id, { ...ensureRow(id, at), reminder_dismissed_at: visitAt || at, updated_at: at })
    },
    async getConversionStats() {
      const since = Date.now() - config.conversionWindowDays * 86400000
      const win = transitions.filter((t) => Date.parse(t.at) >= since)
      const norm = win.filter((t) => t.has_norm === 1)
      const total = norm.length
      const ontime = norm.filter((t) => t.on_time === 1).length
      const csCd = win.filter((t) => t.from_stage === 'consult_scheduled' && t.to_stage === 'consult_done').length
      const csAny = win.filter((t) => t.from_stage === 'consult_scheduled').length
      return {
        onTimePct: total ? Math.round((100 * ontime) / total) : null,
        onTimeCount: ontime, onTimeTotal: total,
        apptToShowCount: csCd, apptToShowTotal: csAny,
        apptToShowPct: csAny ? Math.round((100 * csCd) / csAny) : null,
        windowDays: config.conversionWindowDays,
      }
    },
    async getCache(key) {
      return cache.get(key) || null
    },
    async setCache(key, value, fetchedAt) {
      cache.set(key, { value, fetched_at: fetchedAt })
    },
  }
}

// ─── Postgres / Supabase backend ────────────────────────────────────────────

function createPostgresBackend() {
  const isLocal = /localhost|127\.0\.0\.1/.test(config.dbUrl)
  const sql = postgres(config.dbUrl, {
    prepare: false, // Supabase transaction pooler compatibility
    ssl: isLocal ? false : 'require',
    max: 3,
    idle_timeout: 20,
  })

  let initP
  const init = () => {
    if (!initP) {
      initP = (async () => {
        await sql`CREATE TABLE IF NOT EXISTS positions (
          patient_id text PRIMARY KEY,
          stage text NOT NULL,
          entered_at text NOT NULL,
          first_seen text NOT NULL,
          hot integer,
          reminder_dismissed_at text,
          updated_at text NOT NULL
        )`
        await sql`CREATE TABLE IF NOT EXISTS transitions (
          id bigserial PRIMARY KEY,
          patient_id text NOT NULL,
          from_stage text NOT NULL,
          to_stage text NOT NULL,
          at text NOT NULL,
          duration_ms bigint,
          on_time integer,
          has_norm integer
        )`
        await sql`CREATE INDEX IF NOT EXISTS idx_transitions_at ON transitions(at)`
        await sql`CREATE TABLE IF NOT EXISTS cache (
          key text PRIMARY KEY,
          value text NOT NULL,
          fetched_at text NOT NULL
        )`
      })()
    }
    return initP
  }

  const insertRow = (sqlc, id, stage, at) =>
    sqlc`INSERT INTO positions (patient_id, stage, entered_at, first_seen, hot, reminder_dismissed_at, updated_at)
         VALUES (${id}, ${stage}, ${at}, ${at}, ${null}, ${null}, ${at})
         ON CONFLICT (patient_id) DO NOTHING`

  return {
    async getAllPositions() {
      await init()
      const rows = await sql`SELECT * FROM positions`
      const map = new Map()
      for (const r of rows) map.set(String(r.patient_id), r)
      return map
    },
    async ensureMissingPositions(seeds, known) {
      await init()
      const at = nowIso()
      const rows = []
      for (const s of seeds) {
        const id = String(s.id)
        if (known.has(id)) continue
        rows.push({ patient_id: id, stage: s.defaultStage, entered_at: at, first_seen: at, hot: null, reminder_dismissed_at: null, updated_at: at })
      }
      if (!rows.length) return 0
      await sql`INSERT INTO positions ${sql(rows)} ON CONFLICT (patient_id) DO NOTHING`
      return rows.length
    },
    async setStage(patientId, stage) {
      await init()
      const id = String(patientId)
      const at = nowIso()
      await sql.begin(async (tx) => {
        const [prev] = await tx`SELECT stage, entered_at FROM positions WHERE patient_id = ${id}`
        await insertRow(tx, id, stage, at)
        if (prev && prev.stage && prev.stage !== stage) {
          const { durationMs, hasNorm, onTime } = transitionFor(prev, stage, at)
          await tx`INSERT INTO transitions (patient_id, from_stage, to_stage, at, duration_ms, on_time, has_norm)
                   VALUES (${id}, ${prev.stage}, ${stage}, ${at}, ${durationMs}, ${onTime}, ${hasNorm})`
        }
        await tx`UPDATE positions SET stage = ${stage}, entered_at = ${at}, updated_at = ${at} WHERE patient_id = ${id}`
      })
    },
    async setHot(patientId, hot) {
      await init()
      const id = String(patientId)
      const at = nowIso()
      await insertRow(sql, id, FIRST_STAGE, at)
      await sql`UPDATE positions SET hot = ${hot ? 1 : 0}, updated_at = ${at} WHERE patient_id = ${id}`
    },
    async dismissFollowup(patientId, visitAt) {
      await init()
      const id = String(patientId)
      const at = nowIso()
      await insertRow(sql, id, FIRST_STAGE, at)
      await sql`UPDATE positions SET reminder_dismissed_at = ${visitAt || at}, updated_at = ${at} WHERE patient_id = ${id}`
    },
    async getConversionStats() {
      await init()
      const since = new Date(Date.now() - config.conversionWindowDays * 86400000).toISOString()
      const [ot] = await sql`SELECT COUNT(*)::int total, COALESCE(SUM(on_time),0)::int ontime FROM transitions WHERE at >= ${since} AND has_norm = 1`
      const [a] = await sql`SELECT COUNT(*)::int c FROM transitions WHERE at >= ${since} AND from_stage = 'consult_scheduled' AND to_stage = 'consult_done'`
      const [b] = await sql`SELECT COUNT(*)::int c FROM transitions WHERE at >= ${since} AND from_stage = 'consult_scheduled'`
      return {
        onTimePct: ot.total ? Math.round((100 * ot.ontime) / ot.total) : null,
        onTimeCount: ot.ontime, onTimeTotal: ot.total,
        apptToShowCount: a.c, apptToShowTotal: b.c,
        apptToShowPct: b.c ? Math.round((100 * a.c) / b.c) : null,
        windowDays: config.conversionWindowDays,
      }
    },
    async getCache(key) {
      await init()
      const [r] = await sql`SELECT value, fetched_at FROM cache WHERE key = ${key}`
      return r || null
    },
    async setCache(key, value, fetchedAt) {
      await init()
      await sql`INSERT INTO cache (key, value, fetched_at) VALUES (${key}, ${value}, ${fetchedAt})
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, fetched_at = EXCLUDED.fetched_at`
    },
  }
}

const backend = config.dbUrl ? createPostgresBackend() : createMemoryBackend()

if (!config.dbUrl) {
  console.log('[board] DATABASE_URL not set — using in-memory store (positions are NOT persisted).')
}

export const getAllPositions = (...a) => backend.getAllPositions(...a)
export const ensureMissingPositions = (...a) => backend.ensureMissingPositions(...a)
export const setStage = (...a) => backend.setStage(...a)
export const setHot = (...a) => backend.setHot(...a)
export const dismissFollowup = (...a) => backend.dismissFollowup(...a)
export const getConversionStats = (...a) => backend.getConversionStats(...a)
export const getCache = (...a) => backend.getCache(...a)
export const setCache = (...a) => backend.setCache(...a)
