import { config, isLive } from './config.js'
import { fetchClinicSnapshot } from './clinicCards.js'
import { buildLive, buildDirectory, assemble } from './mapper.js'
import { buildMock } from './mockData.js'
import { getAllPositions, ensureMissingPositions, getConversionStats, getCache, setCache } from './db.js'
import { recentEvents } from './notify.js'

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

// `directory` is 100% derivable from seeds + closedSeeds — buildDirectory()
// (server/mapper.js) is the single place that shape is ever built, called
// here on BOTH the fresh-pull path and the disk-cache path below. That is
// what guarantees a warm-memory snapshot and one rebuilt after a cold start
// are byte-identical (same content, same order): neither buildLive nor
// buildMock builds a directory of its own to (potentially) disagree with.
// It also means the disk cache row itself never carries the field — at
// ~5000 patients that would roughly double the row's size (~3.75MB), parsed
// on every cold-lambda request for no reason.
async function pullFromClinicCards() {
  if (!isLive) {
    const { seeds, closedSeeds, rawNotifs } = buildMock()
    const directory = buildDirectory(seeds, closedSeeds)
    return { seeds, closedSeeds, directory, rawNotifs, updatedAt: new Date().toISOString(), source: 'mock', at: Date.now() }
  }
  const snap = await fetchClinicSnapshot()
  const { seeds, closedSeeds, rawNotifs } = buildLive(snap)
  const directory = buildDirectory(seeds, closedSeeds)
  return { seeds, closedSeeds, directory, rawNotifs, updatedAt: new Date().toISOString(), source: 'live', at: Date.now() }
}

async function readDiskCache() {
  try {
    const row = await getCache(SNAP_KEY)
    if (!row) return null
    const s = JSON.parse(row.value)
    // Guard against rows written before closedSeeds existed: without this, the
    // first request after deploy would throw on an undefined `.filter`.
    s.seeds = s.seeds || []
    s.closedSeeds = s.closedSeeds || []
    // `directory` is never stored (see the comment above) — rebuild it here,
    // via the same buildDirectory() call the fresh-pull path uses. This also
    // covers old rows that happen to still carry a stored one: it is ignored
    // and rebuilt the same way, so behaviour is identical either way.
    s.directory = buildDirectory(s.seeds, s.closedSeeds)
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
      await setCache(SNAP_KEY, JSON.stringify({
        seeds: s.seeds, closedSeeds: s.closedSeeds,
        rawNotifs: s.rawNotifs, updatedAt: s.updatedAt, source: s.source,
      }), s.updatedAt)
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
    return { seeds: [], closedSeeds: [], directory: [], rawNotifs: [], updatedAt: new Date().toISOString(), source: isLive ? 'live' : 'mock', error: e.message, at: Date.now() }
  }
}

// Synthetic test card (not from Clinic Cards) so the Telegram bot flow can be
// exercised end-to-end: it lands in «Очікує план» with no responsibles, ready
// to assign. Disable by setting TEST_CARD=off.
const mkTestSeed = (n) => ({
  id: `test-plan-${n}`,
  name: `Тест Пацієнт ${n} (бот)`,
  phone: '+380 99 123-45-67',
  service: 'Тестовий план лікування',
  comment: `Тестова картка ${n} — перевірка бота`,
  dueVisitAt: null,
  dueVisitNote: '',
  doctor: '',
  visit: '',
  visitAt: null,
  note: 'Тестова картка',
  hot: false,
  synced: false,
  admin: { key: '_none', initials: '—', name: 'Не призначено', color: '#94a3b8' },
  defaultStage: 'plan_wait',
  createdAt: null,
  slaOverride: null,
})
const TEST_SEEDS = [mkTestSeed(1), mkTestSeed(2), mkTestSeed(3)]
// Off by default — set TEST_CARD=1 (or true/on) to inject the test cards.
const TEST_CARDS_ON = ['1', 'true', 'on', 'yes'].includes(String(process.env.TEST_CARD).toLowerCase())
const withTestSeeds = (seeds) => (TEST_CARDS_ON ? [...TEST_SEEDS, ...seeds] : seeds)

export async function getBoard(force = false) {
  const snap = await getSnapshot(force)
  const seeds = withTestSeeds(snap.seeds)
  const known = await getAllPositions()
  const inserted = await ensureMissingPositions(seeds, known)
  const positions = inserted ? await getAllPositions() : known
  // Closed patients an admin pulled back onto the board by hand. They are not in
  // `seeds` (buildLive keeps them apart) and deliberately never reach
  // ensureMissingPositions — only the ones already flagged are merged back in.
  const manualClosed = (snap.closedSeeds || []).filter((s) => positions.get(String(s.id))?.manual)
  const allSeeds = manualClosed.length ? [...seeds, ...manualClosed] : seeds
  const conversion = await getConversionStats()
  // Live workflow events (plan assigned / signed off / postponed / overdue)
  // ride at the top of the feed, ahead of the CRM import notifications.
  const events = recentEvents()
  const notifs = [...events, ...(snap.rawNotifs || [])].slice(0, 12)
  return assemble(allSeeds, notifs, {
    positions,
    conversion,
    updatedAt: snap.updatedAt,
    source: snap.source,
    error: snap.error || null,
  })
}

// Compact { id, name, phone, closed } for every Clinic Cards patient — the
// source for the manual-add search. Served from the same cached snapshot as the
// board, so a search costs no extra CRM calls.
export async function getDirectory() {
  const snap = await getSnapshot(false)
  return snap.directory || []
}
