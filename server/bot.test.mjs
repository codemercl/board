// Simulated end-to-end test of the Telegram plan-review bot. No live token:
// we inject fake deps and feed fake Telegram update payloads through the same
// handleUpdate the real bot uses. Run: node server/bot.test.mjs
import assert from 'node:assert'
import { createBot } from './bot.js'

let passed = 0
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ✓', msg); passed++ }

// ── fake persistence (mirrors db.js plan_review semantics) ──────────────────
const reviews = new Map()
const staff = new Map() // chat_id -> { chat_id, name, role, username }
const stages = new Map() // patient_id -> stage
const pending = new Map() // chat_id -> conversation state
const claimed = new Set()
const sent = []
const events = []
const names = { p1: 'Тест Пацієнт', p2: 'Другий Пацієнт', p3: 'Третій' }
let planCards = []
let reviewCards = [] // plan_wait + plan, with responsibles[].ready (mapper shape)

const seedReview = (id, responsibles) => reviews.set(id, { responsibles, signoffs: {}, postpone: null, notified: {} })

const deps = {
  send: async (chatId, text, opts) => { sent.push({ chatId: String(chatId), text, opts }) },
  answerCallback: async () => {},
  getPlanReview: async (id) => reviews.get(id) || null,
  addPlanSignoff: async (id, uid, { comment, name }) => {
    const r = reviews.get(id)
    r.signoffs[String(uid)] = { status: 'ready', comment, name, at: 'now' }
    r.postpone = null
    return r
  },
  postponePlan: async (id, { comment, by, name }) => {
    const r = reviews.get(id)
    r.signoffs = {}; r.notified = {}
    r.postpone = { comment, by: String(by), name, at: 'now' }
    return r
  },
  claimPlanNotification: async (id, key) => {
    const k = `${id}:${key}`
    if (claimed.has(k)) return false
    claimed.add(k); return true
  },
  getBotStaff: async (chatId) => staff.get(String(chatId)) || null,
  getBotStaffByRole: async (role) => [...staff.values()].filter((s) => s.role === String(role)),
  upsertBotStaff: async ({ chatId, name, role, username }) => {
    const prev = staff.get(String(chatId))
    const row = {
      chat_id: String(chatId),
      name: name ?? prev?.name ?? '',
      role: role != null ? role : (prev?.role || ''),
      username: username != null ? String(username).replace(/^@/, '') : (prev?.username || ''),
    }
    staff.set(String(chatId), row); return row
  },
  getPatientStage: async (id) => stages.get(id) || null,
  setStage: async (id, stage) => { stages.set(id, stage) },
  getPending: async (chatId) => pending.get(String(chatId)) || null,
  setPending: async (chatId, state) => { pending.set(String(chatId), state) },
  clearPending: async (chatId) => { pending.delete(String(chatId)) },
  getPatientName: async (id) => names[id] || null,
  listPlanCards: async () => planCards,
  listReviewCards: async () => reviewCards,
  emitEvent: (e) => { events.push(e) },
  readyRole: 'head_doctor',
  issueRole: 'head_doctor',
  isQuietHours: () => false,
}

const bot = createBot(deps)
const msg = (chatId, text, from = {}) => ({ message: { chat: { id: chatId }, text, from } })
const cb = (chatId, data, from = {}) => ({ callback_query: { id: 'c1', data, from, message: { chat: { id: chatId } } } })
const lastTo = (chatId) => [...sent].reverse().find((s) => s.chatId === String(chatId))

async function run() {
  console.log('1) /start offers a role keyboard')
  sent.length = 0
  await bot.handleUpdate(msg('1001', '/start', { username: 'andrii', first_name: 'Андрій' }))
  const kb = lastTo('1001')?.opts?.reply_markup?.inline_keyboard
  ok(kb && kb.flat().some((b) => b.callback_data === 'role:doctor') && kb.flat().some((b) => b.callback_data === 'role:head_doctor'), '/start shows role buttons (лікар + головний лікар + …)')

  console.log('2) Picking a role registers the person with that role')
  await bot.handleUpdate(cb('1001', 'role:doctor', { username: 'andrii', first_name: 'Андрій Федірко' }))
  ok(staff.get('1001')?.role === 'doctor' && staff.get('1001')?.name === 'Андрій Федірко', '1001 registered as лікар')
  await bot.handleUpdate(cb('1002', 'role:doctor', { first_name: 'Катерина Романова' }))
  await bot.handleUpdate(cb('5001', 'role:head_doctor', { first_name: 'Олена Головна' }))
  ok((await deps.getBotStaffByRole('head_doctor')).length === 1, 'one головний лікар registered')

  console.log('3) Assignment: лікарі get plan+deadline+buttons, головний лікар gets a notice')
  seedReview('p1', [{ id: '1001', name: 'Андрій Федірко' }, { id: '1002', name: 'Катерина Романова' }])
  stages.set('p1', 'plan_wait')
  sent.length = 0
  const future = new Date(Date.now() + 40 * 3600000).toISOString() // ~40h ahead
  await bot.notifyPlanAssigned('p1', 'Тест Пацієнт', reviews.get('p1').responsibles, { deadlineAt: future, visit: 'Завтра, 10:00' })
  ok(sent.filter((s) => s.opts?.reply_markup?.inline_keyboard).length === 2, 'both лікарі got a DM with buttons')
  ok(lastTo('1001') && /призначено план/i.test(lastTo('1001').text) && /залишилось/i.test(lastTo('1001').text), 'лікар DM shows deadline + time left')
  ok(lastTo('5001') && /Призначено план/i.test(lastTo('5001').text) && /Андрій Федірко/.test(lastTo('5001').text), 'головний лікар told which лікар got the plan')

  console.log('3b) An overdue deadline flips the wording')
  sent.length = 0
  const past = new Date(Date.now() - 5 * 3600000).toISOString() // 5h overdue
  await bot.notifyPlanAssigned('p1', 'Тест Пацієнт', [{ id: '1001', name: 'Андрій Федірко' }], { deadlineAt: past })
  ok(lastTo('1001') && /прострочено/i.test(lastTo('1001').text), 'overdue deadline → "прострочено" wording')

  console.log('4) First лікар confirms → not everyone yet → no approve prompt yet')
  sent.length = 0
  await bot.handleUpdate(cb('1001', 'rdy:p1'))
  await bot.handleUpdate(msg('1001', 'План склав, все ок', { username: 'andrii' }))
  ok(reviews.get('p1').signoffs['1001']?.comment === 'План склав, все ок', '1001 signed off')
  ok(!lastTo('5001'), 'головний лікар gets NO approve prompt yet (not everyone confirmed)')

  console.log('5) All лікарі confirm → Головний лікар gets a «Підтвердити» BUTTON')
  await bot.handleUpdate(cb('1002', 'rdy:p1'))
  await bot.handleUpdate(msg('1002', 'Погоджено'))
  const hMsg = lastTo('5001')
  ok(hMsg && /готовий/i.test(hMsg.text), 'головний лікар got the "план готовий" DM')
  ok(hMsg?.opts?.reply_markup?.inline_keyboard?.flat().some((b) => b.callback_data === 'apr:p1'), 'DM carries the «Підтвердити» button')

  console.log('6) A лікар CANNOT approve; головний лікар approve → card auto-moves to «plan»')
  await bot.handleUpdate(cb('1001', 'apr:p1'))
  ok(stages.get('p1') === 'plan_wait', 'doctor cannot approve — card stays in plan_wait')
  await bot.handleUpdate(cb('5001', 'apr:p1'))
  ok(stages.get('p1') === 'plan', 'головний лікар approved → card moved to «План лікування складено»')
  ok(lastTo('1001') && /підтвердив/i.test(lastTo('1001').text), 'лікар notified their plan was approved & moved')
  await bot.handleUpdate(cb('5001', 'apr:p1'))
  ok(stages.get('p1') === 'plan', 'second approval is idempotent (already moved)')

  console.log('7) Postpone → Головний лікар told it is NOT ready + reason')
  seedReview('p2', [{ id: '1001', name: 'Андрій Федірко' }])
  await bot.handleUpdate(cb('1001', 'pst:p2'))
  await bot.handleUpdate(msg('1001', 'Чекаємо КТ', { username: 'andrii' }))
  const nMsg = lastTo('5001')
  ok(nMsg && /не готовий/i.test(nMsg.text) && /Чекаємо КТ/.test(nMsg.text), 'головний лікар got "НЕ готовий" with reason')

  const dlFuture = new Date(Date.now() + 20 * 3600000).toISOString()
  const dlPast = new Date(Date.now() - 3 * 3600000).toISOString()
  const card = (id, name, pr) => ({ id, name, visit: pr.visit || '', planReview: { responsibles: [{ id: '1001', name: 'Андрій' }], allReady: false, planOverdue: false, visitSoon: false, postponeFollowupDue: false, postponed: false, planDeadlineAt: dlFuture, planElapsedFrac: 0, ...pr } })

  console.log('8) Fraction ladder (⅓, ½) nudges the лікар with time-left')
  planCards = [card('f1', 'Пацієнт Ф', { planElapsedFrac: 0.5, planDeadlineAt: dlFuture })]
  sent.length = 0
  const n8 = await bot.sweep()
  ok(n8 === 2 && lastTo('1001') && /нагадування/i.test(lastTo('1001').text) && /залишилось/i.test(lastTo('1001').text), 'both ⅓ and ½ reminders sent to the лікар with "залишилось"')
  ok((await bot.sweep()) === 0, 'ladder reminders dedupe')

  console.log('9) Overdue → head doctor; visit-soon → urgent head doctor')
  planCards = [card('o1', 'Прострочений', { planOverdue: true, planDeadlineAt: dlPast })]
  sent.length = 0
  await bot.sweep()
  ok(lastTo('5001') && /прострочено/i.test(lastTo('5001').text), 'overdue escalated to головний лікар')
  planCards = [card('v1', 'Візит Скоро', { visitSoon: true, visit: 'Сьогодні, 15:00' })]
  sent.length = 0
  await bot.sweep()
  ok(lastTo('5001') && /терміново/i.test(lastTo('5001').text), 'visit-soon escalated urgently to головний лікар')

  console.log('10) No responsibles → head doctor is told to assign')
  planCards = [{ id: 'nr1', name: 'Без Лікарів', visit: '', planReview: { responsibles: [], allReady: false, planOverdue: false, visitSoon: false, postponeFollowupDue: false } }]
  sent.length = 0
  await bot.sweep()
  ok(lastTo('5001') && /без відповідальних/i.test(lastTo('5001').text), 'unassigned card reported to головний лікар')

  console.log('11) Quiet hours hold gentle reminders but let urgent through')
  const botQuiet = createBot({ ...deps, isQuietHours: () => true })
  planCards = [card('q1', 'Тихий', { planElapsedFrac: 0.5 })]
  sent.length = 0
  ok((await botQuiet.sweep()) === 0, 'gentle ladder reminder suppressed during quiet hours')
  planCards = [card('q2', 'Тихий Терміновий', { visitSoon: true, visit: 'Сьогодні' })]
  sent.length = 0
  await botQuiet.sweep()
  ok(lastTo('5001') && /терміново/i.test(lastTo('5001').text), 'urgent visit-soon still fires during quiet hours')

  console.log('12) Morning digest counts states for the head doctor')
  planCards = [
    card('d1', 'Очікує', { planElapsedFrac: 0.2 }),
    card('d2', 'Прострочений', { planOverdue: true }),
    { id: 'd3', name: 'Відкладений', planReview: { responsibles: [{ id: '1001', name: 'А' }], postponed: true } },
    { id: 'd4', name: 'Без лікарів', planReview: { responsibles: [] } },
  ]
  sent.length = 0
  const dg = await bot.digest()
  ok(dg.waiting === 1 && dg.overdue === 1 && dg.postponed === 1 && dg.noResp === 1, 'digest tallies waiting/overdue/postponed/noResp')
  const dText = lastTo('5001')?.text || ''
  ok(/звіт/i.test(dText), 'digest DM sent to головний лікар')
  ok(dText.includes('Прострочений') && dText.includes('Без лікарів') && dText.includes('Відкладений'), 'digest names the cards to chase')

  console.log('12b) Quiet digest when nothing is wrong')
  planCards = [card('c1', 'Спокійний', { planElapsedFrac: 0.1 })]
  sent.length = 0
  await bot.digest()
  ok(/під контролем/i.test(lastTo('5001')?.text || ''), 'all-clear digest wording when no problems')

  // Review cards use the mapper shape: responsibles[].ready + a stage.
  // m1: 1001 to-write (plan_wait, not ready)
  // m2: 1001 written & awaiting (plan_wait, 1001 ready, 1002 not → allReady false)
  // m3: not 1001's
  // m4: 1001 confirmed (plan stage)
  // m5: plan_wait, allReady → awaits head-doctor confirmation
  reviewCards = [
    { id: 'm1', name: 'Пацієнт А', stage: 'plan_wait', planReview: { responsibles: [{ id: '1001', name: 'Андрій', ready: false }], allReady: false } },
    { id: 'm2', name: 'Пацієнт Б', stage: 'plan_wait', planReview: { responsibles: [{ id: '1001', name: 'Андрій', ready: true }, { id: '1002', name: 'Катерина', ready: false }], allReady: false } },
    { id: 'm3', name: 'Пацієнт В', stage: 'plan_wait', planReview: { responsibles: [{ id: '1002', name: 'Катерина', ready: false }], allReady: false } },
    { id: 'm4', name: 'Пацієнт Г', stage: 'plan', planReview: { responsibles: [{ id: '1001', name: 'Андрій', ready: true }], allReady: true } },
    { id: 'm5', name: 'Пацієнт Д', stage: 'plan_wait', planReview: { responsibles: [{ id: '1002', name: 'Катерина', ready: true }], allReady: true } },
  ]

  console.log('13) /my splits into to-write (buttons) / awaiting / confirmed')
  sent.length = 0
  await bot.handleUpdate(msg('1001', '/my'))
  const myMsg = lastTo('1001')
  const rows = myMsg?.opts?.reply_markup?.inline_keyboard || []
  ok(/написати/.test(myMsg?.text || '') && /підтвердж/i.test(myMsg?.text || ''), '/my shows the category summary')
  ok(rows.length === 1 && rows[0][0].callback_data === 'rdy:m1', '/my gives a button only for the to-write plan (m1)')
  ok(/чекають підтвердження[\s\S]*Пацієнт Б/.test(myMsg?.text || ''), '/my lists m2 as written & awaiting confirmation')
  ok(/Підтверджені[\s\S]*Пацієнт Г/.test(myMsg?.text || ''), '/my lists m4 as confirmed')

  console.log('14) /all: per-doctor load + «Підтвердити» buttons for awaiting plans')
  sent.length = 0
  await bot.handleUpdate(msg('5001', '/all'))
  const allM = lastTo('5001')
  const allText = allM?.text || ''
  ok(/Статус лікарів/.test(allText) && allText.includes('Андрій Федірко') && allText.includes('Катерина Романова'), '/all lists лікарі with their load')
  ok(/Чекають ВАШОГО підтвердження[\s\S]*Пацієнт Д/.test(allText), '/all shows plans awaiting head-doctor confirmation (m5)')
  const allKb = allM?.opts?.reply_markup?.inline_keyboard || []
  ok(allKb.some((row) => row[0]?.callback_data === 'apr:m5'), '/all includes a Підтвердити button (apr:m5) for the awaiting plan')
  sent.length = 0
  await bot.handleUpdate(msg('1001', '/all'))
  ok(/лише головному/i.test(lastTo('1001')?.text || ''), '/all is blocked for a non-overseer')

  console.log('15) Plain "готово" (no button) → strict nudge + tappable list, nothing confirmed')
  pending.delete('1001')
  sent.length = 0
  await bot.handleUpdate(msg('1001', 'готово'))
  const texts = sent.map((s) => s.text).join(' | ')
  ok(/не зараховує/.test(texts), 'plain "готово" is explained as not counted')
  ok(sent.some((s) => (s.opts?.reply_markup?.inline_keyboard || []).some((row) => row[0]?.callback_data === 'rdy:m1')), 'and the tappable /my list is shown')

  console.log(`\nAll ${passed} assertions passed ✅`)
}

run().catch((e) => { console.error('\n❌ TEST FAILED:', e.message); process.exit(1) })
