// 予定表チェックの「年間カレンダー」1 枚ぶん (utils/yoteihyo/annualCalendarSheet +
// calendarCompare)。中身のまとめ・予定表そのものの点検・休講日との食い違いと、
// 有給・半休への取り込み (常勤の公休) を出す。
//
// 食い違いの直す案は全日休講 (休講日の部門 = 全部) だけ。注記で他の日へ振り替えて
// いる日 (12/7 → 12/4) は休講日にせず、日まるごと振替を開く案内にする。
// 登録は親 (YoteihyoCheckView) の onApply が 6 秒の「元に戻す」つきで行う。
// 過ぎた日の食い違いは畳んでおく (今日以降を先に読めるように)。ボタンは no-print。

import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { dateLabel } from "../../../utils/yoteihyo/labels";
import { summarizeCalendar } from "../../../utils/yoteihyo/annualCalendarSheet";
import { WARN_TEXT } from "./styles";

const note = { fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, margin: 0 };
const smallBtn = { ...S.btn(false), padding: "3px 10px", fontSize: 12 };
const shortDate = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;

function slotText(slot) {
  return [slot.time, slot.grade, slot.subj].filter(Boolean).join(" ");
}

const CAUTION_REASON = {
  adjustment: "合同・移動",
  sub: "代行・欠勤",
};

function ItemRow({ item, isAdmin, onApply, onOpenDayReschedule, onEditHoliday }) {
  const row = {
    padding: "8px 0",
    borderTop: `1px solid ${colors.border}`,
    fontSize: 12,
    lineHeight: 1.7,
    color: colors.ink,
  };
  const head = (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
      <b style={{ fontSize: 13 }}>{dateLabel(item.date)}</b>
      <span style={{ color: colors.inkMuted }}>年間カレンダー: {item.label}</span>
    </div>
  );
  if (item.type === "classes") {
    const shown = item.held.slice(0, 4).map(slotText);
    return (
      <div style={row}>
        {head}
        <div>
          システムでは授業あり ({item.held.length} コマ): {shown.join("、")}
          {item.held.length > 4 ? ` ほか ${item.held.length - 4} コマ` : ""}
        </div>
        {item.moveTargets.length > 0 ? (
          <div style={{ color: WARN_TEXT }}>
            {`予定表の注記ではこの日の授業を ${item.moveTargets.map(shortDate).join("・")} へ振り替えています。` +
              "休講日にはせず、日まるごと振替で移してください (第N回はこの日の日付で数えます)。"}
            {isAdmin && onOpenDayReschedule && (
              <button
                type="button"
                className="no-print"
                onClick={() =>
                  onOpenDayReschedule({ sourceDate: item.date, targetDate: item.moveTargets[0] })
                }
                style={{ ...smallBtn, marginLeft: 6 }}
              >
                日まるごと振替を開く
              </button>
            )}
          </div>
        ) : (
          <>
            {item.cautions.length > 0 && (
              <div style={{ color: WARN_TEXT }}>
                {"⚠ " +
                  item.cautions
                    .map((c) => `${slotText(c.slot)} に${CAUTION_REASON[c.reason] || "登録"}`)
                    .join("、") +
                  " があります。休講日を登録したら、欠勤組み換えの画面で外してください。"}
              </div>
            )}
            {isAdmin && onApply && (
              <button type="button" className="no-print" onClick={() => onApply([item])} style={smallBtn}>
                全日休講「{item.fix.holidays[0].label}」を登録
              </button>
            )}
          </>
        )}
      </div>
    );
  }
  const msg =
    item.type === "openButClosed"
      ? "年間カレンダーでは授業可能 (予備校授業あり) ですが、システムでは全日休講です"
      : "システムでは全日休講ですが、年間カレンダーには休みの印がありません";
  return (
    <div style={row}>
      {head}
      <div>
        {msg}: {item.holidays.map((h) => `「${h.label || "休講"}」`).join("")}
        {isAdmin &&
          onEditHoliday &&
          item.holidays.map((h) => (
            <button
              key={h.id}
              type="button"
              className="no-print"
              onClick={() => onEditHoliday(h.id)}
              style={{ ...smallBtn, padding: "1px 8px", fontSize: 11, marginLeft: 6 }}
            >
              休講日を開く
            </button>
          ))}
      </div>
    </div>
  );
}

export function CalendarCheckPanel({
  sheet,
  items,
  today,
  isAdmin,
  panelStyle,
  headingStyle,
  headingId,
  onApply,
  onOpenDayReschedule,
  onEditHoliday,
  onImportLeave,
  importedLeave,
  onOpenLeave,
}) {
  const cal = sheet.calendar;
  const sum = summarizeCalendar(cal);
  const upcoming = items.filter((x) => x.date >= today);
  const past = items.filter((x) => x.date < today);
  const fixable = upcoming.filter((x) => x.type === "classes" && x.fix.holidays.length > 0);
  const issues = cal.warnings.length;
  const rowProps = { isAdmin, onApply, onOpenDayReschedule, onEditHoliday };
  return (
    <section aria-labelledby={headingId} style={panelStyle}>
      <h2 id={headingId} tabIndex={-1} style={headingStyle}>
        年間カレンダー「{sheet.name}」({cal.fiscalYear}年度)
      </h2>
      <p style={note}>
        {[
          ...sum.patterns.map((p) => {
            const total = cal.patterns.find((x) => x.key === p.key)?.total;
            return `${p.label} 年間 ${total ?? p.count} 日`;
          }),
          `祝日 ${sum.holidays} 日`,
          `塾の休み ${sum.closed} 日`,
          sum.open ? `授業可能の祝日 ${sum.open} 日` : "",
          sum.half ? `教員半休 ${sum.half} 日` : "",
        ]
          .filter(Boolean)
          .join(" / ")}
      </p>
      {onImportLeave && cal.patterns.length > 0 && (
        <div
          className="no-print"
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}
        >
          <button type="button" onClick={onImportLeave} style={S.btn(!importedLeave)}>
            {importedLeave ? "有給・半休に取り込み直す" : "有給・半休に取り込む (常勤の公休)"}
          </button>
          <span style={note}>
            {importedLeave
              ? `取り込み済み${importedLeave.source ? `: ${importedLeave.source}` : ""}${
                  importedLeave.importedAt ? ` (${importedLeave.importedAt})` : ""
                }`
              : "「土日 休み」「日月 休み」の公休を、有給・半休の月の表と期間の入力に使います"}
          </span>
          {importedLeave && onOpenLeave && (
            <button type="button" onClick={onOpenLeave} style={smallBtn}>
              有給・半休を開く
            </button>
          )}
        </div>
      )}
      {(issues > 0 || cal.notes.length > 0) && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: issues ? WARN_TEXT : colors.ink }}>
            {issues ? `⚠ カレンダーの点検 (気になる点 ${issues} 件)` : "カレンダーの注記"}
          </summary>
          {cal.warnings.map((w, i) => (
            <p key={i} style={{ ...note, color: WARN_TEXT }}>
              ⚠ {w.message}
            </p>
          ))}
          {cal.notes.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: colors.inkMuted, lineHeight: 1.7 }}>
              {cal.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </details>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: 0, color: colors.ink }}>休講日との食い違い</h3>
        <span style={{ fontSize: 12, color: colors.inkMuted }}>
          {items.length} 日 (今日以降 {upcoming.length} 日)
        </span>
        {isAdmin && onApply && fixable.length > 1 && (
          <button
            type="button"
            className="no-print"
            onClick={() => onApply(fixable, { bulk: true })}
            style={{ ...S.btn(true), marginLeft: "auto" }}
          >
            今日以降の全日休講の案をまとめて登録 ({fixable.length} 日)
          </button>
        )}
      </div>
      <p style={{ ...note, marginTop: 4 }}>
        {"年間カレンダーの「予備校授業なし→現役生も休み」の日と、「授業可能」の印の無い祝日を、" +
          "授業の無い日として比べています。"}
      </p>
      {upcoming.length === 0 ? (
        <p style={{ ...note, padding: "8px 0" }}>今日以降の食い違いはありません。</p>
      ) : (
        upcoming.map((item) => <ItemRow key={`${item.type}|${item.date}`} item={item} {...rowProps} />)
      )}
      {past.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: colors.inkMuted }}>
            過ぎた日の食い違い ({past.length} 日)
          </summary>
          {past.map((item) => (
            <ItemRow key={`${item.type}|${item.date}`} item={item} {...rowProps} />
          ))}
        </details>
      )}
    </section>
  );
}
