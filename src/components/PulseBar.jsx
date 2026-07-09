import { css } from '../css.js'
import { Icon } from '../icons.jsx'

function Conversion({ conversion }) {
  const c = conversion || {}
  const win = c.windowDays || 30

  if (!(c.apptToShowCount > 0)) {
    return (
      <div style={css('display:flex;align-items:center;gap:7px;white-space:nowrap')}>
        <span style={css('width:26px;height:26px;border-radius:8px;background:#eef4ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex:none')}>
          <Icon id="ic-trend" size={14} />
        </span>
        <span style={css('font-size:11.5px;color:#9aa6b6')}>Конверсія · поки немає переходів (за {win} дн)</span>
      </div>
    )
  }

  return (
    <div style={css('display:flex;align-items:center;gap:10px;white-space:nowrap')}>
      <span style={css('width:26px;height:26px;border-radius:8px;background:#eafaf0;color:#16a34a;display:flex;align-items:center;justify-content:center;flex:none')}>
        <Icon id="ic-trend" size={14} />
      </span>
      <div style={css('display:flex;align-items:baseline;gap:6px')}>
        <span style={css('font-size:11.5px;color:#7c8aa0')}>Консультація → Прийшов:</span>
        <span style={css("font:700 13px 'Onest',sans-serif;color:#13243b")}>{c.apptToShowCount}</span>
        {c.apptToShowPct != null && <span style={css('font-size:11.5px;color:#9aa6b6')}>({c.apptToShowPct}%)</span>}
      </div>
    </div>
  )
}

export default function PulseBar({ view }) {
  const { stats, workloadAll, workloadOpen, toggleWorkload, closeWorkload, curatorFilter, curatorFilterName, clearCurator, conversion } = view

  return (
    <div
      data-screen-label="Пульс дня"
      style={css('flex:none;display:flex;align-items:center;gap:22px;padding:11px 24px;background:#fff;border-bottom:1px solid #e8edf4;z-index:20')}
    >
      {stats.map((s) => (
        <div key={s.label} style={css('display:flex;align-items:center;gap:9px')}>
          <span
            style={{
              ...css('width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:none'),
              background: s.bg,
              color: s.color,
            }}
          >
            <Icon id={s.iconHref} size={15} />
          </span>
          <div style={css('display:flex;align-items:baseline;gap:6px;white-space:nowrap')}>
            <span style={css("font:700 17px 'Onest',sans-serif;letter-spacing:-.02em;color:#13243b")}>{s.value}</span>
            <span style={css('font-size:12px;color:#7c8aa0')}>{s.label}</span>
          </div>
        </div>
      ))}

      <div style={css('width:1px;height:26px;background:#e8edf4;flex:none')} />

      {/* Compact "Куратор ▾" select — filters the board by responsible person. */}
      <div style={css('display:flex;align-items:center;gap:9px;flex:none')}>
        <span style={css('font-size:11px;font-weight:600;color:#9aa6b6;letter-spacing:.05em;white-space:nowrap')}>НАВАНТАЖЕННЯ</span>
        <div style={css('position:relative')}>
          <button
            onClick={toggleWorkload}
            style={{
              ...css("display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:10px;cursor:pointer;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;white-space:nowrap;transition:background .15s"),
              background: curatorFilter ? '#eef4ff' : workloadOpen ? '#f1f4f8' : '#f4f6fa',
              border: `1px solid ${curatorFilter ? '#b9d0f5' : '#e5ebf3'}`,
              color: curatorFilter ? '#1e3a5f' : '#3c4d66',
            }}
          >
            <Icon id="ic-users" size={15} style={css('color:#8a97a8')} />
            <span style={css('max-width:150px;overflow:hidden;text-overflow:ellipsis')}>
              Лікар: {curatorFilter ? curatorFilterName : 'Всі'}
            </span>
            {curatorFilter ? (
              <span
                onClick={(e) => { e.stopPropagation(); clearCurator() }}
                style={css('display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:5px;color:#5b6b80')}
                title="Скинути"
              >
                <svg viewBox="0 0 24 24" width="13" height="13"><use href="#ic-x" /></svg>
              </span>
            ) : (
              <svg viewBox="0 0 24 24" width="12" height="12" style={{ transform: workloadOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: '#8a97a8' }}>
                <use href="#ic-chevr" />
              </svg>
            )}
          </button>

          {workloadOpen && (
            <>
              <div onClick={closeWorkload} style={css('position:fixed;inset:0;z-index:40')} />
              <div
                className="cccol"
                style={css(
                  'position:absolute;top:40px;left:0;z-index:41;width:262px;max-height:340px;overflow-y:auto;background:#fff;border:1px solid #e5ebf3;border-radius:13px;box-shadow:0 24px 48px -20px rgba(16,35,64,.4);padding:6px'
                )}
              >
                <div
                  onClick={() => { clearCurator(); closeWorkload() }}
                  className="cc-notif"
                  style={{
                    ...css('display:flex;align-items:center;gap:9px;padding:8px;border-radius:9px;cursor:pointer'),
                    background: curatorFilter ? 'transparent' : '#eef4ff',
                  }}
                >
                  <span style={css('width:24px;height:24px;border-radius:50%;background:#e2e9f2;color:#5b6b80;display:flex;align-items:center;justify-content:center;flex:none')}>
                    <Icon id="ic-users" size={13} />
                  </span>
                  <span style={css('font-size:12.5px;font-weight:600;color:#22334c;flex:1')}>Всі лікарі</span>
                </div>
                <div style={css('height:1px;background:#f0f3f7;margin:4px 2px')} />
                {workloadAll.map((w) => (
                  <div
                    key={w.key}
                    onClick={w.onClick}
                    className="cc-notif"
                    style={{
                      ...css('display:flex;align-items:center;gap:9px;padding:8px;border-radius:9px;cursor:pointer'),
                      background: w.active ? '#eef4ff' : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        ...css("width:24px;height:24px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font:600 9.5px 'Onest',sans-serif;flex:none"),
                        background: w.isNone ? '#b6c1cf' : w.color,
                      }}
                    >
                      {w.initials}
                    </span>
                    <span style={css('font-size:12.5px;font-weight:600;color:#22334c;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{w.name}</span>
                    <span style={css("font:600 11.5px 'JetBrains Mono',monospace;color:#8a97a8;flex:none")}>{w.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={css('flex:1')} />

      <Conversion conversion={conversion} />
    </div>
  )
}
