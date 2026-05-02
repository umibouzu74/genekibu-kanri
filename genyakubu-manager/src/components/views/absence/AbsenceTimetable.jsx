import { useCallback, useMemo, useState } from "react";
import { ADJ_COLOR, dateToDay, DEPT_COLOR, timeToMin } from "../../../data";
import { getDashSections } from "../../../constants/schedule";
import { ContextMenu } from "../../ContextMenu";
import { AbsenceSlotCard } from "./AbsenceSlotCard";
import { AbsenceExcelSection } from "./AbsenceExcelSection";
import { SubstitutePickerPopover } from "./SubstitutePickerPopover";
import { SessionOverridePopover } from "./SessionOverridePopover";
import { ReschedulePickerPopover } from "./ReschedulePickerPopover";
import { canCombineSlots, findCombineCandidates } from "../../../utils/absenceHelpers";

// ─── 欠勤ワークフロー: 時間割グリッド (直接操作 UI) ────────────
// レイアウトは Dashboard 時間割 (ExcelGridView) と同じ Excel グリッド。
// 部署セクションを左右 2 カラム (中学部 / それ以外) に並べ、各セクション内は
// 行=時間、列=学年・クラス・教室 の表構造。
// 編集機能:
//   1. スロットをドラッグして別時間セルにドロップ → move 下書き (時間のみ更新)
//   2. 右クリック → ContextMenu → 代行 / 合同 / 移動 / 回数補正 / 取消
//   3. 合同モード中はヒューリスティック候補のみ破線枠、クリックで合同確定
// draft は親から渡された callback 経由で更新する (直接 mutate しない)。

export function AbsenceTimetable({
  slots, // 対象日のコマ群 (day フィルタ済み)
  allSlots, // 全スロット (振替先日付の候補時間帯抽出用)
  draft, // draft.draft (useAbsenceDraft から)
  draftApi, // updateSub, clearSub, updateMove, clearMove, updateReschedule, clearReschedule, setCombine, clearCombine, updateOverride, markAdjustmentRemoved
  existingSubs, // 既存確定代行 (date フィルタ済み)
  existingAdjustments, // 既存調整 (date フィルタ前)
  removedAdjustmentIds, // Set<number> draft 上で解除マークされた adjustment id
  removedSubIds, // Set<number> draft 上で解除マークされた substitute id
  sessionCountMap, // Map<slotId, number> draft 反映済み
  absentSlotIds, // Set<slotId>
  partTimeStaff,
  subjects,
  biweeklyAnchors,
  allTeachers, // 振替先担当候補 (全先生名 / sortJa 済み)
  timetables, // 振替先の有効時間割フィルタ用
  isOffForGrade, // 振替先の休講/テスト期間警告用
  isHolidayForSlot, // 「休講」表示用 (休講のみ判定)
  isInExamPeriodForGrade, // 「テスト期間」表示用 (休講に該当しない場合のフォールバック)
  holidaysToday = [], // 当日に該当する休講エントリ (バナー表示用)
  examPeriodsToday = [], // 当日に該当するテスト期間 (バナー表示用)
  sessionOverrides, // 振替の skip 自動付与判定用 (既存override 検出)
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
  const { existingCombineBySlot, existingMoveBySlot, existingRescheduleBySlot } =
    useMemo(() => {
      const combineMap = new Map(); // hostSlotId -> adjustment
      const moveMap = new Map(); // slotId -> adjustment
      const rescheduleMap = new Map(); // slotId -> adjustment
      for (const adj of activeExistingAdjustments) {
        if (adj.type === "combine") combineMap.set(adj.slotId, adj);
        else if (adj.type === "move") moveMap.set(adj.slotId, adj);
        else if (adj.type === "reschedule") rescheduleMap.set(adj.slotId, adj);
      }
      return {
        existingCombineBySlot: combineMap,
        existingMoveBySlot: moveMap,
        existingRescheduleBySlot: rescheduleMap,
      };
    }, [activeExistingAdjustments]);

  // 他日から当日へ振替えられてきたコマ (incoming) を集約。
  // 「本多が 4/24 休み → 今日のコマを 5/1 に振替」という adjustment が
  // あるとき、5/1 の画面では「+ 振替で来たコマ」バナーとして可視化したい。
  const incomingReschedules = useMemo(() => {
    const removed = removedAdjustmentIds || new Set();
    const slotById = new Map();
    for (const s of allSlots || []) slotById.set(s.id, s);
    const out = [];
    for (const adj of existingAdjustments || []) {
      if (adj.type !== "reschedule") continue;
      if (removed.has(adj.id)) continue;
      if (adj.targetDate !== date) continue;
      const slot = slotById.get(adj.slotId);
      if (!slot) continue;
      out.push({ adj, slot });
    }
    out.sort(
      (a, b) =>
        timeToMin(a.adj.targetTime || a.slot.time || "00:00") -
        timeToMin(b.adj.targetTime || b.slot.time || "00:00")
    );
    return out;
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

  // 表示対象 (absorbed は除外、host/移動済みは残す)
  const visibleSlots = useMemo(
    () => effectiveSlots.filter((s) => !absorbedSet.has(s.id)),
    [effectiveSlots, absorbedSet]
  );

  // 右クリックメニュー
  const openContextMenu = useCallback(
    (e, slot) => {
      e.preventDefault();
      const items = [];
      const row = draft[slot.id];

      const isAbsorbed = absorbedSet.has(slot.id);
      const isHost = hostsAbsorbedMap.has(slot.id);
      const hasSub = !!row?.sub?.substitute;
      const hasOverride = !!row?.override;

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
        // 代行
        items.push({
          label: hasSub ? "代行を変更…" : "代行を割り当て…",
          onClick: () => {
            const anchorRect = e.target.getBoundingClientRect();
            setSubPicker({ slot, anchorRect });
          },
        });

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
          const candidates = findCombineCandidates(slot, slots, subjects, absorbedSet);
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

        if (hasSub) {
          items.push({
            label: "代行を取り消す",
            danger: true,
            onClick: () => draftApi.clearSub(slot.id),
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
      rescheduleBySlot,
      draftApi,
      slots,
      subjects,
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
  const handleSlotClick = useCallback(
    (slot) => {
      if (!combineSource) return;
      if (slot.id === combineSource.id) {
        setCombineSource(null);
        return;
      }
      if (!canCombineSlots(combineSource, slot, subjects)) return;
      const current = hostsAbsorbedMap.get(combineSource.id) || [];
      if (current.includes(slot.id)) return;
      draftApi.setCombine(combineSource.id, [...current, slot.id]);
      setCombineSource(null);
    },
    [combineSource, subjects, hostsAbsorbedMap, draftApi]
  );

  // 個々のスロットカード描画 (AbsenceExcelSection に渡す関数)
  const renderCard = useCallback(
    (s) => {
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

      // 代行: draft or 既存確定 (removedSubIds でマーク済みは表示から除外)
      let substituteName = null;
      let substituteStatus = null;
      if (row.sub?.substitute) {
        substituteName = row.sub.substitute;
        substituteStatus = row.sub.status || "confirmed";
      } else {
        const ex = (existingSubs || []).find(
          (x) =>
            x.date === date &&
            x.slotId === s.id &&
            !removedSubIds?.has(x.id)
        );
        if (ex?.substitute) {
          substituteName = ex.substitute;
          substituteStatus = ex.status;
        }
      }

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
        !absorbedSet.has(s.id) &&
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
      if (isHolidayForSlot && isHolidayForSlot(date, s.grade, s.subj)) {
        cancelLabel = "休講";
      } else if (
        isInExamPeriodForGrade &&
        isInExamPeriodForGrade(date, s.grade)
      ) {
        cancelLabel = "テスト期間";
      }
      const isCancelled = cancelLabel != null;

      return (
        <AbsenceSlotCard
          key={s.id}
          slot={s}
          date={date}
          biweeklyAnchors={biweeklyAnchors}
          isAbsent={isAbsent}
          cancelLabel={cancelLabel}
          isMoved={isMoved}
          isCombineHost={isHost}
          absorbedLabel={absorbedLabel}
          isAbsorbed={isAbsorbed}
          hostLabel={hostLabel}
          substituteName={substituteName}
          substituteStatus={substituteStatus}
          overrideLabel={overrideLabel}
          sessionCount={sessionCountMap?.get(s.id) || 0}
          isCombineCandidate={isCombineCandidate}
          isCombineSource={isCombineSource}
          disableDrag={disableDrag || isCancelled}
          dimmed={dimmed}
          isRescheduled={!!reschedule}
          rescheduleLabel={rescheduleLabel}
          onContextMenu={isCancelled ? undefined : (e) => openContextMenu(e, s)}
          onDragStart={(e) => handleDragStart(e, s)}
          onClick={isCancelled ? undefined : () => handleSlotClick(s)}
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
      existingSubs,
      removedSubIds,
      date,
      biweeklyAnchors,
      combineSource,
      subjects,
      sessionCountMap,
      openContextMenu,
      handleDragStart,
      handleSlotClick,
      isHolidayForSlot,
      isInExamPeriodForGrade,
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
            return (
              <span
                key={`exam-${ep.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "#fde8c8",
                  color: "#7a4a10",
                  border: "1px solid #e0a030",
                  borderRadius: 12,
                  padding: "2px 10px",
                  fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 10 }}>テスト期間</span>
                <span>{ep.name}</span>
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
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {incomingReschedules.map(({ adj, slot }) => {
              const timeText = adj.targetTime || slot.time;
              const teacherText = adj.targetTeacher || slot.teacher;
              const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
              const titleParts = [`元: ${adj.date} ${slot.time}`];
              if (adj.memo) titleParts.push(adj.memo);
              return (
                <span
                  key={adj.id}
                  title={titleParts.join(" / ")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: "#fff",
                    border: `1px solid ${ADJ_COLOR.reschedule.bannerBorder}`,
                    borderRadius: 12,
                    padding: "2px 8px",
                    fontSize: 11,
                    color: ADJ_COLOR.reschedule.deep,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{timeText}</span>
                  <span>
                    {slot.grade}
                    {cls} {slot.subj}
                  </span>
                  <span style={{ color: "#666" }}>({teacherText})</span>
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
        コマをドラッグ → 別時間セルにドロップで移動 / 右クリック → メニューで代行・合同・振替・回数補正
      </div>

      {effectiveSlots.length === 0 ? (
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
          anchorRect={subPicker.anchorRect}
          slot={subPicker.slot}
          partTimeStaff={partTimeStaff}
          subjects={subjects}
          daySlots={slots}
          currentSubstitute={draft[subPicker.slot.id]?.sub?.substitute || ""}
          currentStatus={draft[subPicker.slot.id]?.sub?.status || "confirmed"}
          onAssign={(name, status) =>
            draftApi.updateSub(subPicker.slot.id, { substitute: name, status })
          }
          onClear={() => draftApi.clearSub(subPicker.slot.id)}
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

      {/* 振替ピッカー */}
      {reschedulePicker && (
        <ReschedulePickerPopover
          anchorRect={reschedulePicker.anchorRect}
          slot={reschedulePicker.slot}
          sourceDate={date}
          allSlots={allSlots}
          allTeachers={allTeachers}
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
            if (info?.source === "saved") {
              const existing = existingRescheduleBySlot.get(slotId);
              if (existing) draftApi.markAdjustmentRemoved(existing.id);
            }
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
