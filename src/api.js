// Talks to our own backend (server/), never to Clinic Cards directly —
// the API key stays server-side.

const TOKEN_KEY = 'board_admin_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

function authHeaders() {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function req(url, opts) {
  const res = await fetch(url, opts)
  let json = {}
  try {
    json = await res.json()
  } catch {
    /* empty / non-json */
  }
  if (!res.ok || json.result === 'fail') {
    const err = new Error(json.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return json.data
}

export function fetchBoard(force = false) {
  return req(`/api/board${force ? '?refresh=1' : ''}`, { headers: { ...authHeaders() } })
}

// Login → stores the bearer token; returns the user profile (role + columns).
export async function login(user, password) {
  const data = await req('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  })
  setToken(data.token)
  return data.user
}

// Restore/validate a session from the stored token → current user profile.
export function me() {
  return req('/api/me', { headers: { ...authHeaders() } })
}

export function logout() {
  setToken('')
}

// ─── User management (admins only) ──────────────────────────────────────────
export function listUsers() {
  return req('/api/users', { headers: { ...authHeaders() } })
}

export function createUser(payload) {
  return req('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
}

export function updateUser(id, patch) {
  return req(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  })
}

export function deleteUser(id) {
  return req(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
}

export function moveStage(id, stage) {
  return req(`/api/patients/${encodeURIComponent(id)}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ stage }),
  })
}

export function setFrozen(id, frozen) {
  return req(`/api/patients/${encodeURIComponent(id)}/frozen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ frozen }),
  })
}

export function dismissFollowup(id, visitAt) {
  return req(`/api/patients/${encodeURIComponent(id)}/dismiss-followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ visitAt }),
  })
}

export function refreshBoard() {
  return req('/api/refresh', { method: 'POST', headers: { ...authHeaders() } })
}

// ─── Treatment-plan review ──────────────────────────────────────────────────
export function listStaff() {
  return req('/api/staff', { headers: { ...authHeaders() } })
}

function planPost(id, action, body) {
  return req(`/api/patients/${encodeURIComponent(id)}/plan/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body || {}),
  })
}

export function setPlanResponsibles(id, responsibles, patientName) {
  return planPost(id, 'responsibles', { responsibles, patientName })
}

export function planSignoff(id, { comment, userId, patientName }) {
  return planPost(id, 'signoff', { comment, userId, patientName })
}

export function planPostpone(id, { comment, patientName }) {
  return planPost(id, 'postpone', { comment, patientName })
}
