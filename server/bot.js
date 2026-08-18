import { config, BOT_ROLES, BOT_ROLE_LABEL, isBotRole } from './config.js'
import {
  getPlanReview, addPlanSignoff, postponePlan, claimPlanNotification,
  getBotStaff, getBotStaffByRole, upsertBotStaff,
  getPatientStage, setStage,
  getBotState, setBotState, clearBotState,
} from './db.js'
import { emitEvent } from './notify.js'

// Telegram bot that drives the treatment-plan sign-off entirely in DMs:
//   • /start → the person picks their ROLE with buttons (Керівник / Головний
//     лікар / Лікар). The bot stores role + chat_id (personal DM address,
//     captured automatically). Лікарі are the ones a plan is required from.
//   • when a plan is assigned, each responsible (лікар) gets a DM with «Готово»
//     / «Відкласти» buttons.
//   • tapping a button → the bot asks for a comment; the reply is the sign-off
//     (or the mandatory postpone reason). The board updates and the move gate
//     opens once everyone confirmed.
//   • plan ready → the "ready" role is DM'd (Головний лікар). Plan postponed /
//     overdue → the "issue" role is DM'd. Routing is by role, set in config.
//   • a periodic sweep pings responsibles 24h/4h before the visit, on the 48h
//     overdue, and 24h after a postpone.
//
// Written with injected deps so the whole conversation can be exercised in
// tests by feeding fake Telegram updates (see server/bot.test.mjs).

const CB = { ready: 'rdy', postpone: 'pst', role: 'role', approve: 'apr' }
const trim = (s) => String(s || '').trim()
const trunc = (s, n = 22) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const OVERSEER_ROLES = new Set(['head_doctor', 'kerivnyk'])
// "2026-07-28T14:30:00Z" → "28.07 о 14:30" (local server time).
const formatDeadline = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} о ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Milliseconds → "5 хв" / "6 год" / "1 дн 4 год".
const humanDur = (ms) => {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} хв`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} год`
  const d = Math.floor(h / 24)
  const rh = h - d * 24
  return rh ? `${d} дн ${rh} год` : `${d} дн`
}

// Deadline line for a plan DM: absolute time + time left, or an overdue notice.
const deadlineLine = (iso) => {
  if (!iso) return ''
  const at = formatDeadline(iso)
  if (!at) return ''
  const leftMs = new Date(iso).getTime() - Date.now()
  return leftMs >= 0
    ? `\n⏳ Термін складання плану: до ${at} (залишилось ${humanDur(leftMs)}).`
    : `\n🔴 Термін прострочено на ${humanDur(-leftMs)} (був до ${at}).`
}
const allReadyOf = (review) => {
  const resp = review?.responsibles || []
  return resp.length > 0 && resp.every((r) => review.signoffs?.[String(r.id)]?.status === 'ready')
}

export function createBot(deps) {
  const {
    send, answerCallback,
    getPlanReview, addPlanSignoff, postponePlan, claimPlanNotification,
    getBotStaff, getBotStaffByRole, upsertBotStaff,
    getPatientStage, setStage,
    getPending, setPending, clearPending,
    getPatientName, listPlanCards, emitEvent,
    readyRole, issueRole,
    isQuietHours = () => false,
  } = deps

  // Short "залишилось 4 год" / "прострочено на 2 год" from a deadline ISO.
  const deadlineLeftLabel = (iso) => {
    if (!iso) return ''
    const ms = new Date(iso).getTime() - Date.now()
    return ms >= 0 ? `залишилось ${humanDur(ms)}` : `прострочено на ${humanDur(-ms)}`
  }

  const roleLabel = (k) => BOT_ROLE_LABEL[k] || k
  const approveButton = (patientId) => ({ inline_keyboard: [[{ text: '✅ Підтвердити план', callback_data: `${CB.approve}:${patientId}` }]] })

  // DM everyone holding a given role (e.g. all Головні лікарі). Logs if nobody
  // registered for it yet, so the reason a message didn't arrive is visible.
  async function notifyByRole(role, text) {
    if (!role) return 0
    const people = await getBotStaffByRole(role)
    if (!people.length) {
      console.warn(`[bot] cannot notify role "${role}": nobody registered with it (ask them to /start and pick the role).`)
      return 0
    }
    for (const s of people) await send(String(s.chat_id), text)
    return people.length
  }

  // Per-chat conversation state ({ mode: 'signoff'|'postpone', patientId,
  // patientName }) lives in the store via getPending/setPending/clearPending,
  // so a "tap button → send comment" flow survives across serverless requests.

  const buttons = (patientId) => ({
    inline_keyboard: [[
      { text: '✅ План готовий', callback_data: `${CB.ready}:${patientId}` },
      { text: '⏸ Відкласти', callback_data: `${CB.postpone}:${patientId}` },
    ]],
  })

  // Role-selection keyboard shown on /start — one button per bot role.
  const roleButtons = () => ({
    inline_keyboard: BOT_ROLES.map((r) => [{ text: r.label, callback_data: `${CB.role}:${r.key}` }]),
  })

  // /my — a лікар's own plans as a tappable list. Handy when they have many:
  // one row per pending plan with «✅» (sign off) and «⏸» (postpone) — the
  // buttons reuse the normal rdy:/pst: callbacks (ask for a comment).
  async function myPlans(chatId) {
    const id = String(chatId)
    const cards = await listPlanCards()
    const mine = cards.filter((c) => (c.planReview?.responsibles || []).some((r) => String(r.id) === id))
    if (!mine.length) return send(chatId, '📋 У вас немає призначених планів зараз.')
    const pending = mine.filter((c) => c.planReview?.signoffs?.[id]?.status !== 'ready')
    const readyN = mine.length - pending.length
    let text = `📋 Ваші плани: ${mine.length} · ✅ ${readyN} готово · ⏳ ${pending.length} в роботі`
    if (!pending.length) return send(chatId, text + '\nУсі підтверджені 👍')
    const shown = pending.slice(0, 25)
    const kb = shown.map((c) => ([
      { text: `✅ ${trunc(c.name)}`, callback_data: `${CB.ready}:${c.id}` },
      { text: '⏸', callback_data: `${CB.postpone}:${c.id}` },
    ]))
    if (pending.length > shown.length) text += `\n(показано ${shown.length} з ${pending.length})`
    return send(chatId, text + '\n\nОберіть план — ✅ підтвердити або ⏸ відкласти:', { reply_markup: { inline_keyboard: kb } })
  }

  // /all — overseer view: every лікар with their plan load. Shows who has no
  // tasks and who has how many (готово / в роботі), with pending patient names.
  async function doctorsOverview() {
    const cards = await listPlanCards()
    const docs = await getBotStaffByRole('doctor')
    const stat = new Map() // id -> { name, total, ready, pend: [names] }
    for (const d of docs) stat.set(String(d.chat_id), { name: d.name, total: 0, ready: 0, pend: [] })
    for (const c of cards) {
      const pr = c.planReview || {}
      for (const r of (pr.responsibles || [])) {
        const key = String(r.id)
        if (!stat.has(key)) stat.set(key, { name: r.name, total: 0, ready: 0, pend: [] })
        const s = stat.get(key)
        s.total++
        if (pr.signoffs?.[key]?.status === 'ready') s.ready++
        else s.pend.push(c.name)
      }
    }
    const all = [...stat.values()]
    if (!all.length) return 'Ще немає зареєстрованих лікарів. Хай зайдуть у бота → /start → «Лікар».'
    const withPlans = all.filter((s) => s.total > 0).sort((a, b) => b.pend.length - a.pend.length || b.total - a.total)
    const free = all.filter((s) => s.total === 0)
    let text = `👥 Статус лікарів (${all.length})`
    if (withPlans.length) {
      text += '\n\n📋 З планами:'
      for (const s of withPlans) {
        text += `\n• ${s.name} — ${s.total} · ✅${s.ready} / ⏳${s.pend.length}`
        if (s.pend.length) text += `\n   ⏳ ${s.pend.slice(0, 6).map((n) => trunc(n, 18)).join(', ')}${s.pend.length > 6 ? ` +${s.pend.length - 6}` : ''}`
      }
    }
    if (free.length) text += '\n\n🟢 Без задач:\n' + free.map((s) => `• ${s.name}`).join('\n')
    return text
  }

  async function handleUpdate(update) {
    try {
      if (update.callback_query) return await onCallback(update.callback_query)
      if (update.message && update.message.text) return await onMessage(update.message)
    } catch (e) {
      console.error('[bot] update failed:', e.message)
    }
  }

  async function onMessage(msg) {
    const chatId = String(msg.chat.id)
    const text = trim(msg.text)
    const username = msg.from?.username || ''
    const tgName = trim([msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')) || username || ''
    const state = await getPending(chatId)

    if (text === '/start' || /^\/register\b/.test(text)) {
      // Capture the name + username right away (name from the Telegram profile);
      // the role is chosen next via buttons.
      await upsertBotStaff({ chatId, username, name: tgName || undefined })
      await clearPending(chatId)
      return send(chatId, 'Вітаю! Оберіть вашу роль:', { reply_markup: roleButtons() })
    }

    // Commands work regardless of any pending sign-off/postpone conversation.
    if (/^\/(my|plans)\b/.test(text)) {
      await clearPending(chatId)
      return myPlans(chatId)
    }
    if (/^\/all\b/.test(text)) {
      await clearPending(chatId)
      const staff = await getBotStaff(chatId)
      if (!OVERSEER_ROLES.has(staff?.role)) {
        return send(chatId, 'Команда /all доступна лише головному лікарю або керівнику.')
      }
      return send(chatId, await doctorsOverview())
    }
    if (/^\/help\b/.test(text)) {
      await clearPending(chatId)
      const staff = await getBotStaff(chatId)
      let t = 'Команди:\n/start — реєстрація / зміна ролі'
      if (staff?.role === 'doctor') t += '\n/my — усі ваші плани з кнопками'
      if (OVERSEER_ROLES.has(staff?.role)) t += '\n/all — статус усіх лікарів'
      t += '\n/help — ця довідка'
      return send(chatId, t)
    }

    if (state?.mode === 'signoff') {
      await clearPending(chatId)
      const staff = await getBotStaff(chatId)
      const name = staff?.name || `chat ${chatId}`
      const review = await addPlanSignoff(state.patientId, chatId, { comment: text, name })
      emitEvent({ type: 'plan_signoff', text: `${name} підтвердив(ла) план — ${state.patientName || state.patientId}`, sub: text.slice(0, 120), patientId: state.patientId, targets: review.responsibles.map((r) => r.id) })
      // Show how many of the doctor's own plans still need work (they may have many).
      const cards = await listPlanCards()
      const left = cards.filter((c) => c.id !== state.patientId
        && (c.planReview?.responsibles || []).some((r) => String(r.id) === chatId)
        && c.planReview?.signoffs?.[chatId]?.status !== 'ready').length
      await send(chatId, `✅ Дякую, план позначено готовим.\n${left > 0 ? `Залишилось ваших планів у роботі: ${left}. /my — показати всі.` : 'Це був останній ваш план 👍'}`)
      await maybeAnnounceReady(state.patientId, state.patientName, review)
      return
    }

    if (state?.mode === 'postpone') {
      await clearPending(chatId)
      const staff = await getBotStaff(chatId)
      const name = staff?.name || `chat ${chatId}`
      const review = await postponePlan(state.patientId, { comment: text, by: chatId, name })
      emitEvent({ type: 'plan_postponed', text: `План відкладено — ${state.patientName || state.patientId}`, sub: `${name}: ${text.slice(0, 120)}`, patientId: state.patientId, targets: review.responsibles.map((r) => r.id) })
      await send(chatId, '⏸ План відкладено. Причину збережено.')
      // "Не готов" → escalate to the issue role (Головний лікар by default).
      await notifyByRole(issueRole, `⚠️ План НЕ готовий (відкладено) — ${state.patientName || state.patientId}\n${name}: ${text}`)
      return
    }

    // No active conversation. A common mistake: a лікар types "готово" as plain
    // text instead of tapping ✅. Guide them and show the tappable list.
    const who = await getBotStaff(chatId)
    if (who?.role === 'doctor') {
      const cards = await listPlanCards()
      const pending = cards.filter((c) => (c.planReview?.responsibles || []).some((r) => String(r.id) === chatId)
        && c.planReview?.signoffs?.[chatId]?.status !== 'ready')
      if (pending.length) {
        await send(chatId, '☝️ Текст «готово» бот не зараховує. Щоб підтвердити план — натисніть кнопку ✅ біля потрібного пацієнта у списку нижче:')
        return myPlans(chatId)
      }
      return send(chatId, 'У вас зараз немає планів у роботі. /my — перевірити список.')
    }
    return send(chatId, 'Надішліть /start, щоб обрати роль і отримувати плани.')
  }

  async function onCallback(cb) {
    const chatId = String(cb.message.chat.id)
    const [action, arg] = String(cb.data || '').split(':')
    await answerCallback(cb.id)

    // Role selection on /start.
    if (action === CB.role) {
      if (!isBotRole(arg)) return
      const username = cb.from?.username || ''
      const tgName = trim([cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(' ')) || username || undefined
      await upsertBotStaff({ chatId, role: arg, username, name: tgName })
      const extra = arg === 'doctor'
        ? ' Коли вам призначать план — надішлю сюди кнопки «Готово»/«Відкласти». /my — усі ваші плани.'
        : OVERSEER_ROLES.has(arg)
          ? ' Ви отримуватимете підсумки по планах. /all — статус усіх лікарів.'
          : ' Ви отримуватимете сповіщення по планах відповідно до ролі.'
      return send(chatId, `Готово! Ваша роль: ${roleLabel(arg)}.${extra}`)
    }

    const patientId = arg
    const patientName = (await getPatientName(patientId)) || patientId

    // Head-doctor approval → auto-move plan_wait → plan.
    if (action === CB.approve) {
      const staff = await getBotStaff(chatId)
      if (staff?.role !== readyRole) return send(chatId, `Підтвердити план може лише ${roleLabel(readyRole)}.`)
      const stage = await getPatientStage(patientId)
      if (stage !== 'plan_wait') return send(chatId, 'Картку вже переміщено або вона не очікує підтвердження.')
      const review = await getPlanReview(patientId)
      if (!allReadyOf(review)) return send(chatId, 'Ще не всі лікарі підтвердили план.')
      await setStage(patientId, 'plan')
      emitEvent({ type: 'plan_ready', text: `${roleLabel(readyRole)} підтвердив план — ${patientName}`, sub: 'Картку переміщено в «План лікування складено»', patientId, targets: review.responsibles.map((r) => r.id) })
      await send(chatId, `✅ Підтверджено. Картку переміщено в «План лікування складено» — ${patientName}.`)
      for (const r of review.responsibles) await send(String(r.id), `👍 ${roleLabel(readyRole)} підтвердив ваш план — ${patientName}. Картку переміщено далі.`)
      return
    }

    // Only assigned responsibles may act on the plan.
    const review = await getPlanReview(patientId)
    const isResponsible = (review?.responsibles || []).some((r) => String(r.id) === chatId)
    if (!isResponsible) return send(chatId, 'Вас не призначено відповідальним за цей план.')

    if (action === CB.ready) {
      await setPending(chatId, { mode: 'signoff', patientId, patientName })
      return send(chatId, `Напишіть коментар до плану лікування (${patientName}):`)
    }
    if (action === CB.postpone) {
      await setPending(chatId, { mode: 'postpone', patientId, patientName })
      return send(chatId, `Вкажіть причину відкладення плану (${patientName}) — обовʼязково:`)
    }
  }

  // On assignment: DM each лікар the plan (with deadline + action buttons), and
  // tell the head doctor(s) which лікар(і) just got it.
  async function notifyPlanAssigned(patientId, patientName, responsibles, opts = {}) {
    const list = responsibles || []
    if (!list.length) return
    const termLine = deadlineLine(opts.deadlineAt)
    const visitLine = opts.visit ? `\n📅 Візит: ${opts.visit}` : ''
    for (const r of list) {
      await send(String(r.id), `🦷 На вас призначено план лікування:\n${patientName}${visitLine}${termLine}\n\nСкладіть план і натисніть «✅ План готовий».\n(/my — усі ваші плани)`, { reply_markup: buttons(patientId) })
    }
    const names = list.map((r) => r.name).join(', ')
    const heads = await getBotStaffByRole(readyRole)
    for (const h of heads) {
      await send(String(h.chat_id), `📋 Призначено план лікування — ${patientName}\nВідповідальні лікарі: ${names}${termLine}`)
    }
  }

  // When the last лікар signs off, DM the "ready" role (Головний лікар) with a
  // «Підтвердити» button — tapping it moves the card into «План лікування
  // складено» (see the CB.approve handler).
  async function maybeAnnounceReady(patientId, patientName, review) {
    if (!allReadyOf(review)) return
    const resp = review.responsibles
    const who = resp.map((r) => {
      const so = review.signoffs?.[String(r.id)]
      return `• ${r.name}${so?.comment ? `: ${so.comment}` : ''}`
    }).join('\n')
    emitEvent({ type: 'plan_ready', text: `План готовий — всі лікарі підтвердили: ${patientName || patientId}`, sub: 'Очікує підтвердження головного лікаря', patientId, targets: resp.map((r) => r.id) })
    const heads = await getBotStaffByRole(readyRole)
    if (!heads.length) { console.warn(`[bot] no "${readyRole}" registered to approve the plan.`); return }
    for (const h of heads) {
      await send(String(h.chat_id), `✅ План готовий — ${patientName || patientId}\nПідтвердили:\n${who}\n\nНатисніть «Підтвердити», щоб перемістити картку в «План лікування складено».`, { reply_markup: approveButton(patientId) })
    }
  }

  // Periodic reminders. Each (patient, kind) fires at most once via
  // claimPlanNotification. Gentle jobs are held during quiet hours (not claimed,
  // so they fire next morning); urgent ones bypass. Returns messages sent.
  async function sweep() {
    const quiet = isQuietHours()
    let sent = 0
    const cards = await listPlanCards()
    for (const card of cards) {
      const pr = card.planReview || {}
      const resp = pr.responsibles || []
      const left = deadlineLeftLabel(pr.planDeadlineAt)

      // No responsibles → head doctor (board hygiene). Gentle.
      if (!resp.length) {
        if (!quiet && (await claimPlanNotification(card.id, 'no_resp'))) {
          sent += await notifyByRole(issueRole, `⚠️ Картка «${card.name}» в «Очікує план» без відповідальних. Призначте лікарів на дошці.`)
        }
        continue
      }
      // All лікарі done → waiting on the head-doctor confirm, nothing to nag.
      if (pr.allReady) continue

      const jobs = []
      if (pr.visitSoon) {
        // Visit imminent, still no plan → urgent, bypasses quiet hours.
        jobs.push({ key: 'visit_soon', urgent: true, to: 'role', text: `🔴 Візит скоро (${card.visit || 'сьогодні'}), а плану ще немає — ${card.name}. Потрібно терміново скласти план.` })
      } else if (pr.planOverdue) {
        jobs.push({ key: 'overdue', urgent: false, to: 'role', text: `🔴 План по ${card.name} ${left || 'прострочено'}. Потрібна дія.` })
      }
      // Fraction ladder (⅓, ½ of the term) → the лікарі, while not yet overdue.
      if (!pr.planOverdue && !pr.visitSoon) {
        for (const frac of config.planRemindFractions) {
          if ((pr.planElapsedFrac || 0) >= frac) {
            jobs.push({ key: `remind_${Math.round(frac * 100)}`, urgent: false, to: 'resp', text: `⏳ Нагадування по плану — ${card.name}. ${left ? left[0].toUpperCase() + left.slice(1) : ''}. Складіть план і натисніть «✅ План готовий».` })
          }
        }
      }
      if (pr.postponeFollowupDue) {
        jobs.push({ key: 'postpone24', urgent: false, to: 'role', text: `🔁 Відкладений план по ${card.name} висить 24 год+. Потрібно повернутися до нього.` })
      }

      for (const j of jobs) {
        if (quiet && !j.urgent) continue // held until morning (not claimed)
        if (!(await claimPlanNotification(card.id, j.key))) continue
        if (j.to === 'resp') {
          for (const r of resp) { await send(String(r.id), j.text, { reply_markup: buttons(card.id) }); sent++ }
        } else {
          sent += await notifyByRole(issueRole, j.text)
        }
        emitEvent({ type: 'plan_ping', text: j.text, patientId: card.id, targets: resp.map((r) => r.id) })
      }
    }
    return sent
  }

  // Morning digest to the head doctor: named lists of what needs chasing —
  // overdue, unassigned, postponed, and plans awaiting the head doctor's own
  // confirmation. Great even on a once-a-day cron (Vercel Hobby).
  async function digest() {
    const cards = await listPlanCards()
    const overdue = [], postponed = [], awaitingConfirm = [], noResp = []
    let waiting = 0
    for (const c of cards) {
      const pr = c.planReview || {}
      const who = pr.responsibles?.length ? ` — ${pr.responsibles.map((r) => r.name).join(', ')}` : ''
      if (!(pr.responsibles || []).length) { noResp.push(c.name); continue }
      if (pr.postponed) { postponed.push(`${c.name}${pr.postponeComment ? ` (${pr.postponeComment})` : ''}`); continue }
      if (pr.allReady) { awaitingConfirm.push(`${c.name}${who}`); continue }
      if (pr.planOverdue) overdue.push(`${c.name}${who} — ${deadlineLeftLabel(pr.planDeadlineAt)}`); else waiting++
    }
    const section = (emoji, title, arr) => (arr.length
      ? `\n\n${emoji} ${title} (${arr.length}):\n${arr.slice(0, 12).map((n) => `  • ${n}`).join('\n')}${arr.length > 12 ? `\n  … +${arr.length - 12}` : ''}`
      : '')
    let text = `☀️ Ранковий звіт по планах лікування (${cards.length})`
    text += section('✅', 'Готові — чекають ВАШОГО підтвердження', awaitingConfirm)
    text += section('🔴', 'Прострочено', overdue)
    text += section('⚠️', 'Без відповідальних', noResp)
    text += section('⏸', 'Відкладено', postponed)
    text += `\n\n⏳ Ще в роботі (в межах строку): ${waiting}`
    if (!overdue.length && !noResp.length && !postponed.length && !awaitingConfirm.length) {
      text = `☀️ Ранковий звіт: усе під контролем. Планів у роботі: ${waiting}, проблемних немає. 👍`
    }
    const n = await notifyByRole(readyRole, text)
    return { waiting, overdue: overdue.length, postponed: postponed.length, awaitingConfirm: awaitingConfirm.length, noResp: noResp.length, sent: n }
  }

  return { handleUpdate, notifyPlanAssigned, sweep, digest, myPlans, doctorsOverview }
}

// Current hour (0..23) in the clinic timezone, for quiet-hours checks.
function clinicHour() {
  try {
    const s = new Intl.DateTimeFormat('en-GB', { timeZone: config.clinicTz, hour: '2-digit', hour12: false }).format(new Date())
    return parseInt(s, 10) % 24
  } catch {
    return new Date().getHours()
  }
}

// True inside the quiet window (clinic tz). Handles windows that cross midnight.
function inQuietHours() {
  const { quietStart: a, quietEnd: b } = config
  if (a === b) return false
  const h = clinicHour()
  return a < b ? (h >= a && h < b) : (h >= a || h < b)
}

// ─── Real Telegram wiring (long-polling on the persistent Node host) ─────────

const TG = (method) => `https://api.telegram.org/bot${config.telegramBotToken}/${method}`

async function tgSend(chatId, text, opts = {}) {
  if (config.notifyDryRun || !config.telegramBotToken) return
  await fetch(TG('sendMessage'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, ...opts }),
  }).catch((e) => console.error('[bot] send failed:', e.message))
}

async function tgAnswer(id, text) {
  if (config.notifyDryRun || !config.telegramBotToken) return
  await fetch(TG('answerCallbackQuery'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text: text || '' }),
  }).catch(() => {})
}

// Populate the Telegram "/" command menu (best-effort, idempotent).
async function tgSetCommands() {
  if (config.notifyDryRun || !config.telegramBotToken) return
  await fetch(TG('setMyCommands'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: [
      { command: 'start', description: 'Реєстрація / зміна ролі' },
      { command: 'my', description: 'Мої плани лікування' },
      { command: 'all', description: 'Статус усіх лікарів (головлікар)' },
      { command: 'help', description: 'Довідка по командах' },
    ] }),
  }).catch(() => {})
}

let realBot = null

// The live bot instance (or null when no token / not started) — lets the API
// routes push assignment DMs without importing the polling machinery.
export function getBot() { return realBot }

// Build the production bot instance, wiring DB + board + Telegram. `boardDeps`
// supplies getPatientName + listPlanCards (they need getBoard, kept out of this
// module to avoid a store↔bot import cycle).
export function initBot(boardDeps) {
  if (realBot) return realBot
  realBot = createBot({
    send: tgSend,
    answerCallback: tgAnswer,
    getPlanReview, addPlanSignoff, postponePlan, claimPlanNotification,
    getBotStaff, getBotStaffByRole, upsertBotStaff,
    getPatientStage, setStage,
    getPending: getBotState, setPending: setBotState, clearPending: clearBotState,
    getPatientName: boardDeps.getPatientName,
    listPlanCards: boardDeps.listPlanCards,
    emitEvent,
    readyRole: config.planReadyRole,
    issueRole: config.planIssueRole,
    isQuietHours: inQuietHours,
  })
  tgSetCommands() // populate the "/" command menu (best-effort)
  return realBot
}

// Register the Telegram webhook to point at this deployment. Called from the
// /api/telegram/setup route once after deploy (Vercel / any HTTPS host).
export async function setTelegramWebhook(url, secret) {
  if (!config.telegramBotToken) throw new Error('TELEGRAM_BOT_TOKEN not set')
  const body = { url, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }
  if (secret) body.secret_token = secret
  return await fetch(TG('setWebhook'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((x) => x.json())
}

// Called from server/index.js on a PERSISTENT host → long-polling. On Vercel
// (serverless) we use the webhook route instead, so polling is skipped there.
export function startBot(boardDeps) {
  if (!config.telegramBotToken) {
    console.log('[bot] TELEGRAM_BOT_TOKEN not set — Telegram bot disabled (in-app feed still works).')
    return null
  }
  const bot = initBot(boardDeps)
  if (config.telegramWebhook) {
    console.log('[bot] TELEGRAM_WEBHOOK=1 — using webhook mode, polling disabled on this host.')
    return bot
  }
  pollLoop(bot).catch((e) => console.error('[bot] poll loop crashed:', e.message))
  // Reminder sweep every 5 minutes.
  setInterval(() => bot.sweep().catch((e) => console.error('[bot] sweep failed:', e.message)), 5 * 60 * 1000)
  console.log('[bot] Telegram bot started (long-polling).')
  return bot
}

async function pollLoop(bot) {
  let offset = 0
  // Drop any backlog so we don't replay old updates on restart.
  try {
    const r = await fetch(TG('getUpdates') + '?offset=-1').then((x) => x.json())
    if (r.ok && r.result?.length) offset = r.result[r.result.length - 1].update_id + 1
  } catch { /* ignore */ }
  for (;;) {
    try {
      const res = await fetch(TG('getUpdates') + `?offset=${offset}&timeout=25`).then((x) => x.json())
      if (res.ok) {
        for (const u of res.result) {
          offset = u.update_id + 1
          await bot.handleUpdate(u)
        }
      } else {
        // Invalid/mock token → Telegram returns 401. Stop instead of hot-looping.
        if (res.error_code === 401) {
          console.warn('[bot] Telegram rejected the token (401) — bot stopped. Set a real TELEGRAM_BOT_TOKEN to enable it.')
          return
        }
        console.warn('[bot] getUpdates not ok:', res.description || res.error_code)
        await new Promise((r) => setTimeout(r, 3000))
      }
    } catch (e) {
      console.error('[bot] getUpdates error:', e.message)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}
