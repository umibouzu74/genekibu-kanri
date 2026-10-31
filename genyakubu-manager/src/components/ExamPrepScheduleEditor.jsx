import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { ExamPrepTsvDialog } from "./ExamPrepTsvDialog";
import { S, TOGGLE_LABEL_CLASS, VISUALLY_HIDDEN } from "../styles/common";
import { colors } from "../styles/tokens";
import { eachDateStrInRange, fmtDateWeekday } from "../utils/dateHelpers";
import {
  applyPeriodOrder,
  detectOverlaps,
  findDay,
  isTimeRangeValid,
  nextPeriodNo,
  normalizeShiftTime,
  setStaffTime,
  sortDayPeriodsByTime,
  staffShiftPeriods,
  staffTimeOf,
  staffTimeWarnings,
  timeStrToMin,
  withoutOrphanStaffTimes,
} from "../utils/examPrepHelpers";
import { useConfirm } from "../hooks/useConfirm";
import { useToasts } from "../hooks/useToasts";
import { compareTeacherNames, teacherMatchesQuery } from "../utils/teacherKana";
import { getSlotTeachers, hasTeacherChanges, slotTeacherNamesEver } from "../utils/biweekly";
import { pickSubjectId } from "../utils/subjectMatch";

// 各日のデフォルト雛形（添付画像の平日枠: 4 校時 18:00-21:50）。
// 校時数や時刻は編集画面で自由に変えられるので、あくまで初期値。
const DEFAULT_PERIODS = [
  { no: 1, start: "18:00", end: "18:50" },
  { no: 2, start: "19:00", end: "19:50" },
  { no: 3, start: "20:00", end: "20:50" },
  { no: 4, start: "21:00", end: "21:50" },
];

// その日に 1 校時でも出勤が入っている講師の名前
function assignedNames(day) {
  const out = new Set();
  for (const [name, nos] of Object.entries(day?.assignments || {})) {
    if (Array.isArray(nos) && nos.length > 0) out.add(name);
  }
  return out;
}

function countAssigned(day) {
  return assignedNames(day).size;
}

function blankDay(dateStr) {
  return {
    date: dateStr,
    periods: DEFAULT_PERIODS.map((p) => ({ ...p })),
    assignments: {},
  };
}

export function ExamPrepScheduleEditor({
  examPeriod,
  schedule,
  partTimeStaff,
  slots = [],
  subjects = [],
  teacherSubjects = {},
  teacherKana = {},
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
  // 表 (TSV) で書き出す・貼り付ける (C2)
  const [tsvOpen, setTsvOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState([]);
  // コピー先の一覧には表示中の日が出ないので、選択に残っていても数えない。
  // 選択そのものは消さない (コピー先を選んだあと、その日を覗いて戻ってきた
  // ときに選び直しにならないように)
  const effectiveCopyTargets = copyTargets.filter((d) => d !== activeDate);
  const [staffQuery, setStaffQuery] = useState("");
  // 出勤が入っている講師だけに絞る (割り当て後の見直し用)
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  // 日付を開いた時点 (と「出勤者のみ」を入れた時点) の出勤者。最後の
  // チェックを外しても、その日を開いている間は行を出し続ける。「出勤者のみ」
  // や「候補外」の行が外した瞬間に消えると、誤って外したときにその場で
  // 入れ直せない
  const [pinnedNames, setPinnedNames] = useState(() =>
    assignedNames(findDay(schedule, rangeDates[0] || ""))
  );

  const selectDate = (ds) => {
    setActiveDate(ds);
    setPinnedNames(assignedNames(findDay(schedule, ds)));
  };

  const toggleOnlyAssigned = (on) => {
    setOnlyAssigned(on);
    if (on) setPinnedNames(assignedNames(findDay(schedule, activeDate)));
  };

  // 出勤候補リスト: アルバイト + 通常授業の担当講師 (重複排除)。
  // 各エントリに教科情報を付与し、教科 ID 昇順 → 名前 (五十音) で並べる。
  // 教科未設定の講師は末尾にまとめる。
  //
  // 教科解決: getTeacherSubjectIds は講師ごとに全 slots を走査するため、
  // 単純に呼び出すと O(教師 × slots) になる。スロット 1 周で逆引きマップを作り
  // O(slots + 教師) に抑える。優先順位は resolveTeacherSubjectIds と同じく
  //   (1) teacherSubjects[name] の明示オーバーライド
  //   (2) partTimeStaff.subjectIds
  //   (3) slots からの推定
  const staffEntries = useMemo(() => {
    const ptByName = new Map();
    for (const p of partTimeStaff) ptByName.set(p.name, p.subjectIds || []);

    const fromSlotsByName = new Map(); // teacher → Set<subjectId>
    for (const slot of slots) {
      const sid = pickSubjectId(slot.subj, subjects);
      if (sid == null) continue;
      // 担当の切り替え (A5) の前後の担当も候補に入れる
      for (const t of hasTeacherChanges(slot) ? slotTeacherNamesEver(slot) : getSlotTeachers(slot)) {
        if (!t) continue;
        if (!fromSlotsByName.has(t)) fromSlotsByName.set(t, new Set());
        fromSlotsByName.get(t).add(sid);
      }
    }

    const overrides = teacherSubjects || {};
    const allNames = new Set([...ptByName.keys(), ...fromSlotsByName.keys()]);

    const entries = [...allNames].map((name) => {
      const override = overrides[name];
      let subjectIds;
      if (override && override.length > 0) {
        subjectIds = override;
      } else if (ptByName.has(name)) {
        subjectIds = ptByName.get(name);
      } else {
        const s = fromSlotsByName.get(name);
        subjectIds = s ? [...s] : [];
      }
      return {
        name,
        isPartTime: ptByName.has(name),
        subjectIds,
        // primarySubjectId: 教科 ID の最小値で並べる (subjects 配列の自然順)。
        primarySubjectId: subjectIds.length > 0 ? Math.min(...subjectIds) : Infinity,
      };
    });

    // 教科でまとめた中はよみのあいうえお順 (漢字は読み順に並べられない)
    const cmp = compareTeacherNames(teacherKana);
    entries.sort((a, b) => {
      if (a.primarySubjectId !== b.primarySubjectId) {
        return a.primarySubjectId - b.primarySubjectId;
      }
      return cmp(a.name, b.name);
    });

    return entries;
  }, [partTimeStaff, slots, subjects, teacherSubjects, teacherKana]);

  const subjectNameById = useMemo(() => {
    const m = new Map();
    for (const s of subjects) m.set(s.id, s.name);
    return m;
  }, [subjects]);

  const activeDay = useMemo(() => {
    return findDay(schedule, activeDate);
  }, [schedule, activeDate]);

  // 表の行: 出勤候補 + 「この日に出勤が入っているのに候補に居ない講師」。
  // 候補は バイト + 全時間割のコマの講師 なので、コマの削除・置き換え反映や
  // コマの講師名の書き換えで時間割から居なくなった人は候補から消えるが、
  // 出勤の登録は残る。行を出さないと表から外す手段が無く、見出しの人数にも
  // 別の日へのコピーにも黙って含まれるので、末尾に「候補外」として出す。
  const rowEntries = useMemo(() => {
    const known = new Set(staffEntries.map((e) => e.name));
    const names = new Set([...assignedNames(activeDay), ...pinnedNames]);
    const outside = [...names]
      .filter((name) => !known.has(name))
      .sort(compareTeacherNames(teacherKana))
      .map((name) => {
        const override = teacherSubjects?.[name];
        return {
          name,
          isPartTime: false,
          isOutside: true,
          subjectIds: override && override.length > 0 ? override : [],
          primarySubjectId: Infinity,
        };
      });
    return outside.length > 0 ? [...staffEntries, ...outside] : staffEntries;
  }, [staffEntries, activeDay, pinnedNames, teacherSubjects, teacherKana]);

  // 講師名・よみの部分一致 + 「出勤者のみ」で絞り込み。空クエリは全件。
  const filteredStaffEntries = useMemo(() => {
    const assigned = assignedNames(activeDay);
    return rowEntries.filter(
      (e) =>
        teacherMatchesQuery(e.name, staffQuery, teacherKana) &&
        (!onlyAssigned || assigned.has(e.name) || pinnedNames.has(e.name))
    );
  }, [rowEntries, staffQuery, teacherKana, onlyAssigned, activeDay, pinnedNames]);

  // 校時ごとの出勤人数 (見出しに出す)。絞り込みに関係なく全員ぶん数える。
  const headcountByPeriod = useMemo(() => {
    const m = new Map();
    for (const nos of Object.values(activeDay?.assignments || {})) {
      if (!Array.isArray(nos)) continue;
      for (const no of nos) m.set(no, (m.get(no) || 0) + 1);
    }
    return m;
  }, [activeDay]);

  const hasDay = activeDay != null;
  // 来る・帰る時刻の注意 (保存は止めない)
  const staffWarnings = useMemo(
    () => (activeDay ? staffTimeWarnings(activeDay) : []),
    [activeDay]
  );

  // 書き込む時点のその日の設定に当てる (crud.updateDay)。続けて操作しても
  // 前の操作を消さない。updateDay の無い crud (テストの差し替え) は従来どおり
  const updateActiveDay = (updater) => {
    if (crud.updateDay) {
      crud.updateDay(examPeriod.id, activeDate, updater, blankDay(activeDate));
      return;
    }
    const base = activeDay || blankDay(activeDate);
    crud.upsertDay(examPeriod.id, withoutOrphanStaffTimes(updater(base)), { successMsg: null });
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
      // 直前校時の終了時刻から +10 分後に開始、50 分授業を既定値とする。
      // 直前校時が無効または未設定なら 18:00-18:50 で初期化。
      const lastEndMin = last ? timeStrToMin(last.end) : NaN;
      const startMin = Number.isFinite(lastEndMin) ? lastEndMin + 10 : 18 * 60;
      const endMin = startMin + 50;
      const fmt = (m) =>
        `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return {
        ...d,
        periods: [...d.periods, { no, start: fmt(startMin), end: fmt(endMin) }],
      };
    });
  };

  const handleDeletePeriod = (periodNo) => {
    if (!activeDay) return;
    const filtered = activeDay.periods.filter((p) => p.no !== periodNo);
    // 最後の 1 校時を消す場合は、日ごと削除する（空の日エントリを残さない）。
    if (filtered.length === 0) {
      crud.deleteDay(examPeriod.id, activeDate);
      return;
    }
    // 連番の振り直しと出勤チェックの読み替えは applyPeriodOrder に集約
    crud.upsertDay(examPeriod.id, applyPeriodOrder(activeDay, filtered), {
      successMsg: null,
    });
  };

  // 校時を開始時刻順に並べ替える (連番も振り直す)。後から足した校時に
  // 早い時刻 (17:30-18:30 など) を入れても、手で前へ動かす操作は要らない。
  // 入力中に行が飛ぶと編集しづらいので、時刻の onChange ではなく校時テーブル
  // からフォーカスが外れたときに揃える (テーブル内の別の入力へ移る間は据え置き)。
  const handleSortPeriods = () => {
    if (!activeDay) return;
    const sorted = sortDayPeriodsByTime(activeDay);
    if (sorted === activeDay) return;
    crud.upsertDay(examPeriod.id, sorted, { successMsg: null });
    toasts.info("校時を開始時刻順に並べ替えました");
  };

  const handlePeriodTableBlur = (e) => {
    const next = e.relatedTarget;
    if (next && e.currentTarget.contains(next)) return;
    handleSortPeriods();
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
      const cur = new Set(d.assignments?.[staffName] || []);
      if (cur.has(periodNo)) cur.delete(periodNo);
      else cur.add(periodNo);
      const next = { ...(d.assignments || {}) };
      if (cur.size === 0) delete next[staffName];
      else next[staffName] = [...cur].sort((a, b) => a - b);
      return { ...d, assignments: next };
    });
  };

  // 来る・帰る時刻 (途中入り・途中抜け)。空欄 = 校時どおり
  const handleSetStaffTime = (staffName, times) => {
    updateActiveDay((d) => setStaffTime(d, staffName, times));
  };

  const handleToggleAllForStaff = (staffName) => {
    updateActiveDay((d) => {
      const allNos = d.periods.map((p) => p.no);
      const cur = d.assignments?.[staffName] || [];
      const allSelected = allNos.every((n) => cur.includes(n));
      const next = { ...(d.assignments || {}) };
      if (allSelected) delete next[staffName];
      else next[staffName] = allNos;
      return { ...d, assignments: next };
    });
  };

  const handleCopy = async () => {
    if (!activeDay) {
      toasts.error("コピー元の日を先に設定してください");
      return;
    }
    if (effectiveCopyTargets.length === 0) {
      toasts.error("コピー先の日付を選択してください");
      return;
    }
    const overwrites = effectiveCopyTargets.filter((d) => configuredDates.has(d));
    if (overwrites.length > 0) {
      const ok = await confirm({
        title: "既存シフトの上書き",
        message: `以下の日には既にシフト設定があります。上書きしますか？\n${overwrites
          .map((d) => `・${fmtDateWeekday(d)}`)
          .join("\n")}`,
        okLabel: "上書き",
        tone: "danger",
      });
      if (!ok) return;
    }
    crud.copyDay(examPeriod.id, activeDate, effectiveCopyTargets);
    setCopyTargets([]);
  };

  const toggleCopyTarget = (dateStr) => {
    setCopyTargets((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  // 右ペインのテーブル表示用。時間範囲妥当性 + 校時同士の重複チェック。
  const periodWarnings = useMemo(() => {
    if (!activeDay) return { invalid: [], overlapping: new Set() };
    const invalid = activeDay.periods
      .filter((p) => !isTimeRangeValid(p.start, p.end))
      .map((p) => p.no);
    const overlapping = detectOverlaps(activeDay.periods);
    return { invalid, overlapping };
  }, [activeDay]);

  const configuredDates = new Set((schedule?.days || []).map((d) => d.date));
  const assignedCountByDate = new Map(
    (schedule?.days || []).map((d) => [d.date, countAssigned(d)])
  );
  const filtering = staffQuery.trim() !== "" || onlyAssigned;

  return (
    <Modal
      title={`特訓シフト: ${examPeriod.name}`}
      onClose={onClose}
      width="min(900px, 95vw)"
    >
      {crud.replaceDays && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setTsvOpen(true)}
            style={{ ...S.btn(false), fontSize: 11 }}
            title="テスト期間の特訓シフトを表 (TSV) で書き出す・貼り付ける"
          >
            📋 表で書き出す・貼り付ける
          </button>
        </div>
      )}
      {tsvOpen && (
        <ExamPrepTsvDialog
          examPeriod={examPeriod}
          schedule={schedule}
          candidateNames={staffEntries.map((e) => e.name)}
          compareNames={compareTeacherNames(teacherKana)}
          crud={crud}
          onClose={() => setTsvOpen(false)}
        />
      )}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* 左ペイン: 日付リスト。講師の一覧を下へスクロールしても次の日を
            選べるよう、左右 2 段組の画面ではモーダル内で固定する
            (exam-prep-date-pane、appShell.css) */}
        <div className="exam-prep-date-pane" style={{ minWidth: 170, maxWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            日付
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rangeDates.map((ds) => {
              const sel = ds === activeDate;
              const done = configuredDates.has(ds);
              const count = assignedCountByDate.get(ds) || 0;
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => selectDate(ds)}
                  aria-current={sel ? "date" : undefined}
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
                    <span
                      style={{
                        fontSize: 10,
                        color: count > 0 ? "#4a9a4a" : "#aaa",
                        whiteSpace: "nowrap",
                      }}
                      title={count > 0 ? `${count} 人が出勤` : "校時のみ設定 (出勤なし)"}
                    >
                      ● {count}人
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 右ペイン: 選択日の編集 */}
        <div style={{ flex: 1, minWidth: 320 }}>
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
                  color: colors.danger,
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
                  onBlur={handlePeriodTableBlur}
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f5f5f5" }}>
                      <th scope="col" style={thStyle}>校時</th>
                      <th scope="col" style={thStyle}>開始</th>
                      <th scope="col" style={thStyle}>終了</th>
                      <th scope="col" style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDay.periods.map((p) => {
                      const invalid = periodWarnings.invalid.includes(p.no);
                      const overlap = periodWarnings.overlapping.has(p.no);
                      const borderColor = invalid
                        ? colors.danger
                        : overlap
                          ? "#d98a00"
                          : "#ccc";
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
                                borderColor,
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
                                borderColor,
                              }}
                            />
                          </td>
                          <td style={tdStyle}>
                            <button
                              type="button"
                              onClick={() => handleDeletePeriod(p.no)}
                              // クリックで時刻入力からフォーカスを奪わない。
                              // 奪うと onBlur の並べ替えが先に走り、連番が変わった
                              // 後に古い no で削除してしまう (Safari はボタンに
                              // フォーカスが移らず relatedTarget が null になる)
                              onMouseDown={(e) => e.preventDefault()}
                              aria-label={`${p.no} 校時を削除`}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 14,
                                color: colors.danger,
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
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  校時は開始時刻順に自動で並び、番号も振り直します
                  (出勤のチェックは校時に付いて動きます)
                </div>
                {periodWarnings.invalid.length > 0 && (
                  <div style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>
                    校時 {periodWarnings.invalid.join(", ")} の時刻が不正です（開始 &lt; 終了）
                  </div>
                )}
                {periodWarnings.overlapping.size > 0 && (
                  <div style={{ fontSize: 11, color: "#a06000", marginTop: 4 }}>
                    校時 {[...periodWarnings.overlapping].sort((a, b) => a - b).join(", ")} の時間帯が他の校時と重なっています
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
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    出勤（該当校時にチェック / 教科別表示）
                    <span style={{ marginLeft: 6, fontWeight: 400, color: "#666" }}>
                      {countAssigned(activeDay)} 人
                    </span>
                  </div>
                  <input
                    type="search"
                    value={staffQuery}
                    onChange={(e) => setStaffQuery(e.target.value)}
                    placeholder="講師名・よみで絞り込み"
                    aria-label="講師名・よみで絞り込み"
                    style={{
                      ...S.input,
                      width: 170,
                      padding: "3px 8px",
                      fontSize: 11,
                    }}
                  />
                  <label
                    style={{
                      fontSize: 11,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={onlyAssigned}
                      onChange={(e) => toggleOnlyAssigned(e.target.checked)}
                    />
                    出勤者のみ
                  </label>
                  {filtering && (
                    <span style={{ fontSize: 11, color: "#888" }}>
                      {filteredStaffEntries.length} / {rowEntries.length} 件
                    </span>
                  )}
                </div>
                {rowEntries.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#888" }}>
                    出勤候補の講師が登録されていません
                  </div>
                ) : filteredStaffEntries.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#888" }}>
                    {staffQuery.trim()
                      ? `「${staffQuery.trim()}」に該当する${onlyAssigned ? "出勤者" : "講師"}がいません`
                      : "この日はまだ誰も出勤していません"}
                  </div>
                ) : (
                  // 横スクロールの囲みは狭い画面だけ (exam-prep-staff-scroll、
                  // appShell.css)。広い画面で overflow を付けるとそこが
                  // スクロール領域になり、見出しの sticky がモーダルの縦
                  // スクロールに効かなくなる
                  <div className="exam-prep-staff-scroll">
                  <table
                    style={{
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr>
                        <th scope="col" className="exam-prep-sticky-th" style={{ ...stickyThStyle, minWidth: 60 }}>教科</th>
                        <th scope="col" className="exam-prep-sticky-th" style={{ ...stickyThStyle, minWidth: 80 }}>講師</th>
                        {activeDay.periods.map((p) => {
                          const n = headcountByPeriod.get(p.no) || 0;
                          return (
                            <th
                              scope="col"
                              key={p.no}
                              className="exam-prep-sticky-th"
                              style={{ ...stickyThStyle, minWidth: 64, padding: "4px 6px" }}
                            >
                              <div>{p.no}</div>
                              <div style={{ fontSize: 10, fontWeight: 400, color: "#666" }}>
                                {p.start}-{p.end}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 400,
                                  color: n > 0 ? "#2a7a4a" : "#aaa",
                                }}
                              >
                                {n}人
                              </div>
                            </th>
                          );
                        })}
                        <th scope="col" className="exam-prep-sticky-th" style={stickyThStyle}>全て</th>
                        <th
                          scope="col"
                          className="exam-prep-sticky-th"
                          style={stickyThStyle}
                          title="校時の途中から来る・途中で帰るときだけ入れる (空欄 = 校時どおり)"
                        >
                          来る〜帰る
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaffEntries.map((entry, idx) => {
                        const nos = activeDay.assignments?.[entry.name] || [];
                        const shiftByNo = new Map(
                          staffShiftPeriods(activeDay, entry.name).map((x) => [x.no, x])
                        );
                        const st = staffTimeOf(activeDay, entry.name);
                        const allOn =
                          activeDay.periods.length > 0 &&
                          activeDay.periods.every((p) => nos.includes(p.no));
                        const subjectLabel = entry.subjectIds.length > 0
                          ? entry.subjectIds
                              .map((id) => subjectNameById.get(id))
                              .filter(Boolean)
                              .join("·")
                          : "—";
                        const prev = idx > 0 ? filteredStaffEntries[idx - 1] : null;
                        const isSubjectBoundary =
                          prev &&
                          (prev.primarySubjectId !== entry.primarySubjectId ||
                            !!prev.isOutside !== !!entry.isOutside);
                        return (
                          <tr
                            key={entry.name}
                            style={{
                              borderTop: isSubjectBoundary
                                ? "2px solid #aaa"
                                : undefined,
                            }}
                          >
                            <td
                              style={{
                                ...tdStyle,
                                color:
                                  entry.subjectIds.length > 0 ? "#444" : "#aaa",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              {subjectLabel}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                fontWeight: nos.length > 0 ? 700 : 400,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {entry.name}
                              {entry.isOutside ? (
                                <span
                                  style={{
                                    marginLeft: 4,
                                    fontSize: 9,
                                    color: colors.danger,
                                    fontWeight: 400,
                                  }}
                                  title="アルバイトにも時間割にも居ない講師です。不要ならチェックを外してください"
                                >
                                  候補外
                                </span>
                              ) : (
                                !entry.isPartTime && (
                                  <span
                                    style={{
                                      marginLeft: 4,
                                      fontSize: 9,
                                      color: "#888",
                                      fontWeight: 400,
                                    }}
                                    title="通常授業の担当講師"
                                  >
                                    常勤
                                  </span>
                                )
                              )}
                            </td>
                            {activeDay.periods.map((p) => {
                              const checked = nos.includes(p.no);
                              // 途中から・途中までの校時は薄く塗り、時刻を添える
                              const shift = checked ? shiftByNo.get(p.no) : null;
                              const partial = checked && (!shift || shift.trimmed);
                              return (
                                <td
                                  key={p.no}
                                  style={{
                                    ...tdStyle,
                                    padding: 0,
                                    background: checked
                                      ? partial
                                        ? PARTIAL_BG
                                        : CHECKED_BG
                                      : undefined,
                                  }}
                                  title={
                                    partial
                                      ? shift
                                        ? `${shift.start}〜${shift.end} (途中から・途中まで)`
                                        : "来る・帰る時刻の外 (出勤に数えません)"
                                      : undefined
                                  }
                                >
                                  {/* セル全体をクリック範囲にする (小さな
                                      チェックボックスを狙わなくてよい) */}
                                  <label style={cellLabelStyle}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        handleToggleAssignment(entry.name, p.no)
                                      }
                                      aria-label={`${entry.name} ${p.no} 校時`}
                                    />
                                  </label>
                                </td>
                              );
                            })}
                            <td style={tdStyle}>
                              <button
                                type="button"
                                onClick={() => handleToggleAllForStaff(entry.name)}
                                aria-label={`${entry.name} の全校時を${allOn ? "解除" : "選択"}`}
                                style={{
                                  ...S.btn(false),
                                  fontSize: 10,
                                  padding: "2px 8px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {allOn ? "全解除" : "全選択"}
                              </button>
                            </td>
                            <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                              {nos.length > 0 ? (
                                <StaffTimeInputs
                                  name={entry.name}
                                  from={st.from || ""}
                                  to={st.to || ""}
                                  onChange={(next) => handleSetStaffTime(entry.name, next)}
                                />
                              ) : (
                                <span style={{ color: "#bbb", fontSize: 10 }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>

              {staffWarnings.length > 0 && (
                <div role="alert" style={{ fontSize: 11, color: "#9a6b00", lineHeight: 1.7 }}>
                  {staffWarnings.map((w) => (
                    <div key={`${w.name}-${w.kind}`}>⚠ {w.message}</div>
                  ))}
                </div>
              )}

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
                          className={TOGGLE_LABEL_CLASS}
                          style={{
                            position: "relative",
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
                            style={VISUALLY_HIDDEN}
                          />
                          {fmtDateWeekday(ds)}
                        </label>
                      );
                    })}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={effectiveCopyTargets.length === 0}
                  style={{
                    ...S.btn(effectiveCopyTargets.length > 0),
                    fontSize: 11,
                    padding: "4px 10px",
                    cursor: effectiveCopyTargets.length > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  {effectiveCopyTargets.length} 日にコピー
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

// 出勤表の見出しは、講師の一覧を下へスクロールしても校時と時刻が読めるよう
// モーダル (S.card がスクロール領域) の上端に固定する。固定位置 (top) は
// カードの padding ぶん上へ出す必要があり、padding が画面幅で変わるので
// CSS 側 (appShell.css の .exam-prep-sticky-th) に置く。border-collapse の表は
// sticky にした見出しの罫線が付いてこないので、下罫を影で描く
const stickyThStyle = {
  ...thStyle,
  position: "sticky",
  zIndex: 1,
  background: "#f5f5f5",
  boxShadow: "inset 0 -1px 0 #ccc",
};

// 出勤を入れた校時のセル
const CHECKED_BG = "#fff4d6";
// 途中から・途中までの校時 (来る・帰る時刻で切り詰めた校時)
const PARTIAL_BG = "#fffaec";

// 1 行ぶんの来る・帰る時刻。入力中はこの欄だけで持ち、欄を離れたときに
// "HH:MM" にそろえて保存する ("1830" / "18：30" も読む)
function StaffTimeInputs({ name, from, to, onChange }) {
  const [draft, setDraft] = useState(null);
  const cur = draft || { from, to };
  const commit = (next) => {
    const f = normalizeShiftTime(next.from);
    const t = normalizeShiftTime(next.to);
    setDraft(null);
    if (f === null || t === null) return; // 読めない時刻は保存しない (元に戻る)
    if (f === (from || "") && t === (to || "")) return;
    onChange({ from: f, to: t });
  };
  const input = (field, label) => (
    <input
      type="text"
      inputMode="numeric"
      value={cur[field]}
      placeholder={field === "from" ? "来る" : "帰る"}
      aria-label={`${name} の${label}`}
      onChange={(e) => setDraft({ ...cur, [field]: e.target.value })}
      onBlur={() => draft && commit(cur)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(cur);
        if (e.key === "Escape") setDraft(null);
      }}
      style={{ ...S.input, width: 52, fontSize: 11, padding: "2px 4px" }}
    />
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      {input("from", "来る時刻")}
      <span style={{ fontSize: 10, color: "#888" }}>〜</span>
      {input("to", "帰る時刻")}
    </span>
  );
}

const cellLabelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 8px",
  cursor: "pointer",
};
