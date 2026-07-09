import { config, isLive } from './config.js'
import { fetchClinicSnapshot } from './clinicCards.js'
import { buildLive, assemble } from './mapper.js'
import { buildMock } from './mockData.js'
import { getAllPositions, ensureMissingPositions, getConversionStats, getCache, setCache } from './db.js'

// Caching, serverless-safe:
//  1. In-memory snapshot — instant on warm lambda instances.
//  2. Turso `cache` table — survives cold starts and is shared across instances,
//     so a fresh Clinic Cards pull happens at most once per TTL regardless of how
//     many lambdas spin up (keeps us well under the 60 req/min CC limit).
//  3. Board positions are read fresh from the DB every request and merged.
const SNAP_KEY = 'cc_snapshot'
let mem = null // { seeds, rawNotifs, updatedAt, source, at }
let inflight = null

const fresh = (s) => s && Date.now() - s.at < config.cacheTtlMs

async function pullFromClinicCards() {
  if (!isLive) {
    const { seeds, rawNotifs } = buildMock()
    return { seeds, rawNotifs, updatedAt: new Date().toISOString(), source: 'mock', at: Date.now() }
  }
  const snap = await fetchClinicSnapshot()
  const { seeds, rawNotifs } = buildLive(snap)
  return { seeds, rawNotifs, updatedAt: new Date().toISOString(), source: 'live', at: Date.now() }
}

async function readDiskCache() {
  try {
    const row = await getCache(SNAP_KEY)
    if (!row) return null
    const s = JSON.parse(row.value)
    s.at = Date.parse(row.fetched_at)
    return s
  } catch {
    return null
  }
}

async function refresh() {
  if (inflight) return inflight
  inflight = (async () => {
    const s = await pullFromClinicCards()
    mem = s
    try {
      await setCache(SNAP_KEY, JSON.stringify({ seeds: s.seeds, rawNotifs: s.rawNotifs, updatedAt: s.updatedAt, source: s.source }), s.updatedAt)
    } catch {
      /* cache write is best-effort */
    }
    return s
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

async function getSnapshot(force = false) {
  if (!force && fresh(mem)) return mem
  if (!force) {
    const disk = await readDiskCache()
    if (fresh(disk)) {
      mem = disk
      return disk
    }
  }
  try {
    return await refresh()
  } catch (e) {
    // Serve the freshest thing we have, flagged with the error.
    const stale = mem || (await readDiskCache())
    if (stale) return { ...stale, error: e.message }
    return { seeds: [], rawNotifs: [], updatedAt: new Date().toISOString(), source: isLive ? 'live' : 'mock', error: e.message, at: Date.now() }
  }
}

export async function getBoard(force = false) {
  const snap = await getSnapshot(force)
  const known = await getAllPositions()
  const inserted = await ensureMissingPositions(snap.seeds, known)
  const positions = inserted ? await getAllPositions() : known
  const conversion = await getConversionStats()
  return assemble(snap.seeds, snap.rawNotifs, {
    positions,
    conversion,
    updatedAt: snap.updatedAt,
    source: snap.source,
    error: snap.error || null,
  })
}
