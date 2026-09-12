import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, dateToDay, sortSlots as sortS, DAY_COLOR as DC } from "../../data";
import { S } from "../../styles/common";
import { colors } from "../../styles/tokens";
import { getSlotTeachers } from "../../utils/biweekly";
import { sortTeacherNames } from "../../utils/teacherKana";
import { saveAbsenceBatch } from "../../utils/absenceBatch";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import { buildSessionCountMap } from "../../utils/sessionCount";
import { makeEventHelpers, shiftDate } from "./dashboardHelpers";
import { useToday } from "../../hooks/useToday";
import { useAbsenceDraft } from "./absence/useAbsenceDraft";
import { AbsenceTimetable } from "./absence/AbsenceTimetable";
import { AbsenceRegisterDialog } from "./absence/AbsenceRegisterDialog";
import {
  activeTeachersOnDate,
  collectAbsenceTargets,
  getAbsenceDaySlots,
  getAbsentSlotIds,
} from "../../utils/absenceHelpers";
import { getCutoffGroupLabelsWithSlots, getDayCutoffKind } from "../../utils/timetable";
import {
  getDaySchedulesForDate,
  isSlotCancelledByDaySchedule,
} from "../../utils/daySchedules";
import { extraLessonsOnDate } from "../../utils/extraLessons";
import { ExtraLessonBanner } from "../ExtraLessonBanner";
import { cutoffBannerText } from "../../constants/cutoffMessages";

// ─── 先生欠勤 統合ワークフロー (直接操作 UI 版) ─────────────────
// 上部: 対象日 + 欠勤先生選択 / 下部: 時間割グリッド
// 全ての操作 (代行・合同・移動・回数補正) はグリッド上で DnD や右クリック
// から行い、下書きは useAbsenceDraft が保持する。画面右下のフローティング
// ボタンで一括保存。

export function AbsenceWorkflowView({
  slots,
  subs,
  adjustments,
  sessionOverrides,
  holidays,
  examPeriods,
  biweeklyAnchors,
  classSets,
  displayCutoff,
  partTimeStaff,
  subjects,
  teacherKana = {},
  timetables,
  saveSubs,
  saveAdjustments,
  saveSessionOverrides,
  isAdmin,
  initDate,
  onConsumeInitDate,
  // 特別時程 (1 限カット等) と追加授業。ダッシュボードと同じ日の姿にする
  daySchedules = [],
  extraLessons = [],
  // 複数日の欠勤登録ダイアログ (App が持つ) と玉突き代行 (授業管理のタブ) へ
  onOpenMultiDayAbsence,
  onOpenChainSubstitution,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();
  // 一覧画面から特定日付つきで遷移してきた場合は、初期表示からその日付に
  // することで「今日 → 目的日」のチラつきを防ぐ。
  const todayStr = useToday();
  const [date, setDate] = useState(() => initDate || fmtDate(new Date()));
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState(false);
  const [teacherQuery, setTeacherQuery] = useState("");
  const teacherDropdownRef = useRef(null);
  const draft = useAbsenceDraft();

  // initDate を消費通知 (親側でクリア)。マウント中に再ジャンプされた場合は
  // 新しい日付に切り替え、保留中のドラフトは破棄する (別の日付の作業を
  // 紛れ込ませないため)。
  useEffect(() => {
    if (!initDate) return;
    if (initDate !== date) {
      setDate(initDate);
      draft.reset();
    }
    onConsumeInitDate?.();
    // date / draft / onConsumeInitDate は依存に含めない (initDate 変化時のみ実行)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDate]);

  // ドロップダウン外クリック / Escape で閉じる (K3c: キーボードでも
  // 閉じられるように。IME 変換中の Escape は無視する)
  useEffect(() => {
    if (!teacherDropdownOpen) return undefined;
    const handler = (e) => {
      if (
        teacherDropdownRef.current &&
        !teacherDropdownRef.current.contains(e.target)
      ) {
        setTeacherDropdownOpen(false);
      }
    };
    const keyHandler = (e) => {
      if (e.key === "Escape" && !e.isComposing) setTeacherDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [teacherDropdownOpen]);

  const dayName = useMemo(() => dateToDay(date), [date]);

  // 休講 / テスト期間判定 (sessionCount 計算 + 振替先警告 + コマ単位ラベル表示で共有)
  const {
    isOffForGrade,
    isHolidayForSlot,
    isInExamPeriodForGrade,
    holidaysFor,
    examPeriodsFor,
  } = useMemo(
    () => makeEventHelpers(holidays || [], examPeriods || []),
    [holidays, examPeriods]
  );

  // 当日のヘッダバナー用 (休講・テスト期間が設定されているか一目で分かるように)
  const holidaysToday = useMemo(() => holidaysFor(date), [holidaysFor, date]);
  const examPeriodsToday = useMemo(
    () => examPeriodsFor(date),
    [examPeriodsFor, date]
  );

  // 全先生リスト
  const allTeachers = useMemo(() => {
    const set = new Set();
    for (const s of slots) {
      for (const t of getSlotTeachers(s)) set.add(t);
    }
    for (const p of partTimeStaff || []) set.add(p.name);
    return sortTeacherNames([...set], teacherKana);
  }, [slots, partTimeStaff, teacherKana]);

  // その日が全学年グループの表示期間外か (開講前 / 終講後)。
  // コマを持たない学年グループは判定から外す (ダッシュボードと同じ)。
  const activeGroupLabels = useMemo(
    () => getCutoffGroupLabelsWithSlots(slots, displayCutoff),
    [slots, displayCutoff]
  );
  const dayCutoffKind = useMemo(
    () => getDayCutoffKind(date, displayCutoff, { activeGroupLabels }),
    [date, displayCutoff, activeGroupLabels]
  );

  // 対象日のコマ群。曜日だけでなく時間割の適用期間・表示期間でも絞る
  // (旧期の時間割が残っていると同じコマが 2 重・3 重に並ぶため)。
  // 特別時程の部分休講 (1 限カット等) はダッシュボードと同じく外す
  // (欠勤対象として出すと、休講のコマに代行を立ててしまう)
  const daySlots = useMemo(
    () =>
      sortS(
        getAbsenceDaySlots(slots, date, dayName, { timetables, displayCutoff }).filter(
          (s) => !isSlotCancelledByDaySchedule(s, date, daySchedules)
        )
      ),
    [slots, date, dayName, timetables, displayCutoff, daySchedules]
  );
  const daySchedulesToday = useMemo(
    () => getDaySchedulesForDate(daySchedules, date),
    [daySchedules, date]
  );
  const extraLessonsToday = useMemo(
    () => extraLessonsOnDate(extraLessons, date),
    [extraLessons, date]
  );

  // 欠勤する先生のプルダウンは「この日に担当がある人」を先頭にまとめる。
  // 全員 (バイト含む) を平坦に並べると長くて探せない。隔週は担当週 (A/B) を
  // 解いた上で判定する (B 週の主担当は「この日は担当なし」側に落ちる)。
  // 誰でも選べることは変えない (欠勤する人がその日にコマを持たなくても、
  // 特訓や追加授業の欠勤を登録したいことはある)
  const teacherGroups = useMemo(() => {
    const onDay = new Set();
    for (const s of daySlots) {
      for (const t of activeTeachersOnDate(s, date, {
        biweeklyAnchors: biweeklyAnchors || [],
        holidays: holidays || [],
        examPeriods: examPeriods || [],
      })) {
        onDay.add(t);
      }
    }
    const q = teacherQuery.trim();
    const hit = (t) => !q || t.includes(q);
    return {
      onDay: allTeachers.filter((t) => onDay.has(t) && hit(t)),
      others: allTeachers.filter((t) => !onDay.has(t) && hit(t)),
    };
  }, [daySlots, date, allTeachers, teacherQuery, biweeklyAnchors, holidays, examPeriods]);

  // 欠勤先生が担当するコマ集合 (赤枠表示用)。対象は画面に出ているコマだけ。
  // 隔週は担当週 (A/B) を解いてから判定する ("欠勤にする" の対象と同じ判定)。
  const absentSlotIds = useMemo(
    () =>
      getAbsentSlotIds(daySlots, date, selectedTeachers, {
        biweeklyAnchors: biweeklyAnchors || [],
        holidays: holidays || [],
        examPeriods: examPeriods || [],
      }),
    [daySlots, date, selectedTeachers, biweeklyAnchors, holidays, examPeriods]
  );

  // ドラフト反映済みの回数 map
  const sessionCountMap = useMemo(() => {
    if (!date || !displayCutoff) return new Map();

    // ドラフトを effective な adjustments / overrides に連結
    const draftAdjustments = [];
    const draftOverridesLocal = [];
    const draftOverridingSlots = {
      combine: new Set(),
      move: new Set(),
      reschedule: new Set(),
    };
    let idBase = -1000;
    for (const [sidStr, row] of Object.entries(draft.draft)) {
      const slotId = Number(sidStr);
      if (row.combine?.absorbedSlotIds?.length) {
        draftAdjustments.push({
          id: idBase--,
          date,
          type: "combine",
          slotId,
          combineSlotIds: [...row.combine.absorbedSlotIds],
          memo: "(draft)",
        });
        draftOverridingSlots.combine.add(slotId);
      }
      if (row.move?.targetTime) {
        draftAdjustments.push({
          id: idBase--,
          date,
          type: "move",
          slotId,
          targetTime: row.move.targetTime,
          memo: "(draft)",
        });
        draftOverridingSlots.move.add(slotId);
      }
      if (row.reschedule?.targetDate) {
        const entry = {
          id: idBase--,
          date,
          type: "reschedule",
          slotId,
          targetDate: row.reschedule.targetDate,
          memo: "(draft)",
        };
        if (row.reschedule.targetTime) entry.targetTime = row.reschedule.targetTime;
        if (row.reschedule.targetTeacher) {
          entry.targetTeacher = row.reschedule.targetTeacher;
        }
        draftAdjustments.push(entry);
        draftOverridingSlots.reschedule.add(slotId);
      }
      if (row.override) {
        if (row.override.mode === "set" && Number.isFinite(Number(row.override.value))) {
          draftOverridesLocal.push({
            id: idBase--,
            date,
            slotId,
            mode: "set",
            value: Number(row.override.value),
            memo: "(draft)",
          });
        } else if (row.override.mode === "skip") {
          const entry = { id: idBase--, date, slotId, mode: "skip", memo: "(draft)" };
          const d = Number(row.override.displayAs);
          if (Number.isFinite(d) && d > 0) entry.displayAs = d;
          draftOverridesLocal.push(entry);
        }
      }
    }

    // 既存 adjustments から、draft で上書きされるものと解除マークされたものを除外
    const removedIds = draft.removedAdjustmentIds || new Set();
    const filteredAdjustments = (adjustments || []).filter((a) => {
      if (removedIds.has(a.id)) return false;
      if (a.date === date) {
        if (a.type === "combine" && draftOverridingSlots.combine.has(a.slotId)) return false;
        if (a.type === "move" && draftOverridingSlots.move.has(a.slotId)) return false;
        if (a.type === "reschedule" && draftOverridingSlots.reschedule.has(a.slotId)) {
          return false;
        }
      }
      return true;
    });

    return buildSessionCountMap(daySlots, date, {
      classSets: classSets || [],
      allSlots: slots,
      displayCutoff,
      timetables: timetables || [],
      isOffForGrade,
      biweeklyAnchors: biweeklyAnchors || [],
      adjustments: [...filteredAdjustments, ...draftAdjustments],
      sessionOverrides: [...(sessionOverrides || []), ...draftOverridesLocal],
      // 適用可否は学年グループ設定 (表示期間設定の orientationFirstDay) 側で判定。
      orientationOnFirstDay: true,
    });
  }, [daySlots, slots, date, classSets, displayCutoff, timetables, isOffForGrade, biweeklyAnchors, adjustments, sessionOverrides, draft.draft, draft.removedAdjustmentIds]);

  const toggleTeacher = useCallback(
    (name) => {
      // 欠勤先生の追加 / 削除は「どのコマを赤枠強調するか」だけを変える
      // ため、既存の下書きはそのまま維持する (過去に "リセット" していたが、
      // 別先生を追加しようとして下書きが全消去される事故が起きるため廃止)。
      setSelectedTeachers((prev) =>
        prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
      );
    },
    []
  );

  // 「選択した先生を欠勤にする」の対象 (代行者が空の代行レコードを作る)。
  // 対象から外したコマは理由つきで画面に出す (黙って減らさない)。
  const absenceTargets = useMemo(
    () =>
      collectAbsenceTargets({
        slots: daySlots,
        date,
        teachers: selectedTeachers,
        ctx: {
          biweeklyAnchors: biweeklyAnchors || [],
          holidays: holidays || [],
          examPeriods: examPeriods || [],
          isOffForGrade,
        },
        draft: draft.draft,
        existingSubs: subs,
        removedSubIds: draft.removedSubIds,
        existingAdjustments: adjustments,
        removedAdjustmentIds: draft.removedAdjustmentIds,
      }),
    [
      daySlots,
      date,
      selectedTeachers,
      biweeklyAnchors,
      holidays,
      examPeriods,
      isOffForGrade,
      draft.draft,
      draft.removedSubIds,
      draft.removedAdjustmentIds,
      subs,
      adjustments,
    ]
  );

  // ダイアログで選んだぶんだけ下書きにする。mode は
  //   pending = これから代行を探す (代行未定)
  //   nosub   = 代行を立てず残りの担当者で回す (代行なしで確定)
  const handleRegisterAbsence = useCallback(
    (selected, mode, memo = "") => {
      for (const t of selected) {
        draft.updateSub(t.slotId, t.teacher, {
          substitute: "",
          status: mode === "nosub" ? "confirmed" : "requested",
          ...(memo ? { memo } : {}),
        });
      }
      setAbsenceDialogOpen(false);
      const what = mode === "nosub" ? "欠勤 (代行なし)" : "欠勤 (代行未定)";
      toasts.success(`${selected.length} 件を${what}の下書きにしました`);
    },
    [draft, toasts]
  );

  // 下書きの件数カウント (保存ボタン表示用)
  const draftCount = useMemo(() => {
    let c = 0;
    for (const row of Object.values(draft.draft)) {
      // 代行 / 欠勤は講師ごとに 1 件 (多担任コマでは複数)。代行者が未定の
      // 「欠勤だけ」も数える (数えないと保存ボタンが出ず、登録したつもりが
      // 消える)。
      c += Object.keys(row.subs || {}).length;
      if (row.combine?.absorbedSlotIds?.length) c++;
      if (row.move?.targetTime) c++;
      if (row.reschedule?.targetDate) c++;
      if (row.override) c++;
    }
    c += (draft.removedAdjustmentIds?.size || 0);
    c += (draft.removedSubIds?.size || 0);
    return c;
  }, [draft.draft, draft.removedAdjustmentIds, draft.removedSubIds]);

  // 下書きがある状態でタブを閉じる / リロードしようとしたら警告
  useEffect(() => {
    if (draftCount === 0) return undefined;
    const handler = (e) => {
      e.preventDefault();
      // Chrome ではメッセージ文字列は無視され固定のダイアログが出る
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draftCount]);

  const handleDiscard = useCallback(async () => {
    const ok = await confirm({
      title: "下書きを破棄",
      message: `下書きが ${draftCount} 件あります。破棄しますか？`,
      okLabel: "破棄",
      tone: "danger",
    });
    if (ok) draft.reset();
  }, [confirm, draft, draftCount]);

  const handleDateChange = useCallback(
    async (newDate) => {
      if (draftCount > 0) {
        const ok = await confirm({
          title: "下書きがあります",
          message: "日付を変更すると下書きが破棄されます。続行しますか？",
          okLabel: "破棄して変更",
          tone: "danger",
        });
        if (!ok) return;
        draft.reset();
      }
      setDate(newDate);
    },
    [confirm, draft, draftCount]
  );

  const handleSave = useCallback(() => {
    const {
      draftSubs,
      draftAdjustments,
      draftOverrides,
      removedAdjustmentIds,
      removedSubIds,
      replacedSubIds,
    } = draft.toBatchPayload(date, slots, adjustments || [], subs || []);
    if (
      draftSubs.length === 0 &&
      draftAdjustments.length === 0 &&
      draftOverrides.length === 0 &&
      (!removedAdjustmentIds || removedAdjustmentIds.length === 0) &&
      (!removedSubIds || removedSubIds.length === 0)
    ) {
      toasts.error("変更がありません");
      return;
    }
    try {
      const res = saveAbsenceBatch({
        subsList: subs,
        adjustmentsList: adjustments,
        sessionOverridesList: sessionOverrides,
        draftSubs,
        draftAdjustments,
        draftOverrides,
        removedAdjustmentIds,
        removedSubIds,
        saveSubs,
        saveAdjustments,
        saveSessionOverrides,
      });
      const parts = [];
      if (res.added.subs) {
        // 代行者が決まっている分と「代行未定 (欠勤のみ)」を出し分ける。
        const pending = draftSubs.filter((r) => !r.substitute).length;
        const assigned = res.added.subs - pending;
        if (assigned) parts.push(`代行 ${assigned} 件`);
        if (pending) parts.push(`欠勤 (代行未定) ${pending} 件`);
      }
      if (res.added.adjustments) parts.push(`調整 ${res.added.adjustments} 件`);
      if (res.added.overrides) parts.push(`回数補正 ${res.added.overrides} 件`);
      if (res.added.removed) parts.push(`調整解除 ${res.added.removed} 件`);
      // 付け替え (欠勤 → 代行) で消えた分は「解除」に数えない。
      const removedOnly = Math.max(
        0,
        res.added.removedSubs - (replacedSubIds?.length || 0)
      );
      if (removedOnly) parts.push(`代行解除 ${removedOnly} 件`);
      toasts.success(`保存しました (${parts.join(" / ")})`);
      draft.reset();
    } catch (err) {
      console.error(err);
      toasts.error("保存に失敗しました");
    }
  }, [draft, date, slots, subs, adjustments, sessionOverrides, saveSubs, saveAdjustments, saveSessionOverrides, toasts]);

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, color: "#888", fontSize: 13 }}>
        このビューは管理者のみ利用できます。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 80 }}>
      {/* Header: date + teacher selection */}
      <div
        style={{
          background: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label htmlFor="absence-flow-date" style={{ fontSize: 12, fontWeight: 700 }}>
          対象日:
        </label>
        <input
          id="absence-flow-date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && handleDateChange(e.target.value)}
          style={{ ...S.input, width: "auto" }}
        />
        {/* 翌日分を続けて処理するのに日付ピッカーを開かなくて済むように
            (ダッシュボードの DashboardDateNav と同じ 3 ボタン) */}
        <button
          type="button"
          onClick={() => handleDateChange(shiftDate(date, -1))}
          style={{ ...S.btn(false), fontSize: 12 }}
        >
          ← 前
        </button>
        <button
          type="button"
          onClick={() => handleDateChange(todayStr)}
          style={{ ...S.btn(date === todayStr), fontSize: 12 }}
        >
          今日
        </button>
        <button
          type="button"
          onClick={() => handleDateChange(shiftDate(date, 1))}
          style={{ ...S.btn(false), fontSize: 12 }}
        >
          次 →
        </button>
        {dayName && (
          <span
            style={{
              background: DC[dayName] || "#666",
              color: "#fff",
              padding: "3px 10px",
              borderRadius: 6,
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {dayName}
          </span>
        )}
        <div style={{ fontSize: 12, color: "#666" }}>
          欠勤する先生 ({selectedTeachers.length} 名選択):
        </div>
        <div ref={teacherDropdownRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setTeacherDropdownOpen((v) => !v)}
            aria-expanded={teacherDropdownOpen}
            aria-haspopup="listbox"
            style={{ ...S.btn(false), cursor: "pointer" }}
          >
            {selectedTeachers.length > 0
              ? selectedTeachers.join(", ")
              : "(クリックして選択)"}
          </button>
          {teacherDropdownOpen && (
            <div
              style={{
                position: "absolute",
                zIndex: 10,
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "6px 8px",
                maxHeight: 280,
                overflowY: "auto",
                minWidth: 180,
                boxShadow: "0 2px 6px rgba(0,0,0,.1)",
                top: "100%",
                marginTop: 2,
              }}
            >
              <input
                type="search"
                value={teacherQuery}
                onChange={(e) => setTeacherQuery(e.target.value)}
                placeholder="名前で絞り込み"
                aria-label="欠勤する先生を名前で絞り込み"
                autoFocus
                style={{
                  ...S.input,
                  width: "100%",
                  fontSize: 12,
                  padding: "4px 6px",
                  marginBottom: 4,
                  boxSizing: "border-box",
                }}
              />
              {[
                { key: "onDay", label: `この日に担当あり (${teacherGroups.onDay.length})`, list: teacherGroups.onDay },
                { key: "others", label: `その他 (${teacherGroups.others.length})`, list: teacherGroups.others },
              ].map((g) =>
                g.list.length === 0 ? null : (
                  <div key={g.key} role="group" aria-label={g.label}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#888",
                        padding: "4px 4px 2px",
                        borderTop: g.key === "others" ? "1px solid #eee" : undefined,
                        marginTop: g.key === "others" ? 4 : 0,
                      }}
                    >
                      {g.label}
                    </div>
                    {g.list.map((t) => (
                      <label
                        key={t}
                        style={{
                          display: "flex",
                          gap: 6,
                          padding: "2px 4px",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTeachers.includes(t)}
                          onChange={() => toggleTeacher(t)}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                )
              )}
              {teacherGroups.onDay.length === 0 && teacherGroups.others.length === 0 && (
                <div style={{ fontSize: 11, color: "#888", padding: 4 }}>
                  該当する先生がいません
                </div>
              )}
            </div>
          )}
        </div>
        {/* 代行が見つかっていなくても、まず欠勤だけ登録しておけるようにする。
            作られるのは代行者が空の代行レコード (依頼中) なので、代行が
            決まったら同じコマに名前を入れるだけでよい。 */}
        {selectedTeachers.length > 0 && (
          <button
            type="button"
            onClick={() => setAbsenceDialogOpen(true)}
            disabled={absenceTargets.targets.length === 0}
            title={
              absenceTargets.skipped.length > 0
                ? // 日まるごと振替の「対象外のコマ」と同じ書き方に揃える
                  `対象外のコマ:\n${absenceTargets.skipped
                    .map(
                      (x) =>
                        `${x.slot.time} ${x.slot.grade}${
                          x.slot.cls && x.slot.cls !== "-" ? x.slot.cls : ""
                        } ${x.slot.subj} — ${x.reason}`
                    )
                    .join("\n")}`
                : "選択した先生の休むコマを選んで欠勤にします"
            }
            style={{
              ...S.btn(false),
              cursor: absenceTargets.targets.length === 0 ? "not-allowed" : "pointer",
              color:
                absenceTargets.targets.length === 0 ? "#aaa" : colors.danger,
              borderColor:
                absenceTargets.targets.length === 0 ? "#ddd" : colors.danger,
              fontWeight: 700,
            }}
          >
            ❗ 欠勤にする ({absenceTargets.targets.length} 件)
          </button>
        )}
        {(onOpenMultiDayAbsence || onOpenChainSubstitution) && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {onOpenMultiDayAbsence && (
              <button
                type="button"
                onClick={() => onOpenMultiDayAbsence({ teachers: selectedTeachers, date })}
                title="インフル 1 週間など、複数日にまたがる欠勤をまとめて登録する"
                style={{ ...S.btn(false), fontSize: 12 }}
              >
                🤒 複数日の欠勤登録
              </button>
            )}
            {onOpenChainSubstitution && (
              <button
                type="button"
                onClick={() => onOpenChainSubstitution(date)}
                title="この日の代行未定のコマに、空いている先生を自動で当ててみる (提案。自動では確定しない)"
                style={{ ...S.btn(false), fontSize: 12 }}
              >
                🔗 玉突き代行で探す
              </button>
            )}
          </div>
        )}
      </div>

      {/* 表示期間外の日: 「開講前」と「終講後 (未確定)」は必ず出し分ける */}
      {dayCutoffKind && (
        <div
          style={{
            background: "#fff8e0",
            border: "1px solid #e0d080",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 10,
            color: "#8a7020",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {cutoffBannerText(dayCutoffKind)}
        </div>
      )}

      {/* 特別時程: 時刻の読み替え・1 限カットがある日は先に知らせる
          (グリッドの時刻はコマの元の時刻のまま。カットされたコマは出さない) */}
      {daySchedulesToday.length > 0 && (
        <div
          role="status"
          style={{
            background: "#efeaf8",
            border: "1px solid #b8a8e0",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            color: "#4a3a8e",
            fontWeight: 700,
          }}
        >
          {daySchedulesToday.map((d) => {
            const mapSummary = [
              ...(d.timeMap || []).map((m) => `${m.from}→${m.to}`),
              ...(d.cancelTimes || []).map((t) => `${t} 休講`),
            ].join(" / ");
            return (
              <div key={d.id}>
                ⏰ 特別時程 {d.label ? `「${d.label}」` : ""} ({(d.targetGrades || []).join("・")})
                {mapSummary ? `: ${mapSummary}` : ""}
                <span style={{ fontWeight: 400, marginLeft: 6 }}>
                  — 休講のコマは下のグリッドに出しません。時刻は元の時刻で並んでいます
                </span>
              </div>
            );
          })}
        </div>
      )}
      {/* 追加授業: この日の担当を確かめる場なので出す (代行はここでは登録しない) */}
      <ExtraLessonBanner lessons={extraLessonsToday} />

      {/* Timetable grid */}
      <AbsenceTimetable
        slots={daySlots}
        allSlots={slots}
        draft={draft.draft}
        draftApi={draft}
        existingSubs={subs}
        existingAdjustments={adjustments}
        removedAdjustmentIds={draft.removedAdjustmentIds}
        removedSubIds={draft.removedSubIds}
        sessionCountMap={sessionCountMap}
        absentSlotIds={absentSlotIds}
        partTimeStaff={partTimeStaff}
        subjects={subjects}
        teacherKana={teacherKana}
        biweeklyAnchors={biweeklyAnchors}
        holidays={holidays}
        examPeriods={examPeriods}
        allTeachers={allTeachers}
        timetables={timetables}
        isOffForGrade={isOffForGrade}
        isHolidayForSlot={isHolidayForSlot}
        isInExamPeriodForGrade={isInExamPeriodForGrade}
        holidaysToday={holidaysToday}
        examPeriodsToday={examPeriodsToday}
        sessionOverrides={sessionOverrides}
        date={date}
      />

      {absenceDialogOpen && (
        <AbsenceRegisterDialog
          date={date}
          targets={absenceTargets.targets}
          skipped={absenceTargets.skipped}
          onSubmit={handleRegisterAbsence}
          onClose={() => setAbsenceDialogOpen(false)}
        />
      )}

      {/* Floating save button */}
      {draftCount > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 500,
            display: "flex",
            gap: 6,
            alignItems: "center",
            background: "#fff",
            padding: "8px 10px",
            borderRadius: 10,
            boxShadow: "0 6px 18px rgba(0,0,0,.25)",
            border: "1px solid #ddd",
          }}
        >
          <button
            type="button"
            onClick={handleDiscard}
            style={{ ...S.btn(false), fontSize: 12 }}
          >
            破棄
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              background: "#2a6a9e",
              color: "#fff",
              padding: "8px 16px",
              border: "none",
              borderRadius: 6,
              fontWeight: 800,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {draftCount} 件の変更を保存
          </button>
        </div>
      )}
    </div>
  );
}
