import { css } from '../css.js'
import { Icon } from '../icons.jsx'
import { STAGES } from '../data.js'

// ─── small visual helpers ─────────────────────────────────────────────────────

function Section({ title, icon, children }) {
  return (
    <div style={css('display:flex;flex-direction:column;gap:11px')}>
      <h3 style={css("margin:0;display:flex;align-items:center;gap:8px;font:700 14.5px 'Onest',sans-serif;color:#101d31;letter-spacing:-.01em")}>
        {icon && (
          <span style={css('width:26px;height:26px;border-radius:8px;background:#eef4ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex:none')}>
            <Icon id={icon} size={14} />
          </span>
        )}
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ swatch, children }) {
  return (
    <div style={css('display:flex;align-items:flex-start;gap:10px')}>
      <span style={css('flex:none;margin-top:1px;display:inline-flex')}>{swatch}</span>
      <span style={css('font-size:12.5px;line-height:1.5;color:#3c4d66')}>{children}</span>
    </div>
  )
}

function Chip({ bg, color, border, icon, children }) {
  return (
    <span
      style={{
        ...css("display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:7px;font:700 10.5px 'Onest',sans-serif;letter-spacing:.03em;white-space:nowrap"),
        background: bg,
        color,
        border: border ? `1px solid ${border}` : '1px solid transparent',
      }}
    >
      {icon && <Icon id={icon} size={11} />}
      {children}
    </span>
  )
}

function Bar({ color, pct }) {
  return (
    <span style={css('display:inline-block;width:52px;height:6px;border-radius:99px;background:#edf1f6;overflow:hidden;vertical-align:middle')}>
      <span style={{ ...css('display:block;height:100%;border-radius:99px'), background: color, width: pct }} />
    </span>
  )
}

function FlowBox({ color, title, sub }) {
  return (
    <div style={css('flex:1;min-width:150px;border:1px solid #e6ecf3;border-radius:12px;padding:11px 12px;display:flex;flex-direction:column;gap:4px;background:#f7f9fc')}>
      <span style={css('display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#101d31')}>
        <span style={{ ...css('width:8px;height:8px;border-radius:3px;flex:none'), background: color }} />
        {title}
      </span>
      <span style={css('font-size:11px;color:#7c8aa0;line-height:1.4')}>{sub}</span>
    </div>
  )
}

function Arrow() {
  return (
    <span style={css('display:flex;align-items:center;color:#b6c1cf;flex:none')}>
      <Icon id="ic-arrowr" size={17} />
    </span>
  )
}

// ─── the guide ────────────────────────────────────────────────────────────────

export default function HelpModal({ onClose }) {
  return (
    <div
      onMouseDown={onClose}
      style={css('position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(11,23,40,.55);backdrop-filter:blur(3px)')}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={css('width:100%;max-width:720px;max-height:88vh;background:#fff;border-radius:20px;box-shadow:0 40px 90px -30px rgba(16,35,64,.6);display:flex;flex-direction:column;overflow:hidden')}
      >
        {/* header */}
        <div style={css('flex:none;display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid #eef2f7')}>
          <span style={css('width:40px;height:40px;border-radius:12px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;flex:none')}>
            <Icon id="ic-info" size={20} />
          </span>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px')}>
            <span style={css('font-size:17px;font-weight:700;color:#101d31;letter-spacing:-.015em')}>Як це працює</span>
            <span style={css('font-size:12px;color:#8a97a8')}>Звідки дані, чому картки виглядають так і що означають кольори</span>
          </div>
          <button
            onClick={onClose}
            style={css('width:32px;height:32px;border:1px solid #e7ebf1;background:#fff;border-radius:9px;color:#7c8aa0;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}
          >
            <Icon id="ic-x" size={16} />
          </button>
        </div>

        {/* body */}
        <div className="cccol" style={css('flex:1;min-height:0;overflow-y:auto;padding:20px 22px;display:flex;flex-direction:column;gap:26px')}>
          {/* 1. data flow */}
          <Section title="Звідки беруться дані" icon="ic-sync">
            <div style={css('display:flex;align-items:stretch;gap:8px;flex-wrap:wrap')}>
              <FlowBox color="#7c3aed" title="Clinic Cards (CRM)" sub="Джерело пацієнтів. Ми тільки читаємо — нічого туди не пишемо." />
              <Arrow />
              <FlowBox color="#2563eb" title="Наш сервер" sub="Збирає картки, рахує строки, зберігає позиції на дошці." />
              <Arrow />
              <FlowBox color="#16a34a" title="Дошка" sub="Те, що ви бачите на екрані." />
            </div>
            <div style={css('font-size:12px;line-height:1.5;color:#56667c;background:#f7f9fc;border:1px solid #e6ecf3;border-radius:10px;padding:11px 13px')}>
              Пацієнти приходять з Clinic Cards. <b>Медкартка, фінанси, записи — залишаються у CRM.</b> Тут — лише
              статус пацієнта на воронці лікування. Дані оновлюються автоматично раз на 5 хвилин і по кнопці
              «оновити» <span style={css('display:inline-flex;vertical-align:middle;color:#2563eb')}><Icon id="ic-sync" size={13} /></span> у шапці.
            </div>
          </Section>

          {/* 2. funnel */}
          <Section title="Воронка: етапи (колонки)" icon="ic-users">
            <span style={css('font-size:12.5px;line-height:1.5;color:#3c4d66')}>
              Пацієнт рухається зліва направо. Нові заявки завжди падають у першу колонку. Праворуч від кожного
              етапу — його норматив реакції (скільки часу допустимо там стояти без дії).
            </span>
            <div style={css('display:flex;flex-direction:column;gap:8px;border:1px solid #e6ecf3;border-radius:12px;padding:12px 14px')}>
              {STAGES.map((s) => (
                <div key={s.id} style={css('display:flex;align-items:center;gap:9px')}>
                  <span style={{ ...css('width:9px;height:9px;border-radius:3px;flex:none'), background: s.color }} />
                  <span style={css('font-size:12.5px;font-weight:600;color:#22334c;flex:1')}>{s.title}</span>
                  <span style={css("font:600 10.5px 'JetBrains Mono',monospace;color:#9aa6b6")}>
                    {s.norm ? `${s.norm}` : 'без нормативу'}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* 3. card highlights */}
          <Section title="Чому картка підсвічена: кольори та бейджі" icon="ic-alert">
            <Row swatch={<Chip bg="#e7f0fe" color="#1e40af" border="#bcd4f6" icon="ic-check">Був у клініці · перемістити</Chip>}>
              <b>Синя</b> — пацієнт був на візиті вже після того, як зайшов на цей етап, а його не пересунули далі.
              Найвищий пріоритет: потрібна дія. Такі картки — вгорі колонки.
            </Row>
            <Row swatch={<Chip bg="#fdecd0" color="#b45309" icon="ic-alert">ЗАСТРЯГ · N дн</Chip>}>
              <b>Жовта</b> — стоїть на етапі без руху 3+ дні (і у нього немає дати візиту). Показує, між якими
              етапами застряг.
            </Row>
            <Row swatch={<Chip bg="#ffe1e7" color="#be123c" icon="ic-alert">ПРОСТРОЧЕНО · N дн</Chip>}>
              <b>Червона</b> — призначена дата візиту вже минула, а пацієнта не пересунули. Рахуємо дні прострочки.
            </Row>
            <Row swatch={<Chip bg="linear-gradient(135deg,#fb923c,#ea580c)" color="#fff" icon="ic-flame">Гарячий</Chip>}>
              <b>Помаранчева мітка</b> — найближчий візит зовсім скоро (сьогодні/завтра).
            </Row>
            <Row swatch={<Chip bg="#dcf1f8" color="#0e7490" icon="ic-snow">ЗАМОРОЖЕНА</Chip>}>
              <b>Крижана, знебарвлена, зі сніжинками</b> — поставлена на паузу вручну. Опускається вниз колонки і не
              смикає нагадуваннями.
            </Row>
          </Section>

          {/* 4. SLA bar */}
          <Section title="Смужка під карткою (строк на етапі)" icon="ic-clock">
            <Row swatch={<Bar color="#16a34a" pct="30%" />}>
              <b>Зелена → жовта → червона</b> — <b>норматив реакції</b>. Показує, скільки часу пацієнт на етапі без
              дії відносно нормативу (48 год). Що ближче до прострочки — то «гарячіший» колір.
            </Row>
            <Row swatch={<Bar color="#2563eb" pct="60%" />}>
              <b>Синя</b> — <b>орієнтир на дату візиту</b>. Якщо у пацієнта є «Візит», строк рахуємо не від нормативу,
              а від цієї дати: смужка наповнюється в міру наближення візиту.
            </Row>
            <div style={css('font-size:12px;line-height:1.5;color:#56667c;background:#f7f9fc;border:1px solid #e6ecf3;border-radius:10px;padding:11px 13px')}>
              Час рахується від моменту, коли картка потрапила на етап <b>у нас на дошці</b> (імпорт або переміщення),
              а не від дат усередині CRM — таких дат Clinic Cards не віддає.
            </div>
          </Section>

          {/* 5. tabs */}
          <Section title="Вкладки «Гарячі» та «Потребують уваги»" icon="ic-bell">
            <Row swatch={<span style={css('width:9px;height:9px;border-radius:50%;background:#ea580c;display:inline-block;margin-top:4px')} />}>
              <b>Гарячі</b> — погляд <b>вперед</b>: у пацієнта найближчий візит сьогодні або завтра. Сенс: «скоро
              прийде, будь готовий».
            </Row>
            <Row swatch={<span style={css('width:9px;height:9px;border-radius:50%;background:#f43f5e;display:inline-block;margin-top:4px')} />}>
              <b>Потребують уваги</b> — погляд <b>назад</b>: щось зависло. Сюди потрапляє пацієнт, якщо він
              застряг, або був у клініці й не пересунутий, або прострочив візит.
            </Row>
          </Section>

          {/* 6. who moves */}
          <Section title="Хто і як рухає картки" icon="ic-arrowr">
            <Row swatch={<span style={css('width:22px;height:22px;border-radius:7px;background:linear-gradient(120deg,#1e3a5f,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center')}><Icon id="ic-arrowr" size={12} /></span>}>
              <b>Кнопка «Перемістити»</b> у картці пацієнта — крок уперед по воронці. Доступна всім.
            </Row>
            <Row swatch={<span style={css('width:22px;height:22px;border-radius:7px;background:#eef4ff;color:#2563eb;display:flex;align-items:center;justify-content:center')}><Icon id="ic-user" size={13} /></span>}>
              <b>Перетягування (drag-and-drop)</b> у будь-яку колонку — тільки для адміністратора (вхід у шапці,
              кнопка «Вхід адміністратора»).
            </Row>
            <div style={css('font-size:12px;line-height:1.5;color:#56667c;background:#f7f9fc;border:1px solid #e6ecf3;border-radius:10px;padding:11px 13px')}>
              Переміщення зберігаються <b>у нашій базі</b> й ніколи не пишуться назад у Clinic Cards. Після
              переміщення відлік строку на етапі починається заново.
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
