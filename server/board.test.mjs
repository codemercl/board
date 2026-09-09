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

  console.log('2) buildLive splits open / closed patients')
  const { buildLive, buildDirectory } = await import('./mapper.js')
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
  ok(built.rawNotifs.every((n) => !n.text.includes('Закрита')), 'the feed ignores closed patients')
  ok(built.directory === undefined, 'buildLive no longer builds its own directory')

  console.log('2b) buildDirectory is the single place a directory is ever built')
  const dirFromLive = buildDirectory(built.seeds, built.closedSeeds)
  ok(dirFromLive.length === 2, 'directory holds every patient')
  ok(dirFromLive[0].id === '1' && dirFromLive[0].closed === false, 'open seeds come first, flagged open')
  ok(dirFromLive[1].id === '2' && dirFromLive[1].closed === true, 'closedSeeds come after, flagged closed')

  console.log('3) buildMock matches the buildLive contract')
  const { buildMock } = await import('./mockData.js')
  const mock = buildMock()
  ok(Array.isArray(mock.seeds) && Array.isArray(mock.closedSeeds), 'mock exposes seeds + closedSeeds')
  ok(mock.closedSeeds.some((s) => s.id === 'mock-closed-1'), 'mock ships one closed demo patient')
  ok(mock.directory === undefined, 'buildMock no longer builds its own directory either')
  const mockDir = buildDirectory(mock.seeds, mock.closedSeeds)
  ok(mockDir.length === mock.seeds.length + mock.closedSeeds.length, 'directory covers every mock patient')

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

  console.log('5) a manual card survives the display window in the FIRST column')
  await db.setStage('mock-closed-1', 'consult_scheduled')
  await db.setManual('mock-closed-1', true)
  board = await getBoard(false)
  ok(board.patients.some((p) => p.id === 'mock-closed-1'),
     'manual card in the first column is not dropped by the 30-day window')
  await db.setManual('mock-closed-1', false)

  console.log('6) directory search')
  const { searchDirectory } = await import('./directory.js')
  const sample = [
    { id: '1', name: 'Роза Суренівна Ганжа', phone: '+380 50 123-45-67', closed: false },
    { id: '2', name: 'Олена Балюк', phone: '+380 67 222-33-44', closed: true },
    { id: '3', name: 'Іван Ганжа', phone: '', closed: false },
  ]
  ok(searchDirectory(sample, 'ганжа').length === 2, 'matches a name substring, case-insensitive')
  ok(searchDirectory(sample, 'Балюк')[0].id === '2', 'finds the closed patient too')
  ok(searchDirectory(sample, '0501234567')[0].id === '1', 'matches a phone ignoring formatting')
  ok(searchDirectory(sample, '1234567')[0].id === '1', 'matches a phone fragment')
  ok(searchDirectory(sample, 'я').length === 0, 'a one-character query returns nothing')
  ok(searchDirectory(sample, '   ').length === 0, 'a blank query returns nothing')
  ok(searchDirectory(sample, 'ганжа', { limit: 1 }).length === 1, 'respects the limit')
  ok(searchDirectory(sample, 'Балюк', { onBoardIds: new Set(['2']) })[0].onBoard === true, 'flags patients already on the board')
  ok(searchDirectory(sample, 'ганжа')[0].onBoard === false, 'onBoard is false without the set')

  console.log('7) routes')
  const { default: app } = await import('./app.js')
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (path, opts = {}) => {
    const res = await fetch(base + path, opts)
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  const login = await call('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: 'admin', password: 'admin' }),
  })
  const token = login.body?.data?.token
  ok(!!token, 'bootstrap admin can log in')
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const anon = await call('/api/patients/search?q=закритий')
  ok(anon.status === 401, 'search requires auth')

  const found = await call('/api/patients/search?q=закритий', { headers: auth })
  ok(found.body.data.some((d) => d.id === 'mock-closed-1'), 'search finds the closed demo patient')

  const bad = await call('/api/patients/mock-closed-1/place', {
    method: 'POST', headers: auth, body: JSON.stringify({ stage: 'nonsense' }),
  })
  ok(bad.status === 400, 'place rejects an unknown stage')

  // A role with restricted columns (canMove: true, stages excludes 'lost' —
  // see ROLE_DEFAULTS.doctor) must be blocked from placing into a forbidden
  // column, same as /stage already enforces.
  await db.createUser({ username: 'doc-limited', password: 'pw12345', role: 'doctor' })
  const docLogin = await call('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: 'doc-limited', password: 'pw12345' }),
  })
  const docToken = docLogin.body?.data?.token
  ok(!!docToken, 'restricted doctor account can log in')
  const docAuth = { 'Content-Type': 'application/json', Authorization: `Bearer ${docToken}` }

  const forbidden = await call('/api/patients/mock-closed-1/place', {
    method: 'POST', headers: docAuth, body: JSON.stringify({ stage: 'lost' }),
  })
  ok(forbidden.status === 403, 'place enforces the column-permission check like /stage does')

  const missing = await call('/api/patients/no-such-id/place', {
    method: 'POST', headers: auth, body: JSON.stringify({ stage: 'kt' }),
  })
  ok(missing.status === 404, 'place rejects an id that is not in Clinic Cards')

  const placed2 = await call('/api/patients/mock-closed-1/place', {
    method: 'POST', headers: auth, body: JSON.stringify({ stage: 'kt' }),
  })
  ok(placed2.body.data.patients.some((p) => p.id === 'mock-closed-1' && p.stage === 'kt'),
     'place puts the closed patient on the board')

  const onBoard = await call('/api/patients/search?q=закритий', { headers: auth })
  ok(onBoard.body.data.find((d) => d.id === 'mock-closed-1').onBoard === true, 'search reports it as already on the board')

  // The string "false" is truthy in JS — !! coercion would silently turn this
  // into manual=true. Only real booleans are accepted.
  const badManual = await call('/api/patients/mock-closed-1/manual', {
    method: 'POST', headers: auth, body: JSON.stringify({ manual: 'false' }),
  })
  ok(badManual.status === 400, 'manual rejects a non-boolean value')
  const stillOn = await call('/api/patients/search?q=закритий', { headers: auth })
  ok(stillOn.body.data.find((d) => d.id === 'mock-closed-1').onBoard === true,
     'the string "false" did not clear the flag')

  const removed = await call('/api/patients/mock-closed-1/manual', {
    method: 'POST', headers: auth, body: JSON.stringify({ manual: false }),
  })
  ok(!removed.body.data.patients.some((p) => p.id === 'mock-closed-1'), 'clearing manual takes it off the board')

  console.log('8) place does not record a bogus stage transition (Finding 1)')
  // mock-1 already has a position row (created by ensureMissingPositions back
  // in step 4's getBoard(true)) sitting in a has-norm stage — exactly the
  // stale row a resurrected card would carry in production.
  const mock1Before = (await db.getAllPositions()).get('mock-1')
  ok(!!mock1Before, 'mock-1 already has a position row from ensureMissingPositions')
  ok(mock1Before.stage === 'consult_scheduled', 'mock-1 sits in a has-norm stage before place')

  const statsBefore = await db.getConversionStats()

  const placeMock1 = await call('/api/patients/mock-1/place', {
    method: 'POST', headers: auth, body: JSON.stringify({ stage: 'kt' }),
  })
  ok(placeMock1.body.data.patients.some((p) => p.id === 'mock-1' && p.stage === 'kt'),
     'place moved mock-1 into the chosen column')

  const statsAfter = await db.getConversionStats()
  ok(statsAfter.onTimeTotal === statsBefore.onTimeTotal,
     'place does not inflate the on-time denominator with a bogus transition')
  ok(statsAfter.onTimeCount === statsBefore.onTimeCount,
     'place does not inflate the on-time numerator with a bogus transition')

  console.log('9) directory is not persisted in the cache row (Finding 3)')
  const cacheRow = await db.getCache('cc_snapshot')
  ok(!!cacheRow, 'the snapshot cache row exists after a forced refresh')
  const cached = JSON.parse(cacheRow.value)
  ok(!('directory' in cached), 'the cached row does not carry a directory field')
  ok(Array.isArray(cached.seeds) && Array.isArray(cached.closedSeeds), 'seeds/closedSeeds are still cached')
  const dir2 = await getDirectory()
  ok(dir2.length === mock.seeds.length + mock.closedSeeds.length,
     'getDirectory still returns the full directory content, rebuilt on read')

  console.log('10) warm-memory and disk-cache-rebuilt directories are byte-identical, in order (Finding 3 follow-up)')
  // getDirectory() above answered from this module's warm `mem`. A fresh
  // import of store.js (cache-busted query string) gets its own `mem = null`
  // but shares the same db.js singleton, so its first getDirectory() call is
  // forced onto the disk-cache path — exactly the "cold lambda" case the
  // review flagged: a query matching >20 patients must not surface a
  // different slice of names depending on which path answered it.
  const warmDir = await getDirectory()
  const { getDirectory: getDirectoryCold } = await import(`./store.js?cold=${Date.now()}`)
  const coldDir = await getDirectoryCold()
  ok(coldDir.length > 0, 'the cold-path directory is non-empty (actually exercised the disk cache)')
  let identical = true
  try { assert.deepStrictEqual(coldDir, warmDir) } catch { identical = false }
  ok(identical, 'warm-memory and disk-cache-rebuilt directories match exactly, content and order')

  server.close()

  console.log(`\n✅ ${passed} checks passed`)
}

run().catch((e) => { console.error('\n❌ TEST FAILED:', e.message); process.exit(1) })
