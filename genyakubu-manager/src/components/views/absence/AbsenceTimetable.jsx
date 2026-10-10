import { useCallback, useMemo, useState } from "react";
import { ADJ_COLOR, dateToDay, DEPT_COLOR } from "../../../data";
import { getDashSections } from "../../../constants/schedule";
import { ContextMenu } from "../../ContextMenu";
import { AbsenceSlotCard } from "./AbsenceSlotCard";
import { AbsenceExcelSection } from "./AbsenceExcelSection";
import { SubstitutePickerPopover } from "./SubstitutePickerPopover";
import { SessionOverridePopover } from "./SessionOverridePopover";
import { ReschedulePickerPopover } from "./ReschedulePickerPopover";
import {
  canCombineIncoming,
  canCombineSlots,
  findCombineCandidates,
} from "../../../utils/absenceHelpers";
import { isCancelAdjustment } from "../../../utils/slotCancel";
import {
  buildIncomingItems,
  describeSlot,
  rescheduleTeacherLabel,
} from "../../../utils/adjustmentDisplay";
import { fmtMDWeekday } from "../../../utils/dateHelpers";
import {
  collectTeacherAssignments,
  findTeacherConflicts,
} from "../../../utils/teacherConflicts";
import {
  biweeklyActiveTeacher,
  getSlotTeachers,
  splitTeacherField,
} from "../../../utils/biweekly";

// ─── 欠勤ワークフロー: 時間割グリッド (直接操作 UI) ────────────
// レイアウトは Dashboard 時間割 (ExcelGridView) と同じ Excel グリッド。
// 部署セクションを左右 2 カラム (中学部 / それ以外) に並べ、各セクション内は
// 行=時間、列=学年・クラス・教室 の表構造。
// 編集機能:
//   1. スロットをドラッグして別時間セルにドロップ → move 下書き (時間のみ更新)
//   2. 右クリック → ContextMenu → 代行 / 合同 / 移動 / 振替 / コマ休講 / 回数補正 / 取消
//   3. 合同モード中はヒューリスティック候補のみ破線枠、クリックで合同確定
// draft は親から渡された callback 経由で更新する (直接 mutate しない)。

export function AbsenceTimetable({
  slots, // 対象日のコマ群 (day フィルタ済み)
  allSlots, // 全スロット (振替先日付の候補時間帯抽出用)
  draft, // draft.draft (useAbsenceDraft から)
  draftApi, // updateSub, clearSub, updateMove, clearMove, updateReschedule, clearReschedule, setCombine, clearCombine, updateOverride, setCancel, clearCancel, markAdjustmentRemoved
  existingSubs, // 既存の代行レコード (代行未定の欠勤登録も含む)
  existingAdjustments, // 既存調整 (date フィルタ前)
  removedAdjustmentIds, // Set<number> draft 上で解除マークされた adjustment id
  removedSubIds, // Set<number> draft 上で解除マークされた substitute id
  sessionCountMap, // Map<slotId, number> draft 反映済み
  absentSlotIds, // Set<slotId>
  partTimeStaff,
  subjects,
  teacherKana = {},
  biweeklyAnchors,
  holidays, // 隔週ローテーションのシフトに使用 (任意)
  examPeriods, // 隔週ローテーションのシフトに使用 (任意)
  allTeachers, // 振替先担当候補 (全先生名 / よみ順に整列済み)
  timetables, // 振替先の有効時間割フィルタ用
  isOffForGrade, // 振替先の休講/テスト期間警告用
  isHolidayForSlot, // 「休講」表示用 (休講のみ判定)
  isInExamPeriodForGrade, // 「テスト期間」表示用 (休講に該当しない場合のフォールバック)
  holidaysToday = [], // 当日に該当する休講エントリ (バナー表示用)
  examPeriodsToday = [], // 当日に該当するテスト期間 (バナー表示用)
  sessionOverrides, // 振替の skip 自動付与判定用 (既存override 検出)
  offsiteToday = [], // この日に他校舎へ授業に出ている予定 (重なり・代行候補の「他校舎」)
  // 他日から振替で入ってくるコマ (adjustmentDisplay.buildIncomingCards の
  // コマの形。id は "rs:<振替の id>")。通常のコマと同じグリッドにカードで並べる
  incomingCards = [],
  absentTeachers = [], // 欠勤する先生 (振替で入るコマの ❗欠勤 表示用)
  // 振替で入るコマの操作。どれも保存済みの振替そのものを直すので、下書きを
  // 通さずその場で保存する (呼び出し側が「元に戻す」を出す)。未指定なら
  // その操作を出さない:
  //   onSetIncomingCombine(吸収される振替の id, 受け入れる振替の id | null)
  //   onUpdateIncoming(振替の id, {targetDate, targetTime, targetTeacher, memo})
  //   onRemoveIncoming(振替の id) / onOpenDate("YYYY-MM-DD") (振替元の日を開く)
  onSetIncomingCombine,
  onUpdateIncoming,
  onRemoveIncoming,
  onOpenDate,
  date,
}) {
  const [ctxMenu, setCtxMenu] = useState(null);
  const [combineSource, setCombineSource] = useState(null);
  const [subPicker, setSubPicker] = useState(null); // { slot, anchorRect }
  const [overridePicker, setOverridePicker] = useState(null); // { slot, anchorRect }
  const [reschedulePicker, setReschedulePicker] = useState(null); // { slot, anchorRect }

  const dow = useMemo(() => dateToDay(date), [date]);

  // 当日の既存調整 (解除マーク済みは除く)
  const activeExistingAdjustments = useMemo(() => {
    const removed = removedAdjustmentIds || new Set();
    return (existingAdjustments || []).filter(
      (a) => a.date === date && !removed.has(a.id)
    );
  }, [existingAdjustments, date, removedAdjustmentIds]);

  // 解除マーク済み (保存前に取り消し可能)
  const pendingRemovals = useMemo(() => {
    const removed = removedAdjustmentIds;
    if (!removed || removed.size === 0) return [];
    return (existingAdjustments || []).filter(
      (a) => a.date === date && removed.has(a.id)
    );
  }, [existingAdjustments, date, removedAdjustmentIds]);

  // 既存調整のインデックス: slotId -> adjustment (種別ごと)
  const {
    existingCombineBySlot,
    existingMoveBySlot,
    existingRescheduleBySlot,
    existingCancelBySlot,
  } = useMemo(() => {
    const combineMap = new Map(); // hostSlotId -> adjustment
    const moveMap = new Map(); // slotId -> adjustment
    const rescheduleMap = new Map(); // slotId -> adjustment
    const cancelMap = new Map(); // slotId -> adjustment (コマ休講)
    for (const adj of activeExistingAdjustments) {
      if (adj.type === "combine") combineMap.set(adj.slotId, adj);
      else if (adj.type === "move") moveMap.set(adj.slotId, adj);
      else if (adj.type === "reschedule") rescheduleMap.set(adj.slotId, adj);
      else if (isCancelAdjustment(adj)) cancelMap.set(adj.slotId, adj);
    }
    return {
      existingCombineBySlot: combineMap,
      existingMoveBySlot: moveMap,
      existingRescheduleBySlot: rescheduleMap,
      existingCancelBySlot: cancelMap,
    };
  }, [activeExistingAdjustments]);

  // draft + 既存 からの実効的なコマ休講 (draft 優先)。
  //   slotId -> { memo, source: "draft" | "saved" }
  // 休講のコマは代行・合同・移動・振替の対象にならない (カードは灰色の
  // 「休講」表示になり、右クリックは「休講を取り消す」だけ)。
  const cancelBySlot = useMemo(() => {
    const map = new Map();
    for (const [sid, adj] of existingCancelBySlot) {
      if (draft[sid]?.cancel) continue;
      map.set(sid, { memo: adj.memo || "", source: "saved" });
    }
    for (const [sidStr, row] of Object.entries(draft)) {
      if (!row.cancel) continue;
      map.set(Number(sidStr), { memo: row.cancel.memo || "", source: "draft" });
    }
    return map;
  }, [draft, existingCancelBySlot]);

  // 他日から当日へ振替えられてきたコマ (incoming) を集約。
  // 「本多が 4/24 休み → 今日のコマを 5/1 に振替」という adjustment が
  // あるとき、5/1 の画面では「+ 振替で来たコマ」バナーとして可視化したい。
  // 振替先で合同にしたもの (combineWith) は吸収された側も残し、チップで
  // 「→ 高1A に合同」と出す (ここから合同を外せるように)。
  const incomingReschedules = useMemo(() => {
    const removed = removedAdjustmentIds || new Set();
    const slotById = new Map();
    for (const s of allSlots || []) slotById.set(s.id, s);
    const adjs = (existingAdjustments || []).filter(
      (adj) =>
        adj.type === "reschedule" && adj.targetDate === date && !removed.has(adj.id)
    );
    return buildIncomingItems(adjs, slotById, { includeAbsorbed: true });
  }, [existingAdjustments, removedAdjustmentIds, date, allSlots]);

  // draft + 既存 からの実効的な合同状態 (draft が同 slot にある場合は draft を優先)
  const { absorbedSet, hostByAbsorbed, hostsAbsorbedMap, combineSourceByHost } = useMemo(() => {
    const absorbed = new Set();
    const hostByAbs = new Map();
    const hostsAbs = new Map(); // hostId -> absorbedSlotIds[]
    const sourceByHost = new Map(); // hostId -> "draft" | "saved"

    // 既存 combine を先に反映
    for (const [hostId, adj] of existingCombineBySlot) {
      if (draft[hostId]?.combine) continue; // draft が同 host にあれば draft を優先
      const ids = [...(adj.combineSlotIds || [])];
      if (!ids.length) continue;
      hostsAbs.set(hostId, ids);
      sourceByHost.set(hostId, "saved");
      for (const c of ids) {
        absorbed.add(c);
        hostByAbs.set(c, hostId);
      }
    }

    // draft を上書き
    for (const [sidStr, row] of Object.entries(draft)) {
      const sid = Number(sidStr);
      if (row.combine?.absorbedSlotIds?.length) {
        hostsAbs.set(sid, [...row.combine.absorbedSlotIds]);
        sourceByHost.set(sid, "draft");
        for (const c of row.combine.absorbedSlotIds) {
          absorbed.add(c);
          hostByAbs.set(c, sid);
        }
      }
    }
    return {
      absorbedSet: absorbed,
      hostByAbsorbed: hostByAbs,
      hostsAbsorbedMap: hostsAbs,
      combineSourceByHost: sourceByHost,
    };
  }, [draft, existingCombineBySlot]);

  // 表示用の slot リスト: time は draft move or 既存 move があれば target time
  const { effectiveSlots, moveSourceBySlot } = useMemo(() => {
    const sourceBySlot = new Map(); // slotId -> "draft" | "saved"
    const list = slots.map((s) => {
      let moveTarget = draft[s.id]?.move?.targetTime || null;
      if (moveTarget) {
        sourceBySlot.set(s.id, "draft");
      } else {
        const savedMove = existingMoveBySlot.get(s.id);
        if (savedMove?.targetTime) {
          moveTarget = savedMove.targetTime;
          sourceBySlot.set(s.id, "saved");
        }
      }
      return {
        ...s,
        _time: moveTarget || s.time,
        _moved: !!moveTarget,
      };
    });
    return { effectiveSlots: list, moveSourceBySlot: sourceBySlot };
  }, [slots, draft, existingMoveBySlot]);

  // draft + 既存 からの実効的な振替状態 (draft 優先)。
  //   slotId -> { targetDate, targetTime?, targetTeacher?, memo, source }
  const rescheduleBySlot = useMemo(() => {
    const map = new Map();
    for (const [sid, adj] of existingRescheduleBySlot) {
      if (draft[sid]?.reschedule?.targetDate) continue; // draft 優先
      map.set(sid, {
        targetDate: adj.targetDate,
        targetTime: adj.targetTime || "",
        targetTeacher: adj.targetTeacher || "",
        memo: adj.memo || "",
        source: "saved",
      });
    }
    for (const [sidStr, row] of Object.entries(draft)) {
      if (!row.reschedule?.targetDate) continue;
      map.set(Number(sidStr), {
        targetDate: row.reschedule.targetDate,
        targetTime: row.reschedule.targetTime || "",
        targetTeacher: row.reschedule.targetTeacher || "",
        memo: row.reschedule.memo || "",
        source: "draft",
      });
    }
    return map;
  }, [draft, existingRescheduleBySlot]);

  // draft + 既存 からの実効的な代行状態 (同じ元講師なら draft 優先)。
  //   slotId -> Map<originalTeacher, { substitute, status, source, id? }>
  // **1 コマに複数件ある。** プレップのように 1 コマを 3 人で担当するコマが
  // あり、「香川と福江は休むが川井は出る」を 1 件では表せない。
  // **代行者が空 (substitute: "") の欠勤も必ず含める** — 代行が決まるまで
  // ここを落とすと画面上「何も登録されていない」ように見える。
  const subsBySlot = useMemo(() => {
    const map = new Map();
    const put = (slotId, teacher, info) => {
      if (!map.has(slotId)) map.set(slotId, new Map());
      map.get(slotId).set(teacher, info);
    };
    for (const ex of existingSubs || []) {
      if (ex.date !== date) continue;
      if (removedSubIds?.has(ex.id)) continue;
      const teacher = ex.originalTeacher || "";
      if (draft[ex.slotId]?.subs?.[teacher]) continue; // 同じ元講師は draft 優先
      put(ex.slotId, teacher, {
        substitute: ex.substitute || "",
        status: ex.status || "requested",
        originalTeacher: teacher,
        source: "saved",
        id: ex.id,
      });
    }
    for (const [sidStr, row] of Object.entries(draft)) {
      for (const [teacher, sub] of Object.entries(row.subs || {})) {
        put(Number(sidStr), teacher, {
          substitute: sub.substitute || "",
          status: sub.substitute ? sub.status || "confirmed" : sub.status || "requested",
          originalTeacher: teacher,
          source: "draft",
        });
      }
    }
    return map;
  }, [draft, existingSubs, removedSubIds, date]);

  // 対象日に実際に担当する講師 (隔週は A/B を解決した後)。欠勤・代行は
  // この単位で登録する。
  const activeTeachersFor = useCallback(
    (slot) =>
      splitTeacherField(
        biweeklyActiveTeacher(slot, date, biweeklyAnchors || [], holidays, examPeriods)
      ),
    [date, biweeklyAnchors, holidays, examPeriods]
  );

  // コマ内の並びは講師欄の順 (香川·福江·川井) に揃える。
  const subsForSlot = useCallback(
    (slot) => {
      const perTeacher = subsBySlot.get(slot.id);
      if (!perTeacher) return [];
      const order = getSlotTeachers(slot);
      const rank = (t) => {
        const i = order.indexOf(t);
        return i < 0 ? order.length : i;
      };
      return [...perTeacher.values()].sort(
        (a, b) => rank(a.originalTeacher) - rank(b.originalTeacher)
      );
    },
    [subsBySlot]
  );

  // 振替で入るコマと同じセルに出る「そのコマ自身の休講カード」は出さない。
  // 振替元と振替先が同じ曜日 (10/16 金 → 10/9 金) で振替先が休講日だと、
  // 同じセルに「休講」と「振替で入る」が重なり、授業があるのに休講と読める
  // (2026-10-10 の指摘)。休講日・テスト期間の灰色カードは操作を持たないので
  // 隠してよい。コマ休講 (取り消しのメニューを持つ) と、その日に実施される
  // 通常のコマ (同じ曜日の別の週へ寄せた振替) はそのまま並べる
  // 振替先で合同にした吸収された側も同じ (セルは空になり、受け入れる側の
  // カードに「+ 高1理系 数学 (合同)」と出る。通常の合同と同じ見え方)
  const hiddenOffSlotIds = useMemo(() => {
    const hidden = new Set();
    if (incomingCards.length === 0) return hidden;
    const byId = new Map(effectiveSlots.map((s) => [s.id, s]));
    const arrivals = [];
    for (const card of incomingCards) {
      arrivals.push({ slotId: card._incoming.slot.id, time: card.time });
      for (const p of card._incoming.combined) {
        arrivals.push({ slotId: p.slot.id, time: p.adj.targetTime || p.slot.time });
      }
    }
    for (const { slotId, time } of arrivals) {
      const s = byId.get(slotId);
      if (!s || (s._time || s.time) !== time) continue;
      const off =
        (isHolidayForSlot && isHolidayForSlot(date, s.grade, s.subj)) ||
        (isInExamPeriodForGrade && isInExamPeriodForGrade(date, s.grade));
      if (off) hidden.add(s.id);
    }
    return hidden;
  }, [incomingCards, effectiveSlots, isHolidayForSlot, isInExamPeriodForGrade, date]);

  // 表示対象 (absorbed は除外、host/移動済みは残す)
  const visibleSlots = useMemo(
    () => effectiveSlots.filter((s) => !absorbedSet.has(s.id) && !hiddenOffSlotIds.has(s.id)),
    [effectiveSlots, absorbedSet, hiddenOffSlotIds]
  );

  // ─── 講師の同時刻の重なり (下書きを含む) ─────────────────────────
  // その日に実際に教える人 (元講師 − 欠勤 + 代行者。下書き優先) を集めて、
  // 時間帯の重なるコマを探す。判定は utils/teacherConflicts に集約
  // (タイムテーブルと共有)。休講・テスト期間・振替で出るコマ・合同で
  // 吸収された側は数えない。代行ピッカーは同じ一覧から候補ごとの
  // 「授業中 / 代行中」を出す。
  const teacherAssignments = useMemo(() => {
    const exclude = new Set(absorbedSet);
    for (const id of rescheduleBySlot.keys()) exclude.add(id);
    for (const id of cancelBySlot.keys()) exclude.add(id); // 休講のコマは誰も教えない
    const timeBySlot = new Map();
    for (const s of effectiveSlots) {
      if (
        (isHolidayForSlot && isHolidayForSlot(date, s.grade, s.subj)) ||
        (isInExamPeriodForGrade && isInExamPeriodForGrade(date, s.grade))
      ) {
        exclude.add(s.id);
      }
      if (s._moved && s._time) timeBySlot.set(s.id, s._time);
    }
    // 振替で入るコマも「その時間に教える人」に入れる (担当は振替先の担当。
    // 振替先で合同にした吸収された側はカードに無い = 数えない)
    return collectTeacherAssignments([...effectiveSlots, ...incomingCards], date, {
      subsBySlot,
      timeBySlot,
      excludeSlotIds: exclude,
      biweeklyAnchors,
      holidays,
      examPeriods,
      // 既にこの日の分に絞ってある (休講日の判定も済み)
      offsiteLessons: offsiteToday,
    });
  }, [
    effectiveSlots,
    incomingCards,
    date,
    offsiteToday,
    subsBySlot,
    absorbedSet,
    rescheduleBySlot,
    cancelBySlot,
    isHolidayForSlot,
    isInExamPeriodForGrade,
    biweeklyAnchors,
    holidays,
    examPeriods,
  ]);
  // 合同の相手に選べないコマ (吸収済み + 休講)
  const combineExcluded = useMemo(
    () => new Set([...absorbedSet, ...cancelBySlot.keys()]),
    [absorbedSet, cancelBySlot]
  );
  const teacherConflicts = useMemo(
    () => findTeacherConflicts(teacherAssignments),
    [teacherAssignments]
  );

  // 振替で入ってくるコマのメニュー (グリッドのカードと上の帯のチップで共有)。
  // item は {adj, slot, combined?, combinedInto?} (buildIncomingItems の項目、
  // カードなら card._incoming)。
  // 合同の相手は「同じ日へ振替で入ってきた、同学年・同教科のコマ」だけ。
  // 他のコマを受け入れている側は吸収させない (合同の連鎖を作らない)。
  // どの操作も保存済みの振替を直すので、その場で保存する (下書きにしない)。
  const openIncomingMenu = useCallback(
    (e, item) => {
      e.preventDefault();
      // ピッカーの位置はメニューを開いた時点のカードで決める (メニューの項目を
      // 押す頃には React が event.currentTarget を外している)
      const anchorEl = e.currentTarget || e.target;
      const anchorRect = anchorEl?.getBoundingClientRect?.() || {
        top: e.clientY,
        bottom: e.clientY,
        left: e.clientX,
        right: e.clientX,
      };
      const items = [];
      if (onSetIncomingCombine) {
        if (item.combinedInto) {
          items.push({
            label: `合同を外す (${describeSlot(item.combinedInto.slot)} から)`,
            danger: true,
            onClick: () => onSetIncomingCombine(item.adj.id, null),
          });
        } else {
          const candidates = incomingReschedules.filter(
            (o) =>
              o.adj.id !== item.adj.id &&
              !o.combinedInto &&
              !o.combined?.length &&
              canCombineIncoming(item.slot, o.slot, subjects)
          );
          if (candidates.length === 0) {
            items.push({
              label: "合同にする (候補なし: 同学年・同教科の振替がこの日にありません)",
              disabled: true,
            });
          }
          for (const o of candidates) {
            items.push({
              label: `合同にする: ${describeSlot(o.slot)} (${o.adj.targetTime || o.slot.time}) をこのコマへ`,
              onClick: () => onSetIncomingCombine(o.adj.id, item.adj.id),
            });
          }
          for (const p of item.combined || []) {
            items.push({
              label: `合同を外す: ${describeSlot(p.slot)}`,
              danger: true,
              onClick: () => onSetIncomingCombine(p.adj.id, null),
            });
          }
        }
      }
      if (onUpdateIncoming) {
        // 代行の代わり: 振替で入るコマの担当は振替の「振替先の担当」で決まる
        // (代行レコードは (日付, コマ, 元講師) なので振替で来たコマには立てない)
        items.push({
          label: "振替先の担当・時刻を変更…",
          onClick: () =>
            setReschedulePicker({ slot: item.slot, anchorRect, incomingAdj: item.adj }),
        });
      }
      if (onOpenDate) {
        items.push({
          label: `振替元の日 (${fmtMDWeekday(item.adj.date)}) を開く`,
          onClick: () => onOpenDate(item.adj.date),
        });
      }
      if (onRemoveIncoming) {
        items.push({
          label: "振替を取り消す",
          danger: true,
          onClick: () => onRemoveIncoming(item.adj.id),
        });
      }
      if (items.length === 0) return;
      setCtxMenu({ x: e.clientX, y: e.clientY, items });
    },
    [incomingReschedules, onSetIncomingCombine, onUpdateIncoming, onOpenDate, onRemoveIncoming, subjects]
  );

  // 右クリックメニュー
  const openContextMenu = useCallback(
    (e, slot) => {
      if (slot._incoming) {
        openIncomingMenu(e, slot._incoming);
        return;
      }
      e.preventDefault();
      const items = [];
      const row = draft[slot.id];

      const isAbsorbed = absorbedSet.has(slot.id);
      const isHost = hostsAbsorbedMap.has(slot.id);
      // 欠勤・代行は元講師ごと。多担任コマ (プレップ) では複数件並ぶ。
      const perTeacher = subsBySlot.get(slot.id) || new Map();
      const teachers = activeTeachersFor(slot);
      const isMulti = teachers.length > 1;
      const hasOverride = !!row?.override;

      // コマ休講のコマ: 取り消し以外の操作は出さない (授業自体が無い)
      const cancelInfo = cancelBySlot.get(slot.id);
      if (cancelInfo) {
        items.push({
          label: cancelInfo.source === "draft" ? "休講 (下書き) を取り消す" : "休講を取り消す",
          danger: true,
          onClick: () => {
            if (cancelInfo.source === "saved") {
              const existing = existingCancelBySlot.get(slot.id);
              if (existing) draftApi.markAdjustmentRemoved(existing.id);
            } else {
              draftApi.clearCancel(slot.id);
            }
          },
        });
        setCtxMenu({ x: e.clientX, y: e.clientY, items });
        return;
      }

      if (isAbsorbed) {
        items.push({
          label: "合同から外す",
          danger: true,
          onClick: () => {
            const hostId = hostByAbsorbed.get(slot.id);
            if (hostId == null) return;
            const current = hostsAbsorbedMap.get(hostId) || [];
            const remaining = current.filter((x) => x !== slot.id);
            if (remaining.length === 0) {
              // 全解除: draft は clear、既存は markAdjustmentRemoved
              if (combineSourceByHost.get(hostId) === "saved") {
                const existing = existingCombineBySlot.get(hostId);
                if (existing) draftApi.markAdjustmentRemoved(existing.id);
              } else {
                draftApi.clearCombine(hostId);
              }
            } else {
              // 部分解除: 残りの slots で draft combine を作成
              // (既存 combine は toBatchPayload で自動的に removedIds に追加される)
              draftApi.setCombine(hostId, remaining);
            }
          },
        });
      } else {
        // 代行の割り当て (ピッカー側で元講師を選ぶ)
        items.push({
          label: perTeacher.size > 0 ? "代行を割り当て / 変更…" : "代行を割り当て…",
          onClick: () => {
            const anchorRect = e.target.getBoundingClientRect();
            setSubPicker({ slot, anchorRect });
          },
        });

        // 代行が見つかっていなくても、欠勤だけ先に登録できるようにする
        // (代行者が空の代行レコード = 「代行未定」)。多担任コマは
        // **講師ごとに 1 件**なので、まだ登録の無い講師ぶんだけ並べる。
        // 振替・合同で片付いているコマには出さない (そのコマはこの日
        // 走らない / 別のコマに統合されている)。一括の「欠勤にする」が
        // 同じ理由で外すので、判断を揃える。
        if (!isHost && !rescheduleBySlot.has(slot.id)) {
          for (const t of teachers) {
            if (perTeacher.has(t)) continue;
            items.push({
              label: isMulti ? `❗ ${t} を欠勤にする` : "❗ 代行未定のまま欠勤にする",
              onClick: () =>
                draftApi.updateSub(slot.id, t, {
                  substitute: "",
                  status: "requested",
                }),
            });
          }
        }

        // 合同
        if (isHost) {
          const source = combineSourceByHost.get(slot.id);
          items.push({
            label: "合同相手を変更…",
            onClick: () => setCombineSource(slot),
          });
          items.push({
            label: "合同を取り消す",
            danger: true,
            onClick: () => {
              if (source === "saved") {
                const existing = existingCombineBySlot.get(slot.id);
                if (existing) draftApi.markAdjustmentRemoved(existing.id);
              } else {
                draftApi.clearCombine(slot.id);
              }
            },
          });
        } else {
          const candidates = findCombineCandidates(slot, slots, subjects, combineExcluded);
          items.push({
            label:
              candidates.length > 0
                ? `合同にする (${candidates.length} 件候補)`
                : "合同にする (候補なし)",
            disabled: candidates.length === 0,
            onClick: () => setCombineSource(slot),
          });
        }

        // 移動 (draft or 既存)
        const moveSrc = moveSourceBySlot.get(slot.id);
        if (moveSrc) {
          items.push({
            label: "移動を取り消す",
            danger: true,
            onClick: () => {
              if (moveSrc === "saved") {
                const existing = existingMoveBySlot.get(slot.id);
                if (existing) draftApi.markAdjustmentRemoved(existing.id);
              } else {
                draftApi.clearMove(slot.id);
              }
            },
          });
        }

        // 振替 (他日への移動)。合同 host の状態では振替不可 (排他)。
        const hasReschedule = rescheduleBySlot.has(slot.id);
        const blockReschedule = isHost; // absorbed は分岐の外側で処理済み
        items.push({
          label: hasReschedule ? "振替を変更…" : "振替にする…",
          disabled: blockReschedule,
          onClick: blockReschedule
            ? undefined
            : () => {
                const anchorRect = e.target.getBoundingClientRect();
                setReschedulePicker({ slot, anchorRect });
              },
        });
        if (hasReschedule) {
          const info = rescheduleBySlot.get(slot.id);
          items.push({
            label: "振替を取り消す",
            danger: true,
            onClick: () => {
              if (info.source === "saved") {
                const existing = existingRescheduleBySlot.get(slot.id);
                if (existing) draftApi.markAdjustmentRemoved(existing.id);
              } else {
                draftApi.clearReschedule(slot.id);
              }
            },
          });
        }

        // コマ休講 (このコマだけその日は休講)。合同 host は先に合同を外す。
        // 代行・移動・振替の下書きは setCancel が消す (排他)
        items.push({
          label: "🚫 このコマを休講にする",
          disabled: isHost,
          onClick: isHost ? undefined : () => draftApi.setCancel(slot.id),
        });

        // 回数補正
        items.push({
          label: hasOverride ? "回数補正を変更…" : "回数を補正…",
          onClick: () => {
            const anchorRect = e.target.getBoundingClientRect();
            setOverridePicker({ slot, anchorRect });
          },
        });

        if (hasOverride) {
          items.push({
            label: "回数補正を解除",
            danger: true,
            onClick: () => draftApi.updateOverride(slot.id, null),
          });
        }

        // 取り消しは登録されている講師ぶんだけ並べる。
        for (const info of subsForSlot(slot)) {
          const what = info.substitute ? "代行" : "欠勤";
          items.push({
            label: isMulti
              ? `${info.originalTeacher} の${what}を取り消す`
              : `${what}を取り消す`,
            danger: true,
            onClick: () => {
              if (info.source === "saved") draftApi.markSubRemoved(info.id);
              else draftApi.clearSub(slot.id, info.originalTeacher);
            },
          });
        }
      }

      if (items.length > 0) {
        setCtxMenu({ x: e.clientX, y: e.clientY, items });
      }
    },
    [
      draft,
      absorbedSet,
      hostsAbsorbedMap,
      hostByAbsorbed,
      combineSourceByHost,
      moveSourceBySlot,
      existingCombineBySlot,
      existingMoveBySlot,
      existingRescheduleBySlot,
      existingCancelBySlot,
      rescheduleBySlot,
      cancelBySlot,
      combineExcluded,
      subsBySlot,
      subsForSlot,
      activeTeachersFor,
      draftApi,
      slots,
      subjects,
      openIncomingMenu,
    ]
  );

  // ドラッグ開始: dataTransfer に slotId をセット
  const handleDragStart = useCallback((e, slot) => {
    e.dataTransfer.setData("text/plain", String(slot.id));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  // ドロップ: move 下書きを作成 / 元の時刻に戻したら解除
  const handleDrop = useCallback(
    (slotId, targetTime) => {
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      if (slot.time === targetTime) {
        // 元の時刻に戻す: draft move を削除 + 既存 move を解除マーク
        if (draft[slotId]?.move) draftApi.clearMove(slotId);
        const existingMove = existingMoveBySlot.get(slotId);
        if (existingMove) draftApi.markAdjustmentRemoved(existingMove.id);
        return;
      }
      draftApi.updateMove(slotId, targetTime);
    },
    [slots, draft, draftApi, existingMoveBySlot]
  );

  // 合同モード中のスロットクリック: 相手として選ぶ。
  // 既存 (saved) combine の「相手を変更」時は、保存済みリストを起点に追加する。
  // 合同モード以外のクリック / タップ / Enter は、右クリックと同じ操作メニューを
  // 開く。iPad などのタッチ端末は長押しで contextmenu が出ないため、右クリック
  // だけだと代行・振替・合同を登録する手段が無かった。
  const handleSlotClick = useCallback(
    (slot, e) => {
      if (!combineSource) {
        if (!e) return;
        // キーボード (Enter / Space) の click には座標が無いので、カードの
        // 左下に出す (ContextMenu キーと同じ位置)
        let x = e.clientX;
        let y = e.clientY;
        if (x == null || (!x && !y)) {
          const r = e.currentTarget?.getBoundingClientRect?.();
          x = r ? r.left + 8 : 0;
          y = r ? r.bottom - 4 : 0;
        }
        openContextMenu(
          {
            preventDefault() {},
            stopPropagation() {},
            clientX: x,
            clientY: y,
            currentTarget: e.currentTarget,
            target: e.target,
          },
          slot
        );
        return;
      }
      if (slot.id === combineSource.id) {
        setCombineSource(null);
        return;
      }
      // 振替で入るコマは (日付, コマ) の合同の相手にしない (振替先での合同は
      // そのカードのメニューから)
      if (slot._incoming) return;
      if (!canCombineSlots(combineSource, slot, subjects)) return;
      if (combineExcluded.has(slot.id)) return;
      const current = hostsAbsorbedMap.get(combineSource.id) || [];
      if (current.includes(slot.id)) return;
      draftApi.setCombine(combineSource.id, [...current, slot.id]);
      setCombineSource(null);
    },
    [combineSource, subjects, hostsAbsorbedMap, draftApi, combineExcluded, openContextMenu]
  );

  // 振替で入るコマのカード。見た目は通常のコマのまま、「振替」バッジと
  // 「← 10/16 (金) から振替」で示す。第N回は振替元の日で数えるので出さない。
  // ドラッグ (時刻の移動) はできない — 時刻はメニューの「振替先の担当・時刻を
  // 変更…」で振替そのものを直す
  const absentTeacherSet = useMemo(() => new Set(absentTeachers || []), [absentTeachers]);
  const renderIncomingCard = useCallback(
    (s) => {
      const { adj, combined } = s._incoming;
      const from = `← ${fmtMDWeekday(adj.date)} から振替`;
      const partners = combined.map((p) => describeSlot(p.slot)).join(" / ");
      const interactive = !!(
        onSetIncomingCombine ||
        onUpdateIncoming ||
        onRemoveIncoming ||
        onOpenDate
      );
      return (
        <AbsenceSlotCard
          key={s.id}
          slot={s}
          date={date}
          biweeklyAnchors={biweeklyAnchors}
          holidays={holidays}
          examPeriods={examPeriods}
          isAbsent={splitTeacherField(s.teacher).some((t) => absentTeacherSet.has(t))}
          isCombineHost={combined.length > 0}
          absorbedLabel={combined.length > 0 ? `+ ${partners} (合同)` : null}
          incomingLabel={adj.memo ? `${from} - ${adj.memo}` : from}
          disableDrag
          dimmed={combineSource != null}
          conflicts={teacherConflicts.get(s.id) || null}
          onContextMenu={interactive ? (e) => openContextMenu(e, s) : undefined}
          onClick={interactive ? (e) => handleSlotClick(s, e) : undefined}
        />
      );
    },
    [
      date,
      biweeklyAnchors,
      holidays,
      examPeriods,
      absentTeacherSet,
      combineSource,
      teacherConflicts,
      onSetIncomingCombine,
      onUpdateIncoming,
      onRemoveIncoming,
      onOpenDate,
      openContextMenu,
      handleSlotClick,
    ]
  );

  // 個々のスロットカード描画 (AbsenceExcelSection に渡す関数)
  const renderCard = useCallback(
    (s) => {
      if (s._incoming) return renderIncomingCard(s);
      const row = draft[s.id] || {};
      const isAbsorbed = absorbedSet.has(s.id);
      const isHost = hostsAbsorbedMap.has(s.id);
      const isAbsent = absentSlotIds.has(s.id);

      const absorbedIds = hostsAbsorbedMap.get(s.id) || [];
      const absorbedSlots = absorbedIds
        .map((id) => slots.find((x) => x.id === id))
        .filter(Boolean);
      const absorbedLabel = absorbedSlots.length
        ? `+ ${absorbedSlots
            .map((a) => `${a.grade}${a.cls && a.cls !== "-" ? a.cls : ""} ${a.subj}`)
            .join(" / ")}`
        : null;

      const hostId = hostByAbsorbed.get(s.id);
      const hostSlot = hostId != null ? slots.find((x) => x.id === hostId) : null;
      const hostLabel = hostSlot
        ? `→ ${hostSlot.grade}${hostSlot.cls && hostSlot.cls !== "-" ? hostSlot.cls : ""} ${hostSlot.subj} と合同`
        : null;

      // 代行: draft or 既存 (removedSubIds でマーク済みは表示から除外)。
      // 代行者が未定 (substitute: "") の欠勤登録もここに乗る。
      const slotSubs = subsForSlot(s);

      // 補正バッジ
      let overrideLabel = null;
      if (row.override) {
        if (row.override.mode === "set" && row.override.value) {
          overrideLabel = `第${row.override.value}回 (補正)`;
        } else if (row.override.mode === "skip") {
          if (
            Number.isFinite(Number(row.override.displayAs)) &&
            Number(row.override.displayAs) > 0
          ) {
            overrideLabel = `第${row.override.displayAs}回 (合同消化)`;
          } else {
            overrideLabel = "カウント外";
          }
        }
      }

      const isCombineSource = combineSource?.id === s.id;
      const isCombineCandidate =
        combineSource != null &&
        combineSource.id !== s.id &&
        !combineExcluded.has(s.id) &&
        canCombineSlots(combineSource, s, subjects);

      // 合同モード中の非候補は暗く
      const dimmed =
        combineSource != null &&
        !isCombineSource &&
        !isCombineCandidate &&
        !isAbsorbed;

      // DnD 抑止条件
      const disableDrag = isHost || combineSource != null;

      const isMoved = !!row.move?.targetTime || moveSourceBySlot.get(s.id) === "saved";

      // 振替情報。targetTime が空なら元コマの時間帯を使う。
      const reschedule = rescheduleBySlot.get(s.id) || null;
      let rescheduleLabel = null;
      if (reschedule) {
        const timeText = reschedule.targetTime || s.time;
        const parts = [`→ ${reschedule.targetDate}`];
        if (timeText) parts.push(timeText);
        if (reschedule.targetTeacher && reschedule.targetTeacher !== s.teacher) {
          parts.push(`(${reschedule.targetTeacher})`);
        }
        rescheduleLabel = `振替 ${parts.join(" ")}`;
        if (reschedule.memo) rescheduleLabel += ` - ${reschedule.memo}`;
      }

      // 休講優先 → テスト期間 の順で判定。両方とも当日のコマは流れないので
      // 操作不能 (drag/contextmenu/click 抑止)。
      let cancelLabel = null;
      let cancelNote = null;
      if (isHolidayForSlot && isHolidayForSlot(date, s.grade, s.subj)) {
        cancelLabel = "休講";
      } else if (
        isInExamPeriodForGrade &&
        isInExamPeriodForGrade(date, s.grade)
      ) {
        cancelLabel = "テスト期間";
      }
      const isCancelled = cancelLabel != null;
      // コマ休講 (下書き / 保存済み)。休講日と同じ灰色カードだが、右クリックで
      // 取り消せるようにメニューは残す
      const slotCancel = !isCancelled ? cancelBySlot.get(s.id) : null;
      if (slotCancel) {
        cancelLabel = slotCancel.source === "draft" ? "休講 (下書き)" : "休講";
        cancelNote = slotCancel.memo || null;
      }

      return (
        <AbsenceSlotCard
          key={s.id}
          slot={s}
          date={date}
          biweeklyAnchors={biweeklyAnchors}
          holidays={holidays}
          examPeriods={examPeriods}
          isAbsent={isAbsent}
          cancelLabel={cancelLabel}
          cancelNote={cancelNote}
          isMoved={isMoved}
          isCombineHost={isHost}
          absorbedLabel={absorbedLabel}
          isAbsorbed={isAbsorbed}
          hostLabel={hostLabel}
          subs={slotSubs}
          overrideLabel={overrideLabel}
          sessionCount={sessionCountMap?.get(s.id) || 0}
          isCombineCandidate={isCombineCandidate}
          isCombineSource={isCombineSource}
          disableDrag={disableDrag || isCancelled || !!slotCancel}
          dimmed={dimmed}
          isRescheduled={!!reschedule}
          rescheduleLabel={rescheduleLabel}
          conflicts={teacherConflicts.get(s.id) || null}
          onContextMenu={isCancelled ? undefined : (e) => openContextMenu(e, s)}
          onDragStart={(e) => handleDragStart(e, s)}
          onClick={isCancelled || slotCancel ? undefined : (e) => handleSlotClick(s, e)}
        />
      );
    },
    [
      draft,
      absorbedSet,
      hostsAbsorbedMap,
      hostByAbsorbed,
      moveSourceBySlot,
      rescheduleBySlot,
      absentSlotIds,
      slots,
      subsForSlot,
      date,
      biweeklyAnchors,
      holidays,
      examPeriods,
      combineSource,
      subjects,
      sessionCountMap,
      openContextMenu,
      handleDragStart,
      handleSlotClick,
      isHolidayForSlot,
      isInExamPeriodForGrade,
      teacherConflicts,
      cancelBySlot,
      combineExcluded,
      renderIncomingCard,
    ]
  );

  // 解除予定のアイテムを人間可読な短いラベルに
  const describeRemoved = (adj) => {
    const slot =
      slots.find((s) => s.id === adj.slotId) ||
      (allSlots || []).find((s) => s.id === adj.slotId);
    const slotLabel = slot
      ? `${slot.time} ${slot.grade}${slot.cls && slot.cls !== "-" ? slot.cls : ""} ${slot.subj}`
      : `slot#${adj.slotId}`;
    if (adj.type === "cancel") return `コマ休講: ${slotLabel}`;
    if (adj.type === "combine") return `合同: ${slotLabel}`;
    if (adj.type === "move") return `移動: ${slotLabel} → ${adj.targetTime}`;
    if (adj.type === "reschedule") {
      return `振替: ${slotLabel} → ${adj.targetDate}${
        adj.targetTime ? ` ${adj.targetTime}` : ""
      }`;
    }
    return slotLabel;
  };

  // 休講エントリを「ラベル + 適用範囲 (部・学年・科目)」のテキストに整形。
  const formatHolidayRange = (h) => {
    const parts = [];
    const sc = (h.scope || ["全部"]).filter(Boolean);
    if (sc.length > 0 && !sc.includes("全部")) parts.push(sc.join("・"));
    if ((h.targetGrades || []).length > 0) parts.push(h.targetGrades.join("・"));
    if ((h.subjKeywords || []).length > 0) parts.push(h.subjKeywords.join("・"));
    return parts.join(" / ");
  };

  return (
    <div>
      {/* 当日の休講・テスト期間バナー (部分休講も含めて全体感を掴むため) */}
      {(holidaysToday.length > 0 || examPeriodsToday.length > 0) && (
        <div
          style={{
            background: "#fdf5e8",
            border: "1px solid #e0c080",
            borderRadius: 6,
            padding: "8px 14px",
            marginBottom: 10,
            fontSize: 12,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          {holidaysToday.map((h) => {
            const range = formatHolidayRange(h);
            return (
              <span
                key={`hol-${h.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "#f5dada",
                  color: "#a02020",
                  border: "1px solid #c44040",
                  borderRadius: 12,
                  padding: "2px 10px",
                  fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 10 }}>休講</span>
                <span>{h.label || "休講"}</span>
                {range && (
                  <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>
                    ({range})
                  </span>
                )}
              </span>
            );
          })}
          {examPeriodsToday.map((ep) => {
            const grades = (ep.targetGrades || []).join("・") || "全学年";
            const isDisplayOnly = ep.stopsClasses === false;
            return (
              <span
                key={`exam-${ep.id}`}
                title={isDisplayOnly ? "授業を休止しない (表示のみ)" : undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: isDisplayOnly ? "#fff" : "#fde8c8",
                  color: "#7a4a10",
                  border: `1px ${isDisplayOnly ? "dashed" : "solid"} #e0a030`,
                  borderRadius: 12,
                  padding: "2px 10px",
                  fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 10 }}>
                  テスト期間{isDisplayOnly ? " (表示のみ)" : ""}
                </span>
                <span>{ep.name}</span>
                {(ep.tags || []).length > 0 && (
                  <span style={{ fontSize: 10, opacity: 0.85 }}>
                    [{ep.tags.join("·")}]
                  </span>
                )}
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>
                  ({grades})
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* 解除予定バナー (保存前なら個別に取り消せる) */}
      {pendingRemovals.length > 0 && (
        <div
          style={{
            background: "#fdecec",
            border: "1px solid #f0b0b0",
            borderRadius: 6,
            padding: "8px 14px",
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <strong style={{ color: "#a03030" }}>
              解除予定: {pendingRemovals.length} 件
            </strong>
            <button
              type="button"
              onClick={() => {
                for (const a of pendingRemovals) draftApi.unmarkAdjustmentRemoved(a.id);
              }}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                border: "1px solid #ccc",
                background: "#fff",
                borderRadius: 4,
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              全て取り消す
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pendingRemovals.map((a) => (
              <span
                key={a.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "#fff",
                  border: "1px solid #e0b0b0",
                  borderRadius: 12,
                  padding: "2px 4px 2px 8px",
                  fontSize: 11,
                  color: "#703030",
                  textDecoration: "line-through",
                }}
              >
                {describeRemoved(a)}
                <button
                  type="button"
                  title="この解除を取り消す"
                  onClick={() => draftApi.unmarkAdjustmentRemoved(a.id)}
                  style={{
                    border: "none",
                    background: "#f0d0d0",
                    color: "#703030",
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    lineHeight: "16px",
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "none",
                    padding: 0,
                  }}
                >
                  ↺
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 合同モードバナー */}
      {combineSource && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: 6,
            padding: "8px 14px",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 13,
          }}
        >
          <span>
            <strong>
              {combineSource.grade}
              {combineSource.cls && combineSource.cls !== "-" ? combineSource.cls : ""}{" "}
              {combineSource.subj}
            </strong>{" "}
            に合同するコマをクリック (黄色の破線枠が候補)
          </span>
          <button
            type="button"
            onClick={() => setCombineSource(null)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              border: "1px solid #ccc",
              background: "#fff",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
        </div>
      )}

      {/* 振替で当日に来るコマの案内バナー (他日からこの日付へ振り替えられたもの) */}
      {incomingReschedules.length > 0 && (
        <div
          style={{
            background: ADJ_COLOR.reschedule.bannerBg,
            border: `1px solid ${ADJ_COLOR.reschedule.bannerBorder}`,
            borderRadius: 6,
            padding: "8px 14px",
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <strong style={{ color: ADJ_COLOR.reschedule.deep }}>
              この日に振替で入るコマ: {incomingReschedules.length} 件
            </strong>
            <span style={{ color: "#888", fontSize: 11 }}>
              下の時間割にも「振替」のカードで並べています。押すと合同・担当や時刻の変更 (すぐ保存されます)
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {incomingReschedules.map((item) => {
              const { adj, slot } = item;
              const timeText = adj.targetTime || slot.time;
              const teacherText = rescheduleTeacherLabel(adj, slot, {
                biweeklyAnchors,
                holidays,
                examPeriods,
              });
              const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
              const titleParts = [`元: ${adj.date} ${slot.time}`];
              if (adj.memo) titleParts.push(adj.memo);
              const absorbed = !!item.combinedInto;
              const interactive = !!(
                onSetIncomingCombine ||
                onUpdateIncoming ||
                onRemoveIncoming ||
                onOpenDate
              );
              if (interactive) titleParts.push("クリック / 右クリックで操作");
              const open = interactive ? (e) => openIncomingMenu(e, item) : undefined;
              return (
                <span
                  key={adj.id}
                  title={titleParts.join(" / ")}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={
                    interactive
                      ? `${slot.grade}${cls} ${slot.subj} の振替 (操作)`
                      : undefined
                  }
                  onClick={open}
                  onContextMenu={open}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            const r = e.currentTarget.getBoundingClientRect();
                            openIncomingMenu(
                              { preventDefault: () => e.preventDefault(), clientX: r.left, clientY: r.bottom },
                              item
                            );
                          }
                        }
                      : undefined
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: absorbed ? "#f3f3f3" : "#fff",
                    border: `1px solid ${ADJ_COLOR.reschedule.bannerBorder}`,
                    borderRadius: 12,
                    padding: "2px 8px",
                    fontSize: 11,
                    color: absorbed ? "#888" : ADJ_COLOR.reschedule.deep,
                    cursor: interactive ? "pointer" : undefined,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{timeText}</span>
                  <span>
                    {slot.grade}
                    {cls} {slot.subj}
                  </span>
                  {absorbed ? (
                    <span style={{ fontWeight: 700 }}>
                      → {describeSlot(item.combinedInto.slot)} に合同
                    </span>
                  ) : (
                    <>
                      {item.combined?.length > 0 && (
                        <span style={{ fontWeight: 700 }}>
                          {item.combined.map((p) => `+ ${describeSlot(p.slot)}`).join(" ")} 合同
                        </span>
                      )}
                      <span style={{ color: "#666" }}>({teacherText})</span>
                    </>
                  )}
                  <span style={{ color: "#888" }}>← {adj.date}</span>
                  {adj.memo && (
                    <span
                      style={{
                        color: "#888",
                        fontStyle: "italic",
                        marginLeft: 2,
                      }}
                    >
                      {adj.memo}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginBottom: 6,
        }}
      >
        コマをドラッグ → 別時間セルにドロップで移動 / クリック (タップ) または右クリック → メニューで代行・合同・振替・回数補正
      </div>

      {effectiveSlots.length === 0 && incomingCards.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "#888",
            padding: 30,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e0e0e0",
          }}
        >
          対象日のコマがありません
        </div>
      ) : (
        (() => {
          const sections = getDashSections(dow);
          const leftCol = [];
          const rightCol = [];
          for (const sec of sections) {
            if (sec.dept === "中学部") leftCol.push(sec);
            else rightCol.push(sec);
          }
          const renderSection = (sec) => {
            const color =
              sec.color ||
              DEPT_COLOR[sec.dept] ||
              { b: "#e8e8e8", f: "#444", accent: "#888" };
            return (
              <AbsenceExcelSection
                key={sec.key}
                label={sec.label}
                headerColor={color.accent}
                slots={visibleSlots}
                originalSlots={slots}
                incomingSlots={incomingCards}
                day={dow}
                sectionFilterFn={sec.filterFn}
                renderCard={renderCard}
                onTimeDrop={handleDrop}
              />
            );
          };
          return (
            <div
              className="absence-excel-sections"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  minWidth: 0,
                }}
              >
                {leftCol.map(renderSection)}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  minWidth: 0,
                }}
              >
                {rightCol.map(renderSection)}
              </div>
            </div>
          );
        })()
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* 代行ピッカー */}
      {subPicker && (
        <SubstitutePickerPopover
          /* コマが変わったら作り直す。同じインスタンスのままだと前のコマで
             選んだ元講師 (useState) を持ち越す */
          key={subPicker.slot.id}
          anchorRect={subPicker.anchorRect}
          slot={subPicker.slot}
          date={date}
          biweeklyAnchors={biweeklyAnchors}
          holidays={holidays}
          examPeriods={examPeriods}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          teacherKana={teacherKana}
          daySlots={slots}
          allTeachers={allTeachers}
          teachers={activeTeachersFor(subPicker.slot)}
          assignments={teacherAssignments}
          subsByTeacher={Object.fromEntries(
            subsForSlot(subPicker.slot).map((x) => [x.originalTeacher, x])
          )}
          onAssign={(teacher, name, status) =>
            draftApi.updateSub(subPicker.slot.id, teacher, {
              substitute: name,
              status,
            })
          }
          onClear={(teacher) => {
            const info = subsForSlot(subPicker.slot).find(
              (x) => x.originalTeacher === teacher
            );
            if (info?.source === "saved") draftApi.markSubRemoved(info.id);
            else draftApi.clearSub(subPicker.slot.id, teacher);
          }}
          onClose={() => setSubPicker(null)}
        />
      )}

      {/* 回数補正ピッカー */}
      {overridePicker && (
        <SessionOverridePopover
          anchorRect={overridePicker.anchorRect}
          initial={draft[overridePicker.slot.id]?.override || null}
          currentSessionNumber={sessionCountMap?.get(overridePicker.slot.id) || 0}
          onSave={(payload) => draftApi.updateOverride(overridePicker.slot.id, payload)}
          onClear={() => draftApi.updateOverride(overridePicker.slot.id, null)}
          onClose={() => setOverridePicker(null)}
        />
      )}

      {/* 振替で入るコマの振替を、振替先の日から直す。下書きにせずその場で保存
          (振替元の日の回数補正には触らないので「回数カウントから外す」は出さない) */}
      {reschedulePicker?.incomingAdj && (
        <ReschedulePickerPopover
          anchorRect={reschedulePicker.anchorRect}
          slot={reschedulePicker.slot}
          sourceDate={reschedulePicker.incomingAdj.date}
          allSlots={allSlots}
          allTeachers={allTeachers}
          teacherKana={teacherKana}
          timetables={timetables}
          isOffForGrade={isOffForGrade}
          showAutoSkip={false}
          initial={{
            targetDate: reschedulePicker.incomingAdj.targetDate,
            targetTime: reschedulePicker.incomingAdj.targetTime || "",
            targetTeacher: reschedulePicker.incomingAdj.targetTeacher || "",
            memo: reschedulePicker.incomingAdj.memo || "",
          }}
          onSave={(payload) => {
            const { autoSkip: _autoSkip, ...patch } = payload;
            onUpdateIncoming?.(reschedulePicker.incomingAdj.id, patch);
          }}
          onClear={
            onRemoveIncoming
              ? () => onRemoveIncoming(reschedulePicker.incomingAdj.id)
              : undefined
          }
          onClose={() => setReschedulePicker(null)}
        />
      )}

      {/* 振替ピッカー */}
      {reschedulePicker && !reschedulePicker.incomingAdj && (
        <ReschedulePickerPopover
          anchorRect={reschedulePicker.anchorRect}
          slot={reschedulePicker.slot}
          sourceDate={date}
          allSlots={allSlots}
          allTeachers={allTeachers}
          teacherKana={teacherKana}
          timetables={timetables}
          isOffForGrade={isOffForGrade}
          hasAutoSkip={(() => {
            const sid = reschedulePicker.slot.id;
            // draft 上の override が skip ならそれを引き継ぐ。なければ
            // 保存済み sessionOverrides を date+slotId で検索。
            const draftOv = draft[sid]?.override;
            if (draftOv) return draftOv.mode === "skip";
            const ex = (sessionOverrides || []).find(
              (o) => o.date === date && o.slotId === sid
            );
            return ex?.mode === "skip";
          })()}
          initial={
            draft[reschedulePicker.slot.id]?.reschedule ||
            rescheduleBySlot.get(reschedulePicker.slot.id) ||
            null
          }
          onSave={(payload) => {
            const slotId = reschedulePicker.slot.id;
            const { autoSkip, ...reschedulePayload } = payload;
            // 既存 (saved) からの変更は draft に写した上で既存を除去マーク
            const info = rescheduleBySlot.get(slotId);
            const prevReschedule =
              info?.source === "saved"
                ? existingRescheduleBySlot.get(slotId)
                : draft[slotId]?.reschedule;
            if (info?.source === "saved" && prevReschedule) {
              draftApi.markAdjustmentRemoved(prevReschedule.id);
            }
            // 振替先での合同 (combineWith) は振替先の日が変わらない限り
            // 引き継ぐ (メモや時刻を直しただけで合同が外れないように)。
            // 日を変えたら外す (updateReschedule は下書きに重ねるので明示的に)
            reschedulePayload.combineWith =
              prevReschedule?.combineWith &&
              prevReschedule.targetDate === reschedulePayload.targetDate
                ? prevReschedule.combineWith
                : null;
            // 同コマで既に確定している代行があれば解除マーク
            // (振替するなら同日の代行は不要のため)
            for (const sub of existingSubs || []) {
              if (sub.date === date && sub.slotId === slotId) {
                draftApi.markSubRemoved(sub.id);
              }
            }
            draftApi.updateReschedule(slotId, reschedulePayload);
            // autoSkip: 元日付の回数カウントから外す skip override を付与
            if (autoSkip) {
              draftApi.updateOverride(slotId, {
                mode: "skip",
                memo: "振替に伴う skip",
              });
            } else {
              // ユーザーが明示的にチェック解除した場合: 既存の skip override を解除
              const existingOv = (sessionOverrides || []).find(
                (o) => o.date === date && o.slotId === slotId && o.mode === "skip"
              );
              if (existingOv || draft[slotId]?.override?.mode === "skip") {
                draftApi.updateOverride(slotId, null);
              }
            }
          }}
          onClear={() => {
            const slotId = reschedulePicker.slot.id;
            const info = rescheduleBySlot.get(slotId);
            if (info?.source === "saved") {
              const existing = existingRescheduleBySlot.get(slotId);
              if (existing) draftApi.markAdjustmentRemoved(existing.id);
            } else {
              draftApi.clearReschedule(slotId);
            }
            // 振替設定時に解除マークしていた既存代行を取り消す (元の状態へ)
            for (const sub of existingSubs || []) {
              if (sub.date === date && sub.slotId === slotId) {
                draftApi.unmarkSubRemoved(sub.id);
              }
            }
          }}
          onClose={() => setReschedulePicker(null)}
        />
      )}
    </div>
  );
}
