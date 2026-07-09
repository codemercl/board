import { css } from '../css.js'
import { Icon } from '../icons.jsx'

export default function CrmFeed({ view }) {
  const { notifications, closeFeed } = view

  return (
    <div
      data-screen-label="Лента CRM"
      style={css('position:absolute;top:16px;right:20px;width:346px;max-height:calc(100% - 32px);background:#fff;border:1px solid #e5ebf3;border-radius:16px;box-shadow:0 34px 64px -26px rgba(16,35,64,.5);display:flex;flex-direction:column;overflow:hidden;z-index:25')}
    >
      <div style={css('display:flex;align-items:center;gap:9px;padding:15px 16px;border-bottom:1px solid #f0f3f7')}>
        <span style={css('width:30px;height:30px;border-radius:9px;background:#eef4ff;color:#1e3a5f;display:flex;align-items:center;justify-content:center;flex:none')}>
          <Icon id="ic-sync" size={16} />
        </span>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:1px')}>
          <span style={css('font-size:13.5px;font-weight:700;color:#13243b')}>CRM-активність</span>
          <span style={css('font-size:10.5px;color:#8a97a8')}>Автооновлення з Clinic Cards</span>
        </div>
        <span style={css('width:7px;height:7px;border-radius:50%;background:#16a34a;animation:ccpulse 2.6s infinite;margin-right:2px')} />
        <button
          className="cc-close"
          onClick={closeFeed}
          style={css('width:28px;height:28px;border:1px solid #e7ebf1;background:#fff;border-radius:8px;color:#7c8aa0;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}
        >
          <Icon id="ic-x" size={15} />
        </button>
      </div>

      <div className="cccol" style={css('padding:7px;overflow-y:auto;display:flex;flex-direction:column;gap:1px')}>
        {notifications.map((n, i) => (
          <div key={i} className="cc-notif" style={css('display:flex;gap:11px;padding:11px 10px;border-radius:11px')}>
            <span
              style={{
                ...css('width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:none'),
                background: n.bg,
                color: n.color,
              }}
            >
              <Icon id={n.iconHref} size={15} />
            </span>
            <div style={css('display:flex;flex-direction:column;gap:2px;min-width:0')}>
              <span style={css('font-size:12px;color:#28384f;line-height:1.4')}>{n.text}</span>
              <span style={css('font-size:11px;color:#9aa6b6')}>{n.meta}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={css('padding:11px 14px;border-top:1px solid #f0f3f7;text-align:center')}>
        <span style={css('font-size:11px;color:#8a97a8')}>
          Картки переміщуються по борду автоматично при оновленні статусу в CRM
        </span>
      </div>
    </div>
  )
}
