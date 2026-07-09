// Board funnel definition (display side). Patient data now comes from the
// backend (/api/board), which merges Clinic Cards with our saved positions.

// Default design props (the design exposed these as editor controls).
export const DEFAULT_PROPS = {
  showFeed: false,
  glowAttention: true,
  compactCards: false,
}

// How often to re-pull from the backend (ms). Backend caches Clinic Cards,
// so this stays well under the 60 req/min API limit.
export const POLL_MS = 5 * 60 * 1000

export const CHAIN = ['consult_scheduled', 'consult_done', 'kt', 'plan', 'treatment', 'done']

export const STAGES = [
  { id: 'consult_scheduled', title: 'Консультація призначена', color: '#7c3aed', tint: '#f4f0ff', norm: '24 год' },
  { id: 'consult_done',      title: 'Прийшов на консультацію', color: '#0891b2', tint: '#e8faff', norm: '4 год' },
  { id: 'kt',                title: 'Направлений на КТ',       color: '#4f46e5', tint: '#eef0ff', norm: '24 год' },
  { id: 'plan',              title: 'План лікування складено', color: '#0d9488', tint: '#e7fbf5', norm: '24 год' },
  { id: 'treatment',         title: 'Лікування в процесі',     color: '#d97706', tint: '#fff5e6', norm: '' },
  { id: 'done',              title: 'Лікування завершено',     color: '#16a34a', tint: '#eafaf0', norm: '' },
  { id: 'lost',              title: 'Втрачений / Відмова',     color: '#e11d48', tint: '#fff0f3', norm: '' },
]
