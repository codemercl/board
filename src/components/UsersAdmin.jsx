import { useCallback, useEffect, useState } from 'react'
import { css } from '../css.js'
import { Icon } from '../icons.jsx'
import { STAGES, ROLES, ROLE_LABELS, ROLE_DEFAULTS } from '../data.js'
import * as api from '../api.js'

const roleBadge = {
  admin: { bg: '#eef4ff', color: '#2563eb' },
  doctor: { bg: '#e7fbf5', color: '#0d9488' },
  nurse: { bg: '#f4f0ff', color: '#7c3aed' },
}

const inputCss = css("height:40px;padding:0 12px;border:1px solid #e2e9f2;border-radius:11px;font-family:'Onest',sans-serif;font-size:13.5px;color:#22334c;outline:none;width:100%")
const labelCss = css('font-size:11.5px;font-weight:600;color:#56667c')

// Blank form → new account with the "nurse" preset.
const emptyForm = () => ({
  id: null,
  username: '',
  password: '',
  displayName: '',
  role: 'nurse',
  stages: ROLE_DEFAULTS.nurse.stages ? [...ROLE_DEFAULTS.nurse.stages] : [],
  canMove: !!ROLE_DEFAULTS.nurse.canMove,
  active: true,
})

function columnsLabel(user) {
  if (user.role === 'admin' || user.stages == null) return 'Усі колонки'
  if (!user.stages.length) return 'Немає колонок'
  return STAGES.filter((s) => user.stages.includes(s.id)).map((s) => s.title).join(', ')
}

export default function UsersAdmin({ view }) {
  const meId = view.me?.id
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // null = no editor open
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.listUsers()
      setUsers(list)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const patch = (p) => setForm((f) => ({ ...f, ...p }))

  // Switching role reapplies that role's column/move preset.
  const onRole = (role) => {
    const d = ROLE_DEFAULTS[role] || {}
    patch({ role, stages: d.stages ? [...d.stages] : [], canMove: !!d.canMove })
  }

  const toggleStage = (id) => {
    setForm((f) => {
      const has = f.stages.includes(id)
      return { ...f, stages: has ? f.stages.filter((s) => s !== id) : [...f.stages, id] }
    })
  }

  const startCreate = () => { setFormError(null); setForm(emptyForm()) }
  const startEdit = (u) => {
    setFormError(null)
    setForm({
      id: u.id,
      username: u.username,
      password: '',
      displayName: u.displayName === u.username ? '' : u.displayName,
      role: u.role,
      stages: u.stages == null ? (ROLE_DEFAULTS[u.role]?.stages || []) : [...u.stages],
      canMove: !!u.canMove,
      active: u.active !== false,
    })
  }
  const closeForm = () => { setForm(null); setFormError(null) }

  const save = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setFormError(null)
    const isAdmin = form.role === 'admin'
    const payload = {
      username: form.username.trim(),
      displayName: form.displayName.trim() || form.username.trim(),
      role: form.role,
      // admins always see everything → send null (server enforces this too).
      stages: isAdmin ? null : form.stages,
      canMove: form.canMove,
      active: form.active,
    }
    if (form.password) payload.password = form.password
    try {
      if (form.id) {
        await api.updateUser(form.id, payload)
      } else {
        if (!payload.username) throw new Error('Вкажіть логін')
        if (!form.password) throw new Error('Вкажіть пароль')
        await api.createUser({ ...payload, password: form.password })
      }
      await reload()
      closeForm()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (u) => {
    if (u.id === meId) return
    if (!window.confirm(`Видалити акаунт «${u.displayName}»?`)) return
    try {
      await api.deleteUser(u.id)
      await reload()
    } catch (e) {
      setError(e.message)
    }
  }

  const isAdminRole = form?.role === 'admin'

  return (
    <div style={css('flex:1;min-height:0;overflow-y:auto;padding:22px 26px 40px;background:#f4f6f9')}>
      <div style={css('max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:18px')}>
        {/* header */}
        <div style={css('display:flex;align-items:center;gap:12px')}>
          <button
            onClick={view.openBoard}
            className="cc-action"
            style={css("display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 13px;border:1px solid #e2e9f2;border-radius:11px;background:#fff;color:#56667c;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer")}
          >
            <Icon id="ic-chevl" size={14} />
            До борду
          </button>
          <div style={css('display:flex;flex-direction:column;gap:2px;flex:1')}>
            <span style={css('font-size:20px;font-weight:700;color:#101d31;letter-spacing:-.015em')}>Користувачі та права</span>
            <span style={css('font-size:12.5px;color:#8a97a8')}>Створюйте акаунти й налаштовуйте, які колонки бачить кожна роль</span>
          </div>
          <button
            onClick={startCreate}
            style={css("display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 16px;border:none;border-radius:12px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;font-family:'Onest',sans-serif;font-size:13px;font-weight:600;cursor:pointer")}
          >
            <Icon id="ic-plus" size={16} />
            Новий акаунт
          </button>
        </div>

        {error && (
          <div style={css('font-size:12.5px;color:#be123c;background:#fff1f3;border:1px solid #fbcad3;border-radius:11px;padding:11px 14px')}>{error}</div>
        )}

        {/* editor */}
        {form && (
          <form
            onSubmit={save}
            style={css('background:#fff;border:1px solid #e6ecf3;border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:16px;box-shadow:0 18px 40px -28px rgba(16,35,64,.4)')}
          >
            <span style={css('font-size:15px;font-weight:700;color:#101d31')}>{form.id ? 'Редагувати акаунт' : 'Новий акаунт'}</span>

            <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
              <label style={css('display:flex;flex-direction:column;gap:6px')}>
                <span style={labelCss}>Логін</span>
                <input value={form.username} onChange={(e) => patch({ username: e.target.value })} autoComplete="off" style={inputCss} />
              </label>
              <label style={css('display:flex;flex-direction:column;gap:6px')}>
                <span style={labelCss}>Ім'я (відображається)</span>
                <input value={form.displayName} onChange={(e) => patch({ displayName: e.target.value })} placeholder={form.username || '—'} style={inputCss} />
              </label>
              <label style={css('display:flex;flex-direction:column;gap:6px')}>
                <span style={labelCss}>{form.id ? 'Новий пароль (порожньо — без змін)' : 'Пароль'}</span>
                <input type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} autoComplete="new-password" style={inputCss} />
              </label>
              <label style={css('display:flex;flex-direction:column;gap:6px')}>
                <span style={labelCss}>Роль</span>
                <select value={form.role} onChange={(e) => onRole(e.target.value)} style={{ ...inputCss, cursor: 'pointer' }}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </label>
            </div>

            {/* columns */}
            <div style={css('display:flex;flex-direction:column;gap:9px')}>
              <span style={labelCss}>Видимі колонки</span>
              {isAdminRole ? (
                <div style={css('font-size:12.5px;color:#0d9488;background:#e7fbf5;border:1px solid #b9ede0;border-radius:10px;padding:10px 13px')}>
                  Адміністратор бачить усі колонки
                </div>
              ) : (
                <div style={css('display:flex;flex-wrap:wrap;gap:8px')}>
                  {STAGES.map((s) => {
                    const on = form.stages.includes(s.id)
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => toggleStage(s.id)}
                        style={{
                          ...css("display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:10px;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer"),
                          background: on ? s.tint : '#f6f8fb',
                          border: `1px solid ${on ? s.color : '#e2e9f2'}`,
                          color: on ? s.color : '#8a97a8',
                        }}
                      >
                        <span style={{ ...css('width:8px;height:8px;border-radius:3px;flex:none'), background: on ? s.color : '#cbd5e1' }} />
                        {s.title}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* flags */}
            <div style={css('display:flex;gap:22px;flex-wrap:wrap')}>
              <label style={css('display:inline-flex;align-items:center;gap:9px;cursor:pointer')}>
                <input type="checkbox" checked={form.canMove} onChange={(e) => patch({ canMove: e.target.checked })} style={css('width:16px;height:16px;cursor:pointer')} />
                <span style={css('font-size:13px;font-weight:600;color:#34455e')}>Може переміщати картки</span>
              </label>
              <label style={css('display:inline-flex;align-items:center;gap:9px;cursor:pointer')}>
                <input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} disabled={form.id === meId} style={css('width:16px;height:16px;cursor:pointer')} />
                <span style={css('font-size:13px;font-weight:600;color:#34455e')}>Акаунт активний</span>
              </label>
            </div>

            {formError && (
              <div style={css('font-size:12px;color:#be123c;background:#fff1f3;border:1px solid #fbcad3;border-radius:9px;padding:9px 12px')}>{formError}</div>
            )}

            <div style={css('display:flex;gap:10px;justify-content:flex-end')}>
              <button type="button" onClick={closeForm} style={css("height:40px;padding:0 16px;border:1px solid #e2e9f2;border-radius:11px;background:#fff;color:#56667c;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer")}>
                Скасувати
              </button>
              <button type="submit" disabled={saving} style={{ ...css("height:40px;padding:0 20px;border:none;border-radius:11px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer"), opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Збереження…' : (form.id ? 'Зберегти' : 'Створити акаунт')}
              </button>
            </div>
          </form>
        )}

        {/* list */}
        <div style={css('background:#fff;border:1px solid #e6ecf3;border-radius:16px;overflow:hidden')}>
          <div style={css('display:grid;grid-template-columns:1.4fr 1fr 2fr .8fr auto;gap:12px;padding:13px 18px;background:#f8fafc;border-bottom:1px solid #eef2f7')}>
            {['Користувач', 'Роль', 'Колонки', 'Права', ''].map((h, i) => (
              <span key={i} style={css('font-size:11px;font-weight:700;color:#8a97a8;letter-spacing:.03em;text-transform:uppercase')}>{h}</span>
            ))}
          </div>
          {loading ? (
            <div style={css('padding:26px;text-align:center;font-size:13px;color:#8a97a8')}>Завантаження…</div>
          ) : users.length === 0 ? (
            <div style={css('padding:26px;text-align:center;font-size:13px;color:#8a97a8')}>Немає акаунтів</div>
          ) : (
            users.map((u) => {
              const rb = roleBadge[u.role] || roleBadge.nurse
              return (
                <div key={u.id} style={css('display:grid;grid-template-columns:1.4fr 1fr 2fr .8fr auto;gap:12px;align-items:center;padding:13px 18px;border-bottom:1px solid #f2f5f9')}>
                  <div style={css('display:flex;flex-direction:column;gap:2px;min-width:0')}>
                    <span style={css('font-size:13.5px;font-weight:600;color:#101d31;display:flex;align-items:center;gap:7px')}>
                      {u.displayName}
                      {u.id === meId && <span style={css('font-size:10px;font-weight:700;color:#2563eb;background:#eef4ff;border-radius:6px;padding:1px 6px')}>ви</span>}
                      {u.active === false && <span style={css('font-size:10px;font-weight:700;color:#be123c;background:#fff1f3;border-radius:6px;padding:1px 6px')}>вимкнено</span>}
                    </span>
                    <span style={css("font:500 11px 'JetBrains Mono',monospace;color:#8a97a8")}>{u.username}</span>
                  </div>
                  <span style={{ ...css('justify-self:start;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:8px'), background: rb.bg, color: rb.color }}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                  <span style={css('font-size:12px;color:#56667c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{columnsLabel(u)}</span>
                  <span style={css('font-size:11.5px;font-weight:600')}>
                    {u.canMove
                      ? <span style={css('color:#0d9488')}>Рух карток</span>
                      : <span style={css('color:#94a3b4')}>Тільки перегляд</span>}
                  </span>
                  <div style={css('display:flex;gap:7px;justify-self:end')}>
                    <button onClick={() => startEdit(u)} title="Редагувати" style={css('width:32px;height:32px;border:1px solid #e2e9f2;border-radius:9px;background:#fff;color:#56667c;display:flex;align-items:center;justify-content:center;cursor:pointer')}>
                      <Icon id="ic-user" size={15} />
                    </button>
                    <button onClick={() => remove(u)} disabled={u.id === meId} title="Видалити" style={{ ...css('width:32px;height:32px;border:1px solid #f3d3da;border-radius:9px;background:#fff;color:#e11d48;display:flex;align-items:center;justify-content:center;cursor:pointer'), opacity: u.id === meId ? 0.35 : 1 }}>
                      <Icon id="ic-x" size={15} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
