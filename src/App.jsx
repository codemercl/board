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
import UsersAdmin from './components/UsersAdmin.jsx'
import LoginScreen from './components/LoginScreen.jsx'

// UI-only state (data lives in `board`).
const INITIAL_STATE = {
  feedOpen: undefined,
  tab: 'all',
  query: '',
  selected: null,
  collapsed: { lost: true },
  curatorFilter: null,
  workloadOpen: false,
  screen: 'board', // 'board' | 'users'
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

  // Auth: the whole app is gated behind login. `me` is the signed-in user
  // profile (role, visible columns, canMove, manageUsers). A signed token in
  // localStorage restores the session; the server re-checks permissions.
  const [me, setMe] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [loginState, setLoginState] = useState({ busy: false, error: null })
  const [helpOpen, setHelpOpen] = useState(false)

  const doLogout = useCallback(() => {
    api.logout()
    setMe(null)
    setState({ screen: 'board', selected: null })
  }, [])
  const submitLogin = useCallback(async (user, password) => {
    setLoginState({ busy: true, error: null })
    try {
      const user_ = await api.login(user, password)
      if (!mounted.current) return
      setMe(user_)
      setLoginState({ busy: false, error: null })
    } catch (e) {
      if (mounted.current) setLoginState({ busy: false, error: e.message })
    }
  }, [])

  // Restore a session from the stored token on first mount.
  useEffect(() => {
    mounted.current = true
    if (!api.getToken()) { setAuthReady(true); return }
    api.me()
      .then((u) => { if (mounted.current) setMe(u) })
      .catch(() => { api.logout() })
      .finally(() => { if (mounted.current) setAuthReady(true) })
    return () => { mounted.current = false }
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

  // Initial load + background polling — only once authenticated.
  useEffect(() => {
    if (!me) return undefined
    load(false)
    const t = setInterval(() => load(false), POLL_MS)
    return () => clearInterval(t)
  }, [load, me])

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

  // Plan-review actions all return the full reconciled board (like moveStage).
  const applyBoard = useCallback((data) => {
    if (!mounted.current) return
    setBoard(data)
    setError(data.error || null)
  }, [])

  const setPlanResponsibles = useCallback(async (id, responsibles, name) => {
    try { applyBoard(await api.setPlanResponsibles(id, responsibles, name)) }
    catch (e) { if (mounted.current) setError(e.message); throw e }
  }, [applyBoard])

  const planSignoff = useCallback(async (id, payload) => {
    try { applyBoard(await api.planSignoff(id, payload)) }
    catch (e) { if (mounted.current) setError(e.message); throw e }
  }, [applyBoard])

  const planPostpone = useCallback(async (id, payload) => {
    try { applyBoard(await api.planPostpone(id, payload)) }
    catch (e) { if (mounted.current) setError(e.message); throw e }
  }, [applyBoard])

  const view = computeView(state, DEFAULT_PROPS, setState, {
    patients: board.patients,
    admins: board.admins,
    notifications: board.notifications,
    conversion: board.conversion,
    moveStage,
    dismissFollowup,
    toggleFrozen,
    setPlanResponsibles,
    planSignoff,
    planPostpone,
    isAdmin: !!(me && me.canMove),
    allowedStages: me ? me.stages : null,
    me,
    manageUsers: !!(me && me.manageUsers),
    screen: state.screen,
    openUsers: () => setState({ screen: 'users', selected: null }),
    openBoard: () => setState({ screen: 'board' }),
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

  // Auth gate: nothing renders until we know who (if anyone) is signed in.
  if (!authReady) {
    return (
      <>
        <IconDefs />
        <div style={css('height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f6f9')}>
          <span style={css('font-size:13px;color:#7c8aa0;font-weight:600')}>Завантаження…</span>
        </div>
      </>
    )
  }
  if (!me) {
    return (
      <>
        <IconDefs />
        <LoginScreen busy={loginState.busy} error={loginState.error} onSubmit={submitLogin} />
      </>
    )
  }

  const onUsers = view.screen === 'users' && view.manageUsers

  return (
    <>
      <IconDefs />
      <div style={css('position:relative;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:#f4f6f9')}>
        <Header view={view} sync={sync} onHelp={() => setHelpOpen(true)} />
        {!onUsers && <PulseBar view={view} />}

        {onUsers ? (
          <UsersAdmin view={view} />
        ) : (
          <div data-screen-label="Канбан-борд" style={css('flex:1;min-height:0;position:relative')}>
            <Board view={view} />
            {view.hasSel && <PatientPanel view={view} />}
            {view.feedOpen && <CrmFeed view={view} />}
            {loading && board.patients.length === 0 && <LoadingOverlay />}
          </div>
        )}
      </div>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </>
  )
}

function LoadingOverlay() {
  return (
    <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(244,246,249,.6);z-index:5')}>
      <span style={css("font-size:13px;color:#7c8aa0;font-weight:600")}>Завантаження пацієнтів…</span>
    </div>
  )
}
