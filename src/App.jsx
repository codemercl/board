import { useCallback, useEffect, useRef, useState } from 'react'
import { css } from './css.js'
import { IconDefs } from './icons.jsx'
import { DEFAULT_PROPS, POLL_MS } from './data.js'
import { computeView } from './logic.js'
import * as api from './api.js'
import Header from './components/Header.jsx'
import PulseBar from './components/PulseBar.jsx'
import Board from './components/Board.jsx'
import PatientPanel from './components/PatientPanel.jsx'
import CrmFeed from './components/CrmFeed.jsx'
import HelpModal from './components/HelpModal.jsx'

// UI-only state (data lives in `board`).
const INITIAL_STATE = {
  feedOpen: undefined,
  tab: 'all',
  query: '',
  selected: null,
  collapsed: { lost: true },
  curatorFilter: null,
  workloadOpen: false,
}

const EMPTY_BOARD = { patients: [], admins: {}, notifications: [], updatedAt: null, source: null, error: null }

export default function App() {
  const [state, setStateRaw] = useState(INITIAL_STATE)
  const setState = (patch) => setStateRaw((s) => ({ ...s, ...patch }))

  const [board, setBoard] = useState(EMPTY_BOARD)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const mounted = useRef(true)

  // Admin auth: token in localStorage gates card moves (DnD + panel button).
  const [isAdmin, setIsAdmin] = useState(() => !!api.getToken())
  const [auth, setAuth] = useState({ open: false, error: null, busy: false })
  const [helpOpen, setHelpOpen] = useState(false)

  const openLogin = useCallback(() => setAuth({ open: true, error: null, busy: false }), [])
  const closeLogin = useCallback(() => setAuth((a) => ({ ...a, open: false })), [])
  const doLogout = useCallback(() => { api.logout(); setIsAdmin(false) }, [])
  const submitLogin = useCallback(async (user, password) => {
    setAuth((a) => ({ ...a, busy: true, error: null }))
    try {
      await api.login(user, password)
      if (!mounted.current) return
      setIsAdmin(true)
      setAuth({ open: false, error: null, busy: false })
    } catch (e) {
      if (mounted.current) setAuth((a) => ({ ...a, busy: false, error: e.message }))
    }
  }, [])

  const load = useCallback(async (force) => {
    try {
      const data = await api.fetchBoard(force)
      if (!mounted.current) return
      setBoard(data)
      setError(data.error || null)
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  // Initial load + background polling.
  useEffect(() => {
    mounted.current = true
    load(false)
    const t = setInterval(() => load(false), POLL_MS)
    return () => {
      mounted.current = false
      clearInterval(t)
    }
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load(true)
    if (mounted.current) setRefreshing(false)
  }, [load])

  // Move a patient to a new stage: optimistic update, then persist + reconcile.
  const moveStage = useCallback(async (id, stage) => {
    setBoard((b) => ({
      ...b,
      patients: b.patients.map((p) => (p.id === id ? { ...p, stage, sla: 'только что', slaState: 'ok' } : p)),
    }))
    try {
      const data = await api.moveStage(id, stage)
      if (mounted.current) {
        setBoard(data)
        setError(data.error || null)
      }
    } catch (e) {
      if (mounted.current) setError(e.message)
      load(false) // revert to server truth
    }
  }, [load])

  // Freeze / unfreeze a patient: optimistic flip, then persist + reconcile.
  const toggleFrozen = useCallback(async (id, frozen) => {
    setBoard((b) => ({
      ...b,
      patients: b.patients.map((p) => (p.id === id ? { ...p, frozen, isStuck: frozen ? false : p.isStuck, needsFollowup: frozen ? false : p.needsFollowup } : p)),
    }))
    try {
      const data = await api.setFrozen(id, frozen)
      if (mounted.current) {
        setBoard(data)
        setError(data.error || null)
      }
    } catch (e) {
      if (mounted.current) setError(e.message)
      load(false)
    }
  }, [load])

  // Dismiss the "visited — move me" reminder: optimistic hide, then persist.
  const dismissFollowup = useCallback(async (id, visitAt) => {
    setBoard((b) => ({
      ...b,
      patients: b.patients.map((p) => (p.id === id ? { ...p, needsFollowup: false } : p)),
    }))
    try {
      const data = await api.dismissFollowup(id, visitAt)
      if (mounted.current) setBoard(data)
    } catch (e) {
      if (mounted.current) setError(e.message)
      load(false)
    }
  }, [load])

  const view = computeView(state, DEFAULT_PROPS, setState, {
    patients: board.patients,
    admins: board.admins,
    notifications: board.notifications,
    conversion: board.conversion,
    moveStage,
    dismissFollowup,
    toggleFrozen,
    isAdmin,
    openLogin,
    logout: doLogout,
  })

  const sync = {
    updatedAt: board.updatedAt,
    source: board.source,
    error,
    loading,
    refreshing,
    onRefresh,
  }

  return (
    <>
      <IconDefs />
      <div style={css('position:relative;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:#f4f6f9')}>
        <Header view={view} sync={sync} onHelp={() => setHelpOpen(true)} />
        <PulseBar view={view} />

        <div data-screen-label="Канбан-борд" style={css('flex:1;min-height:0;position:relative')}>
          <Board view={view} />
          {view.hasSel && <PatientPanel view={view} />}
          {view.feedOpen && <CrmFeed view={view} />}
          {loading && board.patients.length === 0 && <LoadingOverlay />}
        </div>
      </div>
      {auth.open && (
        <LoginModal busy={auth.busy} error={auth.error} onSubmit={submitLogin} onClose={closeLogin} />
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </>
  )
}

function LoginModal({ busy, error, onSubmit, onClose }) {
  const [user, setUser] = useState('admin')
  const [password, setPassword] = useState('')
  const submit = (e) => { e.preventDefault(); if (!busy) onSubmit(user, password) }

  return (
    <div
      onMouseDown={onClose}
      style={css('position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(11,23,40,.55);backdrop-filter:blur(3px)')}
    >
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        style={css('width:340px;background:#fff;border-radius:18px;box-shadow:0 40px 80px -30px rgba(16,35,64,.6);padding:24px;display:flex;flex-direction:column;gap:16px')}
      >
        <div style={css('display:flex;flex-direction:column;gap:5px')}>
          <span style={css('font-size:17px;font-weight:700;color:#101d31;letter-spacing:-.015em')}>Вхід адміністратора</span>
          <span style={css('font-size:12px;color:#8a97a8')}>Переміщення карток доступне лише адміністратору</span>
        </div>

        <label style={css('display:flex;flex-direction:column;gap:6px')}>
          <span style={css('font-size:11.5px;font-weight:600;color:#56667c')}>Логін</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoFocus
            style={css("height:40px;padding:0 12px;border:1px solid #e2e9f2;border-radius:11px;font-family:'Onest',sans-serif;font-size:13.5px;color:#22334c;outline:none")}
          />
        </label>
        <label style={css('display:flex;flex-direction:column;gap:6px')}>
          <span style={css('font-size:11.5px;font-weight:600;color:#56667c')}>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="admin"
            style={css("height:40px;padding:0 12px;border:1px solid #e2e9f2;border-radius:11px;font-family:'Onest',sans-serif;font-size:13.5px;color:#22334c;outline:none")}
          />
        </label>

        {error && (
          <div style={css('font-size:12px;color:#be123c;background:#fff1f3;border:1px solid #fbcad3;border-radius:9px;padding:8px 11px')}>{error}</div>
        )}

        <div style={css('display:flex;gap:9px;margin-top:2px')}>
          <button
            type="button"
            onClick={onClose}
            style={css("flex:none;padding:0 16px;height:42px;border:1px solid #e2e9f2;border-radius:12px;background:#fff;color:#56667c;font-family:'Onest',sans-serif;font-size:13px;font-weight:600;cursor:pointer")}
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={busy}
            style={css("flex:1;height:42px;border:none;border-radius:12px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;font-family:'Onest',sans-serif;font-size:13px;font-weight:600;cursor:pointer;opacity:1")}
          >
            {busy ? 'Вхід…' : 'Увійти'}
          </button>
        </div>
      </form>
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(244,246,249,.6);z-index:5')}>
      <span style={css("font-size:13px;color:#7c8aa0;font-weight:600")}>Завантаження пацієнтів…</span>
    </div>
  )
}
