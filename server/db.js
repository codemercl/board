import crypto from 'node:crypto'
import postgres from 'postgres'
import { config, STAGE_BY_ID, FIRST_STAGE } from './config.js'
import { ROLE_DEFAULTS } from './config.js'
import { hashPassword, normalizeRole, normalizeStages } from './auth.js'

// Persistence. With DATABASE_URL set → Supabase/Postgres. Empty → in-memory
// (dev/demo, not persisted across restarts). Both expose the same async API.
// Clinic Cards is never written to — only our board positions, stage
// transitions and a snapshot cache.

const nowIso = () => new Date().toISOString()

// ─── users: shared row shaping ────────────────────────────────────────────
// A user row: { id, username, password (scrypt), role, display_name,
//   stages (array|null — null = all columns), can_move (0/1), active (0/1),
//   created_at }. Backends store `stages` as a JS array in memory and as JSON
//   text in Postgres; both hand back a parsed array (or null) to callers.

function buildUserRow(input) {
  const role = normalizeRole(input.role)
  // canMove falls back to the role's default when the caller omits it.
  const canMove = input.canMove == null ? !!ROLE_DEFAULTS[role]?.canMove : !!input.canMove
  return {
    id: crypto.randomUUID(),
    username: String(input.username || '').trim(),
    password: hashPassword(input.password),
    role,
    display_name: input.displayName || input.username,
    stages: normalizeStages(role, input.stages),
    can_move: canMove ? 1 : 0,
    active: input.active === false ? 0 : 1,
    created_at: nowIso(),
  }
}

// Apply an update patch (any subset of fields) to an existing row.
function mergeUserRow(row, patch) {
  const next = { ...row }
  if (patch.username != null) next.username = String(patch.username).trim()
  if (patch.password) next.password = hashPassword(patch.password)
  if (patch.role != null) next.role = normalizeRole(patch.role)
  if (patch.displayName != null) next.display_name = patch.displayName
  if (patch.canMove != null) next.can_move = patch.canMove ? 1 : 0
  if (patch.active != null) next.active = patch.active ? 1 : 0
  // Re-derive stages against the (possibly new) role whenever role or stages move.
  if (patch.role != null || patch.stages !== undefined) {
    next.stages = normalizeStages(next.role, patch.stages !== undefined ? patch.stages : row.stages)
  }
  return next
}

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
  const users = new Map()
  // Demo bot roster so the web assignment picker works without a live bot.
  // Demo roster (role = bot-role key). Lets the web picker + routing work
  // without a live bot: two doctors, one head doctor, one manager.
  const botStaff = new Map([
    ['1001', { chat_id: '1001', name: 'Андрій Федірко', role: 'doctor', username: '', created_at: nowIso() }],
    ['1002', { chat_id: '1002', name: 'Катерина Романова', role: 'doctor', username: '', created_at: nowIso() }],
    ['1003', { chat_id: '1003', name: 'Олена Головна', role: 'head_doctor', username: '', created_at: nowIso() }],
    ['1004', { chat_id: '1004', name: 'Ігор Керівник', role: 'kerivnyk', username: '', created_at: nowIso() }],
  ])
  // Per-chat bot conversation state (what the next message means). Kept in the
  // store so it survives serverless invocations, not just in a local Map.
  const botState = new Map()
  const ensureRow = (id, at) => positions.get(id) || { patient_id: id, stage: FIRST_STAGE, entered_at: at, first_seen: at, hot: null, frozen: null, reminder_dismissed_at: null, plan_review: null, updated_at: at }

  return {
    async getBotState(chatId) {
      const s = botState.get(String(chatId))
      return s ? { ...s } : null
    },
    async setBotState(chatId, state) {
      botState.set(String(chatId), state)
    },
    async clearBotState(chatId) {
      botState.delete(String(chatId))
    },
    async listBotStaff() {
      return [...botStaff.values()].map((s) => ({ ...s })).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    },
    async getBotStaff(chatId) {
      const s = botStaff.get(String(chatId))
      return s ? { ...s } : null
    },
    async getBotStaffByUsername(username) {
      const key = String(username || '').replace(/^@/, '').toLowerCase()
      if (!key) return null
      for (const s of botStaff.values()) if ((s.username || '').toLowerCase() === key) return { ...s }
      return null
    },
    async getBotStaffByRole(role) {
      const key = String(role || '')
      return [...botStaff.values()].filter((s) => s.role === key).map((s) => ({ ...s }))
    },
    async upsertBotStaff({ chatId, name, role, username }) {
      const id = String(chatId)
      const prev = botStaff.get(id)
      const row = {
        chat_id: id,
        name: name ?? prev?.name ?? '',
        role: role != null ? role : (prev?.role || ''),
        username: username != null ? String(username).replace(/^@/, '') : (prev?.username || ''),
        created_at: prev?.created_at || nowIso(),
      }
      botStaff.set(id, row)
      return { ...row }
    },
    async listUsers() {
      return [...users.values()].map((u) => ({ ...u })).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    },
    async getUserById(id) {
      const u = users.get(String(id))
      return u ? { ...u } : null
    },
    async getUserByUsername(username) {
      const key = String(username || '').trim().toLowerCase()
      for (const u of users.values()) if (u.username.toLowerCase() === key) return { ...u }
      return null
    },
    async countUsers() {
      return users.size
    },
    async createUser(input) {
      const row = buildUserRow(input)
      users.set(row.id, row)
      return { ...row }
    },
    async updateUser(id, patch) {
      const cur = users.get(String(id))
      if (!cur) return null
      const next = mergeUserRow(cur, patch)
      users.set(next.id, next)
      return { ...next }
    },
    async deleteUser(id) {
      return users.delete(String(id))
    },
    async getAllPositions() {
      return new Map(positions)
    },
    async ensureMissingPositions(seeds, known) {
      const at = nowIso()
      let n = 0
      for (const s of seeds) {
        const id = String(s.id)
        if (known.has(id) || positions.has(id)) continue
        positions.set(id, { patient_id: id, stage: s.defaultStage, entered_at: at, first_seen: at, hot: null, frozen: null, reminder_dismissed_at: null, updated_at: at })
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
    async setFrozen(patientId, frozen) {
      const id = String(patientId)
      const at = nowIso()
      positions.set(id, { ...ensureRow(id, at), frozen: frozen ? 1 : 0, updated_at: at })
    },
    async dismissFollowup(patientId, visitAt) {
      const id = String(patientId)
      const at = nowIso()
      positions.set(id, { ...ensureRow(id, at), reminder_dismissed_at: visitAt || at, updated_at: at })
    },
    async getPlanReview(patientId) {
      const row = positions.get(String(patientId))
      return row && row.plan_review ? row.plan_review : null
    },
    async setPlanReview(patientId, review) {
      const id = String(patientId)
      const at = nowIso()
      positions.set(id, { ...ensureRow(id, at), plan_review: review, updated_at: at })
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
        // Additive migration for existing tables (freeze flag).
        await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS frozen integer`
        // Treatment-plan review state (responsibles, sign-offs, postpone) as JSON.
        await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS plan_review text`
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
        await sql`CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          username text UNIQUE NOT NULL,
          password text NOT NULL,
          role text NOT NULL,
          display_name text,
          stages text,
          can_move integer NOT NULL DEFAULT 1,
          active integer NOT NULL DEFAULT 1,
          created_at text NOT NULL
        )`
        // Telegram bot roster: staff who ran /start (chat_id = personal DM address).
        await sql`CREATE TABLE IF NOT EXISTS bot_staff (
          chat_id text PRIMARY KEY,
          name text NOT NULL,
          role text,
          username text,
          created_at text NOT NULL
        )`
        // Additive migration for tables created before the username column.
        await sql`ALTER TABLE bot_staff ADD COLUMN IF NOT EXISTS username text`
        // Bot conversation state (serverless-safe: shared across lambdas).
        await sql`CREATE TABLE IF NOT EXISTS bot_state (
          chat_id text PRIMARY KEY,
          state text NOT NULL,
          updated_at text NOT NULL
        )`
      })()
    }
    return initP
  }

  const insertRow = (sqlc, id, stage, at) =>
    sqlc`INSERT INTO positions (patient_id, stage, entered_at, first_seen, hot, reminder_dismissed_at, updated_at)
         VALUES (${id}, ${stage}, ${at}, ${at}, ${null}, ${null}, ${at})
         ON CONFLICT (patient_id) DO NOTHING`

  const parseUser = (r) => {
    if (!r) return null
    let stages = null
    try {
      stages = r.stages == null ? null : JSON.parse(r.stages)
    } catch {
      stages = null
    }
    return { ...r, stages }
  }
  const writeUser = (row) =>
    sql`INSERT INTO users (id, username, password, role, display_name, stages, can_move, active, created_at)
        VALUES (${row.id}, ${row.username}, ${row.password}, ${row.role}, ${row.display_name},
                ${row.stages == null ? null : JSON.stringify(row.stages)}, ${row.can_move}, ${row.active}, ${row.created_at})
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username, password = EXCLUDED.password, role = EXCLUDED.role,
          display_name = EXCLUDED.display_name, stages = EXCLUDED.stages,
          can_move = EXCLUDED.can_move, active = EXCLUDED.active`

  return {
    async getBotState(chatId) {
      await init()
      const [r] = await sql`SELECT state FROM bot_state WHERE chat_id = ${String(chatId)}`
      if (!r) return null
      try { return JSON.parse(r.state) } catch { return null }
    },
    async setBotState(chatId, state) {
      await init()
      const at = nowIso()
      await sql`INSERT INTO bot_state (chat_id, state, updated_at) VALUES (${String(chatId)}, ${JSON.stringify(state)}, ${at})
                ON CONFLICT (chat_id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`
    },
    async clearBotState(chatId) {
      await init()
      await sql`DELETE FROM bot_state WHERE chat_id = ${String(chatId)}`
    },
    async listBotStaff() {
      await init()
      return await sql`SELECT * FROM bot_staff ORDER BY created_at ASC`
    },
    async getBotStaff(chatId) {
      await init()
      const [r] = await sql`SELECT * FROM bot_staff WHERE chat_id = ${String(chatId)}`
      return r || null
    },
    async getBotStaffByUsername(username) {
      await init()
      const key = String(username || '').replace(/^@/, '').toLowerCase()
      if (!key) return null
      const [r] = await sql`SELECT * FROM bot_staff WHERE lower(username) = ${key}`
      return r || null
    },
    async getBotStaffByRole(role) {
      await init()
      return await sql`SELECT * FROM bot_staff WHERE role = ${String(role || '')} ORDER BY created_at ASC`
    },
    async upsertBotStaff({ chatId, name, role, username }) {
      await init()
      const id = String(chatId)
      const at = nowIso()
      const uname = username != null ? String(username).replace(/^@/, '') : null
      // Preserve existing fields when a caller passes only some of them.
      await sql`INSERT INTO bot_staff (chat_id, name, role, username, created_at)
                VALUES (${id}, ${name || ''}, ${role || ''}, ${uname}, ${at})
                ON CONFLICT (chat_id) DO UPDATE SET
                  name = COALESCE(EXCLUDED.name, bot_staff.name),
                  role = COALESCE(EXCLUDED.role, bot_staff.role),
                  username = COALESCE(EXCLUDED.username, bot_staff.username)`
      return await this.getBotStaff(id)
    },
    async listUsers() {
      await init()
      const rows = await sql`SELECT * FROM users ORDER BY created_at ASC`
      return rows.map(parseUser)
    },
    async getUserById(id) {
      await init()
      const [r] = await sql`SELECT * FROM users WHERE id = ${String(id)}`
      return parseUser(r)
    },
    async getUserByUsername(username) {
      await init()
      const [r] = await sql`SELECT * FROM users WHERE lower(username) = ${String(username || '').trim().toLowerCase()}`
      return parseUser(r)
    },
    async countUsers() {
      await init()
      const [r] = await sql`SELECT COUNT(*)::int c FROM users`
      return r.c
    },
    async createUser(input) {
      await init()
      const row = buildUserRow(input)
      await writeUser(row)
      return parseUser(row)
    },
    async updateUser(id, patch) {
      await init()
      const [cur] = await sql`SELECT * FROM users WHERE id = ${String(id)}`
      if (!cur) return null
      const next = mergeUserRow(parseUser(cur), patch)
      await writeUser(next)
      return parseUser(next)
    },
    async deleteUser(id) {
      await init()
      const r = await sql`DELETE FROM users WHERE id = ${String(id)}`
      return r.count > 0
    },
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
    async setFrozen(patientId, frozen) {
      await init()
      const id = String(patientId)
      const at = nowIso()
      await insertRow(sql, id, FIRST_STAGE, at)
      await sql`UPDATE positions SET frozen = ${frozen ? 1 : 0}, updated_at = ${at} WHERE patient_id = ${id}`
    },
    async dismissFollowup(patientId, visitAt) {
      await init()
      const id = String(patientId)
      const at = nowIso()
      await insertRow(sql, id, FIRST_STAGE, at)
      await sql`UPDATE positions SET reminder_dismissed_at = ${visitAt || at}, updated_at = ${at} WHERE patient_id = ${id}`
    },
    async getPlanReview(patientId) {
      await init()
      const [r] = await sql`SELECT plan_review FROM positions WHERE patient_id = ${String(patientId)}`
      if (!r || r.plan_review == null) return null
      try { return JSON.parse(r.plan_review) } catch { return null }
    },
    async setPlanReview(patientId, review) {
      await init()
      const id = String(patientId)
      const at = nowIso()
      await insertRow(sql, id, FIRST_STAGE, at)
      await sql`UPDATE positions SET plan_review = ${JSON.stringify(review)}, updated_at = ${at} WHERE patient_id = ${id}`
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

export const listUsers = (...a) => backend.listUsers(...a)
export const getUserById = (...a) => backend.getUserById(...a)
export const getUserByUsername = (...a) => backend.getUserByUsername(...a)
export const countUsers = (...a) => backend.countUsers(...a)
export const createUser = (...a) => backend.createUser(...a)
export const updateUser = (...a) => backend.updateUser(...a)
export const deleteUser = (...a) => backend.deleteUser(...a)

// Seed the bootstrap admin from ADMIN_USER/ADMIN_PASSWORD when the users table
// is empty (first run / fresh DB). Idempotent — runs at most once per process.
let seedP = null
export function ensureBootstrapAdmin() {
  if (!seedP) {
    seedP = (async () => {
      try {
        if ((await backend.countUsers()) > 0) return
        await backend.createUser({
          username: config.adminUser,
          password: config.adminPassword,
          role: 'admin',
          displayName: 'Адміністратор',
          stages: null,
          canMove: true,
          active: true,
        })
        console.log(`[board] Seeded bootstrap admin "${config.adminUser}" (change the password!).`)
      } catch (e) {
        seedP = null // let a later request retry if the seed failed
        throw e
      }
    })()
  }
  return seedP
}

export const getAllPositions = (...a) => backend.getAllPositions(...a)
// Current funnel stage of one patient (or null). Backend-agnostic.
export async function getPatientStage(id) {
  const positions = await backend.getAllPositions()
  return positions.get(String(id))?.stage || null
}
export const ensureMissingPositions = (...a) => backend.ensureMissingPositions(...a)
export const setStage = (...a) => backend.setStage(...a)
export const setHot = (...a) => backend.setHot(...a)
export const setFrozen = (...a) => backend.setFrozen(...a)
export const dismissFollowup = (...a) => backend.dismissFollowup(...a)
export const getConversionStats = (...a) => backend.getConversionStats(...a)
export const getCache = (...a) => backend.getCache(...a)
export const setCache = (...a) => backend.setCache(...a)
export const listBotStaff = (...a) => backend.listBotStaff(...a)
export const getBotStaff = (...a) => backend.getBotStaff(...a)
export const getBotStaffByUsername = (...a) => backend.getBotStaffByUsername(...a)
export const getBotStaffByRole = (...a) => backend.getBotStaffByRole(...a)
export const upsertBotStaff = (...a) => backend.upsertBotStaff(...a)
export const getBotState = (...a) => backend.getBotState(...a)
export const setBotState = (...a) => backend.setBotState(...a)
export const clearBotState = (...a) => backend.clearBotState(...a)

// ─── treatment-plan review (responsibles + sign-offs + postpone) ────────────
// Stored as a JSON blob per patient. Shape:
//   { responsibles: [{ id, name }],
//     signoffs: { [userId]: { status: 'ready', comment, name, at } },
//     postpone: { comment, by, name, at } | null,
//     updatedAt }
// Read-modify-write; concurrency here is low (one clinic front desk).

const emptyReview = () => ({ responsibles: [], signoffs: {}, postpone: null, updatedAt: nowIso() })

export const getPlanReview = (id) => backend.getPlanReview(id)

async function mutatePlanReview(id, fn) {
  const cur = (await backend.getPlanReview(id)) || emptyReview()
  const next = fn({ responsibles: [], signoffs: {}, postpone: null, ...cur })
  next.updatedAt = nowIso()
  await backend.setPlanReview(id, next)
  return next
}

// Replace the list of responsibles. Sign-offs for people no longer responsible
// are dropped so the "all signed off" gate stays consistent.
export function setPlanResponsibles(id, responsibles) {
  const clean = (Array.isArray(responsibles) ? responsibles : [])
    .filter((r) => r && r.id)
    .map((r) => ({ id: String(r.id), name: String(r.name || r.id) }))
  return mutatePlanReview(id, (r) => {
    const keep = new Set(clean.map((c) => c.id))
    const signoffs = {}
    for (const [uid, so] of Object.entries(r.signoffs || {})) if (keep.has(uid)) signoffs[uid] = so
    return { ...r, responsibles: clean, signoffs }
  })
}

// A responsible marks the plan ready with a comment.
export function addPlanSignoff(id, userId, { comment, name }) {
  const uid = String(userId)
  return mutatePlanReview(id, (r) => ({
    ...r,
    signoffs: { ...r.signoffs, [uid]: { status: 'ready', comment: String(comment || ''), name: name || uid, at: nowIso() } },
    // A fresh sign-off clears any standing postpone flag.
    postpone: null,
  }))
}

// Postpone the plan with a mandatory reason; wipes prior sign-offs (the plan
// has to be re-confirmed by everyone afterwards). Also resets the dedup markers
// so post-postpone reminders can fire again.
export function postponePlan(id, { comment, by, name }) {
  return mutatePlanReview(id, (r) => ({
    ...r,
    signoffs: {},
    notified: {},
    postpone: { comment: String(comment || ''), by: by ? String(by) : null, name: name || null, at: nowIso() },
  }))
}

// One-shot reminder guard: returns true the first time `key` is claimed for a
// patient, false afterwards — so the bot pings each thing (ping24, ping4,
// overdue, postpone24) exactly once. Concurrency here is a single sweep loop.
export async function claimPlanNotification(id, key) {
  const cur = (await backend.getPlanReview(id)) || emptyReview()
  const notified = cur.notified || {}
  if (notified[key]) return false
  await mutatePlanReview(id, (r) => ({ ...r, notified: { ...(r.notified || {}), [key]: nowIso() } }))
  return true
}
