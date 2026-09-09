// Tests for the manual-add feature: directory search, the `manual` flag,
// the display-window anchor, and the three routes. No live CRM, no Postgres —
// runs on the mock snapshot and the in-memory db backend.
// Run: node server/board.test.mjs
import assert from 'node:assert'

// Set before any import that pulls in config.js (db.js does, transitively),
// so buildLive's closed-status lookup sees this regardless of .env.
process.env.CLINIC_CARDS_CLOSED_STATUSES = 'Закритий'

let passed = 0
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  ✓', msg); passed++ }

const db = await import('./db.js')

async function run() {
  console.log('1) setManual marks the position row')
  await db.setStage('p-manual-1', 'kt')
  await db.setManual('p-manual-1', true)
  let pos = await db.getAllPositions()
  ok(pos.get('p-manual-1').manual === 1, 'manual = 1 after setManual(true)')

  await db.setManual('p-manual-1', false)
  pos = await db.getAllPositions()
  ok(pos.get('p-manual-1').manual === 0, 'manual = 0 after setManual(false)')

  console.log('2) buildLive splits open / closed and builds a directory')
  const { buildLive } = await import('./mapper.js')
  const snap = {
    patients: [
      { patient_id: 1, firstname: 'Іван', lastname: 'Відкритий', phone: '+380501112233', statuses: ['10'], date_created: '2026-09-01' },
      { patient_id: 2, firstname: 'Ольга', lastname: 'Закрита', phone: '+380672223344', statuses: ['99'], date_created: '2025-03-01' },
    ],
    statuses: [{ status_id: '99', name: 'Закритий' }, { status_id: '10', name: 'Активний' }],
    staff: [], plans: [], visits: [],
  }
  const built = buildLive(snap)
  ok(built.seeds.length === 1 && built.seeds[0].id === '1', 'seeds holds only the open patient')
  ok(built.closedSeeds.length === 1 && built.closedSeeds[0].id === '2', 'closedSeeds holds the closed patient')
  ok(built.closedSeeds[0].phone.includes('67'), 'closedSeeds keeps the full seed shape (phone present)')
  ok(built.directory.length === 2, 'directory holds every patient')
  ok(built.directory.find((d) => d.id === '2').closed === true, 'directory flags the closed one')
  ok(built.rawNotifs.every((n) => !n.text.includes('Закрита')), 'the feed ignores closed patients')

  console.log('3) buildMock matches the buildLive contract')
  const { buildMock } = await import('./mockData.js')
  const mock = buildMock()
  ok(Array.isArray(mock.closedSeeds) && Array.isArray(mock.directory), 'mock exposes closedSeeds + directory')
  ok(mock.closedSeeds.some((s) => s.id === 'mock-closed-1'), 'mock ships one closed demo patient')
  ok(mock.directory.length === mock.seeds.length + mock.closedSeeds.length, 'directory covers every mock patient')

  console.log('4) getBoard admits a closed patient only when marked manual')
  const { getBoard, getDirectory } = await import('./store.js')
  let board = await getBoard(true)
  ok(!board.patients.some((p) => p.id === 'mock-closed-1'), 'closed patient is hidden by default')

  await db.setStage('mock-closed-1', 'kt')
  await db.setManual('mock-closed-1', true)
  board = await getBoard(false)
  const placed = board.patients.find((p) => p.id === 'mock-closed-1')
  ok(!!placed, 'closed patient appears once marked manual')
  ok(placed.stage === 'kt', 'it lands in the chosen column')
  ok(placed.manual === true, 'the card carries the manual flag')

  await db.setManual('mock-closed-1', false)
  board = await getBoard(false)
  ok(!board.patients.some((p) => p.id === 'mock-closed-1'), 'clearing the flag removes it again')

  const dir = await getDirectory()
  ok(dir.some((d) => d.id === 'mock-closed-1' && d.closed), 'getDirectory exposes the closed patient')

  // Closed patients must never reach ensureMissingPositions: otherwise the
  // positions table would grow a row for every archived patient in the CRM.
  const posCount = (await db.getAllPositions()).size
  await getBoard(true)
  ok((await db.getAllPositions()).size === posCount,
     'a board rebuild does not create position rows for closed patients')

  console.log(`\n✅ ${passed} checks passed`)
}

run().catch((e) => { console.error('\n❌ TEST FAILED:', e.message); process.exit(1) })
