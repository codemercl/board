import { useEffect, useRef, useState } from 'react'
import { css } from '../css.js'
import { Icon } from '../icons.jsx'
import { STAGES } from '../data.js'

// Find any Clinic Cards patient — including one closed long ago — and drop them
// into one column. The target column comes from the button that opened this, so
// there is nothing to pick here but the patient. Search hits our own cached
// directory, never the CRM.
export default function AddPatientModal({ view, stage, onClose }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [picked, setPicked] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const seq = useRef(0)
  const columnTitle = (STAGES.find((s) => s.id === stage) || {}).title || ''

  // Debounced search; `seq` drops responses that arrive out of order.
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return }
    const mine = ++seq.current
    const t = setTimeout(() => {
      view.searchPatients(q)
        .then((r) => { if (mine === seq.current) { setRows(r); setErr(null) } })
        .catch((e) => { if (mine === seq.current) setErr(e.message) })
    }, 250)
    return () => clearTimeout(t)
  }, [q, view])

  const submit = async () => {
    if (!picked) return
    setBusy(true); setErr(null)
    try { await view.placePatient(picked.id, stage); onClose() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div
      onMouseDown={onClose}
      className="cc-modal"
      style={css('position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(11,23,40,.55);backdrop-filter:blur(3px)')}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="cc-modal-panel"
        style={css('width:100%;max-width:520px;max-height:88vh;background:#fff;border-radius:20px;box-shadow:0 40px 90px -30px rgba(16,35,64,.6);display:flex;flex-direction:column;overflow:hidden')}
      >
        {/* header */}
        <div style={css('flex:none;display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid #eef2f7')}>
          <span style={css('width:40px;height:40px;border-radius:12px;background:linear-gradient(120deg,#0f766e,#0d9488);color:#fff;display:flex;align-items:center;justify-content:center;flex:none')}>
            <Icon id="ic-search" size={18} />
          </span>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px')}>
            <span style={css('font-size:17px;font-weight:700;color:#101d31;letter-spacing:-.015em')}>Додати пацієнта з Clinic Cards</span>
            <span style={css('font-size:12px;color:#8a97a8')}>Картка стане в колонку «{columnTitle}»</span>
          </div>
          <button
            onClick={onClose}
            style={css('width:32px;height:32px;border:1px solid #e7ebf1;background:#fff;border-radius:9px;color:#7c8aa0;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}
          >
            <Icon id="ic-x" size={16} />
          </button>
        </div>

        {/* body */}
        <div className="cccol" style={css('flex:1;min-height:0;overflow-y:auto;padding:16px 22px;display:flex;flex-direction:column;gap:10px')}>
          <div style={css('display:flex;align-items:center;gap:8px;padding:0 12px;background:#f7f9fc;border:1px solid #e2e9f2;border-radius:11px;height:40px')}>
            <Icon id="ic-search" size={15} style={css('flex:none;color:#9aa6b6')} />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setPicked(null) }}
              placeholder="Ім'я або телефон — мінімум 2 символи"
              style={css("flex:1;min-width:0;background:transparent;border:none;outline:none;font-family:'Onest',sans-serif;font-size:13px;color:#22334c;padding:0")}
            />
          </div>

          <div style={css('display:flex;flex-direction:column;gap:6px')}>
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => !r.onBoard && setPicked(r)}
                disabled={r.onBoard}
                style={{
                  ...css("display:flex;width:100%;gap:8px;align-items:center;text-align:left;padding:9px 10px;border-radius:10px;font-family:'Onest',sans-serif"),
                  cursor: r.onBoard ? 'default' : 'pointer',
                  border: `1px solid ${picked && picked.id === r.id ? '#0d9488' : '#e2e9f2'}`,
                  background: r.onBoard ? '#f6f8fb' : '#fff',
                  opacity: r.onBoard ? 0.6 : 1,
                }}
              >
                <span style={css('flex:1;min-width:0')}>
                  <span style={css('font-size:13px;font-weight:600;color:#22334c')}>{r.name}</span>
                  {r.phone ? <span style={css('font-size:12px;color:#7c8aa0;margin-left:6px')}>{r.phone}</span> : null}
                </span>
                {r.onBoard ? <span style={css('flex:none;font-size:11px;color:#7c8aa0')}>вже на дошці</span> : null}
                {r.closed && !r.onBoard ? <span style={css('flex:none;font-size:11px;font-weight:600;color:#b45309;background:#fdecd0;padding:2px 7px;border-radius:6px')}>закритий</span> : null}
              </button>
            ))}
            {q.trim().length >= 2 && !rows.length ? (
              <div style={css('font-size:12.5px;color:#7c8aa0;padding:6px 2px 4px')}>Нікого не знайдено.</div>
            ) : null}
          </div>

          {err ? <div style={css('font-size:12.5px;color:#e11d48')}>{err}</div> : null}
        </div>

        {/* footer */}
        <div style={css('flex:none;padding:14px 22px;border-top:1px solid #eef2f7;display:flex;gap:8px;justify-content:flex-end')}>
          <button
            onClick={onClose}
            style={css("padding:9px 14px;border:1px solid #e2e9f2;border-radius:10px;background:#fbfcfe;color:#56667c;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer")}
          >
            Скасувати
          </button>
          <button
            onClick={submit}
            disabled={!picked || busy}
            style={css(`padding:9px 16px;border:none;border-radius:10px;background:${picked && !busy ? '#0d9488' : '#c8d3e0'};color:#fff;font-family:'Onest',sans-serif;font-size:12.5px;font-weight:600;cursor:${picked && !busy ? 'pointer' : 'default'}`)}
          >
            {busy ? 'Додаю…' : 'Додати'}
          </button>
        </div>
      </div>
    </div>
  )
}
