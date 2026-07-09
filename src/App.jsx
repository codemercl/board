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
        <Header view={view} sync={sync} />
        <PulseBar view={view} />

        <div data-screen-label="Канбан-борд" style={css('flex:1;min-height:0;position:relative')}>
          <Board view={view} />
          {view.hasSel && <PatientPanel view={view} />}
          {view.feedOpen && <CrmFeed view={view} />}
          {loading && board.patients.length === 0 && <LoadingOverlay />}
        </div>
      </div>
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
