// Demo data used when no CLINIC_CARDS_API_KEY is configured, so the app runs
// out of the box. Shaped as board "seeds" (the same intermediate the live
// Clinic Cards mapper produces), so the rest of the pipeline is identical.

const ADMINS = {
  ML: { initials: 'МЛ', name: 'Марина Л.',  color: '#2563eb' },
  OK: { initials: 'ОК', name: 'Ольга К.',   color: '#7c3aed' },
  DS: { initials: 'ДС', name: 'Дмитрий С.', color: '#0891b2' },
  AR: { initials: 'АР', name: 'Алиса Р.',   color: '#d97706' },
}

const RAW = [
  { stage: 'lead', name: 'Алексей Морозов', phone: '+7 916 482-19-03', service: 'Имплантация — консультация', doctor: '', visit: '', sla: '12 мин', slaState: 'ok',   admin: 'ML', hot: true,  synced: true,  note: 'Источник: Instagram Ads' },
  { stage: 'lead', name: 'Виктория Седова', phone: '+7 903 771-55-21', service: 'Брекеты / ортодонтия',       doctor: '', visit: '', sla: '48 мин', slaState: 'ok',   admin: 'OK', hot: false, synced: true,  note: '' },
  { stage: 'lead', name: 'Тимур Гафаров',   phone: '+7 925 330-87-14', service: 'Отбеливание',                doctor: '', visit: '', sla: '1 ч',   slaState: 'ok',   admin: 'ML', hot: false, synced: false, note: '' },
  { stage: 'lead', name: 'Людмила Кравец',  phone: '+7 911 204-66-90', service: 'Гигиена и чистка',           doctor: '', visit: '', sla: '3 ч',   slaState: 'warn', admin: 'DS', hot: false, synced: false, note: '' },

  { stage: 'contact', name: 'Елена Воронина', phone: '+7 905 612-08-77', service: 'Имплантация All-on-4', doctor: '', visit: '', sla: '1 ч',     slaState: 'ok',   admin: 'OK', hot: true,  synced: false, note: '' },
  { stage: 'contact', name: 'Сергей Кузьмин', phone: '+7 962 145-39-52', service: 'Протезирование',      doctor: '', visit: '', sla: '4 ч',     slaState: 'warn', admin: 'DS', hot: false, synced: false, note: '' },
  { stage: 'contact', name: 'Карина Юсупова', phone: '+7 917 880-23-41', service: 'Виниры (6 ед.)',      doctor: '', visit: '', sla: '1 д 2 ч', slaState: 'over', admin: 'ML', hot: true,  synced: false, note: '2 недозвона' },
  { stage: 'contact', name: 'Никита Орлов',   phone: '+7 999 501-77-30', service: 'Лечение кариеса',     doctor: '', visit: '', sla: '26 мин',  slaState: 'ok',   admin: 'AR', hot: false, synced: true,  note: '' },

  { stage: 'consult_scheduled', name: 'Ольга Лебедева', phone: '+7 909 333-12-88', service: 'Брекеты / ортодонтия', doctor: 'Менделевич И.Р.', visit: 'Сегодня, 16:30', sla: '2 ч', slaState: 'ok',   admin: 'OK', hot: false, synced: true,  note: '' },
  { stage: 'consult_scheduled', name: 'Артём Поляков',  phone: '+7 926 778-45-10', service: 'Имплантация (2 ед.)',  doctor: 'Соколова А.В.',   visit: 'Завтра, 10:00',  sla: '5 ч', slaState: 'ok',   admin: 'DS', hot: false, synced: false, note: '' },
  { stage: 'consult_scheduled', name: 'Дарья Зайцева',  phone: '+7 964 220-91-33', service: 'Лечение пульпита',     doctor: 'Кузнецов Д.А.',   visit: '1 июл, 12:15',   sla: '8 ч', slaState: 'warn', admin: 'AR', hot: false, synced: false, note: '' },

  { stage: 'consult_done', name: 'Михаил Громов',  phone: '+7 903 410-55-19', service: 'Имплантация',   doctor: 'Соколова А.В.', visit: 'Сегодня, 11:00 ✓', sla: '40 мин', slaState: 'ok',   admin: 'OK', hot: false, synced: false, note: '' },
  { stage: 'consult_done', name: 'Анна Соловьёва', phone: '+7 916 092-34-67', service: 'Виниры',        doctor: 'Иванова М.С.',  visit: 'Сегодня, 09:30 ✓', sla: '1 ч',    slaState: 'ok',   admin: 'ML', hot: true,  synced: false, note: '' },
  { stage: 'consult_done', name: 'Роман Ефимов',   phone: '+7 925 661-20-04', service: 'Коронка (м/к)', doctor: 'Петров К.Л.',   visit: 'Вчера, 18:00 ✓',   sla: '1 д',    slaState: 'warn', admin: 'DS', hot: false, synced: false, note: 'Ждёт решения' },

  { stage: 'plan', name: 'Павел Жданов',     phone: '+7 962 503-88-21', service: 'Имплантация All-on-4',  doctor: 'Соколова А.В.',   visit: '', sla: '6 ч',     slaState: 'ok',   admin: 'OK', hot: true,  synced: false, note: 'План на согласовании' },
  { stage: 'plan', name: 'Светлана Маркова', phone: '+7 909 145-77-32', service: 'Протезирование (мост)', doctor: 'Менделевич И.Р.', visit: '', sla: '1 д 4 ч', slaState: 'over', admin: 'DS', hot: false, synced: false, note: 'Не отвечает на согласование' },
  { stage: 'plan', name: 'Денис Фомин',      phone: '+7 917 660-19-85', service: 'Брекеты',               doctor: 'Менделевич И.Р.', visit: '', sla: '10 ч',    slaState: 'warn', admin: 'AR', hot: false, synced: false, note: '' },

  { stage: 'treatment', name: 'Наталья Белова', phone: '+7 905 882-41-09', service: 'Имплантация',         doctor: 'Соколова А.В.',   visit: '5 июл, 14:00', sla: '—', slaState: 'ok', admin: 'OK', hot: false, synced: false, note: 'Этап 2 из 3' },
  { stage: 'treatment', name: 'Игорь Романов',  phone: '+7 926 119-50-73', service: 'Брекеты (коррекция)',  doctor: 'Менделевич И.Р.', visit: '8 июл, 15:30', sla: '—', slaState: 'ok', admin: 'ML', hot: false, synced: false, note: 'Плановый визит' },
  { stage: 'treatment', name: 'Юлия Тарасова',  phone: '+7 964 700-33-12', service: 'Лечение пародонтита',  doctor: 'Хасанова Г.Р.',   visit: '3 июл, 12:00', sla: '—', slaState: 'ok', admin: 'AR', hot: false, synced: true,  note: 'Этап 1 из 2' },

  { stage: 'done', name: 'Владимир Шах',     phone: '+7 903 220-67-41', service: 'Гигиена и чистка', doctor: 'Иванова М.С.', visit: 'Завершено 28 июн', sla: '—', slaState: 'ok', admin: 'OK', hot: false, synced: false, note: '' },
  { stage: 'done', name: 'Екатерина Дробыш', phone: '+7 916 540-88-25', service: 'Отбеливание ZOOM', doctor: 'Иванова М.С.', visit: 'Завершено 27 июн', sla: '—', slaState: 'ok', admin: 'ML', hot: false, synced: true,  note: 'Запись на профчистку' },

  { stage: 'thinking', name: 'Виктор Лагутин',  phone: '+7 909 712-04-58', service: 'Имплантация',   doctor: '', visit: '', sla: '2 д',     slaState: 'over', admin: 'DS', hot: false, synced: false, note: '3 недозвона' },
  { stage: 'thinking', name: 'Марина Цветкова', phone: '+7 925 308-19-66', service: 'Виниры',        doctor: '', visit: '', sla: '1 д 6 ч', slaState: 'over', admin: 'OK', hot: false, synced: false, note: 'Думает, перезвонить' },
  { stage: 'thinking', name: 'Олег Дёмин',      phone: '+7 962 455-71-20', service: 'Протезирование', doctor: '', visit: '', sla: '3 д',     slaState: 'over', admin: 'AR', hot: false, synced: false, note: '4 недозвона' },

  { stage: 'lost', name: 'Галина Орлова',    phone: '+7 905 661-23-08', service: 'Брекеты',     doctor: '', visit: '', sla: '5 д', slaState: 'ok', admin: 'ML', hot: false, synced: false, note: 'Причина: дорого' },
  { stage: 'lost', name: 'Станислав Беляев', phone: '+7 917 200-49-31', service: 'Имплантация', doctor: '', visit: '', sla: '7 д', slaState: 'ok', admin: 'DS', hot: false, synced: false, note: 'Ушёл в другую клинику' },
]

const RAW_NOTIFS = [
  { type: 'new',  text: 'Нова заявка з Clinic Cards — Алексей Морозов', sub: 'Instagram Ads',  time: '2 хв' },
  { type: 'move', text: 'Ольга Лебедева → «Консультація призначена»',   sub: 'Запис 16:30',    time: '14 хв' },
  { type: 'new',  text: 'Виктория Седова додана з CRM',                 sub: 'Ортодонтія',     time: '26 хв' },
  { type: 'call', text: 'Никита Орлов — вхідний дзвінок зафіксовано',   sub: '4:12 хв',        time: '1 год' },
  { type: 'done', text: 'Екатерина Дробыш → «Лікування завершено»',     sub: 'Відбілювання',   time: '1 год' },
  { type: 'move', text: 'Юлия Тарасова → «Лікування в процесі»',        sub: 'Пародонтологія', time: '2 год' },
]

// Old (pre-v2) stage ids → new funnel. lead/contact/thinking are gone; new
// patients default to "Консультація призначена".
const STAGE_REMAP = {
  lead: 'consult_scheduled',
  contact: 'consult_scheduled',
  thinking: 'consult_scheduled',
  consult_scheduled: 'consult_scheduled',
  consult_done: 'consult_done',
  plan: 'plan',
  treatment: 'treatment',
  done: 'done',
  lost: 'lost',
}

const translateVisit = (v) =>
  (v || '')
    .replace('Сегодня', 'Сьогодні')
    .replace('Завтра', 'Завтра')
    .replace('Вчера', 'Вчора')
    .replace('Завершено', 'Завершено')

// Build seeds. Ids are stable (derived from index) so positions persist.
export function buildMock() {
  const seeds = RAW.map((p, i) => {
    const a = ADMINS[p.admin]
    // Sprinkle a couple of demo cards into the new "Направлений на КТ" stage.
    const stage = i % 9 === 4 ? 'kt' : (STAGE_REMAP[p.stage] || 'consult_scheduled')
    return {
      id: `mock-${i + 1}`,
      name: p.name,
      phone: p.phone,
      service: p.service,
      comment: p.hot ? 'видалення 27, 28' : '',
      doctor: p.doctor,
      visit: translateVisit(p.visit),
      note: p.note,
      hot: p.hot,
      synced: p.synced,
      admin: { key: p.admin, initials: a.initials, name: a.name, color: a.color },
      defaultStage: stage,
      createdAt: null,
      // In demo mode we keep the hand-authored SLA labels until a card is moved.
      slaOverride: { sla: p.sla, slaState: p.slaState },
    }
  })
  return { seeds, rawNotifs: RAW_NOTIFS }
}
