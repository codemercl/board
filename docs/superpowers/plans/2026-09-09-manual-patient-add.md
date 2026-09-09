# Ручне додавання пацієнта з Clinic Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Адмін знаходить будь-якого пацієнта Clinic Cards — включно із закритим півроку тому — і ставить його у вибрану колонку дошки, після чого картка живе за звичайними правилами.

**Architecture:** Знімок Clinic Cards отримує два додаткові виходи — `closedSeeds` (закриті, повна форма) і `directory` (усі, стисло, для пошуку). Нова колонка `positions.manual` вмикає домішування закритого пацієнта в дошку і робить якорем 30-денного вікна `entered_at` замість дати створення. Пошук — по кешованому довіднику, без додаткових звернень до CRM.

**Tech Stack:** Node 18+ ESM, Express 4, postgres 3.4 (Supabase), React 18 + Vite, тести — самописний раннер на `node:assert` (взірець: `server/bot.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-09-manual-patient-add-design.md`

## Global Constraints

- Мова інтерфейсу і повідомлень — українська, як у решті застосунку.
- Локально `CLINIC_CARDS_API_KEY` не заданий → `isLive === false` → працює мок. Тести не повинні залежати від живого CRM.
- `DATABASE_URL` локально не заданий → memory-бекенд `server/db.js`. Тести ганяють саме його.
- Postgres-міграції тільки адитивні: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Обидва бекенди `server/db.js` (memory і postgres) мають однаковий асинхронний API. Кожну нову функцію додавати в обидва.
- Стадії: `consult_scheduled`, `consult_done`, `kt`, `plan_wait`, `plan`, `treatment`, `done`, `lost`. `FIRST_STAGE === 'consult_scheduled'`.
- Кожна мутація дошки відповідає `{ result: 'success', data: filterBoard(board, req.user) }`.
- Коміти українською або англійською — як у наявній історії; тіло коміту англійською.

## File Structure

| Файл | Відповідальність | Дія |
|---|---|---|
| `server/db.js` | `manual` у схемі й обох бекендах, `setManual` | Modify |
| `server/mapper.js` | `buildLive` → `seeds`/`closedSeeds`/`directory`; якір вікна в `assemble` | Modify |
| `server/mockData.js` | мок дає ті самі чотири поля | Modify |
| `server/store.js` | знімок несе нові поля; `getBoard` домішує ручні закриті | Modify |
| `server/directory.js` | **новий** — чиста функція пошуку `searchDirectory` | Create |
| `server/app.js` | три роути: search / place / manual | Modify |
| `server/board.test.mjs` | **новий** — тести довідника, мітки, вікна, роутів | Create |
| `package.json` | скрипт `test` | Modify |
| `src/api.js` | `searchPatients`, `placePatient`, `setPatientManual` | Modify |
| `src/App.jsx` | проброс трьох дій у `computeView` | Modify |
| `src/logic.js` | проброс у `view`, `manual` на картці | Modify |
| `src/components/AddPatientModal.jsx` | **новий** — пошук + вибір колонки | Create |
| `src/components/Header.jsx` | кнопка «+ Додати пацієнта» | Modify |
| `src/components/PatientPanel.jsx` | бейдж «вручну» + «Прибрати з дошки» | Modify |

Пошук винесено в окремий `server/directory.js` навмисне: це єдина частина фічі з нетривіальною логікою (нормалізація телефону, регістр, ліміт), і як чиста функція вона тестується без Express, БД і мережі.

---

### Task 1: Колонка `manual` і `setManual` в обох бекендах

**Files:**
- Modify: `server/db.js` (memory-бекенд ~`:80`, `:182`; postgres-бекенд `:251`, `:458`; експорти ~`:560`)
- Create: `server/board.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `setManual(patientId: string, on: boolean): Promise<void>` — експорт із `server/db.js`. Рядок позиції отримує поле `manual` зі значенням `1` або `0`; `getAllPositions()` віддає його як частину рядка.

- [ ] **Step 1: Створити тестовий файл із першим падаючим тестом**

Створити `server/board.test.mjs`:

```js
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
```

- [ ] **Step 2: Запустити — має впасти**

Run: `node server/board.test.mjs`
Expected: FAIL — `db.setManual is not a function`

- [ ] **Step 3: Додати `manual` у memory-бекенд**

У `server/db.js`, в `createMemoryBackend`, дописати поле в `ensureRow` (~рядок 80) і в рядок, що створюється в `ensureMissingPositions` (~рядок 162) — обидва отримують `manual: null` поряд із наявним `frozen: null`.

Далі, одразу після `setFrozen` (~рядок 182), додати:

```js
    async setManual(patientId, manual) {
      const id = String(patientId)
      const at = nowIso()
      positions.set(id, { ...ensureRow(id, at), manual: manual ? 1 : 0, updated_at: at })
    },
```

- [ ] **Step 4: Додати `manual` у postgres-бекенд**

У блоці `init()` (`server/db.js:251`), поряд із наявними адитивними міграціями:

```js
        // Additive migration: card was placed on the board by hand.
        await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS manual integer`
```

І після `setFrozen` (~рядок 458):

```js
    async setManual(patientId, manual) {
      await init()
      const id = String(patientId)
      const at = nowIso()
      await insertRow(sql, id, FIRST_STAGE, at)
      await sql`UPDATE positions SET manual = ${manual ? 1 : 0}, updated_at = ${at} WHERE patient_id = ${id}`
    },
```

- [ ] **Step 5: Експортувати**

Поряд із наявним експортом `setFrozen` додати:

```js
export const setManual = (...a) => backend.setManual(...a)
```

- [ ] **Step 6: Запустити тест — має пройти**

Run: `node server/board.test.mjs`
Expected: PASS, 2 checks

- [ ] **Step 7: Додати скрипт `test`**

У `package.json`, у `scripts`, після `"server"`:

```json
    "test": "node server/bot.test.mjs && node server/board.test.mjs",
```

- [ ] **Step 8: Прогнати обидва набори**

Run: `npm test`
Expected: обидва файли проходять

- [ ] **Step 9: Коміт**

```bash
git add server/db.js server/board.test.mjs package.json
git commit -m "feat(db): manual flag on positions + npm test script"
```

---

### Task 2: `buildLive` віддає `seeds` / `closedSeeds` / `directory`

**Files:**
- Modify: `server/mapper.js:131-234` (`buildLive`)
- Modify: `server/board.test.mjs`

**Interfaces:**
- Consumes: нічого з попередніх задач.
- Produces: `buildLive(snapshot)` повертає `{ seeds, closedSeeds, directory, rawNotifs }`.
  - `seeds` — масив seed'ів **тільки відкритих** пацієнтів (форма не змінюється).
  - `closedSeeds` — масив seed'ів закритих, та сама форма.
  - `directory` — масив `{ id: string, name: string, phone: string, closed: boolean }` для **всіх** пацієнтів.
  - `rawNotifs` — як раніше, будується тільки з `seeds`.

- [ ] **Step 1: Дописати падаючі тести**

У `server/board.test.mjs`, всередині `run()`, перед фінальним `console.log`:

```js
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
```

Тест покладається на те, що `CLINIC_CARDS_CLOSED_STATUSES` містить «закритий». Щоб не залежати від `.env`, на початку файлу — **до** першого `import('./mapper.js')` — додати:

```js
process.env.CLINIC_CARDS_CLOSED_STATUSES = 'Закритий'
```

- [ ] **Step 2: Запустити — має впасти**

Run: `node server/board.test.mjs`
Expected: FAIL — `built.closedSeeds` is undefined

- [ ] **Step 3: Переписати цикл у `buildLive`**

У `server/mapper.js` замінити `const seeds = []` і тіло циклу `for (const p of patients)` так, щоб замість раннього `continue` пацієнт розкладався по трьох виходах.

Було (рядки 176-179):

```js
  const seeds = []
  for (const p of patients) {
    const pStatuses = Array.isArray(p.statuses) ? p.statuses.map(String) : []
    if (pStatuses.some((id) => closedStatusIds.has(id))) continue // "closed" → hidden
```

Стає:

```js
  const seeds = []
  const closedSeeds = []
  const directory = []
  for (const p of patients) {
    const pStatuses = Array.isArray(p.statuses) ? p.statuses.map(String) : []
    // Closed patients no longer vanish here: they go to closedSeeds so an admin
    // can pull one back onto the board by hand (see store.getBoard).
    const closed = pStatuses.some((id) => closedStatusIds.has(id))
```

Далі, в кінці циклу, замість `seeds.push({ ... })` — присвоїти seed у змінну і розкласти:

```js
    const seed = {
      id,
      name,
      phone: formatPhone(p.phone || p.phone2),
      // …решта полів без змін…
      slaOverride: null,
    }
    directory.push({ id, name: seed.name, phone: seed.phone, closed })
    if (closed) closedSeeds.push(seed)
    else seeds.push(seed)
  }
```

- [ ] **Step 4: Повернути нові поля**

Наприкінці `buildLive` замінити `return { seeds, rawNotifs }` на:

```js
  return { seeds, closedSeeds, directory, rawNotifs }
```

`rawNotifs` вище будується з `seeds`, тож закриті туди вже не потрапляють — окремої правки не потрібно.

- [ ] **Step 5: Запустити — має пройти**

Run: `node server/board.test.mjs`
Expected: PASS, 8 checks

- [ ] **Step 6: Коміт**

```bash
git add server/mapper.js server/board.test.mjs
git commit -m "feat(mapper): buildLive returns closedSeeds + a search directory"
```

---

### Task 3: Мок дає ті самі поля

**Files:**
- Modify: `server/mockData.js` (кінець `buildMock`)
- Modify: `server/board.test.mjs`

**Interfaces:**
- Produces: `buildMock()` повертає `{ seeds, closedSeeds, directory, rawNotifs }` — той самий контракт, що й `buildLive`. Мок містить рівно одного закритого пацієнта з `id === 'mock-closed-1'` та іменем `Закритий Пацієнт (демо)`, щоб локальна перевірка фічі була можлива без живого CRM.

- [ ] **Step 1: Дописати падаючий тест**

```js
  console.log('3) buildMock matches the buildLive contract')
  const { buildMock } = await import('./mockData.js')
  const mock = buildMock()
  ok(Array.isArray(mock.closedSeeds) && Array.isArray(mock.directory), 'mock exposes closedSeeds + directory')
  ok(mock.closedSeeds.some((s) => s.id === 'mock-closed-1'), 'mock ships one closed demo patient')
  ok(mock.directory.length === mock.seeds.length + mock.closedSeeds.length, 'directory covers every mock patient')
```

- [ ] **Step 2: Запустити — має впасти**

Run: `node server/board.test.mjs`
Expected: FAIL — `mock exposes closedSeeds + directory`

- [ ] **Step 3: Дописати кінець `buildMock`**

Замінити `return { seeds, rawNotifs: RAW_NOTIFS }` на:

```js
  // One closed demo patient so the manual-add flow is exercisable without a
  // live Clinic Cards key (the board hides it until an admin places it).
  const closedSeeds = [{
    id: 'mock-closed-1',
    name: 'Закритий Пацієнт (демо)',
    phone: '+380 50 000-11-22',
    service: 'Лікування завершено торік',
    comment: '',
    dueVisitAt: null,
    dueVisitNote: '',
    doctor: '',
    visit: '',
    visitAt: null,
    note: 'Демо: закрита картка для ручного додавання',
    hot: false,
    synced: false,
    admin: { key: '_none', initials: '—', name: 'Не призначено', color: '#94a3b8' },
    defaultStage: 'consult_scheduled',
    createdAt: new Date(Date.now() - 200 * 86400000).toISOString(),
    slaOverride: null,
  }]
  const directory = [
    ...seeds.map((s) => ({ id: s.id, name: s.name, phone: s.phone, closed: false })),
    ...closedSeeds.map((s) => ({ id: s.id, name: s.name, phone: s.phone, closed: true })),
  ]
  return { seeds, closedSeeds, directory, rawNotifs: RAW_NOTIFS }
```

- [ ] **Step 4: Запустити — має пройти**

Run: `node server/board.test.mjs`
Expected: PASS, 11 checks

- [ ] **Step 5: Коміт**

```bash
git add server/mockData.js server/board.test.mjs
git commit -m "feat(mock): closed demo patient + directory so manual-add works offline"
```

---

### Task 4: Знімок несе нові поля, `getBoard` домішує ручні закриті

**Files:**
- Modify: `server/store.js:20-30` (`pullFromClinicCards`), `:41-58` (`refresh`), `:99-125` (`getBoard`)
- Modify: `server/board.test.mjs`

**Interfaces:**
- Consumes: `buildLive`/`buildMock` із Task 2-3; `setManual`, `getAllPositions` із Task 1.
- Produces: `getBoard(force?: boolean)` — payload незмінної форми, але серед `patients` тепер можуть бути закриті пацієнти з `manual = 1`. Додається експорт `getDirectory(): Promise<Array<{id,name,phone,closed}>>` для роута пошуку.

- [ ] **Step 1: Дописати падаючі тести**

```js
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
```

- [ ] **Step 2: Запустити — має впасти**

Run: `node server/board.test.mjs`
Expected: FAIL — `getDirectory is not a function` (або «closed patient appears once marked manual»)

- [ ] **Step 3: Провести нові поля крізь знімок**

У `server/store.js`, в `pullFromClinicCards`, обидві гілки мають повертати нові поля:

```js
async function pullFromClinicCards() {
  if (!isLive) {
    const { seeds, closedSeeds, directory, rawNotifs } = buildMock()
    return { seeds, closedSeeds, directory, rawNotifs, updatedAt: new Date().toISOString(), source: 'mock', at: Date.now() }
  }
  const snap = await fetchClinicSnapshot()
  const { seeds, closedSeeds, directory, rawNotifs } = buildLive(snap)
  return { seeds, closedSeeds, directory, rawNotifs, updatedAt: new Date().toISOString(), source: 'live', at: Date.now() }
}
```

- [ ] **Step 4: Записувати нові поля в дисковий кеш**

У `refresh()` розширити запис:

```js
      await setCache(SNAP_KEY, JSON.stringify({
        seeds: s.seeds, closedSeeds: s.closedSeeds, directory: s.directory,
        rawNotifs: s.rawNotifs, updatedAt: s.updatedAt, source: s.source,
      }), s.updatedAt)
```

У `readDiskCache()` — захист від рядків, записаних до цієї зміни:

```js
    const s = JSON.parse(row.value)
    s.closedSeeds = s.closedSeeds || []
    s.directory = s.directory || []
    s.at = Date.parse(row.fetched_at)
```

Без цього перший запит після деплою на старому кеші впав би на `undefined.filter`.

- [ ] **Step 5: Домішати ручні закриті в `getBoard`**

У `getBoard`, одразу після рядка `const positions = inserted ? await getAllPositions() : known`:

```js
  // Closed patients an admin pulled back onto the board by hand. They are not in
  // `seeds` (buildLive keeps them apart) and deliberately never reach
  // ensureMissingPositions — only the ones already flagged are merged back in.
  const manualClosed = (snap.closedSeeds || []).filter((s) => positions.get(String(s.id))?.manual)
  const allSeeds = manualClosed.length ? [...seeds, ...manualClosed] : seeds
```

і далі передавати `allSeeds` у `assemble(...)` замість `seeds`. `ensureMissingPositions(seeds, known)` вище лишається на `seeds` — саме тому в позиціях не з'явиться рядок на кожного закритого пацієнта.

- [ ] **Step 6: Додати `getDirectory`**

У кінець `server/store.js`:

```js
// Compact { id, name, phone, closed } for every Clinic Cards patient — the
// source for the manual-add search. Served from the same cached snapshot as the
// board, so a search costs no extra CRM calls.
export async function getDirectory() {
  const snap = await getSnapshot(false)
  return snap.directory || []
}
```

- [ ] **Step 7: Запустити — має пройти**

Run: `node server/board.test.mjs`
Expected: PASS, 17 checks

Якщо «closed patient appears once marked manual» не проходить — причина в Task 5 (якір вікна): `mock-closed-1` створений 200 днів тому. Перевірити, що стадія `kt`, а не `FIRST_STAGE`; тест навмисне бере `kt`, щоб ця задача була зеленою до правки якоря.

- [ ] **Step 8: Коміт**

```bash
git add server/store.js server/board.test.mjs
git commit -m "feat(store): merge manually placed closed patients into the board"
```

---

### Task 5: Якір вікна для ручних карток + `manual` у payload

**Files:**
- Modify: `server/mapper.js:308-410` (`assemble`)
- Modify: `server/board.test.mjs`

**Interfaces:**
- Consumes: `pos.manual` із Task 1, домішування із Task 4.
- Produces: кожна картка в payload отримує поле `manual: boolean`.

- [ ] **Step 1: Дописати падаючий тест — пастка першої колонки**

```js
  console.log('5) a manual card survives the display window in the FIRST column')
  await db.setStage('mock-closed-1', 'consult_scheduled')
  await db.setManual('mock-closed-1', true)
  board = await getBoard(false)
  ok(board.patients.some((p) => p.id === 'mock-closed-1'),
     'manual card in the first column is not dropped by the 30-day window')
```

Без правки цей тест падає: `defaultStage` мока — `consult_scheduled`, отже `movedByUs === false`, якорем стає `createdAt` 200-денної давнини, і `assemble` відкидає картку на рядку `if (now > windowEndMs) continue`.

- [ ] **Step 2: Запустити — має впасти**

Run: `node server/board.test.mjs`
Expected: FAIL — `manual card in the first column is not dropped by the 30-day window`

- [ ] **Step 3: Правка якоря**

У `server/mapper.js`, у `assemble`, замінити:

```js
    const anchorMs = movedByUs ? enteredMs : (createdMs ?? enteredMs)
```

на:

```js
    // Manually placed cards anchor on entered_at even when the chosen column is
    // the first one: otherwise `movedByUs` stays false, the anchor falls back to
    // a заявка created months ago, and the card vanishes the instant it is added.
    const anchorMs = (pos.manual || movedByUs) ? enteredMs : (createdMs ?? enteredMs)
```

- [ ] **Step 4: Віддати прапорець клієнту**

У тому ж `assemble`, у `patients.push({ ... })`, поряд із `frozen`:

```js
      manual: !!pos.manual, // placed on the board by hand, not imported by window
```

- [ ] **Step 5: Запустити — має пройти**

Run: `node server/board.test.mjs`
Expected: PASS, 18 checks

- [ ] **Step 6: Прибрати за собою стан у тесті**

Наприкінці блоку 5 повернути картку в нейтральний стан, щоб наступні блоки не залежали від порядку:

```js
  await db.setManual('mock-closed-1', false)
```

- [ ] **Step 7: Коміт**

```bash
git add server/mapper.js server/board.test.mjs
git commit -m "fix(mapper): anchor the display window on entered_at for manual cards"
```

---

### Task 6: Пошук по довіднику

**Files:**
- Create: `server/directory.js`
- Modify: `server/board.test.mjs`

**Interfaces:**
- Produces: `searchDirectory(directory, q, opts?)` з `server/directory.js`.
  - `directory: Array<{id,name,phone,closed}>`
  - `q: string`
  - `opts: { limit?: number, onBoardIds?: Set<string> }` — `limit` за замовчуванням 20.
  - Повертає `Array<{ id, name, phone, closed, onBoard }>`.
  - Запит коротший за 2 символи (після обрізання пробілів) → `[]`.

- [ ] **Step 1: Дописати падаючі тести**

```js
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
```

- [ ] **Step 2: Запустити — має впасти**

Run: `node server/board.test.mjs`
Expected: FAIL — `Cannot find module './directory.js'`

- [ ] **Step 3: Створити `server/directory.js`**

```js
// Search over the compact patient directory that rides along with the board
// snapshot (see server/store.js getDirectory). Pure and dependency-free so it is
// testable without Express, a database, or a live Clinic Cards key.

const MIN_QUERY = 2
const DEFAULT_LIMIT = 20

const digitsOf = (s) => String(s || '').replace(/\D/g, '')

// Name match is a case-insensitive substring. Phone match compares digits only,
// so "0501234567" finds "+380 50 123-45-67" and a fragment finds the tail.
export function searchDirectory(directory, q, opts = {}) {
  const query = String(q || '').trim()
  if (query.length < MIN_QUERY) return []
  const limit = opts.limit || DEFAULT_LIMIT
  const onBoardIds = opts.onBoardIds || new Set()
  const needle = query.toLowerCase()
  const needleDigits = digitsOf(query)

  const out = []
  for (const entry of directory || []) {
    const nameHit = String(entry.name || '').toLowerCase().includes(needle)
    const phoneHit = needleDigits.length >= 3 && digitsOf(entry.phone).includes(needleDigits)
    if (!nameHit && !phoneHit) continue
    out.push({
      id: String(entry.id),
      name: entry.name || '',
      phone: entry.phone || '',
      closed: !!entry.closed,
      onBoard: onBoardIds.has(String(entry.id)),
    })
    if (out.length >= limit) break
  }
  return out
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `node server/board.test.mjs`
Expected: PASS, 27 checks

- [ ] **Step 5: Коміт**

```bash
git add server/directory.js server/board.test.mjs
git commit -m "feat(directory): pure name/phone search over the patient directory"
```

---

### Task 7: Три роути

**Files:**
- Modify: `server/app.js` — імпорти (`:7-13`), новий блок роутів після `/api/patients/:id/dismiss-followup` (`:206-212`)
- Modify: `server/board.test.mjs`

**Interfaces:**
- Consumes: `searchDirectory` (Task 6), `getDirectory`/`getBoard` (Task 4), `setManual`/`setStage` (Task 1).
- Produces:
  - `GET /api/patients/search?q=<string>` → `{ result: 'success', data: Array<{id,name,phone,closed,onBoard}> }`
  - `POST /api/patients/:id/place` body `{ stage: string }` → `{ result:'success', data: board }`
  - `POST /api/patients/:id/manual` body `{ manual: boolean }` → `{ result:'success', data: board }`
  - Усі три під `requireMove`.

- [ ] **Step 1: Дописати падаючі тести (справжній HTTP через ефемерний порт)**

```js
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

  const removed = await call('/api/patients/mock-closed-1/manual', {
    method: 'POST', headers: auth, body: JSON.stringify({ manual: false }),
  })
  ok(!removed.body.data.patients.some((p) => p.id === 'mock-closed-1'), 'clearing manual takes it off the board')

  server.close()
```

- [ ] **Step 2: Запустити — має впасти**

Run: `node server/board.test.mjs`
Expected: FAIL — `search finds the closed demo patient` (роут віддає 404)

- [ ] **Step 3: Розширити імпорти в `server/app.js`**

У списку з `./db.js` додати `setManual`; окремо додати два імпорти:

```js
import { getBoard, getDirectory } from './store.js'
import { searchDirectory } from './directory.js'
```

(`getBoard` уже імпортується — дописати до нього `getDirectory` у той самий рядок.)

- [ ] **Step 4: Додати роути**

Після `/api/patients/:id/dismiss-followup` (`server/app.js:212`):

```js
// ─── Manual add from Clinic Cards ───────────────────────────────────────────
// Any patient in Clinic Cards — including one closed months ago — can be found
// and dropped into a column by hand. Search runs over the cached directory, so
// it costs no extra CRM calls.
app.get('/api/patients/search', requireMove, wrap(async (req, res) => {
  const directory = await getDirectory()
  const board = await getBoard(false)
  const onBoardIds = new Set(board.patients.map((p) => String(p.id)))
  res.json({ result: 'success', data: searchDirectory(directory, req.query.q, { onBoardIds }) })
}))

// Place a patient into a column by hand and flag the card as manual, so the
// closed-status filter and the creation-anchored display window stop hiding it.
app.post('/api/patients/:id/place', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  const stage = (req.body && req.body.stage) || ''
  if (!STAGE_IDS.has(stage)) return fail(res, 400, 'Невідома колонка')
  const directory = await getDirectory()
  if (!directory.some((d) => String(d.id) === String(id))) {
    return fail(res, 404, 'Пацієнта не знайдено в Clinic Cards')
  }
  await setStage(id, stage)
  await setManual(id, true)
  const board = await getBoard(false)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))

// Clear (or re-set) the manual flag. Clearing returns the card to the normal
// rules: a closed patient drops off, an open one stays until the window ends.
// The position row and plan_review are kept, so re-adding restores the state.
app.post('/api/patients/:id/manual', requireMove, wrap(async (req, res) => {
  const { id } = req.params
  await setManual(id, !!(req.body && req.body.manual))
  const board = await getBoard(false)
  res.json({ result: 'success', data: filterBoard(board, req.user) })
}))
```

**Порядок має значення:** `/api/patients/search` треба оголосити **до** будь-якого `/api/patients/:id/...`, інакше Express прийме `search` за `:id`. У цьому файлі роути з `:id` уже вище, тож нові три ставимо саме туди, де вказано, і перевіряємо тестом на 404 з Step 1.

- [ ] **Step 5: Запустити — має пройти**

Run: `node server/board.test.mjs`
Expected: PASS, 35 checks

Якщо `search` дає 404 — роут перехопив `/api/patients/:id`. Перенести оголошення `search` вище за решту `/api/patients/:id` роутів.

- [ ] **Step 6: Прогнати весь набір**

Run: `npm test`
Expected: обидва файли зелені

- [ ] **Step 7: Коміт**

```bash
git add server/app.js server/board.test.mjs
git commit -m "feat(api): patient search + manual place/unplace routes"
```

---

### Task 8: Клієнтський API і проброс дій

**Files:**
- Modify: `src/api.js` (після `listStaff`, ~`:127`)
- Modify: `src/App.jsx` (~`:161-175`, і блок `computeView`)
- Modify: `src/logic.js` (~`:97` картка, ~`:308-316` view)

**Interfaces:**
- Consumes: роути з Task 7.
- Produces:
  - `api.searchPatients(q): Promise<Array<{id,name,phone,closed,onBoard}>>`
  - `api.placePatient(id, stage): Promise<Board>`
  - `api.setPatientManual(id, manual): Promise<Board>`
  - `view.searchPatients(q)`, `view.placePatient(id, stage)` — доступні компонентам.
  - `card.addedManually: boolean` і `card.removeFromBoard()` у списку карток `computeView`; `sel.addedManually`, `sel.canRemove`, `sel.removeFromBoard()` у панелі.
  - `view.openAddPatient()` — відкриває модалку (стан живе в `App.jsx`, Task 9).

- [ ] **Step 1: Додати виклики в `src/api.js`**

Після `listStaff`:

```js
export function searchPatients(q) {
  return req(`/api/patients/search?q=${encodeURIComponent(q)}`, { headers: { ...authHeaders() } })
}

export function placePatient(id, stage) {
  return req(`/api/patients/${encodeURIComponent(id)}/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ stage }),
  })
}

export function setPatientManual(id, manual) {
  return req(`/api/patients/${encodeURIComponent(id)}/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ manual }),
  })
}
```

- [ ] **Step 2: Додати дії в `src/App.jsx`**

Поряд із `planPostpone` (~рядок 172):

```js
  const searchPatients = useCallback((q) => api.searchPatients(q), [])

  const placePatient = useCallback(async (id, stage) => {
    try { applyBoard(await api.placePatient(id, stage)) }
    catch (e) { if (mounted.current) setError(e.message); throw e }
  }, [applyBoard])

  const setPatientManual = useCallback(async (id, manual) => {
    try { applyBoard(await api.setPatientManual(id, manual)) }
    catch (e) { if (mounted.current) setError(e.message); throw e }
  }, [applyBoard])
```

і додати `searchPatients, placePatient, setPatientManual,` у об'єкт, що передається в `computeView`.

- [ ] **Step 3: Пробросити у `view` в `src/logic.js`**

> **Увага на колізію.** У `src/logic.js:234` уже існує `const manual = justMoved || found.movedByUs`, і таймлайн панелі вже малює бейдж «вручну» — у зовсім іншому значенні: «стадію виставили на дошці, а не взяли з CRM». Тому клієнтське поле цієї фічі називається **`addedManually`**, а не `manual`, і бейдж має текст **«додано вручну»**. Колонка в БД і поле в payload сервера лишаються `manual` — це узгоджено з наявним `frozen`.

У фінальному об'єкті `computeView`, поряд із `manageUsers` (~рядок 312):

```js
    searchPatients: ctx.searchPatients || (async () => []),
    placePatient: ctx.placePatient || (() => {}),
    openAddPatient: ctx.openAddPatient || (() => {}),
```

У мапі картки (де вже є `toggleFrozen`, ~рядок 97):

```js
      addedManually: !!p.manual,
      removeFromBoard: () => { ctx.setPatientManual && ctx.setPatientManual(p.id, false) },
```

І в об'єкті `sel = Object.assign({}, found, { ... })` (~рядок 284) — `found.manual` потрапляє туди сам, але дія і право потрібні явно:

```js
      addedManually: !!found.manual,
      canRemove: !!ctx.isAdmin,
      removeFromBoard: () => { ctx.setPatientManual && ctx.setPatientManual(found.id, false) },
```

- [ ] **Step 4: Перевірити, що збірка не зламалась**

Run: `npm run build`
Expected: збірка проходить без помилок

- [ ] **Step 5: Коміт**

```bash
git add src/api.js src/App.jsx src/logic.js
git commit -m "feat(ui): wire patient search + manual place actions"
```

---

### Task 9: Модалка «Додати пацієнта» і кнопка в шапці

**Files:**
- Create: `src/components/AddPatientModal.jsx`
- Modify: `src/components/Header.jsx` (~`:154`, поряд із кнопкою користувачів)
- Modify: `src/App.jsx` (стан відкриття модалки, рендер)

**Interfaces:**
- Consumes: `view.searchPatients`, `view.placePatient`, `view.isAdmin` (Task 8).
- Produces: компонент `<AddPatientModal view={view} onClose={fn} />`.

- [ ] **Step 1: Створити компонент**

`src/components/AddPatientModal.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { css } from '../css.js'
import { STAGES } from '../data.js'

// Find any Clinic Cards patient — including one closed long ago — and place them
// into a column by hand. Search hits our own cached directory, never the CRM.
export default function AddPatientModal({ view, onClose }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [picked, setPicked] = useState(null)
  const [stage, setStage] = useState('kt')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const seq = useRef(0)

  // Debounced search; `seq` drops responses that arrive out of order.
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return }
    const mine = ++seq.current
    const t = setTimeout(() => {
      view.searchPatients(q)
        .then((r) => { if (mine === seq.current) { setRows(r); setErr(null) } })
        .catch((e) => { if (mine === seq.current) setErr(e.message) })
    }, 250)
    return () => clearTimeout(t)
  }, [q, view])

  const submit = async () => {
    if (!picked) return
    setBusy(true); setErr(null)
    try { await view.placePatient(picked.id, stage); onClose() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={css('position:fixed;inset:0;background:rgba(12,20,33,.45);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px')} onClick={onClose}>
      <div style={css('background:#fff;border-radius:16px;width:min(520px,100%);max-height:80vh;display:flex;flex-direction:column;overflow:hidden')} onClick={(e) => e.stopPropagation()}>
        <div style={css('padding:14px 16px;border-bottom:1px solid #e2e9f2;font-size:14px;font-weight:700;color:#22334c')}>
          Додати пацієнта з Clinic Cards
        </div>

        <div style={css('padding:12px 16px')}>
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setPicked(null) }}
            placeholder="Імʼя або телефон — мінімум 2 символи"
            style={css('width:100%;padding:9px 11px;border:1px solid #d8e2ee;border-radius:10px;font-size:13px;outline:none')}
          />
        </div>

        <div style={css('flex:1;overflow:auto;padding:0 16px')}>
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => !r.onBoard && setPicked(r)}
              disabled={r.onBoard}
              style={css(`display:flex;width:100%;gap:8px;align-items:center;text-align:left;padding:9px 10px;margin-bottom:6px;border-radius:10px;font-size:13px;cursor:${r.onBoard ? 'default' : 'pointer'};border:1px solid ${picked?.id === r.id ? '#0d9488' : '#e2e9f2'};background:${r.onBoard ? '#f6f8fb' : '#fff'};opacity:${r.onBoard ? 0.6 : 1}`)}
            >
              <span style={css('flex:1')}>
                <span style={css('font-weight:600;color:#22334c')}>{r.name}</span>
                {r.phone ? <span style={css('color:#7c8aa0;margin-left:6px')}>{r.phone}</span> : null}
              </span>
              {r.onBoard ? <span style={css('font-size:11px;color:#7c8aa0')}>вже на дошці</span> : null}
              {r.closed && !r.onBoard ? <span style={css('font-size:11px;color:#b45309;background:#fdecd0;padding:2px 6px;border-radius:6px')}>закритий</span> : null}
            </button>
          ))}
          {q.trim().length >= 2 && !rows.length ? (
            <div style={css('color:#7c8aa0;font-size:12.5px;padding:6px 2px 12px')}>Нікого не знайдено.</div>
          ) : null}
        </div>

        {err ? <div style={css('color:#e11d48;font-size:12.5px;padding:0 16px 8px')}>{err}</div> : null}

        <div style={css('padding:12px 16px;border-top:1px solid #e2e9f2;display:flex;gap:8px;align-items:center')}>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={css('flex:1;padding:8px 10px;border:1px solid #d8e2ee;border-radius:10px;font-size:13px')}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button onClick={onClose} style={css('padding:8px 12px;border-radius:10px;border:1px solid #d8e2ee;background:#fff;font-size:13px;cursor:pointer')}>Скасувати</button>
          <button
            onClick={submit}
            disabled={!picked || busy}
            style={css(`padding:8px 14px;border-radius:10px;border:none;background:${picked && !busy ? '#0d9488' : '#c8d3e0'};color:#fff;font-size:13px;font-weight:600;cursor:${picked && !busy ? 'pointer' : 'default'}`)}
          >
            {busy ? 'Додаю…' : 'Додати'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

Перед реалізацією звірити з `src/components/HelpModal.jsx`, як у цьому проєкті прийнято робити модалки й імпортувати `css` — і, за потреби, підлаштувати під наявний взірець замість вигаданого тут.

- [ ] **Step 2: Кнопка в шапці**

У `src/components/Header.jsx`, перед блоком `{view.manageUsers && (` (~рядок 154):

```jsx
      {view.isAdmin && view.screen === 'board' && (
        <button
          onClick={view.openAddPatient}
          title="Додати пацієнта з Clinic Cards"
          style={css('padding:7px 11px;border-radius:10px;border:1px solid #d8e2ee;background:#fff;font-size:12.5px;font-weight:600;color:#22334c;cursor:pointer')}
        >
          + Додати пацієнта
        </button>
      )}
```

- [ ] **Step 3: Стан модалки в `App.jsx`**

Додати `const [addOpen, setAddOpen] = useState(false)`, передати `openAddPatient: () => setAddOpen(true)` в об'єкт для `computeView`, пробросити у `view` в `logic.js` поряд із `openUsers`, і відрендерити:

```jsx
      {addOpen && <AddPatientModal view={view} onClose={() => setAddOpen(false)} />}
```

- [ ] **Step 4: Збірка**

Run: `npm run build`
Expected: без помилок

- [ ] **Step 5: Ручна перевірка на моку**

Run: `npm run dev`
Кроки: увійти як `admin`/`admin` → «+ Додати пацієнта» → ввести `закритий` → у списку є «Закритий Пацієнт (демо)» з бейджем «закритий» → обрати «Направлений на КТ» → «Додати» → картка зʼявляється в колонці. Повторний пошук показує «вже на дошці».

- [ ] **Step 6: Коміт**

```bash
git add src/components/AddPatientModal.jsx src/components/Header.jsx src/App.jsx src/logic.js
git commit -m "feat(ui): add-patient modal with search and column picker"
```

---

### Task 10: Бейдж «вручну» і зняття з дошки

**Files:**
- Modify: `src/components/PatientPanel.jsx`
- Modify: `src/components/Board.jsx` (бейдж на картці)

**Interfaces:**
- Consumes: `card.addedManually`, `sel.addedManually`, `sel.canRemove`, `removeFromBoard()` із Task 8.

- [ ] **Step 1: Бейдж на картці**

У `src/components/Board.jsx`, у рендері картки, поряд із наявними позначками (`hot`, `frozen`), додати:

```jsx
        {p.addedManually ? <span style={css('font-size:10.5px;color:#7c8aa0;background:#eef2f7;padding:1px 5px;border-radius:5px')}>додано вручну</span> : null}
```

Точне місце звірити з тим, як там рендеряться наявні бейджі.

- [ ] **Step 2: Дія в панелі**

У `src/components/PatientPanel.jsx`, у блоці дій над карткою, для `sel.manual`:

```jsx
      {sel.addedManually && sel.canRemove && (
        <button
          onClick={() => sel.removeFromBoard()}
          style={css('padding:7px 11px;border-radius:10px;border:1px solid #ffd9e0;background:#fff;color:#e11d48;font-size:12.5px;cursor:pointer')}
        >
          Прибрати з дошки
        </button>
      )}
```

`addedManually`, `canRemove` і `removeFromBoard` для `sel` додано в Task 8 Step 3 — окремої правки тут не потрібно. Текст бейджа саме «додано вручну», щоб не збігтися з наявним бейджем таймлайна «вручну» (той означає «стадію виставили на дошці»).

- [ ] **Step 3: Збірка**

Run: `npm run build`
Expected: без помилок

- [ ] **Step 4: Ручна перевірка**

Run: `npm run dev`
Кроки: відкрити вручну додану картку → бачити бейдж «вручну» → «Прибрати з дошки» → картка зникає з дошки.

- [ ] **Step 5: Фінальний прогін і коміт**

```bash
npm test && npm run build
git add src/components/PatientPanel.jsx src/components/Board.jsx src/logic.js
git commit -m "feat(ui): manual badge + remove-from-board action"
```

---

## Деплой і перевірка на проді

Окремого стенда немає, тому:

1. `npm test && npm run build` локально — обидва зелені.
2. Задеплоїти. Міграція `ALTER TABLE positions ADD COLUMN IF NOT EXISTS manual integer` виконається сама при першому запиті (`init()`).
3. Перевірити на проді: «+ Додати пацієнта» → знайти реального давно закритого пацієнта → поставити в «Направлений на КТ» → картка зʼявилась → відкрити її → «Прибрати з дошки» → зникла.
4. Перевірити, що звичайна дошка не змінилась: кількість карток у колонках така сама, як до деплою.
5. Відкат за потреби: `git revert` останніх комітів і редеплой. Колонка `manual` лишається в схемі невикористаною і нічому не заважає.
