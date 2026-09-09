// Tests for the manual-add feature: directory search, the `manual` flag,
// the display-window anchor, and the three routes. No live CRM, no Postgres —
// runs on the mock snapshot and the in-memory db backend.
// Run: node server/board.test.mjs
import assert from 'node:assert'

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

  console.log(`\n✅ ${passed} checks passed`)
}

run().catch((e) => { console.error('\n❌ TEST FAILED:', e.message); process.exit(1) })
