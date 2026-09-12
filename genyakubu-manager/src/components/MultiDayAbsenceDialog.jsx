import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { S } from "../styles/common";
import { colors } from "../styles/tokens";
import { DAY_COLOR as DC, gradeColor as GC } from "../data";
import { fmtDateWeekday } from "../utils/dateHelpers";
import { shiftDate } from "./views/dashboardHelpers";
import { useSessionCtx } from "../hooks/useSessionCtx";
import { useToday } from "../hooks/useToday";
import { getSlotTeachers } from "../utils/biweekly";
import { sortTeacherNames } from "../utils/teacherKana";
import { applyAbsenceRange, buildAbsenceRangePlan } from "../utils/absenceRange";

// ─── 複数日の欠勤登録ダイアログ ─────────────────────────────────
// 「インフルで 9/14〜9/18 は休み」を、期間 × 講師で一度に登録する。中身は
// 代行者が空の代行レコードを日数ぶん作るだけ (utils/absenceRange)。
// 画面の作りは「先生 → 期間 → 日ごとの対象コマの確認 → 登録」。対象は既定で
// 全選択、来られる日・コマだけチェックを外す。外したコマは理由つきで畳んで出す。

export function MultiDayAbsenceDialog({
  slots,
  subs = [],
  adjustments = [],
  holidays = [],
  examPeriods = [],
  timetables = [],
  displayCutoff = null,
  classSets = [],
  biweeklyAnchors = [],
  sessionOverrides = [],
  daySchedules = [],
  partTimeStaff = [],
  teacherKana = {},
  sessionCtx: sessionCtxProp = null,
  // 欠勤組み換えから開いたときの初期値 { teachers, date }
  initial = null,
  saveSubs,
  onClose,
  onSaved,
  isAdmin = true,
}) {
  const todayStr = useToday();
  const { sessionCtx: builtCtx } = useSessionCtx({
    classSets,
    slots,
    displayCutoff,
    timetables,
    holidays,
    examPeriods,
    biweeklyAnchors,
    sessionOverrides,
    daySchedules,
  });
  const sessionCtx = sessionCtxProp || builtCtx;

  const [teachers, setTeachers] = useState(() => initial?.teachers || []);
  const [teacherQuery, setTeacherQuery] = useState("");
  const [fromDate, setFromDate] = useState(() => initial?.date || todayStr);
  const [toDate, setToDate] = useState(() => initial?.date || todayStr);
  const [mode, setMode] = useState("pending");
  const [memo, setMemo] = useState("");
  const [excluded, setExcluded] = useState(() => new Set());

  const allTeachers = useMemo(() => {
    const set = new Set();
    for (const s of slots) for (const t of getSlotTeachers(s)) set.add(t);
    for (const p of partTimeStaff || []) set.add(p.name);
    return sortTeacherNames([...set], teacherKana);
  }, [slots, partTimeStaff, teacherKana]);
  const shownTeachers = useMemo(() => {
    const q = teacherQuery.trim();
    return q ? allTeachers.filter((t) => t.includes(q)) : allTeachers;
  }, [allTeachers, teacherQuery]);

  const plan = useMemo(
    () =>
      buildAbsenceRangePlan({
        slots,
        subs,
        adjustments,
        fromDate,
        toDate,
        teachers,
        ctx: sessionCtx,
      }),
    [slots, subs, adjustments, fromDate, toDate, teachers, sessionCtx]
  );
  const selectedCount = useMemo(
    () =>
      plan.days.reduce(
        (n, d) => n + d.targets.filter((t) => !excluded.has(t.key)).length,
        0
      ),
    [plan.days, excluded]
  );
  const sundays = plan.days.filter((d) => d.day == null).length;

  const toggleTeacher = (t) =>
    setTeachers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggle = (key) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleDay = (d, on) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const t of d.targets) {
        if (on) next.delete(t.key);
        else next.add(t.key);
      }
      return next;
    });

  const canApply = isAdmin && plan.errors.length === 0 && selectedCount > 0;
  const handleApply = () => {
    if (!canApply) return;
    const n = applyAbsenceRange({
      subs,
      plan,
      excludedKeys: excluded,
      mode,
      memo: memo.trim(),
      saveSubs,
    });
    onSaved?.({ count: n, mode, fromDate, toDate, teachers });
    onClose?.();
  };

  return (
    <Modal title="🤒 複数日の欠勤登録" onClose={onClose} width="min(760px, 96vw)">
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12, lineHeight: 1.7 }}>
        期間と先生を選ぶと、その期間に実施されるコマのうちその先生の担当分を
        日ごとに並べます。作られるのは日ごとの欠勤 (代行者が空の代行レコード) なので、
        代行が決まったら代行一覧の行内で名前を入れて確定できます。
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 220px" }}>
          <label htmlFor="mda-teacher-q" style={S.formLabel}>
            欠勤する先生 ({teachers.length} 名選択)
          </label>
          <input
            id="mda-teacher-q"
            type="search"
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
            placeholder="名前で絞り込み"
            style={{ ...S.input, marginBottom: 4 }}
          />
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 6,
              maxHeight: 160,
              overflowY: "auto",
              padding: "4px 6px",
              background: "#fff",
            }}
          >
            {shownTeachers.map((t) => (
              <label
                key={t}
                style={{ display: "flex", gap: 6, padding: "2px 2px", fontSize: 12, cursor: "pointer" }}
              >
                <input type="checkbox" checked={teachers.includes(t)} onChange={() => toggleTeacher(t)} />
                {t}
              </label>
            ))}
            {shownTeachers.length === 0 && (
              <div style={{ fontSize: 11, color: "#888", padding: 4 }}>該当する先生がいません</div>
            )}
          </div>
        </div>
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label htmlFor="mda-from" style={S.formLabel}>
                開始日
              </label>
              <input
                id="mda-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setFromDate(v);
                  if (v && toDate < v) setToDate(v);
                }}
                style={{ ...S.input, width: "auto" }}
              />
            </div>
            <span style={{ paddingBottom: 6, color: "#888" }}>〜</span>
            <div>
              <label htmlFor="mda-to" style={S.formLabel}>
                終了日
              </label>
              <input
                id="mda-to"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                style={{ ...S.input, width: "auto" }}
              />
            </div>
            <div style={{ display: "flex", gap: 4, paddingBottom: 2 }}>
              {[
                { label: "1 週間", days: 6 },
                { label: "2 週間", days: 13 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => fromDate && setToDate(shiftDate(fromDate, p.days))}
                  title={`終了日を開始日の ${p.label}後にする`}
                  style={{ ...S.btn(false), fontSize: 11, padding: "3px 8px" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>代行:</span>
            {[
              { key: "pending", label: "これから探す (代行未定)" },
              { key: "nosub", label: "代行なし (残りの担当者で回す)" },
            ].map((opt) => {
              const active = mode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMode(opt.key)}
                  aria-pressed={active}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 700,
                    background: active ? "#1a1a2e" : "#f5f5f5",
                    color: active ? "#fff" : "#888",
                    border: `2px solid ${active ? "#1a1a2e" : "#e0e0e0"}`,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div>
            <label htmlFor="mda-memo" style={S.formLabel}>
              理由メモ (任意。全件に同じメモ)
            </label>
            <input
              id="mda-memo"
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="インフルエンザ / 研修 など"
              style={S.input}
            />
          </div>
        </div>
      </div>

      {plan.errors.length > 0 && teachers.length > 0 && (
        <div role="alert" style={{ fontSize: 11, color: colors.danger, marginBottom: 8 }}>
          {plan.errors.join(" / ")}
        </div>
      )}

      {plan.errors.length === 0 && (
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 12,
            maxHeight: "40vh",
            overflowY: "auto",
          }}
        >
          {plan.days
            .filter((d) => d.day != null)
            .map((d) => {
              const on = d.targets.filter((t) => !excluded.has(t.key)).length;
              return (
                <div key={d.date}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 10px",
                      background: "#f5f7fa",
                      borderBottom: "1px solid #e8e8ec",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ color: DC[d.day] }}>{fmtDateWeekday(d.date)}</span>
                    <span style={{ fontWeight: 400, color: "#666" }}>
                      {d.targets.length === 0
                        ? "担当コマなし"
                        : `${on} / ${d.targets.length} コマ`}
                    </span>
                    {d.targets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleDay(d, on < d.targets.length)}
                        style={{ ...S.btn(false), marginLeft: "auto", fontSize: 10, padding: "2px 8px" }}
                      >
                        {on < d.targets.length ? "この日を全部選ぶ" : "この日を全部外す"}
                      </button>
                    )}
                  </div>
                  {d.targets.map((t) => {
                    const gc = GC(t.slot.grade);
                    const checked = !excluded.has(t.key);
                    return (
                      <label
                        key={t.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 10px 4px 22px",
                          borderBottom: "1px solid #f0f0f0",
                          cursor: "pointer",
                          opacity: checked ? 1 : 0.5,
                          fontSize: 12,
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggle(t.key)} />
                        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t.slot.time}</span>
                        <span
                          style={{
                            background: gc.b,
                            color: gc.f,
                            borderRadius: 3,
                            padding: "0 5px",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {t.slot.grade}
                          {t.slot.cls && t.slot.cls !== "-" ? t.slot.cls : ""}
                        </span>
                        <span>{t.slot.subj}</span>
                        <span style={{ color: "#1a1a2e", fontWeight: 700 }}>{t.teacher}</span>
                        {t.slot.room && <span style={{ fontSize: 10, color: "#888" }}>{t.slot.room}</span>}
                      </label>
                    );
                  })}
                  {d.skipped.length > 0 && (
                    <details style={{ fontSize: 11, color: "#666", padding: "2px 10px 4px 22px" }}>
                      <summary style={{ cursor: "pointer" }}>対象外 {d.skipped.length} 件</summary>
                      <ul style={{ margin: "2px 0 0 16px", padding: 0 }}>
                        {d.skipped.map((x, i) => (
                          <li key={i}>
                            {x.slot.time} {x.slot.grade}
                            {x.slot.cls && x.slot.cls !== "-" ? x.slot.cls : ""} {x.slot.subj}
                            {x.teacher ? ` (${x.teacher})` : ""} —{" "}
                            <span style={{ color: "#a06010" }}>{x.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          {sundays > 0 && (
            <div style={{ fontSize: 11, color: "#888", padding: "6px 10px" }}>
              日曜 {sundays} 日は時間割が無いので飛ばします
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {plan.errors.length === 0 && (
          <span style={{ fontSize: 11, color: "#666", marginRight: "auto" }}>
            対象 {plan.total} コマ / 登録 {selectedCount} 件
          </span>
        )}
        <button type="button" onClick={onClose} style={S.btn(false)}>
          キャンセル
        </button>
        <button
          type="button"
          disabled={!canApply}
          onClick={handleApply}
          style={{
            ...S.btn(true),
            cursor: canApply ? "pointer" : "not-allowed",
            background: canApply ? colors.danger : "#ccc",
            borderColor: canApply ? colors.danger : "#ccc",
          }}
        >
          {selectedCount} 件を欠勤にする
        </button>
      </div>
    </Modal>
  );
}
