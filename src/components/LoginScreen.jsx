import { useState } from 'react'
import { css } from '../css.js'

// Full-screen login gate. The whole app sits behind this — until a valid
// session exists nothing else renders.
export default function LoginScreen({ busy, error, onSubmit }) {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const submit = (e) => { e.preventDefault(); if (!busy) onSubmit(user.trim(), password) }

  return (
    <div style={css('height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f2138 0%,#19354f 55%,#1e3a5f 100%);padding:20px')}>
      <form
        onSubmit={submit}
        style={css('width:360px;background:#fff;border-radius:20px;box-shadow:0 40px 90px -30px rgba(3,12,26,.7);padding:30px;display:flex;flex-direction:column;gap:18px')}
      >
        <div style={css('display:flex;align-items:center;gap:12px')}>
          <div style={css('width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#1e3a5f,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;flex:none')}>
            <svg viewBox="0 0 24 24" width="23" height="23">
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 6.5v11M6.5 12h11" />
              </g>
            </svg>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:3px')}>
            <span style={css('font-size:18px;font-weight:700;color:#101d31;letter-spacing:-.015em')}>Потік пацієнтів</span>
            <span style={css('font-size:12px;color:#8a97a8')}>Вхід у систему</span>
          </div>
        </div>

        <label style={css('display:flex;flex-direction:column;gap:6px')}>
          <span style={css('font-size:11.5px;font-weight:600;color:#56667c')}>Логін</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoFocus
            autoComplete="username"
            style={css("height:42px;padding:0 13px;border:1px solid #e2e9f2;border-radius:12px;font-family:'Onest',sans-serif;font-size:14px;color:#22334c;outline:none")}
          />
        </label>
        <label style={css('display:flex;flex-direction:column;gap:6px')}>
          <span style={css('font-size:11.5px;font-weight:600;color:#56667c')}>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={css("height:42px;padding:0 13px;border:1px solid #e2e9f2;border-radius:12px;font-family:'Onest',sans-serif;font-size:14px;color:#22334c;outline:none")}
          />
        </label>

        {error && (
          <div style={css('font-size:12px;color:#be123c;background:#fff1f3;border:1px solid #fbcad3;border-radius:9px;padding:9px 12px')}>{error}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            ...css("height:44px;border:none;border-radius:13px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;font-family:'Onest',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer"),
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Вхід…' : 'Увійти'}
        </button>
      </form>
    </div>
  )
}
