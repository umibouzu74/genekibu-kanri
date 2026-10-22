import { useEffect, useRef } from "react";
import { fmtMDWeekday } from "../../../utils/dateHelpers";
import {
  examDatesOf,
  examStateText,
  isOptionalMock,
  mdRange,
  schoolGradeLabel,
  schoolKeyOf,
  stripSchoolPrefix,
} from "../../../utils/schoolSchedule";
import { SCHOOL_COLORS } from "./schoolScheduleStyle";
import { S } from "../../../styles/common";

// 学校バッジ・タイムラインの帯を押したときの内訳 (画面だけ、no-print)。
// items = [{ kind: "exam" | "mock", record, state?, ds? }]
//   exam: テスト期間名・発表日・考査日の一覧 (state があればその日の状態)
//   mock: 模試名・対象学年・期間・希望者・冠模試か
// 管理者には記録ごとに「編集」(onEdit(kind, record) → 休講・テスト期間・
// イベントの編集画面、年間カレンダーの現役部の記録と同じ経路)。
// クリック外・Esc で閉じ、開く前のフォーカス (チップ) へ戻す。
export function SchoolSchedulePopover({ x, y, title, items, opener, onClose, onEdit }) {
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      // 開いたチップをもう一度押したときは、チップの onClick が閉じる
      if (opener && opener.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, opener]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 画面端からはみ出さないように寄せる
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const overX = rect.right - (window.innerWidth - pad);
    const overY = rect.bottom - (window.innerHeight - pad);
    if (overX > 0) el.style.left = `${Math.max(pad, x - overX)}px`;
    if (overY > 0) el.style.top = `${Math.max(pad, y - overY)}px`;
    el.focus();
  }, [x, y]);

  useEffect(
    () => () => {
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    },
    [opener]
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      className="ycs-pop no-print"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <h4 style={{ flex: 1 }}>{title}</h4>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="inline-activate"
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, padding: 0 }}
        >
          ✕
        </button>
      </div>
      {items.map((it) =>
        it.kind === "exam" ? (
          <ExamItem key={`e-${it.record.id}`} item={it} onEdit={onEdit} />
        ) : (
          <MockItem key={`m-${it.record.id}`} item={it} onEdit={onEdit} />
        )
      )}
    </div>
  );
}

function EditButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ ...S.btn(false), fontSize: 11, padding: "2px 10px", justifySelf: "start", marginTop: 2 }}
    >
      編集
    </button>
  );
}

function ExamItem({ item, onEdit }) {
  const ep = item.record;
  const school = schoolKeyOf(ep);
  const name = stripSchoolPrefix(ep.name, school);
  const dates = examDatesOf(ep);
  const announce = dates.length && ep.startDate < dates[0] ? ep.startDate : null;
  const stateText = item.state ? examStateText(ep, item.state, item.ds) : "";
  return (
    <div className="ycs-pop-item">
      <div>
        <b style={{ color: SCHOOL_COLORS.examFg }}>📝 {name}</b>（{schoolGradeLabel(ep.targetGrades)}）
        {stateText && <b> — {stateText}</b>}
      </div>
      {announce && <div>発表 {fmtMDWeekday(announce)}</div>}
      {dates.length > 0 ? (
        <div>
          考査 {dates.map(fmtMDWeekday).join("・")} ({dates.length}日)
        </div>
      ) : (
        <div>テスト期間 {mdRange(ep.startDate, ep.endDate)} (考査日の登録なし)</div>
      )}
      {ep.source && <div style={{ color: "#888", fontSize: 11 }}>出典: {ep.source}</div>}
      {onEdit && <EditButton label={`${ep.name} を編集`} onClick={() => onEdit("exam", ep)} />}
    </div>
  );
}

function MockItem({ item, onEdit }) {
  const ev = item.record;
  const school = schoolKeyOf(ev);
  const end = ev.endDate || ev.startDate;
  return (
    <div className="ycs-pop-item">
      <div>
        <b style={{ color: SCHOOL_COLORS.mockFg }}>✏️ 模試</b> {stripSchoolPrefix(ev.name, school)}（
        {schoolGradeLabel(ev.targetGrades)}）
      </div>
      <div>
        {end !== ev.startDate
          ? `${fmtMDWeekday(ev.startDate)} 〜 ${fmtMDWeekday(end)}`
          : fmtMDWeekday(ev.startDate)}
        {isOptionalMock(ev) && <span style={{ marginLeft: 6, fontStyle: "italic" }}>希望者・冠模試</span>}
      </div>
      {ev.memo && <div style={{ color: "#666" }}>{ev.memo}</div>}
      {ev.source && <div style={{ color: "#888", fontSize: 11 }}>出典: {ev.source}</div>}
      {onEdit && <EditButton label={`${ev.name} を編集`} onClick={() => onEdit("mock", ev)} />}
    </div>
  );
}
