// 予定表とシステムが食い違う 1 日ぶん。食い違いの中身と直す案。
// 日付は見出し (h3)。登録してこのカードが消えたら、親が次のカードの見出しへ
// フォーカスを移す (headingId)。ボタンは紙面に出さない (no-print)。
//
// 食い違いごとに「確認済みにする」(対応不要。次に読み込んでも出さない) を置く。
// 確認済みの食い違いは親が「確認済みも表示」にしたときだけ plan.confirmed で
// 渡ってきて、この日の最後に灰色で並ぶ (取り消せる)。

import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { courseLabel, dateLabel } from "../../../utils/yoteihyo/labels";
import { holidayExceptionTargets } from "../../../utils/yoteihyo/compare";
import { WARN_TEXT } from "./styles";

const sectionTitle = { fontSize: 12, fontWeight: 800, color: colors.ink, margin: "8px 0 4px" };
const list = { margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: colors.ink };
const muted = { color: colors.inkMuted };
const smallBtn = { ...S.btn(false), padding: "3px 10px", fontSize: 12 };
const tinyBtn = { ...smallBtn, padding: "1px 8px", fontSize: 11, marginLeft: 6 };

function slotText(slot) {
  return [slot.time, slot.grade, slot.subj].filter(Boolean).join(" ");
}

function uniq(arr) {
  return [...new Set(arr)];
}

const shortDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}` : "");

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

// 確認済みの一覧に出す、食い違いの種類
const KIND_LABEL = {
  needOff: "予定表では休み・システムでは授業あり",
  needOn: "予定表では授業あり・システムでは休み",
  partial: "予定表では授業あり・システムでは一部のコマが休み",
  noSlot: "予定表では授業あり・システムにこの曜日のコマなし",
  missingExtra: "いつもの曜日以外に授業あり・システムには登録なし",
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
  onConfirm,
  onUnconfirm,
  stale,
  onExceptHoliday,
  onAddOnlyDate,
}) {
  const needOff = plan.findings.filter((f) => f.kind === "needOff");
  const confirmed = plan.confirmed || [];
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
  const canConfirm = isAdmin && !!onConfirm;
  const confirmBtn = (f) =>
    canConfirm ? (
      <button
        type="button"
        className="no-print"
        onClick={() => onConfirm([f])}
        style={tinyBtn}
        aria-label={`${dateLabel(plan.date)} ${nameOf(f.courseKey)} を確認済み (対応不要) にする`}
      >
        確認済みにする
      </button>
    ) : null;
  // 確認済みにした後で中身が変わったので、もう一度出しているもの
  const staleNote = (f) => {
    const entry = stale?.get(f);
    if (!entry) return null;
    return (
      <div style={{ fontSize: 11, color: WARN_TEXT }}>
        {`${entry.at ? `${shortDate(entry.at)} に` : "以前に"}確認済みにしましたが、その後に食い違いの中身が変わったため、もう一度出しています。`}
      </div>
    );
  };
  const borderColor = needOff.length
    ? "#c05030"
    : plan.extras.length
      ? colors.accentBlue
      : plan.infos.length
        ? WARN_TEXT
        : colors.inkGhost;

  return (
    <article
      aria-labelledby={headingId}
      style={{
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 6,
        padding: "8px 12px",
        marginBottom: 10,
        background: isPast || !plan.findings.length ? "#fafafa" : colors.surface,
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
        {isPast && plan.findings.length > 0 && (
          <span style={{ fontSize: 11, ...muted }}>過ぎた日 (直すと、この日以降の第N回が変わります)</span>
        )}
        {canConfirm && plan.findings.length >= 2 && (
          <button
            type="button"
            className="no-print"
            onClick={() => onConfirm(plan.findings)}
            style={{ ...tinyBtn, marginLeft: "auto" }}
          >
            この日の食い違いをまとめて確認済みにする
          </button>
        )}
      </div>

      {needOff.length > 0 && (
        <>
          <h4 style={sectionTitle}>予定表では休み・システムでは授業あり</h4>
          <ul style={list}>
            {needOff.map((f) => (
              <li key={f.courseKey}>
                {nameOf(f.courseKey)} <span style={muted}>— 予定表: {f.yt.label}</span>
                {confirmBtn(f)}
                <div style={{ ...muted, fontSize: 11 }}>
                  システムで授業のあるコマ: {f.sys.held.map((x) => slotText(x.slot)).join("、")}
                </div>
                {staleNote(f)}
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
                {confirmBtn(f)}
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
                          style={tinyBtn}
                        >
                          休講日を開く
                        </button>
                      ) : null;
                    })()}
                  </div>
                )}
                {staleNote(f)}
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
              // 休講日で休みのコマは、その日・そのコマだけ休講日の例外にできる
              // (休講日そのものは消さず縮めない)
              const excepts = holidayExceptionTargets(f);
              // 不定期のコマの実施日でない日は、実施日に加えられる
              const irregular = f.sys.off.filter((x) => x.status.kind === "irregular").map((x) => x.slot);
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
                    <button type="button" className="no-print" onClick={() => onEditHoliday(hol.id)} style={tinyBtn}>
                      休講日を開く
                    </button>
                  )}
                  {confirmBtn(f)}
                  {isAdmin && onExceptHoliday && excepts.length > 0 && (
                    <div className="no-print" style={{ marginTop: 2 }}>
                      <button
                        type="button"
                        onClick={() => onExceptHoliday(plan.date, excepts)}
                        style={{ ...smallBtn, padding: "2px 10px" }}
                        aria-label={`${dateLabel(plan.date)} は ${excepts.map(slotText).join("、")} だけ授業あり (休講日の例外にする)`}
                      >
                        {excepts.length > 1
                          ? `この日はこの ${excepts.length} コマだけ授業あり（休講日の例外にする）`
                          : "この日はこのコマだけ授業あり（休講日の例外にする）"}
                      </button>
                      <span style={{ ...muted, fontSize: 11, marginLeft: 6 }}>{excepts.map(slotText).join("、")}</span>
                    </div>
                  )}
                  {isAdmin && onAddOnlyDate && irregular.length > 0 && (
                    <div className="no-print" style={{ marginTop: 2 }}>
                      <button
                        type="button"
                        onClick={() => onAddOnlyDate(plan.date, irregular)}
                        style={{ ...smallBtn, padding: "2px 10px" }}
                        aria-label={`${dateLabel(plan.date)} を ${irregular.map(slotText).join("、")} の実施日に加える`}
                      >
                        {dateLabel(plan.date)} を実施日に加える
                      </button>
                      <span style={{ ...muted, fontSize: 11, marginLeft: 6 }}>
                        {irregular.map(slotText).join("、")} (不定期のコマ)
                      </span>
                    </div>
                  )}
                  {staleNote(f)}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {confirmed.length > 0 && (
        <>
          <h4 style={{ ...sectionTitle, color: colors.inkMuted }}>確認済み (対応不要)</h4>
          <ul style={{ ...list, color: colors.inkMuted }}>
            {confirmed.map(({ finding: f, entry }) => (
              <li key={f.courseKey}>
                ✓ {nameOf(f.courseKey)} <span>— {KIND_LABEL[f.kind] || f.kind}</span>
                {entry.at && <span>{` (${shortDate(entry.at)} 確認)`}</span>}
                {isAdmin && onUnconfirm && (
                  <button
                    type="button"
                    className="no-print"
                    onClick={() => onUnconfirm([{ finding: f, entry }])}
                    style={tinyBtn}
                    aria-label={`${dateLabel(plan.date)} ${nameOf(f.courseKey)} の確認済みを取り消す`}
                  >
                    確認済みを取り消す
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
