// 予定表とシステムが食い違う 1 日ぶん。食い違いの中身と直す案。
// 日付は見出し (h3)。登録してこのカードが消えたら、親が次のカードの見出しへ
// フォーカスを移す (headingId)。ボタンは紙面に出さない (no-print)。

import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { courseLabel, dateLabel } from "../../../utils/yoteihyo/labels";
import { WARN_TEXT } from "./styles";

const sectionTitle = { fontSize: 12, fontWeight: 800, color: colors.ink, margin: "8px 0 4px" };
const list = { margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: colors.ink };
const muted = { color: colors.inkMuted };
const smallBtn = { ...S.btn(false), padding: "3px 10px", fontSize: 12 };

function slotText(slot) {
  return [slot.time, slot.grade, slot.subj].filter(Boolean).join(" ");
}

function uniq(arr) {
  return [...new Set(arr)];
}

// 休講日の案: 「対象 高校部 高2 / 科目名に「高松一」を含むコマ」
// (休講日の照合は 部 × 学年 × 科目名にその語を含む)
function holidayTarget(h) {
  const grades = h.targetGrades?.length ? h.targetGrades.join("・") : "全学年";
  const kws = h.subjKeywords?.length ? ` / 科目名に「${h.subjKeywords.join("」「")}」を含むコマ` : "";
  return `${(h.scope || []).join("・")} ${grades}${kws}`;
}

// 休講日で止めるコマに残っている登録 (休講にしたら外す)
const CAUTION_REASON = {
  adjustment: "合同・移動が登録されています。休講日を登録したら、欠勤組み換えの画面で外してください。",
  sub: "代行・欠勤が登録されています。休講日を登録したら、欠勤組み換えの画面で外してください。",
};

const MANUAL_REASON = {
  adjustment:
    "合同・移動が登録されているため、自動ではコマ休講にできません。欠勤組み換えの画面で、合同・移動を外してから休講にしてください。",
  sub: "代行・欠勤が登録されているため、自動ではコマ休講にできません。欠勤組み換えの画面で「このコマを休講にする」を選んでください。",
};

export function DayPlanCard({
  plan,
  headingId,
  courses,
  today,
  isAdmin,
  onApply,
  onOpenDayReschedule,
  onEditHoliday,
}) {
  const needOff = plan.findings.filter((f) => f.kind === "needOff");
  const isPast = plan.date < today;
  const fix = plan.fix;
  const canApply = fix.holidays.length > 0 || fix.cancels.length > 0;
  const moves = plan.moves || [];
  const nameOf = (key) => courseLabel(courses.get(key)) || key;
  const openReschedule = (sourceDate, targetDate) =>
    isAdmin && onOpenDayReschedule ? (
      <button
        type="button"
        className="no-print"
        onClick={() => onOpenDayReschedule({ sourceDate, targetDate })}
        style={{ ...smallBtn, marginLeft: 6 }}
      >
        {dateLabel(sourceDate)} → {dateLabel(targetDate)} の日まるごと振替を開く
      </button>
    ) : null;

  return (
    <article
      aria-labelledby={headingId}
      style={{
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${needOff.length ? "#c05030" : plan.extras.length ? colors.accentBlue : WARN_TEXT}`,
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 10,
        background: isPast ? "#fafafa" : colors.surface,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 id={headingId} tabIndex={-1} style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>
          {dateLabel(plan.date)}
        </h3>
        {plan.date === today && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              background: colors.accentRed,
              borderRadius: 4,
              padding: "0 6px",
            }}
          >
            今日
          </span>
        )}
        {isPast && <span style={{ fontSize: 11, ...muted }}>過ぎた日 (直すと、この日以降の第N回が変わります)</span>}
      </div>

      {needOff.length > 0 && (
        <>
          <h4 style={sectionTitle}>予定表では休み・システムでは授業あり</h4>
          <ul style={list}>
            {needOff.map((f) => (
              <li key={f.courseKey}>
                {nameOf(f.courseKey)} <span style={muted}>— 予定表: {f.yt.label}</span>
                <div style={{ ...muted, fontSize: 11 }}>
                  システムで授業のあるコマ: {f.sys.held.map((x) => slotText(x.slot)).join("、")}
                </div>
              </li>
            ))}
          </ul>
          <div
            style={{
              marginTop: 6,
              padding: "6px 10px",
              background: "#f6f8fb",
              border: "1px solid #dde4ef",
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <div style={{ fontWeight: 700 }}>直す案</div>
            {fix.holidays.map((h, i) => (
              <div key={`h${i}`}>
                休講日を追加: 「{h.label}」 <span style={muted}>{holidayTarget(h)}</span>
              </div>
            ))}
            {fix.cancels.length > 0 && (
              <div>
                コマ休講を追加:{" "}
                {fix.cancels
                  .map((c) => plan.offSlots.find((s) => s.id === c.slotId))
                  .filter(Boolean)
                  .map(slotText)
                  .join("、")}
              </div>
            )}
            {fix.manual.map((m) => (
              <div key={`m${m.slot.id}`} style={{ color: WARN_TEXT }}>
                手で直す: {slotText(m.slot)} — {MANUAL_REASON[m.reason] || m.reason}
              </div>
            ))}
            {(fix.cautions || []).map((m) => (
              <div key={`c${m.slot.id}`} style={{ color: WARN_TEXT }}>
                注意: {slotText(m.slot)} — {CAUTION_REASON[m.reason] || m.reason}
              </div>
            ))}
            {moves.map((mv) => (
              <div key={mv.targetDate}>
                {`振替元: ${mv.slots.map(slotText).join("、")} は、予定表では ${dateLabel(mv.targetDate)} に振り替えています。` +
                  "休講日にせず、日まるごと振替で移してください (休講日にすると振替の対象から外れます)。"}
                {openReschedule(plan.date, mv.targetDate)}
              </div>
            ))}
            {isAdmin && canApply && (
              <button
                type="button"
                className="no-print"
                onClick={onApply}
                style={{ ...S.btn(true), marginTop: 6, padding: "4px 12px", fontSize: 12 }}
              >
                この日の案を登録
              </button>
            )}
          </div>
        </>
      )}

      {plan.extras.length > 0 && (
        <>
          <h4 style={sectionTitle}>予定表ではいつもの曜日以外に授業あり・システムには登録なし</h4>
          <ul style={list}>
            {plan.extras.map((f) => (
              <li key={f.courseKey}>
                {nameOf(f.courseKey)}
                {f.notes?.length > 0 && <span style={muted}> — 注記「{f.notes.join(" / ")}」</span>}
                {f.sourceOff?.length > 0 && (
                  <div style={{ fontSize: 11, color: WARN_TEXT }}>
                    {`${dateLabel(f.sourceDate)} のこのコマはシステムで休み (${uniq(
                      f.sourceOff.map((x) => x.status.label)
                    ).join("、")}) のため、日まるごと振替では移せません。`}
                    {(() => {
                      const hol = f.sourceOff.map((x) => x.status.holidays?.[0]).find(Boolean);
                      return isAdmin && hol && onEditHoliday ? (
                        <button
                          type="button"
                          className="no-print"
                          onClick={() => onEditHoliday(hol.id)}
                          style={{ ...smallBtn, padding: "1px 8px", fontSize: 11, marginLeft: 6 }}
                        >
                          休講日を開く
                        </button>
                      ) : null;
                    })()}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {(() => {
            const src = uniq(plan.extras.map((f) => f.sourceDate).filter(Boolean));
            if (!src.length) {
              return (
                <p style={{ ...muted, fontSize: 12, margin: "4px 0 0" }}>
                  {"振替も追加授業も登録されていません。振替なら欠勤組み換えか日まるごと振替で、" +
                    "単発の授業なら「休講・テスト期間・イベント」の追加授業で登録してください。"}
                </p>
              );
            }
            return src.map((s) => (
              <div key={s} style={{ marginTop: 4, fontSize: 12 }}>
                {dateLabel(s)} の授業をこの日へ振り替える登録がありません。
                {openReschedule(s, plan.date)}
              </div>
            ));
          })()}
        </>
      )}

      {plan.infos.length > 0 && (
        <>
          <h4 style={sectionTitle}>予定表では授業あり・システムでは休み</h4>
          <ul style={list}>
            {plan.infos.map((f) => {
              const reasons = uniq(f.sys.off.map((x) => x.status.label));
              const hol = f.sys.off.map((x) => x.status.holidays?.[0]).find(Boolean);
              return (
                <li key={f.courseKey}>
                  {nameOf(f.courseKey)}{" "}
                  <span style={muted}>
                    —{" "}
                    {f.kind === "noSlot"
                      ? "システムにこの曜日のコマがありません"
                      : f.kind === "partial"
                        ? `一部のコマだけ休み (${reasons.join("、")})`
                        : reasons.join("、")}
                  </span>
                  {isAdmin && hol && onEditHoliday && (
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => onEditHoliday(hol.id)}
                      style={{ ...smallBtn, padding: "1px 8px", fontSize: 11, marginLeft: 6 }}
                    >
                      休講日を開く
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
