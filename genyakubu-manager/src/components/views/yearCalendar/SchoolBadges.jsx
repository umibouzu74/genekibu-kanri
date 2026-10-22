import { describeSchoolBadge, examDayMark } from "../../../utils/schoolSchedule";
import { fmtMDWeekday } from "../../../utils/dateHelpers";
import { SCHOOL_COLORS } from "./schoolScheduleStyle";

// 年間カレンダーの現役部の欄の先頭に出す、学校ごとのバッジ 1 行
// (.year-cal-school-strip)。状態は見た目と文字の両方で表す (色だけに頼らない):
//   発表 = 白地に濃い枠「桜井 発表」/ 発表後 = 淡い地に枠「桜井」/
//   考査日 = 塗り「桜井❷」/ 期間中の休み = 淡い塗り「桜井」/ 模試だけ = 模試の色
//   模試があれば小札「模」(希望者・冠模試だけなら点線)
// aria-label と title に全文 (utils/schoolSchedule.describeSchoolBadge)。
// 押すと内訳のポップオーバー (閲覧者も見られる。編集は管理者だけ)。
export function SchoolBadgeStrip({ ds, badges, openKey, onOpen }) {
  if (!badges?.length) return null;
  return (
    <div className="ycs-strip year-cal-school-strip">
      {badges.map((b) => (
        <SchoolBadgeChip
          key={b.school}
          ds={ds}
          badge={b}
          open={openKey === `${ds}|${b.school}`}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function SchoolBadgeChip({ ds, badge, open, onOpen }) {
  const kind = badge.examState?.kind || "mock";
  const full = `${fmtMDWeekday(ds)} ${describeSchoolBadge(badge, ds)}`;
  const inner = (
    <>
      {badge.school}
      {kind === "exam" && <span className="ycs-sub">{examDayMark(badge.examState.index)}</span>}
      {kind === "announce" && <span className="ycs-sub"> 発表</span>}
      {badge.mocks.length > 0 && (
        <span className={`ycs-mk${badge.onlyOptionalMocks ? " ycs-mk--opt" : ""}`}>模</span>
      )}
    </>
  );
  return (
    <button
      type="button"
      className={`ycs-chip ycs-chip--${kind} inline-activate`}
      title={`${full} — クリックで内訳`}
      aria-label={full}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(e) => onOpen(ds, badge, e.currentTarget)}
    >
      {inner}
    </button>
  );
}

// 凡例 (年間カレンダーの現役部の行に足す。紙面にも載せる)
export function SchoolBadgeLegend() {
  const item = (cls, inner, label) => (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 11, color: "#555" }}>
      <span className={`ycs-chip ${cls}`} aria-hidden="true" style={{ cursor: "default" }}>
        {inner}
      </span>
      {label}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <b style={{ fontSize: 11, color: SCHOOL_COLORS.examFg, minWidth: 56 }}>学校の予定</b>
      {item(
        "ycs-chip--announce",
        <>
          学校<span className="ycs-sub"> 発表</span>
        </>,
        "考査発表"
      )}
      {item("ycs-chip--pre", "学校", "発表後〜考査前")}
      {item(
        "ycs-chip--exam",
        <>
          学校<span className="ycs-sub">❷</span>
        </>,
        "考査日 (何日目)"
      )}
      {item("ycs-chip--gap", "学校", "考査期間中の休み")}
      {item(
        "ycs-chip--mock",
        <>
          学校<span className="ycs-mk">模</span>
        </>,
        "模試"
      )}
      {item(
        "ycs-chip--mock",
        <>
          学校<span className="ycs-mk ycs-mk--opt">模</span>
        </>,
        "希望者・冠模試だけ"
      )}
    </div>
  );
}
