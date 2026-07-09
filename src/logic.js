// View-model builder. Patient data + admins + notifications + conversion come
// from the backend via `ctx`; funnel display config (STAGES/CHAIN) stays local.
// Selection and moves are keyed by patient id. All copy is Ukrainian.
import { STAGES, CHAIN } from './data.js'

const slaStyle = {
  ok:   { c: '#5b6b80', b: '#f1f4f8', bd: '#e4e9f0', bar: '#16a34a' },
  warn: { c: '#b45309', b: '#fff7ed', bd: '#fadcb4', bar: '#d97706' },
  over: { c: '#be123c', b: '#fff1f3', bd: '#fbcad3', bar: '#e11d48' },
}

const shadowBase = '0 2px 4px rgba(16,35,64,.04),0 16px 32px -22px rgba(16,35,64,.3)'

const attnStyle = {
  over: { bg: '#fff5f7', border: '#f1b0bf', shadow: '0 0 0 1.5px rgba(225,29,72,.18),0 16px 32px -16px rgba(225,29,72,.5)' },
  warn: { bg: '#fffaf1', border: '#eed3a3', shadow: '0 0 0 1.5px rgba(217,119,6,.16),0 14px 28px -18px rgba(217,119,6,.42)' },
}
// A patient sitting on a stage too long ("застряг") — amber highlight.
const stuckStyle = { bg: '#fff8ef', border: '#e7c893', shadow: '0 0 0 1.6px rgba(217,119,6,.24),0 16px 32px -16px rgba(217,119,6,.48)' }
// Visited the clinic but not advanced — blue highlight, top priority (actionable).
const followupStyle = { bg: '#eef4ff', border: '#9fc0f0', shadow: '0 0 0 1.6px rgba(37,99,235,.24),0 16px 32px -16px rgba(37,99,235,.45)' }
// Frozen — manually put on hold. Icy cyan highlight; overrides attention glows.
const frozenStyle = { bg: '#ecf8fb', border: '#a4d6e6', shadow: '0 0 0 1.6px rgba(8,145,178,.20),0 16px 32px -18px rgba(8,145,178,.4)' }

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997
  return h
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '')).toUpperCase()
}

export function computeView(state, props, setState, ctx) {
  const A = ctx.admins || {}
  const list = ctx.patients || []
  const moveStage = ctx.moveStage || (() => {})

  const S = {}
  STAGES.forEach((s) => { S[s.id] = s })
  const glow = props.glowAttention !== false
  const compact = props.compactCards === true

  const enrich = (p0) => {
    const p = p0
    const a = A[p.admin] || {}
    const st = S[p.stage] || {}
    const ss = slaStyle[p.slaState] || slaStyle.ok
    const at = attnStyle[p.slaState]
    const initials = initialsOf(p.name)
    const h = hash(p.name)
    // Real fill from the backend (elapsed vs stage norm). Fall back to the old
    // name-hash estimate only if the backend didn't send slaPct (e.g. old cache).
    const pct = typeof p.slaPct === 'number'
      ? p.slaPct
      : (p.slaState === 'over' ? 100 : p.slaState === 'warn' ? 62 + (h % 23) : p.sla === 'щойно' ? 4 : 12 + (h % 26))
    const isSel = state.selected === p.id
    const frozen = !!p.frozen
    const isStuck = !frozen && !!p.isStuck
    const needsFollowup = !frozen && !!p.needsFollowup
    // Between which stages the patient is stuck (current → next in the chain).
    const idx = CHAIN.indexOf(p.stage)
    const nextId = idx > -1 && idx < CHAIN.length - 1 ? CHAIN[idx + 1] : null
    const nextTitle = nextId ? S[nextId].title : ''
    const glowStyle = frozen ? frozenStyle : needsFollowup ? followupStyle : isStuck ? stuckStyle : at
    return Object.assign({}, p, {
      adminInitials: a.initials, adminName: a.name, adminColor: a.color,
      stageColor: st.color, stageTitle: st.title, stageTint: st.tint, stageNorm: st.norm,
      slaColor: ss.c, slaBg: ss.b, slaBorder: ss.bd,
      // Visit-based "Орієнтир" bar is blue; norm-based bar keeps its state colour.
      slaBarColor: p.slaByVisit ? '#2563eb' : ss.bar,
      slaPct: pct, slaPctW: pct + '%',
      initials,
      hasSla: p.sla !== '—' && p.stage !== 'done' && p.stage !== 'lost',
      showDoctor: !!p.doctor && !compact, showVisit: !!p.visit && !compact, showNote: !!p.note && !compact,
      isOver: p.slaState === 'over', isWarn: p.slaState === 'warn',
      // KT overdue-by-visit shows the day count in the "ПРОСТРОЧЕНО" badge.
      overBadge: p.slaByVisit && p.overdueDays > 0 ? `ПРОСТРОЧЕНО · ${p.overdueDays} дн` : 'ПРОСТРОЧЕНО',
      isStuck, nextTitle, stuckBetween: nextTitle ? `${st.title} → ${nextTitle}` : st.title,
      needsFollowup,
      frozen,
      toggleFrozen: () => { ctx.toggleFrozen && ctx.toggleFrozen(p.id, !frozen) },
      dismissFollowup: () => { ctx.dismissFollowup && ctx.dismissFollowup(p.id, p.followupVisitAt) },
      isSelected: isSel,
      cardBg: glowStyle && glow ? glowStyle.bg : '#ffffff',
      cardBorder: isSel ? '#7fa6e0' : (glowStyle ? glowStyle.border : '#e6ecf3'),
      cardShadow: isSel ? '0 0 0 2.5px rgba(37,99,235,.25),0 18px 36px -20px rgba(16,35,64,.4)' : (glowStyle && glow ? glowStyle.shadow : shadowBase),
      select: () => { setState({ selected: p.id, feedOpen: false }) },
    })
  }

  const enriched = list.map(enrich)

  const tab = state.tab
  const q = (state.query || '').trim().toLowerCase()
  const qd = q.replace(/[^0-9]/g, '')
  const visible = enriched.filter((p) => {
    if (tab === 'hot' && !p.hot) return false
    if (tab === 'attention' && !(p.isStuck || p.needsFollowup || p.visitOverdue)) return false
    if (state.curatorFilter && p.admin !== state.curatorFilter) return false
    if (q) {
      const nameHit = p.name.toLowerCase().indexOf(q) > -1
      const phoneHit = qd.length > 1 && (p.phone || '').replace(/[^0-9]/g, '').indexOf(qd) > -1
      if (!nameHit && !phoneHit) return false
    }
    return true
  })

  // Sort: frozen cards always sink to the bottom; above them, visited-not-
  // advanced first (actionable), then stuck, SLA, hot, rest.
  const rank = (p) => (p.needsFollowup ? 0 : p.isStuck ? 1 : p.isOver ? 2 : p.isWarn ? 3 : p.hot ? 4 : 5)
  const collapsed = state.collapsed

  const columns = STAGES.map((s) => {
    const ps = visible
      .filter((p) => p.stage === s.id)
      .slice()
      .sort((a, b) => (a.frozen === b.frozen ? rank(a) - rank(b) : a.frozen ? 1 : -1))
    const stuck = ps.filter((p) => p.isStuck || p.needsFollowup || p.visitOverdue).length
    const isCol = !!collapsed[s.id]
    return Object.assign({}, s, {
      patients: ps, count: ps.length,
      attnCount: String(stuck), hasAttn: stuck > 0,
      isCollapsed: isCol, isOpen: !isCol,
      isEmpty: ps.length === 0,
      width: isCol ? '52px' : '256px',
      toggle: () => {
        const next = Object.assign({}, state.collapsed)
        if (next[s.id]) delete next[s.id]; else next[s.id] = true
        setState({ collapsed: next })
      },
    })
  })

  const active = enriched.filter((p) => p.stage !== 'done' && p.stage !== 'lost')
  const today = enriched.filter((p) => (p.visit || '').indexOf('Сьогодні') > -1).length
  const hotCount = enriched.filter((p) => p.hot).length
  const stuckCount = enriched.filter((p) => p.isStuck || p.needsFollowup || p.visitOverdue).length

  const stats = [
    { iconHref: 'ic-users',    value: String(active.length), label: 'в роботі',       color: '#2563eb', bg: '#eef4ff' },
    { iconHref: 'ic-flame',    value: String(hotCount),      label: 'гарячих',        color: '#ea580c', bg: '#fff2e4' },
    { iconHref: 'ic-calendar', value: String(today),         label: 'візитів сьогодні', color: '#0d9488', bg: '#e7fbf5' },
  ]

  // Workload per curator → compact "Куратор ▾" select. Counts are clinic-wide.
  const countByAdmin = {}
  active.forEach((p) => { countByAdmin[p.admin] = (countByAdmin[p.admin] || 0) + 1 })
  const workloadAll = Object.keys(A)
    .map((k) => {
      const a = A[k]
      return {
        key: k, initials: a.initials, name: a.name, color: a.color,
        count: countByAdmin[k] || 0,
        isNone: k === '_none',
        active: state.curatorFilter === k,
        onClick: () => setState({ curatorFilter: state.curatorFilter === k ? null : k, workloadOpen: false }),
      }
    })
    .sort((a, b) => (a.isNone ? 1 : 0) - (b.isNone ? 1 : 0) || b.count - a.count)

  const mkTab = (id, label, count) => {
    const on = tab === id
    return {
      id, label, count: count || 0,
      bg: on ? '#ffffff' : 'transparent',
      color: on ? '#13294a' : 'rgba(255,255,255,.78)',
      fw: on ? '600' : '500',
      onClick: () => { setState({ tab: id }) },
    }
  }
  const tabs = [
    mkTab('all', 'Всі заявки'),
    mkTab('hot', 'Гарячі', hotCount),
    mkTab('attention', 'Потребують уваги', stuckCount),
  ]

  const nMeta = {
    new:  { iconHref: 'ic-plus',  color: '#2563eb', bg: '#eef4ff' },
    move: { iconHref: 'ic-sync',  color: '#7c3aed', bg: '#f4f0ff' },
    call: { iconHref: 'ic-phone', color: '#0891b2', bg: '#e8faff' },
    done: { iconHref: 'ic-check', color: '#16a34a', bg: '#eafaf0' },
  }
  const notifications = (ctx.notifications || []).map((n) => {
    const m = nMeta[n.type] || nMeta.move
    const metaParts = [n.sub, n.time ? n.time + ' тому' : ''].filter(Boolean)
    return Object.assign({}, n, m, { meta: metaParts.join(' · ') })
  })
  const feedCount = notifications.length

  const initialFeed = props.showFeed === true
  const feedOpen = (state.feedOpen === undefined ? initialFeed : state.feedOpen) && !state.selected

  let sel = null
  const found = enriched.filter((p) => p.id === state.selected)[0]
  if (found) {
    const chain = CHAIN
    const idx = chain.indexOf(found.stage)
    const isBranch = found.stage === 'lost'
    const passedIds = isBranch ? ['consult_scheduled', 'consult_done'] : chain.slice(0, Math.max(idx, 0))
    const times = ['12 дн тому', '9 дн тому', '6 дн тому', '4 дн тому', '2 дн тому', 'вчора']
    const justMoved = found.sla === 'щойно'
    const timeline = []
    passedIds.forEach((id, i) => {
      timeline.push({
        title: S[id].title, isDone: true, isCurrent: false, isFuture: false,
        dotBg: '#eafaf0', dotColor: '#16a34a', dotAnim: 'none', titleColor: '#3c4d66',
        time: times[Math.max(times.length - passedIds.length + i, 0)],
        mark: i % 2 === 0 ? 'з CRM' : 'вручну', hasMark: true,
        markBg: i % 2 === 0 ? '#eef4ff' : '#f1f4f8', markColor: i % 2 === 0 ? '#2563eb' : '#6b7a8d',
        showLine: true,
      })
    })
    // "Manual" if this stage was set on the board (moved by us), else "з CRM".
    const manual = justMoved || found.movedByUs
    timeline.push({
      title: found.stageTitle, isDone: false, isCurrent: true, isFuture: false,
      dotBg: found.stageTint, dotColor: found.stageColor, dotAnim: 'ccdot 2.2s infinite', titleColor: '#101d31',
      time: justMoved ? 'переміщено щойно' : 'на етапі ' + (found.sla === '—' ? 'зараз' : found.sla),
      mark: manual ? 'вручну' : (found.synced ? 'з CRM' : ''), hasMark: manual || found.synced,
      markBg: manual ? '#f1f4f8' : '#eef4ff', markColor: manual ? '#6b7a8d' : '#2563eb',
      showLine: false,
    })
    let nextId = null
    if (isBranch) nextId = 'consult_scheduled'
    else if (idx > -1 && idx < chain.length - 1) nextId = chain[idx + 1]
    if (nextId) {
      timeline[timeline.length - 1].showLine = true
      timeline.push({
        title: S[nextId].title, isDone: false, isCurrent: false, isFuture: true,
        dotBg: '#f1f4f8', dotColor: '#b6c1cf', dotAnim: 'none', titleColor: '#9aa6b6',
        time: 'наступний етап', mark: '', hasMark: false, showLine: false,
      })
    }
    const infoRows = [
      found.comment
        ? { iconHref: 'ic-comment', label: 'Коментар', value: found.comment, wrap: true }
        : { iconHref: 'ic-users',   label: 'Послуга',  value: found.service },
      { iconHref: 'ic-user',     label: 'Лікар',   value: found.doctor },
      { iconHref: 'ic-calendar', label: 'Візит',   value: found.visit },
      { iconHref: 'ic-phone',    label: 'Нотатка', value: found.note },
    ].filter((r) => !!r.value)
    sel = Object.assign({}, found, {
      timeline,
      infoRows,
      hasNext: !!nextId,
      nextLabel: isBranch ? 'Повернути в роботу' : 'Перемістити: ' + (nextId ? S[nextId].title : ''),
      // KT with a visit date: no reaction norm — the SLA is the visit itself.
      slaLabel: found.slaByVisit
        ? (found.visitOverdue ? 'Прострочення візиту' : 'До візиту')
        : 'На етапі без дії',
      // Frozen with an Орієнтир (visit date) → still show it. Frozen without one
      // → drop the reaction norm entirely (it's paused while on hold).
      slaNorm: found.slaByVisit
        ? (found.visitOverdue ? 'Орієнтир — призначена дата візиту (прострочено)' : 'Орієнтир — призначена дата візиту')
        : found.frozen
          ? 'Норматив на паузі — заморожено'
          : (found.stageNorm ? 'Норматив реакції на етапі: ' + found.stageNorm : 'Етап без нормативу реакції'),
      slaBlockBg: found.isStuck ? '#fff8ef' : found.isOver ? '#fff8f9' : found.isWarn ? '#fffdf6' : '#fbfcfe',
      slaTextColor: found.isOver ? '#be123c' : found.isWarn ? '#b45309' : '#22334c',
      moveNext: () => { if (nextId) moveStage(found.id, nextId) },
    })
  }

  const filterKey = [tab, q, state.curatorFilter || ''].join('|')

  return {
    columns, stats, tabs,
    // Admin auth + drag-and-drop move (arbitrary column). Only admins can move.
    isAdmin: !!ctx.isAdmin,
    openLogin: ctx.openLogin || (() => {}),
    logout: ctx.logout || (() => {}),
    moveTo: (id, stage) => moveStage(id, stage),
    workloadAll,
    workloadOpen: !!state.workloadOpen,
    toggleWorkload: () => setState({ workloadOpen: !state.workloadOpen }),
    closeWorkload: () => setState({ workloadOpen: false }),
    curatorFilter: state.curatorFilter || null,
    curatorFilterName: state.curatorFilter ? (A[state.curatorFilter]?.name || '') : '',
    clearCurator: () => setState({ curatorFilter: null }),
    conversion: ctx.conversion || null,
    filterKey,
    notifications, feedCount,
    query: state.query,
    onQuery: (e) => { setState({ query: e.target.value }) },
    toggleFeed: () => {
      const cur = (state.feedOpen === undefined ? initialFeed : state.feedOpen) && !state.selected
      setState({ feedOpen: !cur, selected: null })
    },
    closeFeed: () => { setState({ feedOpen: false }) },
    closePanel: () => { setState({ selected: null }) },
    feedOpen,
    hasSel: !!sel,
    sel: sel || {},
  }
}
