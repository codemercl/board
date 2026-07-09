// Talks to our own backend (server/), never to Clinic Cards directly —
// the API key stays server-side.

async function req(url, opts) {
  const res = await fetch(url, opts)
  let json = {}
  try {
    json = await res.json()
  } catch {
    /* empty / non-json */
  }
  if (!res.ok || json.result === 'fail') {
    throw new Error(json.error || `HTTP ${res.status}`)
  }
  return json.data
}

export function fetchBoard(force = false) {
  return req(`/api/board${force ? '?refresh=1' : ''}`)
}

export function moveStage(id, stage) {
  return req(`/api/patients/${encodeURIComponent(id)}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  })
}

export function dismissFollowup(id, visitAt) {
  return req(`/api/patients/${encodeURIComponent(id)}/dismiss-followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitAt }),
  })
}

export function refreshBoard() {
  return req('/api/refresh', { method: 'POST' })
}
