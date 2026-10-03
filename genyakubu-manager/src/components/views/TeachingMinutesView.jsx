// ─── 授業時間の集計 (旧「講師比較」) ───────────────────────────────
// 給与を「分」で計算する講師のために、期間内に**実際に教えた**時間を
// 講師ごとに一覧する。集計は utils/teachingMinutes (代行・欠勤・振替・
// 合同・休講・特別時程・時間割の有効期間を反映した後の分)。
//
// - 期間は「月 + 締め日」で 1 手、または開始日・終了日を直接入力
// - 講師は教科ごとのボタンで選ぶ (何も選ばなければ期間内に授業のあった全員)
// - 行をクリックすると明細 (日付・時間帯・分・授業)。CSV で集計 / 明細を保存
//
// 締め日と選んだ講師は、この端末の表示の好みとして localStorage に残す
// (人が明示的に選んだもの。使用頻度で並べ替えたりはしない)。

import { Fragment, useMemo, useState } from "react";
import { DAY_COLOR as DC } from "../../data";
import { S } from "../../styles/common";
import { makeEventHelpers } from "./dashboardHelpers";
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
  formatMinutes,
  minutesToHours,
  monthPeriod,
  teachingMinutesDetailRows,
  teachingMinutesSummaryRows,
} from "../../utils/teachingMinutes";

const LS_CLOSING_DAY = "teachingMinutes.closingDay";
const LS_SELECTED = "teachingMinutes.selected";
const CLOSING_DAYS = [0, 10, 15, 20, 25];

const KIND_COLOR = {
  own: "#2e6a9e",
  sub: "#c05030",
  extra: "#3d7a4a",
  koshu: "#7a4a9e",
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

export function TeachingMinutesView({
  slots = [],
  subs = [],
  adjustments = [],
  daySchedules = [],
  timetables = [],
  displayCutoff,
  holidays = [],
  examPeriods = [],
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
  const now = new Date();
  const [closingDay, setClosingDayState] = useState(() => {
    const v = Number(readLs(LS_CLOSING_DAY, 0));
    return CLOSING_DAYS.includes(v) ? v : 0;
  });
  const [ym, setYm] = useState(() => {
    // 締め日を過ぎていたら次の月の期間を開く (21 日以降の 20 日締めは翌月分)
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    const cd = Number(readLs(LS_CLOSING_DAY, 0));
    if (cd && now.getDate() > cd) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return { y, m };
  });
  const initial = monthPeriod(ym.y, ym.m, closingDay);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [selected, setSelectedState] = useState(() => {
    const v = readLs(LS_SELECTED, []);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(() => new Set());

  const setSelected = (updater) => {
    setSelectedState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeLs(LS_SELECTED, next);
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
  const setClosingDay = (cd) => {
    setClosingDayState(cd);
    writeLs(LS_CLOSING_DAY, cd);
    applyMonth(ym.y, ym.m, cd);
  };
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
    ]
  );
  const { rows } = result;

  // 選択ボタンに並べる講師: 時間割に出てくる全員 + 期間内に授業のあった人
  // (代行・追加授業・講習だけの人も選べるように)
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

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (t) =>
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleGroup = (names) =>
    setSelected((prev) => {
      const allOn = names.every((t) => prev.includes(t));
      if (allOn) return prev.filter((t) => !names.includes(t));
      return [...prev, ...names.filter((t) => !prev.includes(t))];
    });

  // 表に出す講師。選択なし = 期間内に授業のあった全員
  const shownTeachers = useMemo(() => {
    const base =
      selected.length > 0
        ? allTeachers.filter((t) => selectedSet.has(t))
        : allTeachers.filter((t) => rows.has(t));
    return base;
  }, [selected, selectedSet, allTeachers, rows]);

  const totals = useMemo(() => {
    const t = { total: 0, count: 0, byKind: { own: 0, sub: 0, extra: 0, koshu: 0 } };
    for (const name of shownTeachers) {
      const r = rows.get(name);
      if (!r) continue;
      t.total += r.total;
      t.count += r.count;
      for (const k of MINUTE_KINDS) t.byKind[k] += r.byKind[k];
    }
    return t;
  }, [shownTeachers, rows]);
  const noTimeCount = shownTeachers.reduce((n, t) => n + (rows.get(t)?.noTime || 0), 0);
  const unconfirmedCount = shownTeachers.reduce(
    (n, t) => n + (rows.get(t)?.unconfirmed || 0),
    0
  );
  // 種別の列は期間内に 1 件でもあるものだけ出す (講習のない月に空列を並べない)
  const kindCols = MINUTE_KINDS.filter(
    (k) => k === "own" || shownTeachers.some((t) => rows.get(t)?.countByKind[k] > 0)
  );

  const rangeOk = startDate && endDate && startDate <= endDate;
  const fileTag = `${startDate}_${endDate}`;
  const exportSummary = () => {
    const { headers, body } = teachingMinutesSummaryRows(rows, shownTeachers);
    downloadTableCsv(headers, body, `授業時間_集計_${fileTag}.csv`);
  };
  const exportDetail = () => {
    const { headers, body } = teachingMinutesDetailRows(rows, shownTeachers);
    downloadTableCsv(headers, body, `授業時間_明細_${fileTag}.csv`);
  };

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

  return (
    <div style={{ marginTop: 12 }}>
      {/* 期間 */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#444" }}>期間</span>
          <button type="button" onClick={() => shiftMonth(-1)} style={S.btn(false)} aria-label="前の月">
            ◀
          </button>
          <button
            type="button"
            onClick={() => applyMonth(ym.y, ym.m)}
            style={{ ...S.btn(isMonthPeriod), minWidth: 110 }}
            title="この月の期間にする"
          >
            {ym.y}年{ym.m}月分
          </button>
          <button type="button" onClick={() => shiftMonth(1)} style={S.btn(false)} aria-label="次の月">
            ▶
          </button>
          <label style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
            締め日
            <select
              value={closingDay}
              onChange={(e) => setClosingDay(Number(e.target.value))}
              style={{ ...S.input, width: "auto", padding: "6px 8px", fontSize: 13 }}
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
            style={{ ...S.input, width: "auto", padding: "6px 8px", fontSize: 13 }}
          />
          <span style={{ color: "#888" }}>〜</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="終了日"
            style={{ ...S.input, width: "auto", padding: "6px 8px", fontSize: 13 }}
          />
          {rangeOk && (
            <span style={{ fontSize: 12, color: "#666" }}>({result.days} 日間)</span>
          )}
        </div>
        {!rangeOk && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#c03030" }}>
            開始日と終了日を正しく入れてください (開始日 ≦ 終了日)
          </div>
        )}
        {result.truncated && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#c03030" }}>
            期間が長すぎるため、開始日から {MAX_RANGE_DAYS} 日ぶんだけ集計しています
          </div>
        )}
      </div>

      {/* 講師の選択 */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#444" }}>
            講師を選ぶ
            <span style={{ fontWeight: 400, color: "#888", marginLeft: 6, fontSize: 12 }}>
              {selected.length === 0
                ? "(未選択 = 期間内に授業のあった全員)"
                : `${selected.length} 名を選択中`}
            </span>
          </span>
          <input
            type="text"
            placeholder="講師名で検索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...S.input, width: "100%", maxWidth: 200, padding: "6px 8px", fontSize: 13 }}
          />
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} style={S.btn(false)}>
              選択を解除
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {teacherGroups.map((group) => {
            const allOn = group.teachers.length > 0 && group.teachers.every((t) => selectedSet.has(t));
            return (
              <div key={group.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.teachers)}
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
                        title={has ? formatMinutes(rows.get(t).total) : "期間内の授業なし"}
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

      {/* 集計表 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>
          {rangeOk ? `${fmtMD(startDate, { withYear: true })} 〜 ${fmtMD(endDate, { withYear: true })}` : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={exportSummary} disabled={shownTeachers.length === 0} style={S.btn(false)}>
          ⬇ 集計 CSV
        </button>
        <button type="button" onClick={exportDetail} disabled={shownTeachers.length === 0} style={S.btn(false)}>
          ⬇ 明細 CSV
        </button>
      </div>
      {(noTimeCount > 0 || unconfirmedCount > 0) && (
        <div
          style={{
            background: "#fff8e0",
            border: "1px solid #e0d080",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            color: "#7a6010",
            marginBottom: 8,
          }}
        >
          {noTimeCount > 0 && (
            <div>⚠ 終了時刻が読めないコマが {noTimeCount} 件あります (分には含めていません。明細の「—」)</div>
          )}
          {unconfirmedCount > 0 && (
            <div>⚠ 代行が未確定のコマが {unconfirmedCount} 件あります (代行者の時間として数えています)</div>
          )}
        </div>
      )}
      {shownTeachers.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", color: "#888", padding: 40 }}>
          {rangeOk ? "この期間に授業はありません" : "期間を指定してください"}
        </div>
      ) : (
        <div className="mobile-scroll-x" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560, background: "#fff" }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, textAlign: "left" }}>講師</th>
                <th scope="col" style={th}>合計</th>
                <th scope="col" style={th}>時間</th>
                {kindCols.map((k) => (
                  <th scope="col" key={k} style={th}>{MINUTE_KIND_LABELS[k]}</th>
                ))}
                <th scope="col" style={th}>コマ数</th>
                <th scope="col" style={th}>出勤日数</th>
              </tr>
            </thead>
            <tbody>
              {shownTeachers.map((t) => {
                const r = rows.get(t);
                const isOpen = open.has(t);
                return (
                  <Fragment key={t}>
                    <tr
                      onClick={() => r && toggleOpen(t)}
                      style={{ cursor: r ? "pointer" : "default", background: isOpen ? "#f5f8fc" : undefined }}
                    >
                      <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                        <span style={{ color: "#999", marginRight: 6, fontSize: 10 }}>
                          {r ? (isOpen ? "▼" : "▶") : ""}
                        </span>
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
                      </td>
                      <td style={{ ...td, fontWeight: 800, fontSize: 14 }}>
                        {r ? `${r.total.toLocaleString()} 分` : "—"}
                      </td>
                      <td style={{ ...td, color: "#555" }}>{r ? formatMinutes(r.total) : "—"}</td>
                      {kindCols.map((k) => (
                        <td key={k} style={{ ...td, color: r?.byKind[k] ? KIND_COLOR[k] : "#ccc" }}>
                          {r?.countByKind[k] ? `${r.byKind[k].toLocaleString()} 分` : "—"}
                        </td>
                      ))}
                      <td style={td}>
                        {r ? r.count : 0}
                        {r?.noTime > 0 && (
                          <span style={{ color: "#c08000", fontSize: 11 }} title="終了時刻が読めないコマ">
                            {" "}(⚠{r.noTime})
                          </span>
                        )}
                      </td>
                      <td style={td}>{r ? r.days.size : 0}</td>
                    </tr>
                    {isOpen && r && (
                      <tr>
                        <td colSpan={5 + kindCols.length} style={{ padding: "4px 10px 12px 28px", background: "#f5f8fc" }}>
                          <EntryList entries={r.entries} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {shownTeachers.length > 1 && (
                <tr>
                  <td style={{ ...td, textAlign: "left", fontWeight: 800, background: "#f0f0f0" }}>合計</td>
                  <td style={{ ...td, fontWeight: 800, background: "#f0f0f0" }}>
                    {totals.total.toLocaleString()} 分
                  </td>
                  <td style={{ ...td, background: "#f0f0f0" }}>{formatMinutes(totals.total)}</td>
                  {kindCols.map((k) => (
                    <td key={k} style={{ ...td, background: "#f0f0f0" }}>
                      {totals.byKind[k].toLocaleString()} 分
                    </td>
                  ))}
                  <td style={{ ...td, background: "#f0f0f0" }}>{totals.count}</td>
                  <td style={{ ...td, background: "#f0f0f0" }} />
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            代行・欠勤・振替・合同・コマ休講・特別時程・休講・テスト期間を反映した、実際に教えた時間です
            (時間 = {minutesToHours(totals.total)} h)。行をクリックすると明細を開きます。
          </div>
        </div>
      )}
    </div>
  );
}

function EntryList({ entries }) {
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
      <tbody>
        {entries.map((e, i) => {
          const dow = dateToDay(e.date) || "日";
          const notes = [];
          if (e.originalTeacher) notes.push(`${e.originalTeacher} の代行`);
          if (e.unconfirmed) notes.push("未確定");
          if (e.rescheduledFrom) notes.push(`${fmtMD(e.rescheduledFrom)} から振替`);
          return (
            <tr key={i} style={{ borderBottom: "1px solid #e6ebf2" }}>
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
