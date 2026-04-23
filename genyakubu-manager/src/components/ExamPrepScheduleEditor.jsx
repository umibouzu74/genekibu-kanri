import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { S } from "../styles/common";
import { eachDateStrInRange, fmtDateWeekday } from "../utils/dateHelpers";
import {
  findDay,
  isTimeRangeValid,
  nextPeriodNo,
} from "../utils/examPrepHelpers";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";

// 各日のデフォルト雛形（添付画像の平日枠: 4 校時 18:00-21:50）。
// 校時数や時刻は編集画面で自由に変えられるので、あくまで初期値。
const DEFAULT_PERIODS = [
  { no: 1, start: "18:00", end: "18:50" },
  { no: 2, start: "19:00", end: "19:50" },
  { no: 3, start: "20:00", end: "20:50" },
  { no: 4, start: "21:00", end: "21:50" },
];

function blankDay(dateStr) {
  return {
    date: dateStr,
    periods: DEFAULT_PERIODS.map((p) => ({ ...p })),
    assignments: {},
  };
}

function renumberPeriods(periods) {
  // 常に 1 始まりの連番に振り直す。assignments との整合は呼び出し側で取る。
  return periods.map((p, i) => ({ ...p, no: i + 1 }));
}

// assignments を periods の no に合わせて再マップする（校時追加／削除／並び替え対応）。
// oldNos -> newNos の対応を渡すと、assignments を正しく変換して返す。
function remapAssignments(assignments, noMap) {
  const next = {};
  for (const [name, nos] of Object.entries(assignments || {})) {
    const mapped = nos
      .map((n) => noMap.get(n))
      .filter((n) => typeof n === "number");
    if (mapped.length > 0) next[name] = mapped;
  }
  return next;
}

export function ExamPrepScheduleEditor({
  examPeriod,
  schedule,
  partTimeStaff,
  crud,
  onClose,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const rangeDates = useMemo(
    () => eachDateStrInRange(examPeriod.startDate, examPeriod.endDate),
    [examPeriod.startDate, examPeriod.endDate]
  );

  const [activeDate, setActiveDate] = useState(rangeDates[0] || "");
  const [copyTargets, setCopyTargets] = useState([]);

  const activeDay = useMemo(() => {
    return findDay(schedule, activeDate);
  }, [schedule, activeDate]);

  const hasDay = activeDay != null;

  const updateActiveDay = (updater) => {
    const base = activeDay || blankDay(activeDate);
    const next = updater(base);
    crud.upsertDay(examPeriod.id, next, { successMsg: null });
  };

  const handleInitDay = () => {
    crud.upsertDay(examPeriod.id, blankDay(activeDate));
  };

  const handleDeleteDay = async () => {
    const ok = await confirm({
      title: "この日のシフト削除",
      message: `${fmtDateWeekday(activeDate)} のシフト設定を削除しますか？`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    crud.deleteDay(examPeriod.id, activeDate);
  };

  const handleAddPeriod = () => {
    updateActiveDay((d) => {
      const no = nextPeriodNo(d.periods);
      const last = d.periods[d.periods.length - 1];
      // 直前校時の終了時刻から +10 分を初期値として提案（無ければ 18:00 開始）。
      const start = last?.end || "18:00";
      const end = last?.end || "18:50";
      return {
        ...d,
        periods: [...d.periods, { no, start, end }],
      };
    });
  };

  const handleDeletePeriod = (periodNo) => {
    updateActiveDay((d) => {
      const filtered = d.periods.filter((p) => p.no !== periodNo);
      const renumbered = renumberPeriods(filtered);
      const noMap = new Map();
      filtered.forEach((p, i) => noMap.set(p.no, renumbered[i].no));
      return {
        ...d,
        periods: renumbered,
        assignments: remapAssignments(d.assignments, noMap),
      };
    });
  };

  const handleChangePeriodTime = (periodNo, field, value) => {
    updateActiveDay((d) => ({
      ...d,
      periods: d.periods.map((p) =>
        p.no === periodNo ? { ...p, [field]: value } : p
      ),
    }));
  };

  const handleToggleAssignment = (staffName, periodNo) => {
    updateActiveDay((d) => {
      const cur = new Set(d.assignments[staffName] || []);
      if (cur.has(periodNo)) cur.delete(periodNo);
      else cur.add(periodNo);
      const next = { ...d.assignments };
      if (cur.size === 0) delete next[staffName];
      else next[staffName] = [...cur].sort((a, b) => a - b);
      return { ...d, assignments: next };
    });
  };

  const handleToggleAllForStaff = (staffName) => {
    updateActiveDay((d) => {
      const allNos = d.periods.map((p) => p.no);
      const cur = d.assignments[staffName] || [];
      const allSelected = allNos.every((n) => cur.includes(n));
      const next = { ...d.assignments };
      if (allSelected) delete next[staffName];
      else next[staffName] = allNos;
      return { ...d, assignments: next };
    });
  };

  const handleCopy = () => {
    if (!activeDay) {
      toasts.error("コピー元の日を先に設定してください");
      return;
    }
    if (copyTargets.length === 0) {
      toasts.error("コピー先の日付を選択してください");
      return;
    }
    crud.copyDay(examPeriod.id, activeDate, copyTargets);
    setCopyTargets([]);
  };

  const toggleCopyTarget = (dateStr) => {
    setCopyTargets((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  // 右ペインのテーブル表示用。時間範囲妥当性チェックも算出。
  const periodWarnings = useMemo(() => {
    if (!activeDay) return [];
    return activeDay.periods
      .filter((p) => !isTimeRangeValid(p.start, p.end))
      .map((p) => p.no);
  }, [activeDay]);

  const configuredDates = new Set((schedule?.days || []).map((d) => d.date));

  return (
    <Modal
      title={`特訓シフト: ${examPeriod.name}`}
      onClose={onClose}
    >
      <div style={{ display: "flex", gap: 16, minWidth: 720 }}>
        {/* 左ペイン: 日付リスト */}
        <div style={{ minWidth: 170, maxWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            日付
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rangeDates.map((ds) => {
              const sel = ds === activeDate;
              const done = configuredDates.has(ds);
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => setActiveDate(ds)}
                  style={{
                    textAlign: "left",
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: `1px solid ${sel ? "#e0a030" : "#ddd"}`,
                    background: sel ? "#fffbe6" : "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: sel ? 700 : 400,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{fmtDateWeekday(ds)}</span>
                  {done && (
                    <span style={{ fontSize: 10, color: "#4a9a4a" }}>●</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右ペイン: 選択日の編集 */}
        <div style={{ flex: 1, minWidth: 520 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {fmtDateWeekday(activeDate)} の特訓シフト
            </div>
            {hasDay && (
              <button
                type="button"
                onClick={handleDeleteDay}
                style={{
                  ...S.btn(false),
                  fontSize: 11,
                  padding: "4px 10px",
                  color: "#c44",
                }}
              >
                この日を削除
              </button>
            )}
          </div>

          {!hasDay ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                border: "1px dashed #ccc",
                borderRadius: 8,
                color: "#888",
                fontSize: 12,
              }}
            >
              <div style={{ marginBottom: 10 }}>
                この日はまだシフトが設定されていません
              </div>
              <button
                type="button"
                onClick={handleInitDay}
                style={S.btn(true)}
              >
                シフトを作成（4 校時 18:00-21:50 で初期化）
              </button>
            </div>
          ) : (
            <>
              {/* 校時テーブル */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  校時
                </div>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f5f5f5" }}>
                      <th style={thStyle}>校時</th>
                      <th style={thStyle}>開始</th>
                      <th style={thStyle}>終了</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDay.periods.map((p) => {
                      const invalid = periodWarnings.includes(p.no);
                      return (
                        <tr key={p.no}>
                          <td style={tdStyle}>{p.no}</td>
                          <td style={tdStyle}>
                            <input
                              type="time"
                              value={p.start}
                              onChange={(e) =>
                                handleChangePeriodTime(p.no, "start", e.target.value)
                              }
                              style={{
                                ...S.input,
                                width: 100,
                                padding: "4px 6px",
                                borderColor: invalid ? "#c44" : "#ccc",
                              }}
                            />
                          </td>
                          <td style={tdStyle}>
                            <input
                              type="time"
                              value={p.end}
                              onChange={(e) =>
                                handleChangePeriodTime(p.no, "end", e.target.value)
                              }
                              style={{
                                ...S.input,
                                width: 100,
                                padding: "4px 6px",
                                borderColor: invalid ? "#c44" : "#ccc",
                              }}
                            />
                          </td>
                          <td style={tdStyle}>
                            <button
                              type="button"
                              onClick={() => handleDeletePeriod(p.no)}
                              aria-label={`${p.no} 校時を削除`}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 14,
                                color: "#c44",
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {periodWarnings.length > 0 && (
                  <div style={{ fontSize: 11, color: "#c44", marginTop: 4 }}>
                    校時 {periodWarnings.join(", ")} の時刻が不正です（開始 &lt; 終了）
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAddPeriod}
                  style={{
                    ...S.btn(false),
                    fontSize: 11,
                    padding: "4px 10px",
                    marginTop: 8,
                  }}
                >
                  ＋ 校時を追加
                </button>
              </div>

              {/* 出勤アサイン表 */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  アルバイト出勤（該当校時にチェック）
                </div>
                {partTimeStaff.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#888" }}>
                    アルバイト講師が登録されていません
                  </div>
                ) : (
                  <table
                    style={{
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        <th style={{ ...thStyle, minWidth: 80 }}>講師</th>
                        {activeDay.periods.map((p) => (
                          <th key={p.no} style={{ ...thStyle, minWidth: 50 }}>
                            {p.no}
                          </th>
                        ))}
                        <th style={thStyle}>全て</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partTimeStaff.map((s) => {
                        const nos = activeDay.assignments[s.name] || [];
                        return (
                          <tr key={s.name}>
                            <td style={tdStyle}>{s.name}</td>
                            {activeDay.periods.map((p) => {
                              const checked = nos.includes(p.no);
                              return (
                                <td key={p.no} style={tdStyle}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      handleToggleAssignment(s.name, p.no)
                                    }
                                    aria-label={`${s.name} ${p.no} 校時`}
                                  />
                                </td>
                              );
                            })}
                            <td style={tdStyle}>
                              <button
                                type="button"
                                onClick={() => handleToggleAllForStaff(s.name)}
                                style={{
                                  ...S.btn(false),
                                  fontSize: 10,
                                  padding: "2px 8px",
                                }}
                              >
                                切替
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 別日へのコピー */}
              <div
                style={{
                  background: "#f9f9f9",
                  borderRadius: 6,
                  padding: 10,
                  border: "1px solid #e0e0e0",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  この日の設定を別の日にコピー
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  {rangeDates
                    .filter((ds) => ds !== activeDate)
                    .map((ds) => {
                      const sel = copyTargets.includes(ds);
                      return (
                        <label
                          key={ds}
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: `1px solid ${sel ? "#e0a030" : "#ccc"}`,
                            background: sel ? "#fffbe6" : "#fff",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => toggleCopyTarget(ds)}
                            style={{ display: "none" }}
                          />
                          {fmtDateWeekday(ds)}
                        </label>
                      );
                    })}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={copyTargets.length === 0}
                  style={{
                    ...S.btn(copyTargets.length > 0),
                    fontSize: 11,
                    padding: "4px 10px",
                    cursor: copyTargets.length > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  {copyTargets.length} 日にコピー
                </button>
                <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
                  ※コピー先に既に設定がある場合は上書きされます。
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid #eee",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button type="button" onClick={onClose} style={S.btn(true)}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}

const thStyle = {
  border: "1px solid #ddd",
  padding: "6px 8px",
  textAlign: "center",
  fontWeight: 700,
};

const tdStyle = {
  border: "1px solid #ddd",
  padding: "4px 8px",
  textAlign: "center",
};
