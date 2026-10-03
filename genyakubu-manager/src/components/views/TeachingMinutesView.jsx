// ─── 授業時間の集計 (旧「講師比較」) ───────────────────────────────
// 給与を「分」で計算する講師のために、期間内に**実際に教えた**時間を
// 講師ごとに一覧する。集計は utils/teachingMinutes (代行・欠勤・振替・
// 合同・休講・特別時程・時間割の有効期間を反映した後の分)。
//
// - 期間は「月 + 締め日」で 1 手 (← / → / t でも送れる)、または開始日・
//   終了日を直接入力
// - 講師は教科ごとのボタンで選ぶ (何も選ばなければ期間内に授業のあった全員)
// - 行の ▶ で明細 (日付・時間帯・分・授業)。CSV で集計 / 明細を保存
// - 「合計に含める」種別を選べる (講習・特訓を別の単価で払う運用のため)
//
// 締め日・選んだ講師・合計に含める種別は、この端末の表示の好みとして
// localStorage に残す (人が明示的に選んだもの。使用頻度で並べ替えたりはしない)。
//
// 印刷はトップバーの 🖨 (popup 系統)。操作部は no-print、紙面のタイトルは
// data-print-title で渡す (日付入力を「授業予定」の日付と取り違えないように)。

import { Fragment, useMemo, useState } from "react";
import { DAY_COLOR as DC } from "../../data";
import { S } from "../../styles/common";
import { makeEventHelpers } from "./dashboardHelpers";
import { useDateKeyNav } from "../../hooks/useDateKeyNav";
import { useToday } from "../../hooks/useToday";
import { sortTeacherNames } from "../../utils/teacherKana";
import { getSlotTeachers } from "../../utils/biweekly";
import { groupTeacherNames } from "../../utils/groupTeacherNames";
import { dateToDay, fmtMD } from "../../utils/dateHelpers";
import { downloadTableCsv } from "../../utils/csv";
import {
  MAX_RANGE_DAYS,
  MINUTE_KINDS,
  MINUTE_KIND_LABELS,
  computeTeachingMinutes,
  currentPeriodYm,
  describeEntryNotes,
  formatMinutes,
  monthPeriod,
  summarizeTeacherRow,
  teachingMinutesDetailRows,
  teachingMinutesSummaryRows,
} from "../../utils/teachingMinutes";

const LS_CLOSING_DAY = "teachingMinutes.closingDay";
const LS_SELECTED = "teachingMinutes.selected";
const LS_INCLUDED = "teachingMinutes.includedKinds";
const CLOSING_DAYS = [0, 10, 15, 20, 25];

const KIND_COLOR = {
  own: "#2e6a9e",
  sub: "#c05030",
  extra: "#3d7a4a",
  koshu: "#7a4a9e",
  prep: "#9e6a2e",
};

function readLs(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writeLs(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}
function readClosingDay() {
  const v = Number(readLs(LS_CLOSING_DAY, 0));
  return CLOSING_DAYS.includes(v) ? v : 0;
}
function readIncluded() {
  const v = readLs(LS_INCLUDED, null);
  const list = Array.isArray(v) ? MINUTE_KINDS.filter((k) => v.includes(k)) : [];
  return list.length > 0 ? list : [...MINUTE_KINDS];
}

export function TeachingMinutesView({
  slots = [],
  subs = [],
  adjustments = [],
  daySchedules = [],
  timetables = [],
  displayCutoff,
  holidays = [],
  examPeriods = [],
  examPrepSchedules = [],
  specialEvents = [],
  biweeklyAnchors = [],
  extraLessons = [],
  koshuLessons = [],
  partTimeStaff = [],
  subjects = [],
  teacherKana = {},
  // 講師名クリックでその人の月間へ
  onSelectTeacher,
}) {
  const today = useToday();
  const [closingDay, setClosingDayState] = useState(readClosingDay);
  // 期間は「◯月分」(ym) から作るか、日付を直接入れるか。初期値は今日を含む月分
  const [initial] = useState(() => {
    const cur = currentPeriodYm(today, closingDay);
    return { ym: cur, ...monthPeriod(cur.y, cur.m, closingDay) };
  });
  const [ym, setYm] = useState(initial.ym);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [selected, setSelectedState] = useState(() => {
    const v = readLs(LS_SELECTED, []);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  });
  const [included, setIncludedState] = useState(readIncluded);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(() => new Set());

  const setSelected = (updater) => {
    setSelectedState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeLs(LS_SELECTED, next);
      return next;
    });
  };
  const toggleIncluded = (kind) => {
    setIncludedState((prev) => {
      const on = prev.includes(kind);
      // 全部外すと合計が 0 になるだけなので、最後の 1 つは外せない
      if (on && prev.length === 1) return prev;
      const next = MINUTE_KINDS.filter((k) => (k === kind ? !on : prev.includes(k)));
      writeLs(LS_INCLUDED, next);
      return next;
    });
  };

  const applyMonth = (y, m, cd = closingDay) => {
    setYm({ y, m });
    const p = monthPeriod(y, m, cd);
    setStartDate(p.startDate);
    setEndDate(p.endDate);
  };
  const shiftMonth = (delta) => {
    const d = new Date(ym.y, ym.m - 1 + delta, 1);
    applyMonth(d.getFullYear(), d.getMonth() + 1);
  };
  const goCurrentMonth = () => {
    const cur = currentPeriodYm(today, closingDay);
    applyMonth(cur.y, cur.m);
  };
  const setClosingDay = (cd) => {
    setClosingDayState(cd);
    writeLs(LS_CLOSING_DAY, cd);
    applyMonth(ym.y, ym.m, cd);
  };
  // ← / → / t = 前の月 / 次の月 / 今月 (月間カレンダーと同じ)
  useDateKeyNav({
    onPrev: () => shiftMonth(-1),
    onNext: () => shiftMonth(1),
    onToday: goCurrentMonth,
  });
  const monthPreset = monthPeriod(ym.y, ym.m, closingDay);
  const isMonthPeriod =
    monthPreset.startDate === startDate && monthPreset.endDate === endDate;

  const { isOffForGrade } = useMemo(
    () => makeEventHelpers(holidays, examPeriods, specialEvents),
    [holidays, examPeriods, specialEvents]
  );

  const result = useMemo(
    () =>
      computeTeachingMinutes({
        startDate,
        endDate,
        slots,
        subs,
        adjustments,
        daySchedules,
        timetables,
        displayCutoff,
        isOffForGrade,
        biweeklyAnchors,
        holidays,
        examPeriods,
        extraLessons,
        koshuLessons,
        examPrepSchedules,
      }),
    [
      startDate,
      endDate,
      slots,
      subs,
      adjustments,
      daySchedules,
      timetables,
      displayCutoff,
      isOffForGrade,
      biweeklyAnchors,
      holidays,
      examPeriods,
      extraLessons,
      koshuLessons,
      examPrepSchedules,
    ]
  );
  const { rows } = result;
  const includedSet = useMemo(() => new Set(included), [included]);
  // 講師 → 合計 (合計に含める種別だけ)
  const sums = useMemo(() => {
    const m = new Map();
    for (const [t, r] of rows) m.set(t, summarizeTeacherRow(r, includedSet));
    return m;
  }, [rows, includedSet]);

  // 選択ボタンに並べる講師: 時間割に出てくる全員 + 期間内に授業のあった人
  // (代行・追加授業・講習・特訓だけの人も選べるように)
  const allTeachers = useMemo(() => {
    const set = new Set();
    for (const s of slots) for (const t of getSlotTeachers(s)) set.add(t);
    for (const t of rows.keys()) set.add(t);
    return sortTeacherNames([...set], teacherKana);
  }, [slots, rows, teacherKana]);
  const filtered = useMemo(
    () => (search ? allTeachers.filter((t) => t.includes(search)) : allTeachers),
    [allTeachers, search]
  );
  const teacherGroups = useMemo(
    () => groupTeacherNames(filtered, { slots, partTimeStaff, subjects, teacherKana }),
    [filtered, slots, partTimeStaff, subjects, teacherKana]
  );

  // 保存してある選択のうち、今も一覧にいる人だけ (辞めた人の名前が残っていても
  // 「N 名を選択中」に数えない)
  const selectedSet = useMemo(() => {
    const known = new Set(allTeachers);
    return new Set(selected.filter((t) => known.has(t)));
  }, [selected, allTeachers]);
  const toggle = (t) =>
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleGroup = (names) =>
    setSelected((prev) => {
      const allOn = names.every((t) => prev.includes(t));
      if (allOn) return prev.filter((t) => !names.includes(t));
      return [...prev, ...names.filter((t) => !prev.includes(t))];
    });

  // 表に出す講師。選択なし = 期間内に授業のあった全員
  const shownTeachers = useMemo(
    () =>
      selectedSet.size > 0
        ? allTeachers.filter((t) => selectedSet.has(t))
        : allTeachers.filter((t) => rows.has(t)),
    [selectedSet, allTeachers, rows]
  );

  const totals = useMemo(() => {
    const t = { total: 0, count: 0, byKind: Object.fromEntries(MINUTE_KINDS.map((k) => [k, 0])) };
    for (const name of shownTeachers) {
      const r = rows.get(name);
      if (!r) continue;
      const s = sums.get(name);
      t.total += s.total;
      t.count += s.count;
      for (const k of MINUTE_KINDS) t.byKind[k] += r.byKind[k];
    }
    return t;
  }, [shownTeachers, rows, sums]);

  // 種別の列は期間内に 1 件でもあるものだけ出す (講習のない月に空列を並べない)。
  // 1 種類だけで合計に入っているなら内訳は合計と同じなので列ごと出さない。
  // 合計から外した種別が残っているときは必ず出す (前に外したまま保存された
  // 種別しか無い月に、合計が 0 なのにチェックを戻す場所が無くならないように)
  const presentKinds = MINUTE_KINDS.filter((k) =>
    shownTeachers.some((t) => rows.get(t)?.countByKind[k] > 0)
  );
  const kindCols =
    presentKinds.length > 1 || presentKinds.some((k) => !includedSet.has(k))
      ? presentKinds
      : [];

  // 注意書き (表に出している講師・合計に含める種別の分だけ)
  const issues = useMemo(() => {
    const noTime = [];
    const unconfirmed = [];
    for (const t of shownTeachers) {
      for (const e of rows.get(t)?.entries || []) {
        if (!includedSet.has(e.kind)) continue;
        if (e.minutes == null) noTime.push({ ...e, teacher: t });
        if (e.unconfirmed) unconfirmed.push({ ...e, teacher: t });
      }
    }
    const pending =
      selectedSet.size > 0
        ? result.pendingAbsences.filter((p) => selectedSet.has(p.teacher))
        : result.pendingAbsences;
    return { noTime, unconfirmed, pending };
  }, [shownTeachers, rows, includedSet, selectedSet, result.pendingAbsences]);

  const rangeOk = !!startDate && !!endDate && startDate <= endDate;
  const periodText = rangeOk
    ? `${fmtMD(startDate, { withYear: true })} 〜 ${fmtMD(endDate, { withYear: true })}`
    : "";
  const fileTag = `${startDate}_${endDate}`;
  const exportSummary = () => {
    const { headers, body } = teachingMinutesSummaryRows(rows, shownTeachers, included);
    downloadTableCsv(headers, body, `授業時間_集計_${fileTag}.csv`);
  };
  const exportDetail = () => {
    const { headers, body } = teachingMinutesDetailRows(rows, shownTeachers, included);
    downloadTableCsv(headers, body, `授業時間_明細_${fileTag}.csv`);
  };
  const canExport = rangeOk && shownTeachers.length > 0;

  const toggleOpen = (t) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const panel = {
    background: "#fff",
    borderRadius: 8,
    padding: 14,
    border: "1px solid #e0e0e0",
    marginBottom: 16,
  };
  const smallInput = { ...S.input, width: "auto", padding: "6px 8px", fontSize: 13 };
  const th = {
    padding: "8px 10px",
    background: "#1a1a2e",
    color: "#fff",
    fontSize: 12,
    textAlign: "right",
    whiteSpace: "nowrap",
  };
  const td = {
    padding: "7px 10px",
    borderBottom: "1px solid #eee",
    fontSize: 13,
    textAlign: "right",
    whiteSpace: "nowrap",
  };
  const totalTd = { ...td, background: "#f0f0f0" };
  const exportBtn = {
    ...S.btn(false),
    opacity: canExport ? 1 : 0.5,
    cursor: canExport ? "pointer" : "not-allowed",
  };

  return (
    <div style={{ marginTop: 12 }}>
      {/* 期間 */}
      <div className="no-print" style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#444" }}>期間</span>
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            style={S.btn(false)}
            aria-label="前の月"
            title="前の月 (←)"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => applyMonth(ym.y, ym.m)}
            aria-pressed={isMonthPeriod}
            style={{ ...S.btn(isMonthPeriod), minWidth: 110 }}
            title={`${monthPreset.startDate} 〜 ${monthPreset.endDate}`}
          >
            {ym.y}年{ym.m}月分
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            style={S.btn(false)}
            aria-label="次の月"
            title="次の月 (→)"
          >
            ▶
          </button>
          <label style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
            締め日
            <select
              value={closingDay}
              onChange={(e) => setClosingDay(Number(e.target.value))}
              style={smallInput}
            >
              {CLOSING_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "末日" : `${d}日`}
                </option>
              ))}
            </select>
          </label>
          <span style={{ width: 8 }} />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="開始日"
            style={smallInput}
          />
          <span style={{ color: "#888" }}>〜</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="終了日"
            style={smallInput}
          />
          {rangeOk && <span style={{ fontSize: 12, color: "#666" }}>({result.days} 日間)</span>}
        </div>
        {!rangeOk && (
          <div role="alert" style={{ marginTop: 8, fontSize: 12, color: "#c03030" }}>
            開始日と終了日を入れてください (開始日は終了日以前)
          </div>
        )}
        {result.truncated && (
          <div role="alert" style={{ marginTop: 8, fontSize: 12, color: "#c03030" }}>
            期間が長すぎるため、開始日から {MAX_RANGE_DAYS} 日ぶんだけ集計しています
          </div>
        )}
      </div>

      {/* 講師の選択 */}
      <div className="no-print" style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#444" }}>
            講師を選ぶ
            <span style={{ fontWeight: 400, color: "#888", marginLeft: 6, fontSize: 12 }}>
              {selectedSet.size === 0
                ? "(未選択 = 期間内に授業のあった全員)"
                : `${selectedSet.size} 名を選択中`}
            </span>
          </span>
          <input
            type="search"
            placeholder="講師名で検索…"
            aria-label="講師名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...smallInput, width: "100%", maxWidth: 200 }}
          />
          {selectedSet.size > 0 && (
            <button type="button" onClick={() => setSelected([])} style={S.btn(false)}>
              選択を解除
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {teacherGroups.length === 0 && (
            <div style={{ fontSize: 12, color: "#999" }}>該当する講師がいません</div>
          )}
          {teacherGroups.map((group) => {
            const allOn = group.teachers.length > 0 && group.teachers.every((t) => selectedSet.has(t));
            return (
              <div key={group.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.teachers)}
                  aria-pressed={allOn}
                  title={allOn ? `${group.label} をまとめて外す` : `${group.label} をまとめて選ぶ`}
                  style={{
                    flex: "0 0 auto",
                    minWidth: 56,
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: "1px solid #bbb",
                    background: allOn ? "#1a1a2e" : "#f3f3f6",
                    color: allOn ? "#fff" : "#444",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {group.label}
                </button>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {group.teachers.map((t) => {
                    const on = selectedSet.has(t);
                    const has = rows.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggle(t)}
                        aria-pressed={on}
                        title={has ? formatMinutes(sums.get(t).total) : "期間内の授業なし"}
                        style={{
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: on ? "2px solid #2e6a9e" : "1px solid #ddd",
                          background: on ? "#2e6a9e18" : "#fff",
                          color: on ? "#2e6a9e" : has ? "#333" : "#aaa",
                          fontSize: 12,
                          fontWeight: on ? 700 : 400,
                          cursor: "pointer",
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 見出し (紙面のタイトルもここから) */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <h3
          data-print-title={rangeOk ? `授業時間の集計 ${periodText}` : "授業時間の集計"}
          style={{ fontSize: 14, fontWeight: 800, margin: 0 }}
        >
          {rangeOk ? `${periodText} の授業時間` : "授業時間"}
        </h3>
        <span style={{ flex: 1 }} />
        <span className="no-print" style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={exportSummary} disabled={!canExport} style={exportBtn}>
            ⬇ 集計 CSV
          </button>
          <button type="button" onClick={exportDetail} disabled={!canExport} style={exportBtn}>
            ⬇ 明細 CSV
          </button>
        </span>
      </div>

      {/* 合計に含める種別 (内訳の列を出すときだけ) */}
      {kindCols.length > 0 && (
        <div
          className="no-print"
          role="group"
          aria-labelledby="minutes-included-label"
          style={{
            margin: "0 0 8px",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <span id="minutes-included-label" style={{ fontWeight: 700, color: "#444" }}>
            合計に含める:
          </span>
          {kindCols.map((k) => {
            const on = includedSet.has(k);
            return (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={on && included.length === 1}
                  onChange={() => toggleIncluded(k)}
                />
                <span style={{ color: KIND_COLOR[k], fontWeight: 700 }}>{MINUTE_KIND_LABELS[k]}</span>
              </label>
            );
          })}
        </div>
      )}

      {(issues.noTime.length > 0 || issues.unconfirmed.length > 0 || issues.pending.length > 0) && (
        <div
          style={{
            background: "#fff8e0",
            border: "1px solid #e0d080",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            color: "#7a6010",
            marginBottom: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <IssueList
            items={issues.pending}
            title={`代行未定のままの欠勤が ${issues.pending.length} 件あります (誰の時間にも数えていません。代行が入っていたら授業管理で代行者を登録してください)`}
            describe={(p) => `${p.teacher} の ${p.label}`}
          />
          <IssueList
            items={issues.unconfirmed}
            title={`代行が未確定のコマが ${issues.unconfirmed.length} 件あります (代行者の時間として数えています)`}
            describe={(e) => `${e.teacher} (${e.originalTeacher} の代行) ${e.label}`}
          />
          <IssueList
            items={issues.noTime}
            title={`終了時刻が読めないコマが ${issues.noTime.length} 件あります (分には含めていません)`}
            describe={(e) => `${e.teacher} ${e.label}`}
          />
        </div>
      )}

      {shownTeachers.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", color: "#888", padding: 40 }}>
          {rangeOk ? "この期間に授業はありません" : "期間を指定してください"}
        </div>
      ) : (
        <div className="mobile-scroll-x" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table
            style={{
              width: "100%",
              maxWidth: 1000,
              borderCollapse: "collapse",
              minWidth: 480,
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                <th scope="col" style={{ ...th, textAlign: "left" }}>
                  講師
                </th>
                <th scope="col" style={th}>
                  合計
                </th>
                <th scope="col" style={th}>
                  時間
                </th>
                {kindCols.map((k) => (
                  <th scope="col" key={k} style={{ ...th, opacity: includedSet.has(k) ? 1 : 0.6 }}>
                    {MINUTE_KIND_LABELS[k]}
                    {!includedSet.has(k) && (
                      <>
                        {" "}
                        <span style={{ fontSize: 10, fontWeight: 400 }}>(合計外)</span>
                      </>
                    )}
                  </th>
                ))}
                <th scope="col" style={th}>
                  コマ数
                </th>
                <th scope="col" style={th}>
                  出勤日数
                </th>
              </tr>
            </thead>
            <tbody>
              {shownTeachers.map((t) => {
                const r = rows.get(t);
                const s = sums.get(t);
                const isOpen = open.has(t);
                const detailId = `minutes-detail-${t}`;
                return (
                  <Fragment key={t}>
                    <tr
                      onClick={() => r && toggleOpen(t)}
                      style={{ cursor: r ? "pointer" : "default", background: isOpen ? "#f5f8fc" : undefined }}
                    >
                      <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                        {r ? (
                          <button
                            type="button"
                            className="no-print"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleOpen(t);
                            }}
                            aria-expanded={isOpen}
                            aria-controls={isOpen ? detailId : undefined}
                            aria-label={`${t} の明細を${isOpen ? "閉じる" : "開く"}`}
                            style={{
                              border: "none",
                              background: "none",
                              padding: "0 6px 0 0",
                              color: "#999",
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                          >
                            {isOpen ? "▼" : "▶"}
                          </button>
                        ) : (
                          <span style={{ display: "inline-block", width: 16 }} />
                        )}
                        {onSelectTeacher ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectTeacher(t);
                            }}
                            title={`${t} の月間スケジュールを開く`}
                            style={{
                              border: "none",
                              background: "none",
                              padding: 0,
                              font: "inherit",
                              color: "inherit",
                              cursor: "pointer",
                              textDecoration: "underline dotted",
                              textUnderlineOffset: 3,
                            }}
                          >
                            {t}
                          </button>
                        ) : (
                          t
                        )}
                      </th>
                      <td style={{ ...td, fontWeight: 800, fontSize: 14 }}>
                        {r ? `${s.total.toLocaleString()} 分` : "—"}
                      </td>
                      <td style={{ ...td, color: "#555" }}>{r ? formatMinutes(s.total) : "—"}</td>
                      {kindCols.map((k) => (
                        <td
                          key={k}
                          style={{
                            ...td,
                            color: r?.countByKind[k] ? KIND_COLOR[k] : "#ccc",
                            opacity: includedSet.has(k) ? 1 : 0.6,
                          }}
                        >
                          {r?.countByKind[k] ? `${r.byKind[k].toLocaleString()} 分` : "—"}
                        </td>
                      ))}
                      <td style={td}>
                        {s?.count ?? 0}
                        {s?.noTime > 0 && (
                          <span style={{ color: "#c08000", fontSize: 11 }} title="終了時刻が読めないコマ">
                            {" "}
                            (⚠{s.noTime})
                          </span>
                        )}
                      </td>
                      <td style={td}>{s?.days ?? 0}</td>
                    </tr>
                    {isOpen && r && (
                      <tr id={detailId}>
                        <td
                          colSpan={5 + kindCols.length}
                          style={{ padding: "4px 10px 12px 28px", background: "#f5f8fc" }}
                        >
                          <EntryList entries={r.entries} includedSet={includedSet} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {shownTeachers.length > 1 && (
                <tr>
                  <th scope="row" style={{ ...totalTd, textAlign: "left", fontWeight: 800 }}>
                    合計
                  </th>
                  <td style={{ ...totalTd, fontWeight: 800 }}>{totals.total.toLocaleString()} 分</td>
                  <td style={totalTd}>{formatMinutes(totals.total)}</td>
                  {kindCols.map((k) => (
                    <td key={k} style={{ ...totalTd, opacity: includedSet.has(k) ? 1 : 0.6 }}>
                      {totals.byKind[k].toLocaleString()} 分
                    </td>
                  ))}
                  <td style={totalTd}>{totals.count}</td>
                  <td style={totalTd} />
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "#888", marginTop: 6, lineHeight: 1.6 }}>
            代行・欠勤・振替・合同・コマ休講・特別時程・休講・テスト期間を反映した、実際に教えた時間です。
            他校舎の授業は含めません。
            <span className="no-print"> 行をクリックすると明細を開きます。</span>
          </div>
        </div>
      )}
    </div>
  );
}

// 注意書き 1 種類ぶん。件数の見出しを押すと中身 (日付・時刻・授業) が開く
function IssueList({ items, title, describe }) {
  if (items.length === 0) return null;
  return (
    <details>
      <summary style={{ cursor: "pointer" }}>⚠ {title}</summary>
      <ul style={{ margin: "4px 0 2px", paddingLeft: 20 }}>
        {items.map((it, i) => (
          <li key={i}>
            {fmtMD(it.date)} ({dateToDay(it.date) || "日"}) {it.time || "時刻なし"} {describe(it)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function EntryList({ entries, includedSet }) {
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
      <tbody>
        {entries.map((e, i) => {
          const dow = dateToDay(e.date) || "日";
          const excluded = !includedSet.has(e.kind);
          const notes = describeEntryNotes(e);
          if (excluded) notes.push("合計外");
          return (
            <tr key={i} style={{ borderBottom: "1px solid #e6ebf2", opacity: excluded ? 0.5 : 1 }}>
              <td style={{ padding: "3px 8px", whiteSpace: "nowrap" }}>
                {fmtMD(e.date)}{" "}
                <span style={{ color: DC[dow] || "#c03030", fontWeight: 700 }}>({dow})</span>
              </td>
              <td style={{ padding: "3px 8px", whiteSpace: "nowrap", color: "#555" }}>{e.time || "—"}</td>
              <td style={{ padding: "3px 8px", whiteSpace: "nowrap", textAlign: "right", fontWeight: 700 }}>
                {e.minutes == null ? "—" : `${e.minutes} 分`}
              </td>
              <td style={{ padding: "3px 8px", whiteSpace: "nowrap", color: KIND_COLOR[e.kind] }}>
                {MINUTE_KIND_LABELS[e.kind]}
              </td>
              <td style={{ padding: "3px 8px" }}>{e.label}</td>
              <td style={{ padding: "3px 8px", color: "#888" }}>{notes.join(" / ")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
