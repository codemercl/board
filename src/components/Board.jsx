import { useEffect, useState } from 'react'
import { css } from '../css.js'
import { Icon } from '../icons.jsx'

// Per-column render window. Columns can hold thousands of cards (all new leads
// land in the first column), so we render a slice and grow it as the user
// scrolls — keeps initial mount fast without hiding anyone.
const WINDOW_BASE = 25
const WINDOW_STEP = 25
const WINDOW_JUMP = 100

function PatientCard({ p }) {
  return (
    <div
      className="cc-card"
      onClick={p.select}
      style={{
        ...css('border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease'),
        background: p.cardBg,
        border: `1.5px solid ${p.cardBorder}`,
        boxShadow: p.cardShadow,
      }}
    >
      {p.needsFollowup ? (
        <div style={css('display:flex;align-self:stretch;align-items:flex-start;gap:6px;padding:7px 8px;border-radius:9px;background:#e7f0fe;border:1px solid #bcd4f6')}>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
            <div style={css('display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:#1e40af;letter-spacing:.02em')}>
              <Icon id="ic-check" size={12} />
              Був у клініці · перемістити
            </div>
            {p.followupVisitLabel && (
              <div style={css('display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:500;color:#3b62a3')}>
                <Icon id="ic-calendar" size={11} />
                Візит {p.followupVisitLabel} минув
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); p.dismissFollowup() }}
            title="Закрити нагадування"
            style={css('flex:none;width:20px;height:20px;border:none;border-radius:6px;background:transparent;color:#5b7bb0;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0')}
          >
            <Icon id="ic-x" size={13} />
          </button>
        </div>
      ) : p.isStuck ? (
        <div style={css('display:flex;align-self:flex-start;flex-direction:column;gap:4px')}>
          <div style={css('display:inline-flex;align-self:flex-start;align-items:center;gap:5px;padding:3px 9px;border-radius:7px;background:#fdecd0;color:#b45309;font-size:10px;font-weight:700;letter-spacing:.04em')}>
            <Icon id="ic-alert" size={11} />
            ЗАСТРЯГ · {p.daysInStage} дн
          </div>
          {p.nextTitle && (
            <div style={css('display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:#9a7b3f')}>
              <svg viewBox="0 0 24 24" width="11" height="11"><use href="#ic-arrowr" /></svg>
              {p.nextTitle}
            </div>
          )}
        </div>
      ) : p.isOver ? (
        <div style={css('display:inline-flex;align-self:flex-start;align-items:center;gap:5px;padding:3px 9px;border-radius:7px;background:#ffe1e7;color:#be123c;font-size:10px;font-weight:700;letter-spacing:.04em')}>
          <Icon id="ic-alert" size={11} />
          ПРОСТРОЧЕНО
        </div>
      ) : null}

      <div style={css('display:flex;align-items:center;gap:10px')}>
        <span
          style={{
            ...css("width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font:700 12.5px 'Onest',sans-serif;flex:none"),
            background: p.stageTint,
            color: p.stageColor,
          }}
        >
          {p.initials}
        </span>
        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <span style={css('font-size:14.5px;font-weight:700;color:#101d31;letter-spacing:-.015em;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden')}>
            {p.name}
          </span>
          <span style={css("font:500 10.5px 'JetBrains Mono',monospace;color:#8a97a8;letter-spacing:-.02em")}>{p.phone}</span>
        </div>
        {p.hot && (
          <span style={css('display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:8px;background:linear-gradient(135deg,#fb923c,#ea580c);color:#fff;font-size:10px;font-weight:700;flex:none;box-shadow:0 4px 10px -4px rgba(234,88,12,.6)')}>
            <Icon id="ic-flame" size={11} />
            Гарячий
          </span>
        )}
      </div>

      <div style={css('display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:500;color:#34455e')}>
        <span style={{ ...css('width:7px;height:7px;border-radius:50%;flex:none'), background: p.stageColor }} />
        <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.comment || p.service}</span>
      </div>

      {p.showDoctor && (
        <div style={css('display:flex;align-items:center;gap:8px;color:#56667c;font-size:12px')}>
          <Icon id="ic-user" size={15} style={css('color:#aab5c4;flex:none')} />
          <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.doctor}</span>
        </div>
      )}
      {p.showVisit && (
        <div style={css('display:flex;align-items:center;gap:8px;color:#56667c;font-size:12px')}>
          <Icon id="ic-calendar" size={15} style={css('color:#aab5c4;flex:none')} />
          <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.visit}</span>
        </div>
      )}
      {p.showNote && (
        <div style={css('display:flex;align-items:center;gap:7px;font-size:11.5px;color:#94a3b4')}>
          <span style={css('width:5px;height:5px;border-radius:50%;background:#cbd5e1;flex:none')} />
          <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.note}</span>
        </div>
      )}

      {p.hasSla && (
        <div style={css('height:4px;border-radius:99px;background:#edf1f6;overflow:hidden')}>
          <div style={{ ...css('height:100%;border-radius:99px;transition:width .3s'), background: p.slaBarColor, width: p.slaPctW }} />
        </div>
      )}

      <div style={css('display:flex;align-items:center;gap:8px;padding-top:10px;border-top:1px solid #eef2f7')}>
        <span
          style={{
            ...css("display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:8px;font:600 11px 'JetBrains Mono',monospace"),
            background: p.slaBg,
            border: `1px solid ${p.slaBorder}`,
            color: p.slaColor,
          }}
        >
          <Icon id="ic-clock" size={12} />
          {p.sla}
        </span>
        {p.synced && (
          <span style={css('display:inline-flex;align-items:center;gap:4px;color:#2563eb;font-size:10.5px;font-weight:600')}>
            <Icon id="ic-sync" size={12} />
            з CRM
          </span>
        )}
        <span style={css('flex:1')} />
        <span
          style={{
            ...css("width:27px;height:27px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font:600 10px 'Onest',sans-serif;flex:none"),
            background: p.adminColor,
          }}
        >
          {p.adminInitials}
        </span>
      </div>
    </div>
  )
}

function Column({ col, filterKey }) {
  const [limit, setLimit] = useState(WINDOW_BASE)
  // Reset the window whenever the active filter changes.
  useEffect(() => { setLimit(WINDOW_BASE) }, [filterKey])

  const shown = col.patients.slice(0, limit)
  const remaining = col.patients.length - shown.length

  const onScroll = (e) => {
    if (remaining <= 0) return
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 320) {
      setLimit((l) => l + WINDOW_STEP)
    }
  }

  return (
    <div style={{ ...css('flex:0 0 auto;height:100%;display:flex;flex-direction:column;gap:10px;transition:width .25s ease'), width: col.width }}>
      {col.isCollapsed ? (
        <div
          className="cc-collapsed-col"
          onClick={col.toggle}
          style={{
            ...css('flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 0;border-radius:13px;cursor:pointer;border:1px solid rgba(15,27,45,.05)'),
            background: col.tint,
          }}
        >
          <span style={css('width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,.75);color:#5b6b80;display:flex;align-items:center;justify-content:center;flex:none')}>
            <Icon id="ic-chevr" size={14} />
          </span>
          <span style={css("min-width:22px;height:21px;padding:0 6px;border-radius:7px;background:rgba(255,255,255,.78);color:#46566e;font:600 11px/21px 'JetBrains Mono',monospace;text-align:center")}>
            {col.count}
          </span>
          <span style={css('writing-mode:vertical-rl;font-size:12px;font-weight:600;color:#3c4d66;letter-spacing:.02em')}>{col.title}</span>
          <span style={{ ...css('width:8px;height:8px;border-radius:3px;flex:none;margin-top:auto'), background: col.color }} />
        </div>
      ) : (
        <>
          <div style={{ ...css('flex:none;display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;border-radius:11px'), background: col.tint }}>
            <span style={{ ...css('width:9px;height:9px;border-radius:3px;flex:none'), background: col.color }} />
            <span style={css('font-size:12.5px;font-weight:600;color:#23324a;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{col.title}</span>
            {col.hasAttn && (
              <span style={css("display:inline-flex;align-items:center;gap:2px;height:21px;padding:0 7px;border-radius:7px;background:#fee2e6;color:#be123c;font:700 10.5px/21px 'JetBrains Mono',monospace;flex:none")}>
                <Icon id="ic-alert" size={11} />
                {col.attnCount}
              </span>
            )}
            <span style={css("min-width:22px;height:21px;padding:0 7px;border-radius:7px;background:rgba(255,255,255,.78);color:#46566e;font:600 11.5px/21px 'JetBrains Mono',monospace;text-align:center;flex:none")}>
              {col.count}
            </span>
            <button
              className="cc-col-collapse"
              onClick={col.toggle}
              style={css('width:21px;height:21px;border:none;border-radius:6px;background:transparent;color:#7c8aa0;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0')}
            >
              <Icon id="ic-chevl" size={13} />
            </button>
          </div>
          <div className="cccol" onScroll={onScroll} style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:11px;padding:3px 5px 10px 3px')}>
            {col.isEmpty && (
              <div style={css('border:1.5px dashed #d4dce7;border-radius:13px;padding:22px 12px;text-align:center;font-size:12px;color:#9aa6b6')}>Немає карток</div>
            )}
            {shown.map((p) => (
              <PatientCard key={p.id} p={p} />
            ))}
            {remaining > 0 && (
              <button
                onClick={() => setLimit((l) => l + WINDOW_JUMP)}
                className="cc-action"
                style={css("flex:none;padding:9px;border:1px dashed #cbd5e1;border-radius:12px;background:#fbfcfe;cursor:pointer;font-family:'Onest',sans-serif;font-size:11.5px;font-weight:600;color:#5b6b80")}
              >
                Показати ще · залишилось {remaining}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Board({ view }) {
  return (
    <div className="ccboard" style={css('height:100%;display:flex;gap:14px;padding:18px 22px 12px;overflow-x:auto;align-items:stretch')}>
      {view.columns.map((col) => (
        <Column key={col.id} col={col} filterKey={view.filterKey} />
      ))}
    </div>
  )
}
