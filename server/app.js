import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { config, isLive, STAGE_IDS, BOT_ROLE_LABEL } from './config.js'
import { getBoard } from './store.js'
import {
  setStage, setHot, setFrozen, dismissFollowup,
  ensureBootstrapAdmin, listUsers, getUserById, getUserByUsername,
  createUser, updateUser, deleteUser,
  getAllPositions, getPlanReview, setPlanResponsibles, addPlanSignoff, postponePlan,
  listBotStaff,
} from './db.js'
import { verifyPassword, signToken, verifyToken, bearerFrom, toPublicUser } from './auth.js'
import { emitEvent } from './notify.js'
import { getBot, initBot, setTelegramWebhook } from './bot.js'
import { boardDeps } from './boardBot.js'

// Ensure the bot instance exists in this process (for webhook + assignment DMs).
// No-op without a token; polling is started separately by server/index.js.
if (config.telegramBotToken) initBot(boardDeps)

// Forward stages the plan-review gate protects: a card may only leave «Очікує
// план» (plan_wait) for plan/treatment/done once every лікар signed off.
const PLAN_FORWARD = new Set(['plan', 'treatment', 'done'])

// Compact "did everyone confirm?" check against a stored plan_review blob.
const planAllReady = (review) => {
  const resp = review?.responsibles || []
  return resp.length > 0 && resp.every((r) => review.signoffs?.[String(r.id)]?.status === 'ready')
}

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

const fail = (res, status, error) => res.status(status).json({ result: 'fail', error })

// ─── Auth ───────────────────────────────────────────────────────────────────
// A signed bearer token carries the user id; we re-read the row on every request
// so role/column/active changes take effect immediately (no session store).

async function authenticate(req) {
  const token = bearerFrom(req)
  if (!token) return null
  const claim = verifyToken(token)
  if (!claim) return null
  const user = toPublicUser(await getUserById(claim.id))
  return user && user.active ? user : null
}

// Runs on every /api request: seed the bootstrap admin (once) and attach the
// authenticated user (or null). Never fails the request — a DB hiccup just
// leaves the caller anonymous, and the guarded routes below return 401/403.
const loadUser = async (req, _res, next) => {
  try {
    await ensureBootstrapAdmin()
    req.user = await authenticate(req)
  } catch (e) {
    console.error('[auth]', e.message)
    req.user = null
  }
  next()
}

const requireAuth = (req, res, next) =>
  req.user ? next() : fail(res, 401, 'Потрібна авторизація')
const requireMove = (req, res, next) =>
  !req.user ? fail(res, 401, 'Потрібна авторизація')
    : !req.user.canMove ? fail(res, 403, 'Немає прав на переміщення карток')
    : next()
const requireManage = (req, res, next) =>
  !req.user ? fail(res, 401, 'Потрібна авторизація')
    : !req.user.manageUsers ? fail(res, 403, 'Доступно лише адміністратору')
    : next()

// Hide patients in columns the user isn't allowed to see (admins see all).
function filterBoard(board, user) {
  if (!user || !user.stages) return board
  const allow = new Set(user.stages)
  return { ...board, patients: (board.patients || []).filter((p) => allow.has(p.stage)) }
}

app.use('/api', loadUser)

// ─── Session ──────────────────────────────────────────────────────────────
app.post('/api/login', wrap(async (req, res) => {
  const { user, password } = req.body || {}
  const row = await getUserByUsername(user)
  if (!row || !row.active || !verifyPassword(password, row.password)) {
    return fail(res, 401, 'Невірний логін або пароль')
  }
  const pub = toPublicUser(row)
  res.json({ result: 'success', data: { token: signToken(pub), user: pub } })
}))

// Who am I? Used by the client to restore a session and refresh permissions.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ result: 'success', data: req.user })
})

// ─── User management (admins only) ──────────────────────────────────────────
app.get('/api/users', requireManage, wrap(async (_req, res) => {
  const rows = await listUsers()
  res.json({ result: 'success', data: rows.map(toPublicUser) })
}))

app.post('/api/users', requireManage, wrap(async (req, res) => {
  const { username, password, role, displayName, stages, canMove, active } = req.body || {}
  if (!username || !String(username).trim()) return fail(res, 400, 'Вкажіть логін')
  if (!password) return fail(res, 400, 'Вкажіть пароль')
  if (await getUserByUsername(username)) return fail(res, 409, 'Такий логін вже існує')
  const row = await createUser({ username, password, role, displayName, stages, canMove, active })
  res.json({ result: 'success', data: toPublicUser(row) })
}))

app.patch('/api/users/:id', requireManage, wrap(async (req, res) => {
  const { id } = req.params
  const patch = req.body || {}
  // Guard against self-lockout: an admin can't strip their own admin/access.
  if (id === req.user.id && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
    return fail(res, 400, 'Не можна змінити власні права адміністратора')
  }
  if (patch.username) {
    const other = await getUserByUsername(patch.username)
    if (other && other.id !== id) return fail(res, 409, 'Такий логін вже існує')
  }
  const row = await updateUser(id, patch)
  if (!row) return fail(res, 404, 'Користувача не знайдено')
  res.json({ result: 'success', data: toPublicUser(row) })
}))

app.delete('/api/users/:id', requireManage, wrap(async (req, res) => {
  if (req.params.id === req.user.id) return fail(res, 400, 'Не можна видалити власний акаунт')
  const deleted = await deleteUser(req.params.id)
  res.json({ result: 'success', data: { deleted } })
}))

// ─── Board ──────────────────────────────────────────────────────────────────
// Board state: mapped Clinic Cards patients merged with our saved positions,
// filtered to the columns the signed-in user is allowed to see.
app.get('/api/board', requireAuth, wrap(async (req, res) => {
  const force = req.query.refresh === '1' || req.query.refresh === 'true'
  const board = await getBoard(force)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// Force a fresh pull from Clinic Cards.
app.post('/api/refresh', requireAuth, wrap(async (req, res) => {
  const board = await getBoard(true)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// Move a patient to a new stage (persisted in our DB, never written to CC).
app.post('/api/patients/:id/stage', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  const { stage } = req.body || {}
  if (!stage || !STAGE_IDS.has(stage)) {
    return fail(res, 400, `Unknown stage: ${stage}`)
  }
  if (req.user.stages && !req.user.stages.includes(stage)) {
    return fail(res, 403, 'Ця колонка недоступна для вашої ролі')
  }
  // Gate: leaving the plan stage forward requires every responsible signed off.
  if (PLAN_FORWARD.has(stage)) {
    const positions = await getAllPositions()
    const curStage = positions.get(String(id))?.stage
    if (curStage === 'plan_wait') {
      const review = await getPlanReview(id)
      if ((review?.responsibles || []).length && !planAllReady(review)) {
        return fail(res, 409, 'Не всі відповідальні підтвердили план лікування')
      }
    }
  }
  await setStage(id, stage)
  const board = await getBoard(false) // reuse cached CC snapshot; positions are fresh
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// Toggle a patient's "hot" flag (stored locally; reserved for future UI).
app.post('/api/patients/:id/hot', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  await setHot(id, !!(req.body && req.body.hot))
  const board = await getBoard(false)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// Freeze / unfreeze a patient (put on hold — pauses attention flags).
app.post('/api/patients/:id/frozen', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  await setFrozen(id, !!(req.body && req.body.frozen))
  const board = await getBoard(false)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// Dismiss the "visited — move me" reminder for a patient.
app.post('/api/patients/:id/dismiss-followup', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  await dismissFollowup(id, (req.body && req.body.visitAt) || null)
  const board = await getBoard(false)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// ─── Treatment-plan review workflow ─────────────────────────────────────────
// Assignable responsibles = лікарі who registered in the Telegram bot (/start
// → picked role «Лікар»). Their chat_id is the person's DM address = the id.
// (Керівник / Головний лікар are notification targets, not plan responsibles.)
app.get('/api/staff', requireMove, wrap(async (_req, res) => {
  const rows = await listBotStaff()
  const staff = rows
    .filter((s) => s.role === 'doctor')
    .map((s) => ({ id: String(s.chat_id), name: s.name, role: BOT_ROLE_LABEL[s.role] || s.role || '' }))
  res.json({ result: 'success', data: staff })
}))

// Set / replace the responsibles for a patient's plan, then DM each of them the
// plan with «Готово» / «Відкласти» buttons (via the bot, if it's running).
app.post('/api/patients/:id/plan/responsibles', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  const { responsibles, patientName } = req.body || {}
  const review = await setPlanResponsibles(id, responsibles)
  const board = await getBoard(false)
  if (review.responsibles.length) {
    const p = board.patients.find((x) => String(x.id) === String(id))
    emitEvent({
      type: 'plan_assigned',
      text: `План лікування — призначено відповідальних${patientName ? `: ${patientName}` : ''}`,
      sub: review.responsibles.map((r) => r.name).join(', '),
      patientId: id,
      targets: review.responsibles.map((r) => r.id),
    })
    const bot = getBot()
    if (bot) await bot.notifyPlanAssigned(id, patientName || id, review.responsibles, {
      deadlineAt: p?.planReview?.planDeadlineAt || null,
      visit: p?.visit || '',
    })
  }
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// A responsible marks the plan ready (comment required). Admins may record it
// on someone else's behalf by passing `userId`.
app.post('/api/patients/:id/plan/signoff', requireAuth, wrap(async (req, res) => {
  const { id } = req.params
  const { comment, userId, patientName } = req.body || {}
  if (!comment || !String(comment).trim()) return fail(res, 400, 'Додайте коментар до плану')
  const review = await getPlanReview(id)
  const responsibles = review?.responsibles || []
  const targetId = userId ? String(userId) : req.user.id
  const isResponsible = responsibles.some((r) => String(r.id) === targetId)
  if (!isResponsible) return fail(res, 403, 'Ви не у списку відповідальних за цей план')
  // Acting for another person requires admin rights.
  if (targetId !== req.user.id && !req.user.manageUsers) {
    return fail(res, 403, 'Підтвердити за іншого може лише адміністратор')
  }
  const targetName = responsibles.find((r) => String(r.id) === targetId)?.name || req.user.displayName
  const next = await addPlanSignoff(id, targetId, { comment, name: targetName })
  emitEvent({
    type: 'plan_signoff',
    text: `${targetName} підтвердив(ла) план${patientName ? ` — ${patientName}` : ''}`,
    sub: String(comment).trim().slice(0, 120),
    patientId: id,
    targets: next.responsibles.map((r) => r.id),
  })
  if (planAllReady(next)) {
    emitEvent({
      type: 'plan_ready',
      text: `План лікування готовий — всі відповідальні підтвердили${patientName ? `: ${patientName}` : ''}`,
      sub: 'Картку можна переміщувати далі',
      patientId: id,
      targets: next.responsibles.map((r) => r.id),
    })
  }
  const board = await getBoard(false)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// Postpone the plan — comment is mandatory. Clears prior sign-offs.
app.post('/api/patients/:id/plan/postpone', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  const { comment, patientName } = req.body || {}
  if (!comment || !String(comment).trim()) return fail(res, 400, 'Вкажіть причину відкладення (обовʼязково)')
  const next = await postponePlan(id, { comment, by: req.user.id, name: req.user.displayName })
  emitEvent({
    type: 'plan_postponed',
    text: `План лікування відкладено${patientName ? ` — ${patientName}` : ''}`,
    sub: `${req.user.displayName}: ${String(comment).trim().slice(0, 120)}`,
    patientId: id,
    targets: next.responsibles.map((r) => r.id),
  })
  const board = await getBoard(false)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// ─── Telegram webhook (serverless / Vercel) ─────────────────────────────────
// Telegram POSTs each update here. Validated by the secret token header set at
// setWebhook time. Conversation state is persisted in the DB, so multi-step
// flows survive across serverless invocations.
app.post('/api/telegram/webhook', wrap(async (req, res) => {
  if (config.telegramWebhookSecret &&
      req.get('x-telegram-bot-api-secret-token') !== config.telegramWebhookSecret) {
    return res.status(401).json({ ok: false })
  }
  const bot = getBot()
  if (bot) await bot.handleUpdate(req.body || {})
  res.json({ ok: true })
}))

// One-time (or after redeploy) webhook registration. Hit this once after deploy:
//   GET /api/telegram/setup?secret=<TELEGRAM_WEBHOOK_SECRET>
// Points Telegram at this deployment's /api/telegram/webhook.
app.get('/api/telegram/setup', wrap(async (req, res) => {
  if (!config.telegramBotToken) return fail(res, 400, 'TELEGRAM_BOT_TOKEN не заданий')
  if (config.telegramWebhookSecret && req.query.secret !== config.telegramWebhookSecret) {
    return fail(res, 401, 'Невірний secret')
  }
  const base = config.publicUrl || `https://${req.get('host')}`
  const url = `${base}/api/telegram/webhook`
  const tg = await setTelegramWebhook(url, config.telegramWebhookSecret)
  res.json({ result: 'success', data: { url, telegram: tg } })
}))

// Reminder sweep — invoked by Vercel Cron (see vercel.json). Auth: the Vercel
// cron "Authorization: Bearer <CRON_SECRET>" header, or ?secret=<webhook secret>.
app.get('/api/cron/plan-sweep', wrap(async (req, res) => {
  const bearer = (req.get('authorization') || '') === `Bearer ${config.cronSecret}`
  const bySecret = config.telegramWebhookSecret && req.query.secret === config.telegramWebhookSecret
  if ((config.cronSecret || config.telegramWebhookSecret) && !(config.cronSecret ? bearer : false) && !bySecret) {
    return fail(res, 401, 'Немає доступу')
  }
  const bot = getBot()
  const sent = bot ? await bot.sweep() : 0
  res.json({ result: 'success', data: { sent } })
}))

// Morning digest to the head doctor — invoked by Vercel Cron (see vercel.json).
app.get('/api/cron/plan-digest', wrap(async (req, res) => {
  const bearer = (req.get('authorization') || '') === `Bearer ${config.cronSecret}`
  const bySecret = config.telegramWebhookSecret && req.query.secret === config.telegramWebhookSecret
  if ((config.cronSecret || config.telegramWebhookSecret) && !(config.cronSecret ? bearer : false) && !bySecret) {
    return fail(res, 401, 'Немає доступу')
  }
  const bot = getBot()
  const data = bot ? await bot.digest() : { sent: 0 }
  res.json({ result: 'success', data })
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
