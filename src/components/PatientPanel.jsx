import { css } from '../css.js'
import { Icon } from '../icons.jsx'

export default function PatientPanel({ view }) {
  const { sel, closePanel } = view

  return (
    <div
      data-screen-label="Карточка пациента"
      style={css('position:absolute;top:16px;right:20px;bottom:16px;width:376px;background:#fff;border:1px solid #e2e9f2;border-radius:18px;box-shadow:0 40px 80px -30px rgba(16,35,64,.55);display:flex;flex-direction:column;overflow:hidden;z-index:26')}
    >
      {/* header */}
      <div style={css('flex:none;display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #eef2f7')}>
        <span
          style={{
            ...css("width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;font:700 15px 'Onest',sans-serif;flex:none"),
            background: sel.stageTint,
            color: sel.stageColor,
          }}
        >
          {sel.initials}
        </span>
        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
          <div style={css('display:flex;align-items:center;gap:8px')}>
            <span style={css('font-size:16.5px;font-weight:700;color:#101d31;letter-spacing:-.015em;line-height:1.15')}>{sel.name}</span>
            {sel.hot && (
              <span style={css('display:inline-flex;align-items:center;gap:3px;padding:3px 7px;border-radius:7px;background:linear-gradient(135deg,#fb923c,#ea580c);color:#fff;font-size:9.5px;font-weight:700;flex:none')}>
                <Icon id="ic-flame" size={10} />
                Гарячий
              </span>
            )}
          </div>
          <span style={css("font:500 11.5px 'JetBrains Mono',monospace;color:#8a97a8;letter-spacing:-.02em")}>{sel.phone}</span>
        </div>
        <button
          className="cc-close"
          onClick={closePanel}
          style={css('width:30px;height:30px;border:1px solid #e7ebf1;background:#fff;border-radius:9px;color:#7c8aa0;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}
        >
          <Icon id="ic-x" size={15} />
        </button>
      </div>

      {/* body */}
      <div className="cccol" style={css('flex:1;min-height:0;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:16px')}>
        <div style={css('display:flex;align-items:center;gap:8px')}>
          <span
            style={{
              ...css('display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:9px;font-size:12px;font-weight:600'),
              background: sel.stageTint,
              color: sel.stageColor,
            }}
          >
            <span style={{ ...css('width:7px;height:7px;border-radius:50%'), background: sel.stageColor }} />
            {sel.stageTitle}
          </span>
          {sel.needsFollowup ? (
            <span style={css('display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:9px;background:#e7f0fe;color:#1e40af;font-size:10.5px;font-weight:700;letter-spacing:.03em')}>
              <Icon id="ic-check" size={11} />
              Був у клініці{sel.followupVisitLabel ? ` · ${sel.followupVisitLabel}` : ''}
            </span>
          ) : sel.isStuck ? (
            <span style={css('display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:9px;background:#fdecd0;color:#b45309;font-size:10.5px;font-weight:700;letter-spacing:.03em')}>
              <Icon id="ic-alert" size={11} />
              ЗАСТРЯГ · {sel.daysInStage} дн
            </span>
          ) : sel.isOver ? (
            <span style={css('display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:9px;background:#ffe1e7;color:#be123c;font-size:10.5px;font-weight:700;letter-spacing:.03em')}>
              <Icon id="ic-alert" size={11} />
              ПРОСТРОЧЕНО
            </span>
          ) : null}
        </div>

        {/* action buttons */}
        <div style={css('display:flex;gap:8px')}>
          <button className="cc-action" style={css("flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border:1px solid #e2e9f2;border-radius:12px;background:#fbfcfe;cursor:pointer;color:#2c3e58;font-family:'Onest',sans-serif")}>
            <Icon id="ic-phone" size={17} style={css('color:#2563eb')} />
            <span style={css('font-size:11px;font-weight:600')}>Зателефонувати</span>
          </button>
          <button className="cc-action" style={css("flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border:1px solid #e2e9f2;border-radius:12px;background:#fbfcfe;cursor:pointer;color:#2c3e58;font-family:'Onest',sans-serif")}>
            <Icon id="ic-bell" size={17} style={css('color:#d97706')} />
            <span style={css('font-size:11px;font-weight:600')}>Нагадати</span>
          </button>
          <button className="cc-action" style={css("flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border:1px solid #e2e9f2;border-radius:12px;background:#fbfcfe;cursor:pointer;color:#2c3e58;font-family:'Onest',sans-serif")}>
            <Icon id="ic-ext" size={17} style={css('color:#7c3aed')} />
            <span style={css('font-size:11px;font-weight:600')}>Clinic Cards</span>
          </button>
        </div>
        <div style={css('font-size:10.5px;color:#9aa6b6;text-align:center;margin-top:-8px')}>
          Медкартка, фінанси та записи — у CRM. Тут лише статус.
        </div>

        {sel.hasNext && (
          <button
            className="cc-move"
            onClick={sel.moveNext}
            style={css("display:flex;align-items:center;justify-content:center;gap:9px;padding:12px;border:none;border-radius:12px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;font-family:'Onest',sans-serif;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 10px 22px -10px rgba(37,99,235,.65)")}
          >
            {sel.nextLabel}
            <Icon id="ic-arrowr" size={16} />
          </button>
        )}

        {/* SLA block */}
        <div style={{ ...css('border:1px solid #e8edf4;border-radius:13px;padding:13px 14px;display:flex;flex-direction:column;gap:9px'), background: sel.slaBlockBg }}>
          <div style={css('display:flex;align-items:center;gap:8px')}>
            <Icon id="ic-clock" size={15} style={css('color:#7c8aa0')} />
            <span style={css('font-size:12px;font-weight:600;color:#3c4d66;flex:1')}>На етапі без дії</span>
            <span style={{ ...css("font:700 13px 'JetBrains Mono',monospace"), color: sel.slaTextColor }}>{sel.sla}</span>
          </div>
          <div style={css('height:5px;border-radius:99px;background:rgba(15,27,45,.07);overflow:hidden')}>
            <div style={{ ...css('height:100%;border-radius:99px'), background: sel.slaBarColor, width: sel.slaPctW }} />
          </div>
          <div style={css('font-size:11px;color:#8a97a8')}>{sel.slaNorm}</div>
        </div>

        {/* info rows */}
        <div style={css('display:flex;flex-direction:column;gap:9px')}>
          {sel.infoRows.map((r) => (
            <div key={r.label} style={css('display:flex;align-items:center;gap:10px')}>
              <span style={css('width:28px;height:28px;border-radius:9px;background:#f4f6fa;color:#7c8aa0;display:flex;align-items:center;justify-content:center;flex:none')}>
                <Icon id={r.iconHref} size={14} />
              </span>
              <span style={css('font-size:11.5px;color:#8a97a8;width:88px;flex:none')}>{r.label}</span>
              <span style={css('font-size:12.5px;font-weight:600;color:#22334c;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* timeline */}
        <div style={css('display:flex;flex-direction:column;gap:2px')}>
          <div style={css('font-size:11px;font-weight:700;color:#9aa6b6;letter-spacing:.06em;margin-bottom:8px')}>ШЛЯХ ПАЦІЄНТА</div>
          {sel.timeline.map((t, i) => (
            <div key={i} style={css('display:flex;gap:11px')}>
              <div style={css('display:flex;flex-direction:column;align-items:center;width:22px;flex:none')}>
                <span
                  style={{
                    ...css('width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none'),
                    background: t.dotBg,
                    color: t.dotColor,
                    animation: t.dotAnim,
                  }}
                >
                  {t.isDone && <Icon id="ic-check" size={12} />}
                  {t.isCurrent && <span style={css('width:8px;height:8px;border-radius:50%;background:currentColor')} />}
                  {t.isFuture && <span style={css('width:7px;height:7px;border-radius:50%;border:1.5px solid currentColor')} />}
                </span>
                {t.showLine && <span style={css('width:2px;flex:1;min-height:12px;background:#e6ecf3;margin:2px 0')} />}
              </div>
              <div style={css('display:flex;flex-direction:column;gap:2px;padding-bottom:12px;min-width:0')}>
                <span style={{ ...css('font-size:12.5px;font-weight:600;line-height:1.3'), color: t.titleColor }}>{t.title}</span>
                <div style={css('display:flex;align-items:center;gap:6px')}>
                  <span style={css('font-size:11px;color:#9aa6b6')}>{t.time}</span>
                  {t.hasMark && (
                    <span style={{ ...css('padding:1.5px 6px;border-radius:5px;font-size:9.5px;font-weight:600'), background: t.markBg, color: t.markColor }}>
                      {t.mark}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* footer */}
      <div style={css('flex:none;display:flex;align-items:center;gap:9px;padding:13px 18px;border-top:1px solid #eef2f7;background:#fbfcfe')}>
        <span
          style={{
            ...css("width:28px;height:28px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font:600 10px 'Onest',sans-serif;flex:none"),
            background: sel.adminColor,
          }}
        >
          {sel.adminInitials}
        </span>
        <span style={css('font-size:12px;color:#56667c')}>
          Відповідальний: <b style={css('color:#22334c')}>{sel.adminName}</b>
        </span>
      </div>
    </div>
  )
}
