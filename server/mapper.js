import { config, STAGE_BY_ID, FIRST_STAGE, ACTIVE_STAGE_IDS } from './config.js'

const DAY_MS = 86400000

// ─── small helpers ────────────────────────────────────────────────────────────

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру']

// Clinic Cards stores colors as palette indices ("1".."12"). Map to hexes.
const CC_PALETTE = [
  '#2563eb', '#7c3aed', '#0891b2', '#d97706', '#16a34a', '#e11d48',
  '#0d9488', '#db2777', '#4f46e5', '#ca8a04', '#9333ea', '#0ea5e9',
]

function colorFromIndex(idx) {
  const n = Number(idx)
  if (!Number.isFinite(n) || n < 1) return CC_PALETTE[0]
  return CC_PALETTE[(n - 1) % CC_PALETTE.length]
}

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  const a = (parts[0]?.[0] || '')
  const b = (parts[1]?.[0] || '')
  return (a + b).toUpperCase() || '—'
}

function joinName(firstname, lastname, fallback) {
  const n = [firstname, lastname].map((s) => (s || '').trim()).filter(Boolean).join(' ')
  return n || fallback || 'Без имени'
}

export function formatPhone(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const d = s.replace(/\D/g, '')
  // Ukraine: +380 XX XXX-XX-XX
  if (d.length === 12 && d.startsWith('380')) {
    return `+380 ${d.slice(3, 5)} ${d.slice(5, 8)}-${d.slice(8, 10)}-${d.slice(10, 12)}`
  }
  // Russia / Kazakhstan: +7 XXX XXX-XX-XX
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`
  }
  if (d.length === 10) {
    return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`
  }
  return s.startsWith('+') ? s : d ? `+${d}` : s
}

function parseDate(str) {
  if (!str) return null
  // Accept "YYYY-MM-DD" and "YYYY-MM-DD HH:MM(:SS)"
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) {
    const d = new Date(str)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const [, y, mo, da, hh, mi] = m
  return new Date(Number(y), Number(mo) - 1, Number(da), Number(hh || 0), Number(mi || 0))
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Human visit label; flags "Сьогодні"/"Завтра" so the day-stat can count them.
export function formatVisit(str, now = new Date()) {
  const d = parseDate(str)
  if (!d) return ''
  const hasTime = /\d{2}:\d{2}/.test(String(str))
  const time = hasTime ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS)
  let head
  if (dayDiff === 0) head = 'Сьогодні'
  else if (dayDiff === 1) head = 'Завтра'
  else if (dayDiff === -1) head = 'Вчора'
  else head = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return time ? `${head}, ${time}` : head
}

export function formatDuration(min) {
  if (min < 1) return 'щойно'
  if (min < 60) return `${Math.round(min)} хв`
  const hours = min / 60
  if (hours < 24) return `${Math.floor(hours)} год`
  const days = Math.floor(hours / 24)
  const remH = Math.floor(hours - days * 24)
  return remH ? `${days} дн ${remH} год` : `${days} дн`
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return ''
  const min = Math.max(0, (now - new Date(iso).getTime()) / 60000)
  return formatDuration(min)
}

function computeSla(stage, enteredAtIso, now = Date.now()) {
  const st = STAGE_BY_ID[stage]
  if (!st || st.norm == null || st.terminal) return { sla: '—', slaState: 'ok' }
  const elapsedMin = Math.max(0, (now - new Date(enteredAtIso).getTime()) / 60000)
  const ratio = elapsedMin / st.norm
  const slaState = ratio > 1 ? 'over' : ratio > 0.6 ? 'warn' : 'ok'
  return { sla: formatDuration(elapsedMin), slaState }
}

// ─── live Clinic Cards → seeds ────────────────────────────────────────────────

// "Гарячі": patient has an upcoming visit within `hotVisitDays` (e.g. tomorrow).
function isHot(patient, now = new Date()) {
  const next = parseDate(patient.next_visit_date)
  if (!next) return false
  const days = (startOfDay(next) - startOfDay(now)) / DAY_MS
  return days >= 0 && days <= config.hotVisitDays
}

// Pick the most relevant visit for a patient: soonest upcoming, else most
// recent past. Only visits that actually carry a note count.
function betterVisit(a, b, nowMs) {
  const aUp = a.startMs >= nowMs
  const bUp = b.startMs >= nowMs
  if (aUp && bUp) return a.startMs <= b.startMs ? a : b
  if (aUp) return a
  if (bUp) return b
  return a.startMs >= b.startMs ? a : b
}

export function buildLive(snapshot) {
  const { patients = [], statuses = [], staff = [], plans = [], visits = [] } = snapshot
  const now = new Date()
  const nowMs = now.getTime()

  // patient_id → comment from their relevant visit's note.
  const visitByPatient = new Map()
  // patient_id → latest *past* visit (whose time has elapsed and wasn't
  // cancelled / no-show) — drives the "відвідав клініку — перемістити" reminder.
  const dueVisitByPatient = new Map()
  const SKIP_STATUS = new Set(['CANCELLED', 'DID_NOT_COME', 'MOVED'])
  for (const v of visits) {
    const start = parseDate(v.visit_start)
    if (!start) continue
    const startMs = start.getTime()
    const pid = String(v.patient_id)
    const note = (v.note || '').trim()
    if (note) {
      const cand = { startMs, note }
      const prev = visitByPatient.get(pid)
      visitByPatient.set(pid, prev ? betterVisit(prev, cand, nowMs) : cand)
    }
    const status = String(v.status || '').toUpperCase()
    if (startMs <= nowMs && !SKIP_STATUS.has(status)) {
      const prev = dueVisitByPatient.get(pid)
      if (!prev || startMs > prev.startMs) dueVisitByPatient.set(pid, { startMs, startIso: start.toISOString(), note, status })
    }
  }

  const closedStatusIds = new Set(
    statuses
      .filter((s) => config.closedStatusNames.includes(String(s.name || '').trim().toLowerCase()))
      .map((s) => String(s.status_id)),
  )

  const staffById = new Map()
  for (const s of staff) {
    staffById.set(String(s.doctor_id), {
      name: joinName(s.firstname, s.lastname),
      color: colorFromIndex(s.color),
    })
  }

  const planById = new Map()
  for (const p of plans) planById.set(String(p.plan_id), { name: p.plan_name, doctorId: String(p.doctor_id) })

  const seeds = []
  for (const p of patients) {
    const pStatuses = Array.isArray(p.statuses) ? p.statuses.map(String) : []
    if (pStatuses.some((id) => closedStatusIds.has(id))) continue // "closed" → hidden

    const id = String(p.patient_id)
    const name = joinName(p.firstname, p.lastname, p.code)
    const plan = planById.get(String(p.main_plans_id))
    const service = plan?.name || ''

    // Responsible person (curator) → the card's admin avatar.
    let admin
    const curatorStaff = p.curator_id != null ? staffById.get(String(p.curator_id)) : null
    if (curatorStaff) {
      admin = { key: `d${p.curator_id}`, initials: initialsOf(curatorStaff.name), name: curatorStaff.name, color: curatorStaff.color }
    } else if (p.curator) {
      admin = { key: `c${String(p.curator).toLowerCase()}`, initials: initialsOf(p.curator), name: p.curator, color: colorFromIndex(id.length) }
    } else {
      admin = { key: '_none', initials: '—', name: 'Не призначено', color: '#94a3b8' }
    }

    // Treating doctor (from the main plan) → the "Лікар" row; fall back to curator.
    const planDoctor = plan?.doctorId ? staffById.get(plan.doctorId) : null
    const doctor = planDoctor?.name || (curatorStaff ? curatorStaff.name : '') || ''

    const note = (p.important_note || '').trim() || (p.source ? `Джерело: ${p.source}` : '') || (p.note || '').trim()
    const created = parseDate(p.date_created)

    seeds.push({
      id,
      name,
      phone: formatPhone(p.phone || p.phone2),
      service,
      comment: visitByPatient.get(id)?.note || '',
      dueVisitAt: dueVisitByPatient.get(id)?.startIso || null,
      dueVisitNote: dueVisitByPatient.get(id)?.note || '',
      doctor,
      visit: formatVisit(p.next_visit_date, now),
      note,
      hot: isHot(p, now),
      synced: true,
      admin,
      defaultStage: FIRST_STAGE,
      createdAt: created ? created.toISOString() : null,
      slaOverride: null,
    })
  }

  // Feed: newest imported patients.
  const rawNotifs = seeds
    .filter((s) => s.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6)
    .map((s) => ({
      type: 'new',
      text: `Нова заявка з Clinic Cards — ${s.name}`,
      sub: s.service || s.note || '',
      time: relativeTime(s.createdAt),
    }))

  return { seeds, rawNotifs }
}

// ─── seeds + saved positions → final board payload ────────────────────────────

export function assemble(seeds, rawNotifs, meta = {}) {
  const positions = meta.positions // Map<id, row>
  const now = Date.now()
  const windowMs = config.windowDays * DAY_MS
  const nowIso = new Date(now).toISOString()
  const admins = {}
  const patients = []

  for (const seed of seeds) {
    // Positions are ensured in bulk by the store before assembling, so this is
    // read-only. Fall back defensively if a row is somehow missing.
    const pos = positions.get(String(seed.id)) || { stage: seed.defaultStage, entered_at: nowIso, hot: null }
    const stage = STAGE_BY_ID[pos.stage] ? pos.stage : seed.defaultStage
    const movedByUs = stage !== seed.defaultStage
    const enteredMs = Date.parse(pos.entered_at) || now
    const createdMs = seed.createdAt ? Date.parse(seed.createdAt) : null

    // Display window: a month from заявка creation; each stage advance re-anchors
    // it to the advance date (= entered_at). Out-of-window patients drop off.
    const anchorMs = movedByUs ? enteredMs : (createdMs ?? enteredMs)
    const windowEndMs = anchorMs + windowMs
    if (now > windowEndMs) continue

    const hot = pos.hot != null ? !!pos.hot : seed.hot
    const daysInStage = Math.max(0, (now - enteredMs) / DAY_MS)
    const isStuck = ACTIVE_STAGE_IDS.has(stage) && daysInStage >= config.stuckDays

    // "Visited but not advanced": a visit's time passed AFTER the patient entered
    // this stage, they're still in an active stage, and the reminder wasn't
    // dismissed for that (or a newer) visit.
    const followupMs = seed.dueVisitAt ? Date.parse(seed.dueVisitAt) : 0
    const dismissedMs = pos.reminder_dismissed_at ? Date.parse(pos.reminder_dismissed_at) : 0
    const needsFollowup = !!followupMs && ACTIVE_STAGE_IDS.has(stage) && followupMs > enteredMs && followupMs > dismissedMs

    let sla, slaState
    if (seed.slaOverride && !movedByUs) {
      ;({ sla, slaState } = seed.slaOverride)
    } else {
      ;({ sla, slaState } = computeSla(stage, pos.entered_at, now))
    }

    admins[seed.admin.key] = { initials: seed.admin.initials, name: seed.admin.name, color: seed.admin.color }

    patients.push({
      id: seed.id,
      stage,
      name: seed.name,
      phone: seed.phone,
      service: seed.service,
      comment: seed.comment || '',
      doctor: seed.doctor,
      visit: seed.visit,
      note: seed.note,
      sla,
      slaState,
      admin: seed.admin.key,
      hot,
      synced: seed.synced,
      daysInStage: Math.floor(daysInStage),
      isStuck,
      needsFollowup,
      followupVisitAt: seed.dueVisitAt || null,
      followupVisitLabel: needsFollowup ? formatVisit(seed.dueVisitAt, new Date(now)) : '',
      daysLeft: Math.max(0, Math.ceil((windowEndMs - now) / DAY_MS)),
    })
  }

  return {
    patients,
    admins,
    notifications: rawNotifs,
    conversion: meta.conversion || null,
    updatedAt: meta.updatedAt || nowIso,
    source: meta.source || 'mock',
    error: meta.error || null,
  }
}
