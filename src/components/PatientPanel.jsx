import { useEffect, useState } from 'react'
import { css } from '../css.js'
import { Icon } from '../icons.jsx'
import * as api from '../api.js'

export default function PatientPanel({ view }) {
  const { sel, closePanel } = view
  const [copied, setCopied] = useState(false)

  const copyPhone = async () => {
    if (!sel.phone) return
    try {
      await navigator.clipboard.writeText(sel.phone)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

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
          {sel.frozen ? (
            <span style={css('display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:9px;background:#dcf1f8;color:#0e7490;font-size:10.5px;font-weight:700;letter-spacing:.03em')}>
              <Icon id="ic-snow" size={11} />
              ЗАМОРОЖЕНА
            </span>
          ) : sel.needsFollowup ? (
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
              {sel.overBadge}
            </span>
          ) : null}
        </div>

        {/* action buttons — this board is read-only over Clinic Cards, so the
            actions are copy-to-clipboard and a deep link to the CC profile. */}
        <div style={css('display:flex;gap:8px')}>
          <button
            className="cc-action"
            onClick={copyPhone}
            disabled={!sel.phone}
            style={css("flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border:1px solid #e2e9f2;border-radius:12px;background:#fbfcfe;cursor:pointer;color:#2c3e58;font-family:'Onest',sans-serif")}
          >
            <Icon id={copied ? 'ic-check' : 'ic-phone'} size={17} style={css(copied ? 'color:#16a34a' : 'color:#2563eb')} />
            <span style={css('font-size:11px;font-weight:600')}>{copied ? 'Скопійовано' : 'Копіювати телефон'}</span>
          </button>
          <a
            className="cc-action"
            href={sel.ccUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={css("flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border:1px solid #e2e9f2;border-radius:12px;background:#fbfcfe;cursor:pointer;color:#2c3e58;font-family:'Onest',sans-serif;text-decoration:none")}
          >
            <Icon id="ic-ext" size={17} style={css('color:#7c3aed')} />
            <span style={css('font-size:11px;font-weight:600')}>Відкрити в Clinic Cards</span>
          </a>
        </div>
        <div style={css('font-size:10.5px;color:#9aa6b6;text-align:center;margin-top:-8px')}>
          Дзвінки, нагадування та записи — у Clinic Cards. Тут лише статус на воронці.
        </div>

        {view.isAdmin && (
          <button
            className="cc-action"
            onClick={sel.toggleFrozen}
            style={css(
              sel.frozen
                ? "display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border:1px solid #e2e9f2;border-radius:12px;background:#fbfcfe;color:#56667c;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer"
                : "display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border:1px solid #a4d6e6;border-radius:12px;background:#ecf8fb;color:#0e7490;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer"
            )}
          >
            <Icon id="ic-snow" size={15} />
            {sel.frozen ? 'Розморозити' : 'Заморозити (на паузу)'}
          </button>
        )}

        {/* Treatment-plan review (only on the «План лікування» stage) */}
        {sel.planReview?.onPlan && <PlanReview sel={sel} />}

        {view.isAdmin && sel.hasNext && (
          sel.planMoveBlocked ? (
            <button
              disabled
              title="Спочатку всі відповідальні мають підтвердити план лікування"
              style={css("display:flex;align-items:center;justify-content:center;gap:9px;padding:12px;border:1px dashed #cbd5e1;border-radius:12px;background:#f4f6fa;color:#9aa6b6;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:not-allowed")}
            >
              <Icon id="ic-clock" size={15} />
              Чекаємо підтвердження плану
            </button>
          ) : (
            <button
              className="cc-move"
              onClick={sel.moveNext}
              style={css("display:flex;align-items:center;justify-content:center;gap:9px;padding:12px;border:none;border-radius:12px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;font-family:'Onest',sans-serif;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 10px 22px -10px rgba(37,99,235,.65)")}
            >
              {sel.nextLabel}
              <Icon id="ic-arrowr" size={16} />
            </button>
          )
        )}

        {/* SLA block */}
        <div style={{ ...css('border:1px solid #e8edf4;border-radius:13px;padding:13px 14px;display:flex;flex-direction:column;gap:9px'), background: sel.slaBlockBg }}>
          <div style={css('display:flex;align-items:center;gap:8px')}>
            <Icon id="ic-clock" size={15} style={css('color:#7c8aa0')} />
            <span style={css('font-size:12px;font-weight:600;color:#3c4d66;flex:1')}>{sel.slaLabel}</span>
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
            <div key={r.label} style={css(r.wrap ? 'display:flex;align-items:flex-start;gap:10px' : 'display:flex;align-items:center;gap:10px')}>
              <span style={css('width:28px;height:28px;border-radius:9px;background:#f4f6fa;color:#7c8aa0;display:flex;align-items:center;justify-content:center;flex:none')}>
                <Icon id={r.iconHref} size={14} />
              </span>
              <span style={css(r.wrap ? 'font-size:11.5px;color:#8a97a8;width:88px;flex:none;padding-top:5px' : 'font-size:11.5px;color:#8a97a8;width:88px;flex:none')}>{r.label}</span>
              <span
                style={css(
                  r.wrap
                    ? 'font-size:12.5px;font-weight:600;color:#22334c;flex:1;min-width:0;white-space:pre-wrap;word-break:break-word;line-height:1.45'
                    : 'font-size:12.5px;font-weight:600;color:#22334c;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
                )}
              >
                {r.value}
              </span>
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

const PING_LABEL = { 24: 'Візит за < 24 год', 4: 'Візит за < 4 год' }

// «План лікування» review: responsibles, per-person sign-off with a comment,
// and a mandatory-comment postpone. Drives the move gate above.
function PlanReview({ sel }) {
  const pr = sel.planReview
  const [staff, setStaff] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [postponeOpen, setPostponeOpen] = useState(false)
  const [postponeComment, setPostponeComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!pickerOpen || staff) return
    api.listStaff().then(setStaff).catch((e) => setErr(e.message))
  }, [pickerOpen, staff])

  const run = async (fn) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const toggleResp = (person) => {
    const cur = pr.responsibles.map((r) => ({ id: String(r.id), name: r.name }))
    const has = cur.some((r) => r.id === String(person.id))
    const next = has ? cur.filter((r) => r.id !== String(person.id)) : [...cur, { id: String(person.id), name: person.name }]
    run(() => pr.setResponsibles(next))
  }

  const submitSignoff = () => {
    if (!comment.trim()) { setErr('Додайте коментар до плану'); return }
    run(async () => { await pr.signoff(comment.trim()); setComment('') })
  }

  const submitPostpone = () => {
    if (!postponeComment.trim()) { setErr('Коментар обовʼязковий'); return }
    run(async () => { await pr.postpone(postponeComment.trim()); setPostponeComment(''); setPostponeOpen(false) })
  }

  const headerRight = pr.postponed
    ? { text: 'Відкладено', bg: '#fdecd0', color: '#b45309' }
    : pr.hasResponsibles
      ? (pr.allReady
        ? { text: `Готово ${pr.readyCount}/${pr.total}`, bg: '#dcfce7', color: '#15803d' }
        : { text: `Готово ${pr.readyCount}/${pr.total}`, bg: '#fdecd0', color: '#b45309' })
      : { text: 'Без відповідальних', bg: '#eef2f7', color: '#7c8aa0' }

  const selectedIds = new Set(pr.responsibles.map((r) => String(r.id)))

  return (
    <div style={css('border:1px solid #e2e9f2;border-radius:14px;overflow:hidden')}>
      {/* header */}
      <div style={css('display:flex;align-items:center;gap:8px;padding:11px 13px;background:#f4f0ff;border-bottom:1px solid #ece6fb')}>
        <span style={css('width:26px;height:26px;border-radius:8px;background:#fff;color:#0d9488;display:flex;align-items:center;justify-content:center;flex:none')}>
          <Icon id="ic-users" size={15} />
        </span>
        <span style={css('font-size:12.5px;font-weight:700;color:#22334c;flex:1')}>План лікування</span>
        <span style={{ ...css('padding:3px 8px;border-radius:7px;font-size:10.5px;font-weight:700'), background: headerRight.bg, color: headerRight.color }}>
          {headerRight.text}
        </span>
      </div>

      <div style={css('padding:12px 13px;display:flex;flex-direction:column;gap:11px')}>
        {/* SLA / ping line */}
        <div style={css('display:flex;align-items:center;gap:7px;font-size:11px;color:#7c8aa0')}>
          <Icon id="ic-clock" size={13} />
          <span>Норматив складання — 48 год</span>
          {pr.planOverdue && <span style={css('padding:2px 6px;border-radius:6px;background:#ffe1e7;color:#be123c;font-weight:700')}>прострочено</span>}
          {pr.planPing && <span style={css('padding:2px 6px;border-radius:6px;background:#e8faff;color:#0e7490;font-weight:700')}>{PING_LABEL[pr.planPing] || 'скоро візит'}</span>}
        </div>

        {/* postpone banner */}
        {pr.postponed && (
          <div style={css('display:flex;flex-direction:column;gap:3px;padding:9px 10px;border-radius:10px;background:#fff8ef;border:1px solid #eed3a3')}>
            <span style={css('font-size:11px;font-weight:700;color:#b45309')}>
              План відкладено{pr.postponeName ? ` · ${pr.postponeName}` : ''}
              {pr.postponeFollowupDue ? ' · потребує дії (24 год+)' : ''}
            </span>
            {pr.postponeComment && <span style={css('font-size:11.5px;color:#7a6132;white-space:pre-wrap;word-break:break-word')}>{pr.postponeComment}</span>}
          </div>
        )}

        {/* responsibles list */}
        {pr.responsibles.length > 0 && !pr.allReady && (
          <div style={css('display:flex;align-items:center;gap:6px;font-size:10.5px;color:#7c8aa0')}>
            <Icon id="ic-comment" size={12} />
            Підтвердження — у Telegram-боті (кнопки «Готово» / «Відкласти»).
          </div>
        )}

        {pr.responsibles.length > 0 ? (
          <div style={css('display:flex;flex-direction:column;gap:8px')}>
            {pr.responsibles.map((r) => (
              <div key={r.id} style={css('display:flex;align-items:flex-start;gap:9px')}>
                <span style={{ ...css("width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:700 10px 'Onest',sans-serif;flex:none"), background: r.ready ? '#dcfce7' : '#f4f6fa', color: r.ready ? '#15803d' : '#7c8aa0' }}>
                  {r.ready ? <Icon id="ic-check" size={13} /> : r.initials}
                </span>
                <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                  <span style={css('font-size:12px;font-weight:600;color:#22334c')}>{r.name}</span>
                  {r.ready
                    ? <span style={css('font-size:11px;color:#56667c;white-space:pre-wrap;word-break:break-word')}>{r.comment}</span>
                    : <span style={css('font-size:10.5px;color:#b09155')}>очікує підтвердження</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={css('font-size:11.5px;color:#9aa6b6')}>Відповідальних ще не призначено.</div>
        )}

        {/* assign responsibles (admins) */}
        {pr.canManage && (
          <div>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              style={css("display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #e2e9f2;border-radius:9px;background:#fbfcfe;color:#2c3e58;font-family:'Onest',sans-serif;font-size:11.5px;font-weight:600;cursor:pointer")}
            >
              <Icon id="ic-users" size={13} />
              {pickerOpen ? 'Сховати список' : 'Призначити відповідальних'}
            </button>
            {pickerOpen && (
              <div style={css('margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;border:1px solid #eef2f7;border-radius:10px;padding:6px')}>
                {staff === null && <span style={css('font-size:11px;color:#9aa6b6;padding:4px')}>Завантаження…</span>}
                {staff && staff.length === 0 && <span style={css('font-size:11px;color:#9aa6b6;padding:4px')}>Немає акаунтів.</span>}
                {staff && staff.map((person) => {
                  const on = selectedIds.has(String(person.id))
                  return (
                    <button
                      key={person.id}
                      disabled={busy}
                      onClick={() => toggleResp(person)}
                      style={{ ...css("display:flex;align-items:center;gap:8px;padding:6px 8px;border:none;border-radius:8px;cursor:pointer;text-align:left;font-family:'Onest',sans-serif"), background: on ? '#eef4ff' : 'transparent' }}
                    >
                      <span style={{ ...css('width:16px;height:16px;border-radius:5px;display:flex;align-items:center;justify-content:center;flex:none;border:1.5px solid'), borderColor: on ? '#2563eb' : '#cbd5e1', background: on ? '#2563eb' : '#fff', color: '#fff' }}>
                        {on && <Icon id="ic-check" size={11} />}
                      </span>
                      <span style={css('flex:1;font-size:12px;color:#22334c')}>{person.name}{person.role ? <span style={css('color:#9aa6b6;font-weight:400')}> · {person.role}</span> : null}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* two buttons: sign-off (with comment) + postpone */}
        {pr.isResponsible && !pr.mySignedOff && (
          <div style={css('display:flex;flex-direction:column;gap:7px;padding-top:2px')}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Коментар до плану лікування…"
              rows={2}
              style={css("resize:vertical;min-height:44px;padding:8px 10px;border:1px solid #e2e9f2;border-radius:10px;font-family:'Onest',sans-serif;font-size:12px;color:#22334c;outline:none")}
            />
            <div style={css('display:flex;gap:7px')}>
              <button
                disabled={busy}
                onClick={submitSignoff}
                style={css("flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border:none;border-radius:10px;background:linear-gradient(120deg,#0d9488,#15803d);color:#fff;font-family:'Onest',sans-serif;font-size:12px;font-weight:600;cursor:pointer")}
              >
                <Icon id="ic-check" size={14} />
                План готовий
              </button>
              <button
                disabled={busy}
                onClick={() => setPostponeOpen((o) => !o)}
                style={css("flex:none;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 12px;border:1px solid #eed3a3;border-radius:10px;background:#fff8ef;color:#b45309;font-family:'Onest',sans-serif;font-size:12px;font-weight:600;cursor:pointer")}
              >
                <Icon id="ic-clock" size={14} />
                Відкласти
              </button>
            </div>
          </div>
        )}

        {pr.mySignedOff && (
          <div style={css('display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:#15803d')}>
            <Icon id="ic-check" size={14} />
            Ви підтвердили план
          </div>
        )}

        {/* postpone for admins who aren't in the responsibles list */}
        {pr.canManage && !pr.isResponsible && !postponeOpen && (
          <button
            onClick={() => setPostponeOpen(true)}
            style={css("display:inline-flex;align-self:flex-start;align-items:center;gap:6px;padding:7px 11px;border:1px solid #eed3a3;border-radius:9px;background:#fff8ef;color:#b45309;font-family:'Onest',sans-serif;font-size:11.5px;font-weight:600;cursor:pointer")}
          >
            <Icon id="ic-clock" size={13} />
            Відкласти план
          </button>
        )}

        {postponeOpen && (
          <div style={css('display:flex;flex-direction:column;gap:7px')}>
            <textarea
              value={postponeComment}
              onChange={(e) => setPostponeComment(e.target.value)}
              placeholder="Причина відкладення (обовʼязково)…"
              rows={2}
              style={css("resize:vertical;min-height:44px;padding:8px 10px;border:1px solid #eed3a3;border-radius:10px;font-family:'Onest',sans-serif;font-size:12px;color:#22334c;outline:none;background:#fffdf8")}
            />
            <div style={css('display:flex;gap:7px')}>
              <button
                disabled={busy}
                onClick={submitPostpone}
                style={css("flex:1;padding:9px;border:none;border-radius:10px;background:#d97706;color:#fff;font-family:'Onest',sans-serif;font-size:12px;font-weight:600;cursor:pointer")}
              >
                Підтвердити відкладення
              </button>
              <button
                disabled={busy}
                onClick={() => { setPostponeOpen(false); setPostponeComment('') }}
                style={css("flex:none;padding:9px 12px;border:1px solid #e2e9f2;border-radius:10px;background:#fbfcfe;color:#56667c;font-family:'Onest',sans-serif;font-size:12px;font-weight:600;cursor:pointer")}
              >
                Скасувати
              </button>
            </div>
          </div>
        )}

        {pr.hasResponsibles && pr.allReady && (
          <div style={css('display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#15803d')}>
            <Icon id="ic-check" size={13} />
            Всі лікарі підтвердили. Очікує підтвердження головного лікаря в боті → картка поїде в «План лікування складено».
          </div>
        )}

        {pr.moveBlocked && (
          <div style={css('display:flex;align-items:center;gap:6px;font-size:10.5px;color:#9aa6b6')}>
            <Icon id="ic-info" size={12} />
            Картка рушить далі, коли всі лікарі підтвердять план і головний лікар підтвердить у боті.
          </div>
        )}

        {err && <div style={css('font-size:11px;color:#be123c')}>{err}</div>}
      </div>
    </div>
  )
}
