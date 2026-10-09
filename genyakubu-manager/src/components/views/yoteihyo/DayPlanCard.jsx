// 予定表とシステムが食い違う 1 日ぶん。食い違いの中身と直す案。

import { S } from "../../../styles/common";
import { describeHolidayScope } from "../../../utils/holidayDuplicates";
import { courseLabel, dateLabel } from "../../../utils/yoteihyo/labels";

const sectionTitle = { fontSize: 12, fontWeight: 800, color: "#333", margin: "8px 0 4px" };
const list = { margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: "#333" };
const muted = { color: "#666" };

function slotText(slot) {
  return [slot.time, slot.grade, slot.subj].filter(Boolean).join(" ");
}

function uniq(arr) {
  return [...new Set(arr)];
}

export function DayPlanCard({ plan, courses, today, isAdmin, onApply, onOpenDayReschedule, onEditHoliday }) {
  const needOff = plan.findings.filter((f) => f.kind === "needOff");
  const isPast = plan.date < today;
  const fix = plan.fix;
  const canApply = fix.holidays.length > 0 || fix.cancels.length > 0;
  const nameOf = (key) => courseLabel(courses.get(key)) || key;

  return (
    <section
      aria-label={`${dateLabel(plan.date)} の食い違い`}
      style={{
        border: "1px solid #e3e3e8",
        borderLeft: `4px solid ${needOff.length ? "#c05030" : plan.extras.length ? "#2e6a9e" : "#a07000"}`,
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 10,
        background: isPast ? "#fafafa" : "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{dateLabel(plan.date)}</span>
        {plan.date === today && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#c03030", borderRadius: 4, padding: "0 6px" }}>
            今日
          </span>
        )}
        {isPast && <span style={{ fontSize: 11, ...muted }}>過ぎた日 (第N回に効きます)</span>}
      </div>

      {needOff.length > 0 && (
        <>
          <div style={sectionTitle}>予定表では休み・システムでは授業あり</div>
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
                休講日「{h.label}」 <span style={muted}>{describeHolidayScope(h)}</span>
              </div>
            ))}
            {fix.cancels.length > 0 && (
              <div>
                コマ休講:{" "}
                {fix.cancels
                  .map((c) => plan.offSlots.find((s) => s.id === c.slotId))
                  .filter(Boolean)
                  .map(slotText)
                  .join("、")}
              </div>
            )}
            {fix.manual.map((m) => (
              <div key={m.slot.id} style={{ color: "#a05000" }}>
                手で直す: {slotText(m.slot)} ({m.reason}。欠勤組み換えの画面で)
              </div>
            ))}
            {isAdmin && canApply && (
              <button type="button" onClick={onApply} style={{ ...S.btn(true), marginTop: 6, padding: "4px 12px", fontSize: 12 }}>
                この日の案を登録
              </button>
            )}
          </div>
        </>
      )}

      {plan.extras.length > 0 && (
        <>
          <div style={sectionTitle}>予定表では授業あり (いつもの曜日以外)・システムには無し</div>
          <ul style={list}>
            {plan.extras.map((f) => (
              <li key={f.courseKey}>
                {nameOf(f.courseKey)}
                {f.notes?.length > 0 && <span style={muted}> — 注記「{f.notes.join(" / ")}」</span>}
              </li>
            ))}
          </ul>
          {(() => {
            const src = uniq(plan.extras.map((f) => f.sourceDate).filter(Boolean));
            if (!src.length) {
              return (
                <p style={{ ...muted, fontSize: 12, margin: "4px 0 0" }}>
                  振替・追加授業の登録がありません。振替なら欠勤組み換え / 日まるごと振替、単発の授業なら追加授業で登録します。
                </p>
              );
            }
            return src.map((s) => (
              <div key={s} style={{ marginTop: 4, fontSize: 12 }}>
                {dateLabel(s)} の授業をこの日へ振り替える登録がありません。
                {isAdmin && onOpenDayReschedule && (
                  <button
                    type="button"
                    onClick={() => onOpenDayReschedule({ sourceDate: s, targetDate: plan.date })}
                    style={{ ...S.btn(false), padding: "3px 10px", fontSize: 12, marginLeft: 6 }}
                  >
                    日まるごと振替を開く ({dateLabel(s)} → {dateLabel(plan.date)})
                  </button>
                )}
              </div>
            ));
          })()}
        </>
      )}

      {plan.infos.length > 0 && (
        <>
          <div style={sectionTitle}>予定表では授業あり・システムでは休み</div>
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
                  {hol && onEditHoliday && (
                    <button
                      type="button"
                      onClick={() => onEditHoliday(hol.id)}
                      style={{ ...S.btn(false), padding: "1px 8px", fontSize: 11, marginLeft: 6 }}
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
    </section>
  );
}
