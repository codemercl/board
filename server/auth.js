import crypto from 'node:crypto'
import { authSecret, ROLES, ROLE_DEFAULTS, ALL_STAGE_IDS, canManageUsers } from './config.js'

// Password hashing (scrypt) and stateless auth tokens (HMAC-signed). No session
// store — a token carries the user id and is verified by signature, then the
// user row is re-read on every request so permission/active changes take effect
// immediately (and revoked accounts stop working at once).

const KEYLEN = 32

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored) return false
  const [scheme, salt, hash] = String(stored).split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const test = crypto.scryptSync(String(password), salt, KEYLEN)
  const a = Buffer.from(hash, 'hex')
  return a.length === test.length && crypto.timingSafeEqual(a, test)
}

export function signToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, u: user.username })).toString('base64url')
  const sig = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expect = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return null
  }
}

export function bearerFrom(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : ''
}

// Normalise a role and its stage allowlist. `stages` null/omitted → role default;
// admins always see every column regardless of what's passed.
export function normalizeRole(role) {
  return ROLES.includes(role) ? role : 'nurse'
}

export function normalizeStages(role, stages) {
  if (role === 'admin') return null // admin sees everything
  if (stages == null) return ROLE_DEFAULTS[role]?.stages ?? null
  const allow = new Set(ALL_STAGE_IDS)
  const clean = [...new Set((Array.isArray(stages) ? stages : []).filter((s) => allow.has(s)))]
  return clean
}

// Shape a DB row into the object the client and middleware use (no password).
export function toPublicUser(row) {
  if (!row) return null
  const role = normalizeRole(row.role)
  const stages = role === 'admin' ? null : (row.stages == null ? ROLE_DEFAULTS[role]?.stages ?? null : row.stages)
  return {
    id: row.id,
    username: row.username,
    role,
    displayName: row.display_name || row.username,
    stages, // null = all columns
    canMove: row.can_move == null ? !!ROLE_DEFAULTS[role]?.canMove : !!row.can_move,
    active: row.active == null ? true : !!row.active,
    manageUsers: canManageUsers(role),
    createdAt: row.created_at || null,
  }
}
