import { config, isLive } from './config.js'
import { fetchClinicSnapshot } from './clinicCards.js'
import { buildLive, assemble } from './mapper.js'
import { buildMock } from './mockData.js'
import { getAllPositions, getPositionsVersion, ensureMissingPositions, getConversionStats } from './db.js'

// Caching strategy (keeps load off the rate-limited Clinic Cards API):
//  1. The raw Clinic Cards pull is cached in memory for `cacheTtlMs`.
//  2. Stale-while-revalidate: once cached, requests NEVER block on Clinic Cards
//     again — a stale cache is served immediately and refreshed in the
//     background. So CC is hit at most once per TTL regardless of how many
//     browser clients poll.
//  3. The assembled board (mapped patients + merged positions) is memoized and
//     only rebuilt when the snapshot or a board position actually changes.

let snapshot = null // { seeds, rawNotifs, updatedAt, source, error, _at }
let inflight = null
let assembled = null // { board, snapAt, posVersion }

async function build() {
  if (!isLive) {
    const { seeds, rawNotifs } = buildMock()
    return { seeds, rawNotifs, updatedAt: new Date().toISOString(), source: 'mock', error: null, _at: Date.now() }
  }
  try {
    const snap = await fetchClinicSnapshot()
    const { seeds, rawNotifs } = buildLive(snap)
    return { seeds, rawNotifs, updatedAt: new Date().toISOString(), source: 'live', error: null, _at: Date.now() }
  } catch (e) {
    console.error('[board] Clinic Cards pull failed:', e.message)
    // Keep serving the last good snapshot, but surface the error.
    if (snapshot) return { ...snapshot, error: e.message, _at: snapshot._at }
    return { seeds: [], rawNotifs: [], updatedAt: new Date().toISOString(), source: 'live', error: e.message, _at: Date.now() }
  }
}

function refresh() {
  if (inflight) return inflight
  inflight = build()
    .then((c) => { snapshot = c; return c })
    .finally(() => { inflight = null })
  return inflight
}

async function pull(force = false) {
  if (!snapshot || force) return refresh()
  const age = Date.now() - snapshot._at
  // Stale but usable: serve it now, revalidate in the background.
  if (age >= config.cacheTtlMs && isLive) refresh().catch(() => {})
  return snapshot
}

export async function getBoard(force = false) {
  const snap = await pull(force)

  // Fast path: nothing changed since we last assembled — no DB read at all.
  const posVersion = getPositionsVersion()
  if (assembled && assembled.snapAt === snap._at && assembled.posVersion === posVersion && !snap.error) {
    return assembled.board
  }

  // Persist first-seen patients (bulk, one transaction) before assembling.
  const known = getAllPositions()
  ensureMissingPositions(snap.seeds, known)
  const posVersion2 = getPositionsVersion()
  const positions = posVersion2 === posVersion ? known : getAllPositions()

  const board = assemble(snap.seeds, snap.rawNotifs, {
    positions,
    conversion: getConversionStats(),
    updatedAt: snap.updatedAt,
    source: snap.source,
    error: snap.error,
  })
  assembled = { board, snapAt: snap._at, posVersion: posVersion2 }
  return board
}
