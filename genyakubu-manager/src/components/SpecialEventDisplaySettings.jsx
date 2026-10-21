import { SPECIAL_EVENT_TYPES } from "../constants/specialEvents";
import {
  isTypeShownInTeacherMonth,
  normalizeSpecialEventDisplay,
} from "../utils/specialEventDisplay";

// 「講師の月間予定に出す種別」の 1 行 (特別イベント管理の見出しの下)。
// 全員共通の設定なので管理者だけが切り替えられ、閲覧者には今の設定を見せるだけ。
// 効くのは講師別の月間・週間 (→ まとめて印刷・画像)。イベントカレンダー・
// ダッシュボードは全種別を出す (utils/specialEventDisplay)。
export function SpecialEventDisplaySettings({ display, onSave, isAdmin }) {
  const canEdit = isAdmin && !!onSave;
  const toggle = (key) =>
    onSave((prev) => {
      const cur = normalizeSpecialEventDisplay(prev);
      return { monthTypes: { ...cur.monthTypes, [key]: !cur.monthTypes[key] } };
    });

  return (
    <div
      role="group"
      aria-label="講師の月間予定に出す種別"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "wrap",
        marginBottom: 12,
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 700, color: "#555", marginRight: 2 }}>
        講師の月間予定に出す種別:
      </span>
      {SPECIAL_EVENT_TYPES.map((t) => {
        const on = isTypeShownInTeacherMonth(display, t.key);
        const style = {
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 10,
          background: on ? t.bg : "#f5f5f5",
          color: on ? t.fg : "#aaa",
          border: `1px solid ${on ? t.accent : "#ddd"}`,
          fontWeight: on ? 700 : 400,
          textDecoration: on ? "none" : "line-through",
        };
        const label = (
          <>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            {on ? " ✓" : ""}
          </>
        );
        return canEdit ? (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(t.key)}
            title={on ? "講師の月間予定に出しています (クリックで出さない)" : "講師の月間予定に出していません (クリックで出す)"}
            style={{ ...style, cursor: "pointer" }}
          >
            {label}
          </button>
        ) : (
          <span key={t.key} style={style} aria-label={`${t.label}: ${on ? "出す" : "出さない"}`}>
            {label}
          </span>
        );
      })}
      <span style={{ fontSize: 10, color: "#888", marginLeft: 4 }}>
        (講師別の月間・週間・まとめて印刷・画像。イベントカレンダーとダッシュボードは全部出す)
      </span>
    </div>
  );
}
