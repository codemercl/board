import { config } from './config.js'

// Thin read-only client for the Clinic Cards API.
// Docs: https://documenter.getpostman.com/view/29513893/2s9YBxZbqY
// Every request needs `Token` + `Content-Type: application/json`.
// Responses use the envelope { data, result: 'success'|'fail', error }.

const PAGE_SIZE = 1000
const MAX_PAGES = 100 // safety cap (1000 * 100 = 100k patients)

async function ccFetch(pathAndQuery) {
  if (!config.apiKey) throw new Error('CLINIC_CARDS_API_KEY is not set')
  const url = `${config.baseUrl}${pathAndQuery}`
  let res
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Token: config.apiKey,
        'Content-Type': 'application/json',
      },
    })
  } catch (e) {
    throw new Error(`Clinic Cards request failed (${pathAndQuery}): ${e.message}`)
  }
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Clinic Cards returned non-JSON (${res.status}) for ${pathAndQuery}`)
  }
  if (!res.ok || json.result === 'fail') {
    throw new Error(json.error || `Clinic Cards HTTP ${res.status} for ${pathAndQuery}`)
  }
  return json.data
}

// Patients come paginated. The docs expose `limit`/`offset` (their sample also
// spells it `offest`), so we send both spellings to be safe.
export async function getPatients() {
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE
    const data = await ccFetch(`/patients?limit=${PAGE_SIZE}&offset=${offset}&offest=${offset}`)
    const batch = Array.isArray(data) ? data : []
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return all
}

export async function getPatientStatuses() {
  const data = await ccFetch('/patientStatuses')
  return Array.isArray(data) ? data : []
}

export async function getStaff() {
  const data = await ccFetch('/staff')
  return Array.isArray(data) ? data : []
}

// Treatment plans for a period — used as a fallback for the card's main line.
// One call covers everyone: we map plan_id -> plan_name.
export async function getPlans(from, to) {
  const data = await ccFetch(`/plans?from=${from}&to=${to}`)
  return Array.isArray(data) ? data : []
}

// Visits/appointments for a period — each has a `note` (the comment from the
// "визит пациента" popup) which we surface as the card's "Коментар".
export async function getVisits(from, to) {
  const data = await ccFetch(`/visits?from=${from}&to=${to}`)
  return Array.isArray(data) ? data : []
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)

// Pull everything the board needs in one shot.
export async function fetchClinicSnapshot() {
  const now = Date.now()
  const today = ymd(now)
  const visitsFrom = ymd(now - config.visitsBackDays * 86400000)
  const visitsTo = ymd(now + config.visitsFwdDays * 86400000)
  const [patients, statuses, staff, plans, visits] = await Promise.all([
    getPatients(),
    getPatientStatuses(),
    getStaff(),
    getPlans(config.plansSince, today).catch(() => []), // best-effort
    getVisits(visitsFrom, visitsTo).catch(() => []), // best-effort
  ])
  return { patients, statuses, staff, plans, visits }
}
