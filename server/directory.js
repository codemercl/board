// Search over the compact patient directory that rides along with the board
// snapshot (see server/store.js getDirectory). Pure and dependency-free so it is
// testable without Express, a database, or a live Clinic Cards key.

const MIN_QUERY = 2
const DEFAULT_LIMIT = 20
// Minimum digits a query must have before it is allowed to match on phone.
// MUST NEVER be lowered to 0 (or omitted): with 0 digits, needleDigits is ''
// and String.prototype.includes('') is true for every string, so a query with
// no digits (e.g. a name) would match every patient's phone number and the
// phone branch would stop filtering anything.
const MIN_PHONE_DIGITS = 3

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
    const phoneHit = needleDigits.length >= MIN_PHONE_DIGITS && digitsOf(entry.phone).includes(needleDigits)
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
