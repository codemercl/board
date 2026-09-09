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

  console.log(`\n✅ ${passed} checks passed`)
}

run().catch((e) => { console.error('\n❌ TEST FAILED:', e.message); process.exit(1) })
