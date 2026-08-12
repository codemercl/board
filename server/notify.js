import { config } from './config.js'

// Notification seam. The treatment-plan workflow emits events (plan assigned,
// responsible signed off, plan postponed, plan overdue). Every event is:
//   1. kept in a small in-memory ring so the board can surface it in the bell
//      feed (see server/store.js), and
//   2. best-effort pushed to external channels — a Telegram bot today, with an
//      obvious hook for SMS. External sends never block or fail the request.
//
// Real "бот на номер телефона и смс в телегу" wiring lives here: set
// TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (or drop in an SMS provider in
// sendSms). Without credentials the send is a logged no-op, so the in-app feed
// still works out of the box.

const RING_MAX = 40
const ring = [] // newest first: { id, type, text, sub, patientId, targets, at }

let seq = 0
const nextId = () => `evt-${Date.now()}-${++seq}`

// Map an event type to the feed icon meta the client already understands
// (see src/logic.js nMeta). Unknown types fall back to the generic "move" look.
const FEED_TYPE = {
  plan_assigned: 'move',
  plan_signoff: 'done',
  plan_ready: 'done',
  plan_postponed: 'call',
  plan_overdue: 'move',
  plan_ping: 'call',
}

export function emitEvent(evt) {
  const e = {
    id: nextId(),
    type: evt.type || 'move',
    feedType: FEED_TYPE[evt.type] || 'move',
    text: evt.text || '',
    sub: evt.sub || '',
    patientId: evt.patientId != null ? String(evt.patientId) : null,
    targets: Array.isArray(evt.targets) ? evt.targets : [],
    at: new Date().toISOString(),
  }
  ring.unshift(e)
  if (ring.length > RING_MAX) ring.length = RING_MAX
  console.log(`[notify] ${e.type} · ${e.text}${e.sub ? ` — ${e.sub}` : ''}`)
  // Fire-and-forget external delivery.
  deliver(e).catch((err) => console.error('[notify] delivery failed:', err.message))
  return e
}

// Feed rows (newest first), shaped like the CRM notifications the client renders.
export function recentEvents(limit = 12) {
  return ring.slice(0, limit).map((e) => ({
    type: e.feedType,
    text: e.text,
    sub: e.sub,
    time: relTime(e.at),
    at: e.at,
    patientId: e.patientId,
  }))
}

function relTime(iso) {
  const min = Math.max(0, (Date.now() - Date.parse(iso)) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${Math.round(min)} хв`
  const h = min / 60
  if (h < 24) return `${Math.floor(h)} год`
  return `${Math.floor(h / 24)} дн`
}

async function deliver(e) {
  const body = e.sub ? `${e.text}\n${e.sub}` : e.text
  await Promise.allSettled([sendTelegram(body, e), sendSms(body, e)])
}

async function sendTelegram(text, _e) {
  if (config.notifyDryRun || !config.telegramBotToken || !config.telegramChatId) return
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.telegramChatId, text, disable_web_page_preview: true }),
  })
}

// SMS hook — intentionally a stub. Wire your provider (Twilio, Vonage, a local
// gateway, …) here; `e.targets` carries the responsibles/doctor to reach.
async function sendSms(_text, _e) {
  // no-op by default
}
