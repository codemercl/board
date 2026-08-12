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
  // Treatment-plan workflow. A card on the «План лікування» stage must be
  // composed within this many hours; we ping N hours before the appointment.
  planSlaHours: Number(process.env.PLAN_SLA_HOURS) || 48,
  planPingHours: list(process.env.PLAN_PING_HOURS || '24,4').map(Number).filter((n) => n > 0),
  // After a plan is postponed, re-notify every responsible + the doctor once
  // this many hours pass with the card still sitting on the plan stage.
  postponeFollowupHours: Number(process.env.POSTPONE_FOLLOWUP_HOURS) || 24,
  // ─── Notifications (bot / SMS / Telegram seam) ───────────────────────────
  // Events (assign, sign-off, postpone, overdue) are recorded and shown in the
  // in-app feed. If a Telegram bot is configured they're also pushed there;
  // otherwise the send is a no-op and only logged. SMS is left as a documented
  // hook in server/notify.js (plug in your provider of choice).
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  notifyDryRun: bool(process.env.NOTIFY_DRY_RUN),
  // Serverless (Vercel): receive updates via webhook instead of long-polling,
  // run the reminder sweep from a cron endpoint. On Vercel these are set for
  // you (VERCEL=1); elsewhere set TELEGRAM_WEBHOOK=1 to switch to webhook mode.
  telegramWebhook: bool(process.env.TELEGRAM_WEBHOOK) || bool(process.env.VERCEL),
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  // Public https base of the deployment (for setWebhook). Empty → derived from
  // the request host. On Vercel, VERCEL_URL is provided automatically.
  publicUrl: (process.env.PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/+$/, ''),
  cronSecret: process.env.CRON_SECRET || '',
  // Plan-outcome routing is by ROLE (the person picks their role on /start).
  //   ready → who's told a plan is fully confirmed ("готов, і у кого")
  //   issue → who's tagged when a plan is postponed / overdue ("не готов")
  planReadyRole: process.env.PLAN_READY_NOTIFY_ROLE || 'head_doctor',
  planIssueRole: process.env.PLAN_ISSUE_NOTIFY_ROLE || 'head_doctor',
  // Reminder ladder: fractions of the plan term at which to nudge the лікарі.
  // Term = min(48h SLA, appointment). Default ⅓ and ½ of the term.
  planRemindFractions: (process.env.PLAN_REMIND_FRACTIONS || '0.33,0.5')
    .split(',').map((s) => Number(s.trim())).filter((n) => n > 0 && n < 1),
  // Escalate to the head doctor when the visit is this close and no plan yet.
  visitSoonHours: Number(process.env.VISIT_SOON_HOURS) || 4,
  // Quiet hours (clinic timezone): gentle reminders are held until the morning.
  // Set start === end to disable.
  quietStart: Number.isFinite(Number(process.env.QUIET_HOURS_START)) && process.env.QUIET_HOURS_START !== undefined ? Number(process.env.QUIET_HOURS_START) : 21,
  quietEnd: Number.isFinite(Number(process.env.QUIET_HOURS_END)) && process.env.QUIET_HOURS_END !== undefined ? Number(process.env.QUIET_HOURS_END) : 9,
  clinicTz: process.env.CLINIC_TZ || 'Europe/Kyiv',
  // Bootstrap admin — seeded into the `users` table on first run (when it's
  // empty). After that, accounts are managed in the app. Change in prod!
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  // Secret used to sign auth tokens (HMAC). Stateless → serverless-safe. If not
  // set, derived from the bootstrap credentials so single-host dev still works.
  authSecret: process.env.AUTH_SECRET || '',
  // Link to the patient's profile in the Clinic Cards web app. `{id}` is the
  // Clinic Cards patient_id. Default: same host as the API, sans `/api`.
  patientUrlTemplate:
    process.env.CLINIC_CARDS_PATIENT_URL ||
    `${(process.env.CLINIC_CARDS_BASE_URL || 'https://cliniccards.com/api').replace(/\/+$/, '').replace(/\/api$/, '')}/patients/{id}`,
}

// HMAC key for signing auth tokens. Falls back to a value derived from the
// bootstrap credentials so it needs no server-side session store (serverless).
export const authSecret =
  config.authSecret ||
  crypto.createHash('sha256').update(`board-auth:${config.adminUser}:${config.adminPassword}`).digest('hex')

// Is a real Clinic Cards key configured? If not, we run on mock data.
export const isLive = !!config.apiKey

// ─── Funnel stages (mirror of the frontend's STAGES ids) ──────────────────────
// `norm` is the reaction SLA for the stage in minutes (null = no SLA / terminal).
// `first` marks the column new Clinic Cards patients land in.
export const STAGES = [
  { id: 'consult_scheduled', norm: 48 * 60,  first: true },
  { id: 'consult_done',      norm: 48 * 60 },
  { id: 'kt',                norm: 48 * 60 },
  // Plan is composed while the card waits here (48h SLA + pings live on it);
  // once the head doctor confirms it advances to `plan` (composed & approved).
  { id: 'plan_wait',         norm: 48 * 60 },
  { id: 'plan',              norm: null },
  { id: 'treatment',         norm: null,     terminal: true },
  { id: 'done',              norm: null,     terminal: true },
  { id: 'lost',              norm: null,     terminal: true },
]

export const STAGE_IDS = new Set(STAGES.map((s) => s.id))
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]))
export const FIRST_STAGE = STAGES.find((s) => s.first)?.id || 'consult_scheduled'

// Non-terminal stages a patient is expected to keep advancing through.
export const ACTIVE_STAGE_IDS = new Set(STAGES.filter((s) => !s.terminal).map((s) => s.id))

export const ALL_STAGE_IDS = STAGES.map((s) => s.id)

// ─── Roles ────────────────────────────────────────────────────────────────
// Every account has a role plus a per-account column allowlist (`stages`) and a
// `canMove` flag. The role only supplies sensible defaults on the accounts page
// and decides who may manage users — an admin can override columns per account.
//   stages: null  → sees every column ("админ видит все")
//   stages: [ids] → sees only those columns
export const ROLES = ['admin', 'doctor', 'nurse']

export const ROLE_LABELS = {
  admin: 'Адміністратор',
  doctor: 'Лікар',
  nurse: 'Медсестра',
}

export const ROLE_DEFAULTS = {
  admin: { stages: null, canMove: true },
  doctor: { stages: ['consult_done', 'kt', 'plan_wait', 'plan', 'treatment', 'done'], canMove: true },
  nurse: { stages: ['consult_scheduled', 'consult_done', 'kt'], canMove: false },
}

// Only admins may create accounts and configure rights.
export const canManageUsers = (role) => role === 'admin'

// ─── Telegram bot roles ─────────────────────────────────────────────────────
// The person picks one on /start. `doctor` (лікар) is the assignable
// responsible for a plan (many of them); the others are single routing targets.
export const BOT_ROLES = [
  { key: 'kerivnyk',    label: 'Керівник' },
  { key: 'head_doctor', label: 'Головний лікар' },
  { key: 'doctor',      label: 'Лікар' },
]
export const BOT_ROLE_LABEL = Object.fromEntries(BOT_ROLES.map((r) => [r.key, r.label]))
export const isBotRole = (k) => BOT_ROLES.some((r) => r.key === k)

export { bool, list }
