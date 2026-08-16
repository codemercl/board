import { css } from '../css.js'
import { Icon } from '../icons.jsx'
import { ROLE_LABELS } from '../data.js'

function relTime(iso) {
  if (!iso) return ''
  const min = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${Math.round(min)} хв тому`
  const h = min / 60
  if (h < 24) return `${Math.floor(h)} год тому`
  return `${Math.floor(h / 24)} дн тому`
}

function syncLine(sync) {
  if (sync.error) return { dot: '#f43f5e', text: 'Clinic Cards · помилка синхронізації' }
  if (sync.source === 'mock') return { dot: '#f59e0b', text: 'Clinic Cards · демо-режим (немає API-ключа)' }
  if (!sync.updatedAt) return { dot: '#34d399', text: 'Clinic Cards · завантаження…' }
  return { dot: '#34d399', text: `Clinic Cards · синхронізовано ${relTime(sync.updatedAt)}` }
}

export default function Header({ view, sync, onHelp }) {
  const { tabs, query, onQuery, toggleFeed, feedCount } = view
  const line = syncLine(sync)

  return (
    <div
      data-screen-label="Шапка"
      className="cc-header"
      style={css(
        "flex:none;display:flex;align-items:center;gap:14px;padding:15px 22px;background:linear-gradient(120deg,#0f2138 0%,#19354f 55%,#1e3a5f 100%);box-shadow:0 8px 24px -16px rgba(15,33,56,.7);z-index:30"
      )}
    >
      {/* logo + title */}
      <div style={css('flex:none;display:flex;align-items:center;gap:13px')}>
        <div
          style={css(
            'width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;color:#fff;flex:none'
          )}
        >
          <svg viewBox="0 0 24 24" width="21" height="21">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 6.5v11M6.5 12h11" />
            </g>
          </svg>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:3px')}>
          <div style={css('font-size:18px;font-weight:700;letter-spacing:-.015em;color:#fff;white-space:nowrap')}>
            Потік пацієнтів
          </div>
          <div className="cc-hide-mobile" style={css('display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,.6);white-space:nowrap')}>
            <span style={{ ...css('width:7px;height:7px;border-radius:50%;animation:ccpulse 2.6s infinite;flex:none'), background: line.dot }} />
            {line.text}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div
        className="cc-tabs"
        style={css(
          'flex:none;display:flex;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:11px;padding:3px;gap:2px;margin-left:8px'
        )}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={t.onClick}
            style={{
              ...css("display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:8px;border:none;cursor:pointer;font-family:'Onest',sans-serif;font-size:12.5px;white-space:nowrap;transition:background .15s"),
              background: t.bg,
              color: t.color,
              fontWeight: t.fw,
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span
                style={{
                  ...css("min-width:17px;height:17px;padding:0 4px;border-radius:6px;font:600 10.5px/17px 'JetBrains Mono',monospace;text-align:center"),
                  background: t.id === 'attention' ? '#f43f5e' : t.id === 'hot' ? '#ea580c' : 'rgba(255,255,255,.2)',
                  color: '#fff',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* search */}
      <div
        className="cc-search"
        style={css(
          'flex:1;display:flex;align-items:center;gap:8px;padding:0 12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:11px;min-width:140px;height:40px'
        )}
      >
        <Icon id="ic-search" size={15} style={css('flex:none;color:rgba(255,255,255,.6)')} />
        <input
          className="ccsearch"
          value={query}
          onChange={onQuery}
          placeholder="Пошук: ім'я, телефон…"
          style={css("flex:1;min-width:0;background:transparent;border:none;outline:none;font-family:'Onest',sans-serif;font-size:12.5px;color:#fff;padding:0")}
        />
      </div>

      {/* refresh */}
      <button
        className="cc-bell"
        onClick={sync.onRefresh}
        title="Оновити з Clinic Cards"
        style={css(
          'flex:none;width:40px;height:40px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.1);border-radius:11px;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer'
        )}
      >
        <Icon id="ic-sync" size={18} style={sync.refreshing ? { animation: 'ccspin .9s linear infinite' } : undefined} />
      </button>

      {/* info / guide */}
      <button
        className="cc-bell"
        onClick={onHelp}
        title="Як це працює"
        style={css(
          'flex:none;width:40px;height:40px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.1);border-radius:11px;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer'
        )}
      >
        <Icon id="ic-info" size={19} />
      </button>

      {/* bell */}
      <button
        className="cc-bell"
        onClick={toggleFeed}
        style={css(
          'position:relative;flex:none;width:40px;height:40px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.1);border-radius:11px;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer'
        )}
      >
        <Icon id="ic-bell" size={18} />
        {feedCount > 0 && (
          <span
            style={css(
              "position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#f43f5e;color:#fff;font:600 10.5px/18px 'JetBrains Mono',monospace;text-align:center;border:2px solid #1a3553"
            )}
          >
            {feedCount}
          </span>
        )}
      </button>

      {/* user management (admins only) */}
      {view.manageUsers && (
        <button
          className="cc-bell"
          onClick={view.screen === 'users' ? view.openBoard : view.openUsers}
          title="Користувачі та права"
          style={{
            ...css("flex:none;display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 14px;border-radius:11px;color:#fff;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap"),
            background: view.screen === 'users' ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.1)',
            border: '1px solid rgba(255,255,255,.16)',
          }}
        >
          <Icon id="ic-users" size={17} />
          {view.screen === 'users' ? 'До борду' : 'Користувачі'}
        </button>
      )}

      {/* current user + logout */}
      <div style={css('flex:none;display:flex;align-items:center;gap:8px')}>
        <span
          className="cc-hide-mobile"
          style={css(
            "display:inline-flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;height:40px;padding:0 13px;border-radius:11px;background:rgba(52,211,153,.14);border:1px solid rgba(52,211,153,.34);white-space:nowrap"
          )}
        >
          <span style={css("font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;color:#eafff6;line-height:1.1")}>{view.me?.displayName || 'Користувач'}</span>
          <span style={css("font-size:10px;font-weight:600;color:rgba(209,250,229,.7);line-height:1.1")}>{ROLE_LABELS[view.me?.role] || view.me?.role}</span>
        </span>
        <button
          className="cc-bell"
          onClick={view.logout}
          title="Вийти"
          style={css(
            'flex:none;width:40px;height:40px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.1);border-radius:11px;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer'
          )}
        >
          <Icon id="ic-ext" size={18} />
        </button>
      </div>
    </div>
  )
}
