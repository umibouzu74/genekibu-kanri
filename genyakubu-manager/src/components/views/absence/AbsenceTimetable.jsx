import { useCallback, useMemo, useState } from "react";
import { dateToDay } from "../../../data";
import { ContextMenu } from "../../ContextMenu";
import { AbsenceSlotCard } from "./AbsenceSlotCard";
import { AbsenceDashDayRow } from "./AbsenceDashDayRow";
import { SubstitutePickerPopover } from "./SubstitutePickerPopover";
import { SessionOverridePopover } from "./SessionOverridePopover";
import { canCombineSlots, findCombineCandidates } from "../../../utils/absenceHelpers";

// ─── 欠勤ワークフロー: 時間割グリッド (直接操作 UI) ────────────
// レイアウトは Dashboard 日別 (DashDayRow) と同じ 3 カラム。
// 編集機能:
//   1. スロットをドラッグして別時間行にドロップ → move 下書き
//   2. 右クリック → ContextMenu → 代行 / 合同 / 移動 / 回数補正 / 取消
//   3. 合同モード中はヒューリスティック候補のみ破線枠、クリックで合同確定
// draft は親から渡された callback 経由で更新する (直接 mutate しない)。

export function AbsenceTimetable({
  slots, // 対象日のコマ群 (day フィルタ済み)
  draft, // draft.draft (useAbsenceDraft から)
  draftApi, // setAction, updateSub, updateMove, setCombine, clearCombine, updateOverride, getRow
  existingSubs, // 既存確定代行 (date フィルタ済み)
  sessionCountMap, // Map<slotId, number> draft 反映済み
  absentSlotIds, // Set<slotId>
  partTimeStaff,
  subjects,
  date,
}) {
  const [ctxMenu, setCtxMenu] = useState(null);
  const [combineSource, setCombineSource] = useState(null);
  const [subPicker, setSubPicker] = useState(null); // { slot, anchorRect }
  const [overridePicker, setOverridePicker] = useState(null); // { slot, anchorRect }

  const dow = useMemo(() => dateToDay(date), [date]);

  // draft から派生する absorbed 集合とホスト対応
  const { absorbedSet, hostByAbsorbed, hostsAbsorbedMap } = useMemo(() => {
    const absorbed = new Set();
    const hostByAbs = new Map();
    const hostsAbs = new Map(); // hostId -> absorbedSlotIds[]
    for (const [sidStr, row] of Object.entries(draft)) {
      const sid = Number(sidStr);
      if (row.action === "combine" && row.combine?.absorbedSlotIds) {
        hostsAbs.set(sid, [...row.combine.absorbedSlotIds]);
        for (const c of row.combine.absorbedSlotIds) {
          absorbed.add(c);
          hostByAbs.set(c, sid);
        }
      }
    }
    return { absorbedSet: absorbed, hostByAbsorbed: hostByAbs, hostsAbsorbedMap: hostsAbs };
  }, [draft]);

  // 表示用の slot リスト: time は move があれば target time
  const effectiveSlots = useMemo(() => {
    return slots.map((s) => {
      const row = draft[s.id];
      const moveTarget = row?.action === "move" ? row.move?.targetTime : null;
      return {
        ...s,
        _time: moveTarget || s.time,
        _moved: !!moveTarget,
      };
    });
  }, [slots, draft]);

  // AbsenceDashDayRow に渡す表示対象 (absorbed は除外、host/移動済みは残す)
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
      const hasSub = row?.action === "sub" && row.sub?.substitute;
      const hasMove = row?.action === "move" && row.move?.targetTime;
      const hasOverride = !!row?.override;

      if (isAbsorbed) {
        items.push({
          label: "合同から外す",
          danger: true,
          onClick: () => {
            const hostId = hostByAbsorbed.get(slot.id);
            if (hostId == null) return;
            const hostRow = draft[hostId];
            const remaining = (hostRow?.combine?.absorbedSlotIds || []).filter(
              (x) => x !== slot.id
            );
            if (remaining.length === 0) {
              draftApi.clearCombine(hostId);
            } else {
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
          items.push({
            label: "合同相手を変更…",
            onClick: () => setCombineSource(slot),
          });
          items.push({
            label: "合同を取り消す",
            danger: true,
            onClick: () => draftApi.clearCombine(slot.id),
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

        // 移動
        if (hasMove) {
          items.push({
            label: "移動を取り消す",
            danger: true,
            onClick: () => draftApi.setAction(slot.id, null),
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
            onClick: () => draftApi.setAction(slot.id, null),
          });
        }
      }

      if (items.length > 0) {
        setCtxMenu({ x: e.clientX, y: e.clientY, items });
      }
    },
    [draft, absorbedSet, hostsAbsorbedMap, hostByAbsorbed, draftApi, slots, subjects]
  );

  // ドラッグ開始: dataTransfer に slotId をセット
  const handleDragStart = useCallback((e, slot) => {
    e.dataTransfer.setData("text/plain", String(slot.id));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  // ドロップ: move 下書きを作成 / 同じ時刻なら解除
  const handleDrop = useCallback(
    (slotId, targetTime) => {
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      if (slot.time === targetTime) {
        const row = draft[slotId];
        if (row?.action === "move") draftApi.setAction(slotId, null);
        return;
      }
      draftApi.updateMove(slotId, targetTime);
    },
    [slots, draft, draftApi]
  );

  // 合同モード中のスロットクリック: 相手として選ぶ
  const handleSlotClick = useCallback(
    (slot) => {
      if (!combineSource) return;
      if (slot.id === combineSource.id) {
        setCombineSource(null);
        return;
      }
      if (!canCombineSlots(combineSource, slot, subjects)) return;
      const existing = draft[combineSource.id]?.combine?.absorbedSlotIds || [];
      if (existing.includes(slot.id)) return;
      draftApi.setCombine(combineSource.id, [...existing, slot.id]);
      setCombineSource(null);
    },
    [combineSource, subjects, draft, draftApi]
  );

  // 個々のスロットカード描画 (AbsenceSectionColumn に渡す関数)
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

      // 代行: draft or 既存確定
      let substituteName = null;
      let substituteStatus = null;
      if (row.action === "sub" && row.sub?.substitute) {
        substituteName = row.sub.substitute;
        substituteStatus = row.sub.status || "confirmed";
      } else {
        const ex = (existingSubs || []).find(
          (x) => x.date === date && x.slotId === s.id
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

      return (
        <AbsenceSlotCard
          key={s.id}
          slot={s}
          isAbsent={isAbsent}
          isMoved={row._moved || row.action === "move"}
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
          disableDrag={disableDrag}
          compact
          dimmed={dimmed}
          onContextMenu={(e) => openContextMenu(e, s)}
          onDragStart={(e) => handleDragStart(e, s)}
          onClick={() => handleSlotClick(s)}
        />
      );
    },
    [
      draft,
      absorbedSet,
      hostsAbsorbedMap,
      hostByAbsorbed,
      absentSlotIds,
      slots,
      existingSubs,
      date,
      combineSource,
      subjects,
      sessionCountMap,
      openContextMenu,
      handleDragStart,
      handleSlotClick,
    ]
  );

  return (
    <div>
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

      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginBottom: 6,
        }}
      >
        コマをドラッグ → 別時間にドロップで移動 / 右クリック → メニューで代行・合同・回数補正
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
        <AbsenceDashDayRow
          dow={dow}
          slots={visibleSlots}
          renderCard={renderCard}
          onTimeDrop={handleDrop}
        />
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
          onClear={() => draftApi.setAction(subPicker.slot.id, null)}
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
    </div>
  );
}
