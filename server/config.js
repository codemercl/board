import 'dotenv/config'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const bool = (v) => v === true || v === 'true' || v === '1'
const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export const config = {
  root,
  apiKey: process.env.CLINIC_CARDS_API_KEY || '',
  baseUrl: (process.env.CLINIC_CARDS_BASE_URL || 'https://cliniccards.com/api').replace(/\/+$/, ''),
  closedStatusNames: list(process.env.CLINIC_CARDS_CLOSED_STATUSES).map((s) => s.toLowerCase()),
  plansSince: process.env.CLINIC_CARDS_PLANS_SINCE || '2015-01-01',
  port: Number(process.env.PORT) || 8787,
  cacheTtlMs: (Number(process.env.CC_CACHE_TTL_SECONDS) || 180) * 1000,
  // Supabase / Postgres connection string (pooled for serverless). Empty →
  // in-memory store (dev/demo, no persistence).
  dbUrl: process.env.DATABASE_URL || '',
  // Show a patient for this many days after заявка creation; each stage advance
  // extends the window by another WINDOW_DAYS from the advance date.
  windowDays: Number(process.env.WINDOW_DAYS) || 30,
  // No stage advance for this many days → patient flagged "потребує уваги".
  stuckDays: Number(process.env.STUCK_DAYS) || 3,
  // "Гарячі": patient has an upcoming visit within this many days (0..N).
  hotVisitDays: Number(process.env.HOT_VISIT_DAYS) || 1,
  // Conversion stats are computed over this trailing window.
  conversionWindowDays: Number(process.env.CONVERSION_WINDOW_DAYS) || 30,
  // Range of visits/appointments to pull for the "Коментар" (visit note) field.
  visitsBackDays: Number(process.env.VISITS_BACK_DAYS) || 60,
  visitsFwdDays: Number(process.env.VISITS_FWD_DAYS) || 120,
  // Admin login (gates manual card moves). Change ADMIN_PASSWORD in prod!
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  // Link to the patient's profile in the Clinic Cards web app. `{id}` is the
  // Clinic Cards patient_id. Default: same host as the API, sans `/api`.
  patientUrlTemplate:
    process.env.CLINIC_CARDS_PATIENT_URL ||
    `${(process.env.CLINIC_CARDS_BASE_URL || 'https://cliniccards.com/api').replace(/\/+$/, '').replace(/\/api$/, '')}/patients/{id}`,
}

// Bearer token issued on login and checked on mutations. Derived from the
// credentials so it needs no server-side session store (works on serverless).
export const adminToken = crypto.createHash('sha256').update(`${config.adminUser}:${config.adminPassword}`).digest('hex')

// Is a real Clinic Cards key configured? If not, we run on mock data.
export const isLive = !!config.apiKey

// ─── Funnel stages (mirror of the frontend's STAGES ids) ──────────────────────
// `norm` is the reaction SLA for the stage in minutes (null = no SLA / terminal).
// `first` marks the column new Clinic Cards patients land in.
export const STAGES = [
  { id: 'consult_scheduled', norm: 48 * 60,  first: true },
  { id: 'consult_done',      norm: 48 * 60 },
  { id: 'kt',                norm: 48 * 60 },
  { id: 'plan',              norm: 48 * 60 },
  { id: 'treatment',         norm: null,     terminal: true },
  { id: 'done',              norm: null,     terminal: true },
  { id: 'lost',              norm: null,     terminal: true },
]

export const STAGE_IDS = new Set(STAGES.map((s) => s.id))
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]))
export const FIRST_STAGE = STAGES.find((s) => s.first)?.id || 'consult_scheduled'

// Non-terminal stages a patient is expected to keep advancing through.
export const ACTIVE_STAGE_IDS = new Set(STAGES.filter((s) => !s.terminal).map((s) => s.id))

export { bool, list }
