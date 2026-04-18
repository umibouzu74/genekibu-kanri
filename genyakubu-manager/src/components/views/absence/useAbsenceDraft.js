import { useCallback, useState } from "react";

// ─── Teacher Absence workflow: local draft state ──────────────────
// 代行・合同/移動・回数補正の下書きを slot ごとに保持する。
// sub / move / combine / override はいずれも独立フィールドで、同一スロット
// 上で任意の組み合わせが共存できる (例: 時間を移動した上でさらに代行を
// 割り当てる)。combine で吸収された側 (absorbedBy != null) は表示対象から
// 除外されるため、個別の sub/move は持たない。
//
// draft shape:
//   {
//     [slotId]: {
//       sub?:        { substitute, status, memo },
//       move?:       { targetTime },
//       combine?:    { absorbedSlotIds },   // この slot が host
//       absorbedBy?: number,                // 逆向き: 他の slot (host) に吸収
//       override?:   { mode, value?, displayAs?, memo },
//     }
//   }

const emptyRow = () => ({
  sub: null,
  move: null,
  combine: null,
  absorbedBy: null,
  override: null,
});

// row が "空" (全フィールド null) なら true
function isEmptyRow(row) {
  return (
    !row.sub &&
    !row.move &&
    !row.combine &&
    row.absorbedBy == null &&
    !row.override
  );
}

// 各フィールドを更新する共通ヘルパ。row が空になったら entry ごと削除して
// draft を綺麗に保つ。
function patchRow(prev, slotId, patch) {
  const cur = prev[slotId] || emptyRow();
  const next = { ...cur, ...patch };
  const out = { ...prev };
  if (isEmptyRow(next)) {
    delete out[slotId];
  } else {
    out[slotId] = next;
  }
  return out;
}

export function useAbsenceDraft() {
  const [draft, setDraft] = useState({});

  const reset = useCallback(() => setDraft({}), []);

  const getRow = useCallback((slotId) => draft[slotId] || emptyRow(), [draft]);

  const updateSub = useCallback((slotId, patch) => {
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      return patchRow(prev, slotId, {
        sub: {
          substitute: "",
          status: "confirmed",
          memo: "",
          ...(cur.sub || {}),
          ...patch,
        },
      });
    });
  }, []);

  const clearSub = useCallback((slotId) => {
    setDraft((prev) => patchRow(prev, slotId, { sub: null }));
  }, []);

  const updateMove = useCallback((slotId, targetTime) => {
    setDraft((prev) => patchRow(prev, slotId, { move: { targetTime } }));
  }, []);

  const clearMove = useCallback((slotId) => {
    setDraft((prev) => patchRow(prev, slotId, { move: null }));
  }, []);

  // 合同: host に combine.absorbedSlotIds[] を、absorbed 側に absorbedBy=host を
  // 設定する。吸収された slot は host と統合されるため、独自の sub/move は
  // 持たせない (表示対象外になる)。
  const setCombine = useCallback((hostSlotId, absorbedSlotIds) => {
    setDraft((prev) => {
      let next = { ...prev };
      const newIds = [...absorbedSlotIds];
      const newIdSet = new Set(newIds);

      // 既存 host から新リストに含まれなくなった slot の absorbedBy を解除
      const prevHost = next[hostSlotId];
      for (const oldId of prevHost?.combine?.absorbedSlotIds || []) {
        if (newIdSet.has(oldId)) continue;
        const oldRow = next[oldId];
        if (oldRow && oldRow.absorbedBy === hostSlotId) {
          next = patchRow(next, oldId, { absorbedBy: null });
        }
      }

      next = patchRow(next, hostSlotId, {
        combine: { absorbedSlotIds: newIds },
      });

      for (const sid of newIds) {
        next = patchRow(next, sid, {
          absorbedBy: hostSlotId,
          sub: null,
          move: null,
        });
      }
      return next;
    });
  }, []);

  const clearCombine = useCallback((hostSlotId) => {
    setDraft((prev) => {
      const hostRow = prev[hostSlotId];
      if (!hostRow?.combine) return prev;
      let next = { ...prev };
      for (const sid of hostRow.combine.absorbedSlotIds || []) {
        const cur = next[sid];
        if (cur && cur.absorbedBy === hostSlotId) {
          next = patchRow(next, sid, { absorbedBy: null });
        }
      }
      next = patchRow(next, hostSlotId, { combine: null });
      return next;
    });
  }, []);

  const updateOverride = useCallback((slotId, patch) => {
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      if (patch === null) {
        return patchRow(prev, slotId, { override: null });
      }
      return patchRow(prev, slotId, {
        override: {
          mode: "set",
          value: 0,
          memo: "",
          ...(cur.override || {}),
          ...patch,
        },
      });
    });
  }, []);

  // ドラフトから保存対象の配列を作成する。
  // 1 スロットが sub + move の両方を持つ場合は両方のレコードを出力する。
  const toBatchPayload = useCallback(
    (date, slots) => {
      const draftSubs = [];
      const draftAdjustments = [];
      const draftOverrides = [];

      const slotById = new Map();
      for (const s of slots) slotById.set(s.id, s);

      for (const [sidStr, row] of Object.entries(draft)) {
        const slotId = Number(sidStr);
        const slot = slotById.get(slotId);
        if (!slot) continue;

        if (row.sub?.substitute || row.sub?.status) {
          draftSubs.push({
            date,
            slotId,
            originalTeacher: slot.teacher,
            substitute: row.sub.substitute || "",
            status: row.sub.status || "requested",
            memo: row.sub.memo || "",
          });
        }

        if (row.combine?.absorbedSlotIds?.length) {
          draftAdjustments.push({
            date,
            type: "combine",
            slotId,
            combineSlotIds: [...row.combine.absorbedSlotIds],
            memo: row.combine.memo || "",
          });
        }

        if (row.move?.targetTime) {
          draftAdjustments.push({
            date,
            type: "move",
            slotId,
            targetTime: row.move.targetTime,
            memo: `${slot.time} → ${row.move.targetTime}`,
          });
        }

        if (row.override) {
          if (row.override.mode === "set" && Number.isFinite(Number(row.override.value))) {
            draftOverrides.push({
              date,
              slotId,
              mode: "set",
              value: Number(row.override.value),
              memo: row.override.memo || "",
            });
          } else if (row.override.mode === "skip") {
            const rawDisplay = Number(row.override.displayAs);
            const entry = {
              date,
              slotId,
              mode: "skip",
              memo: row.override.memo || "",
            };
            if (Number.isFinite(rawDisplay) && rawDisplay > 0) {
              entry.displayAs = rawDisplay;
            }
            draftOverrides.push(entry);
          }
        }
      }

      return { draftSubs, draftAdjustments, draftOverrides };
    },
    [draft]
  );

  return {
    draft,
    reset,
    getRow,
    updateSub,
    clearSub,
    updateMove,
    clearMove,
    setCombine,
    clearCombine,
    updateOverride,
    toBatchPayload,
  };
}
