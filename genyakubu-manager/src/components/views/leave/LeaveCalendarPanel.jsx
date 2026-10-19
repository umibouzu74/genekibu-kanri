import { useRef, useState } from "react";
import { useToasts } from "../../../hooks/useToasts";
import { S, colors } from "../../../styles/common";
import { fmtFiscalYear } from "../../../utils/teacherAffiliations";
import {
  CALENDAR_DAY_KINDS,
  calendarFor,
  restoreCalendars,
  setCalendar,
} from "../../../utils/staffLeave";

// ─── 有給・半休の画面の「📅 年間カレンダー」 ───────────────────────────
// 予定表の Excel に入っている教員用の年間カレンダー (「土日 休み」「日月 休み」の
// 列) を取り込む / 外す。取り込んだカレンダーは staffLeave の calendars
// (adminData/) に年度ごとに入り、月の表の公休・期間で入れるときの「公休を除く」に
// 使う。ブックの読み取りは予定表チェックと同じ utils/yoteihyo (読むときだけ
// 読み込む)。予定表チェックの画面からも同じ形で取り込める。
//
// 取り込み・外すは 6 秒の「元に戻す」(控えた年度のカレンダーだけを戻す)。

function countKinds(cal) {
  const out = { closed: 0, open: 0, half: 0, holidays: 0 };
  for (const d of cal?.days || []) {
    if (d.kind) out[d.kind] += 1;
    if (d.holiday) out.holidays += 1;
  }
  return out;
}

export function LeaveCalendarPanel({ id, leave, year, onSave, today, noPatternCount = 0 }) {
  const toasts = useToasts();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  // 直前に読み込んだときの点検 (表の休日数と印の数の違いなど)。この画面にいる間だけ
  const [lastWarnings, setLastWarnings] = useState(null);
  const cal = calendarFor(leave, year);
  const kinds = countKinds(cal);

  const importFile = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const [{ readWorkbookFile }, { findCalendarSheets, calendarForLeave }] = await Promise.all([
        import("../../../utils/yoteihyo/workbookFile"),
        import("../../../utils/yoteihyo/annualCalendarSheet"),
      ]);
      const found = findCalendarSheets(await readWorkbookFile(file));
      if (!found.length) {
        toasts.error(`「${file.name}」に年間カレンダーのシートが見つかりませんでした`);
        return;
      }
      const cals = found.map((f) =>
        calendarForLeave(f.parsed, { source: `${file.name} / ${f.name}`, importedAt: today })
      );
      const years = [...new Set(cals.map((c) => c.year))];
      const previous = (leave?.calendars || []).filter((c) => years.includes(c.year));
      onSave((prev) => cals.reduce((acc, c) => setCalendar(acc, c), prev));
      setLastWarnings(found.flatMap((f) => f.parsed.warnings.map((w) => ({ ...w, sheet: f.name }))));
      toasts.success(
        `${years.map((y) => fmtFiscalYear(y)).join("・")}の年間カレンダーを取り込みました` +
          (previous.length ? " (前に取り込んだものと入れ替えました)" : ""),
        {
          duration: 6000,
          action: {
            label: "元に戻す",
            onClick: () => onSave((prev) => restoreCalendars(prev, years, previous)),
          },
        }
      );
    } catch (err) {
      console.warn("[leave] 年間カレンダーの読み込みに失敗", err);
      toasts.error(`「${file.name}」を読み込めませんでした: ${err?.message || "原因が分かりません"}`);
    } finally {
      setLoading(false);
    }
  };

  const remove = () => {
    if (!cal) return;
    const previous = [cal];
    onSave((prev) => restoreCalendars(prev, [year], []));
    setLastWarnings(null);
    toasts.info(`${fmtFiscalYear(year)}の年間カレンダーを外しました`, {
      duration: 6000,
      action: { label: "元に戻す", onClick: () => onSave((prev) => restoreCalendars(prev, [year], previous)) },
    });
  };

  return (
    <section id={id} className="no-print" style={{ ...S.panel, padding: "10px 14px" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>
        📅 {fmtFiscalYear(year)}の年間カレンダー (常勤の公休)
      </h3>
      {cal ? (
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          <div>
            {cal.patterns.map((p) => (
              <span key={p.key} style={{ marginRight: 12 }}>
                <b>{p.label}</b> 年間 {p.total ?? p.offDates.length} 日
              </span>
            ))}
            <span style={{ color: colors.inkMuted }}>
              {[
                kinds.holidays && `祝日 ${kinds.holidays} 日`,
                kinds.closed && `${CALENDAR_DAY_KINDS.closed} ${kinds.closed} 日`,
                kinds.half && `${CALENDAR_DAY_KINDS.half} ${kinds.half} 日`,
              ]
                .filter(Boolean)
                .join(" / ")}
            </span>
          </div>
          {cal.notes.length > 0 && (
            <div style={{ color: colors.inkMuted }}>注記: {cal.notes.join(" / ")}</div>
          )}
          <div style={{ color: colors.inkMuted }}>
            {cal.source ? `取り込んだもの: ${cal.source}` : ""}
            {cal.importedAt ? ` (${cal.importedAt})` : ""}
          </div>
          {noPatternCount > 0 && (
            <div role="note" style={{ color: "#8a5a00" }}>
              休みの型が未設定の人が {noPatternCount} 人います。上の「{fmtFiscalYear(year)}
              のまとめ」の「休みの型」で選ぶと、その人の公休が月の表に出ます。
            </div>
          )}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: colors.inkMuted, lineHeight: 1.7 }}>
          {"予定表の Excel に入っている教員用の年間カレンダー (「土日 休み」「日月 休み」の列) を取り込むと、" +
            "人ごとの休みの型に合わせて公休の日を月の表に出し、期間でまとめて入れるときに公休を除きます" +
            " (有給の日数に公休を数えない)。祝日・塾の休み・教員半休・行事も表の日付に出ます。"}
        </p>
      )}
      {lastWarnings && lastWarnings.length > 0 && (
        <details style={{ marginTop: 6, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "#8a5a00" }}>
            ⚠ 読み込んだカレンダーの気になる点 ({lastWarnings.length} 件)
          </summary>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, color: "#8a5a00", lineHeight: 1.7 }}>
            {lastWarnings.map((w, i) => (
              <li key={i}>
                {w.sheet}: {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="年間カレンダーの入った Excel ファイル"
          onChange={(e) => {
            importFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          style={{ ...S.btn(!cal), padding: "5px 12px", fontSize: 12 }}
        >
          {loading ? "読み込み中…" : cal ? "読み込み直す" : "予定表の Excel から取り込む"}
        </button>
        {cal && (
          <button
            type="button"
            onClick={remove}
            style={{ ...S.btn(false), padding: "5px 12px", fontSize: 12, color: colors.danger }}
          >
            外す
          </button>
        )}
      </div>
    </section>
  );
}
