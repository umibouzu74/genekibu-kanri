import { useCallback, useState } from "react";

// ─── Teacher Absence workflow: local draft state ──────────────────
// 代行・合同/移動・回数補正の下書きを slot ごとに保持する。
// 1 スロットに対し 1 種類の action (sub|combine|move) と回数補正 (override)
// を共存可能とする。sub/combine/move は相互排他。
//
// draft shape:
//   {
//     [slotId]: {
//       action: null | "sub" | "combine" | "move",
//       sub?: { substitute: string, status: "requested"|"confirmed", memo: string }
//       combine?: { hostSlotId: number }  // この slot が host、他が吸収される
//       absorbedBy?: number               // 逆向き: 他の slot (host) に吸収される
//       move?: { targetTime: string }
//       override?: { mode: "set"|"skip", value?: number, memo: string }
//     }
//   }

const emptyRow = () => ({
  action: null,
  sub: null,
  combine: null,
  absorbedBy: null,
  move: null,
  override: null,
});

export function useAbsenceDraft() {
  const [draft, setDraft] = useState({});

  const reset = useCallback(() => setDraft({}), []);

  const getRow = useCallback((slotId) => draft[slotId] || emptyRow(), [draft]);

  const setAction = useCallback((slotId, action) => {
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      const next = { ...prev };

      // 合同関連のクリーンアップ: 合同から離脱するときに両側の参照を切る。
      const wasHost = cur.action === "combine" && cur.combine;
      const wasAbsorbed = cur.absorbedBy != null;

      if (wasHost && action !== "combine") {
        // host → 別アクション: 吸収されていた全スロットの absorbedBy を解除
        for (const absId of cur.combine.absorbedSlotIds || []) {
          const absRow = next[absId];
          if (absRow && absRow.absorbedBy === slotId) {
            next[absId] = { ...absRow, absorbedBy: null, action: null };
          }
        }
      }

      if (wasAbsorbed && action !== "combine") {
        // 吸収されていた側 → 別アクション: host の absorbedSlotIds から自分を除去
        const hostId = cur.absorbedBy;
        const host = next[hostId];
        if (host && host.combine && Array.isArray(host.combine.absorbedSlotIds)) {
          const filtered = host.combine.absorbedSlotIds.filter((x) => x !== slotId);
          next[hostId] = {
            ...host,
            combine: filtered.length > 0 ? { ...host.combine, absorbedSlotIds: filtered } : null,
            action: filtered.length > 0 ? "combine" : null,
          };
        }
      }

      // action を切り替えるときに相互排他する (sub, combine, move)
      next[slotId] = {
        ...cur,
        action,
        sub: action === "sub" ? cur.sub || { substitute: "", status: "confirmed", memo: "" } : null,
        combine: action === "combine" ? cur.combine : null,
        absorbedBy: action === "combine" ? cur.absorbedBy : null,
        move: action === "move" ? cur.move : null,
      };
      return next;
    });
  }, []);

  const updateSub = useCallback((slotId, patch) => {
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      return {
        ...prev,
        [slotId]: {
          ...cur,
          action: "sub",
          sub: { substitute: "", status: "confirmed", memo: "", ...(cur.sub || {}), ...patch },
        },
      };
    });
  }, []);

  const updateMove = useCallback((slotId, targetTime) => {
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      return {
        ...prev,
        [slotId]: { ...cur, action: "move", move: { targetTime } },
      };
    });
  }, []);

  // 合同: host と absorbed の両方を同時に更新する。
  // host 側には combine.absorbedSlotIds[] を、absorbed 側には absorbedBy=host を設定。
  const setCombine = useCallback((hostSlotId, absorbedSlotIds) => {
    setDraft((prev) => {
      const next = { ...prev };
      // まず既存の host エントリを取得 / 初期化
      const hostRow = next[hostSlotId] || emptyRow();
      next[hostSlotId] = {
        ...hostRow,
        action: "combine",
        combine: {
          ...(hostRow.combine || {}),
          absorbedSlotIds: [...absorbedSlotIds],
        },
      };
      for (const sid of absorbedSlotIds) {
        const cur = next[sid] || emptyRow();
        next[sid] = {
          ...cur,
          action: "combine",
          combine: null,
          absorbedBy: hostSlotId,
        };
      }
      return next;
    });
  }, []);

  const clearCombine = useCallback((hostSlotId) => {
    setDraft((prev) => {
      const hostRow = prev[hostSlotId];
      if (!hostRow || !hostRow.combine) return prev;
      const absorbedIds = hostRow.combine.absorbedSlotIds || [];
      const next = { ...prev };
      next[hostSlotId] = { ...hostRow, action: null, combine: null };
      for (const sid of absorbedIds) {
        const cur = next[sid];
        if (cur && cur.absorbedBy === hostSlotId) {
          next[sid] = { ...cur, action: null, absorbedBy: null };
        }
      }
      return next;
    });
  }, []);

  const updateOverride = useCallback((slotId, patch) => {
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      return {
        ...prev,
        [slotId]: {
          ...cur,
          override: patch === null ? null : { mode: "set", value: 0, memo: "", ...(cur.override || {}), ...patch },
        },
      };
    });
  }, []);

  // ドラフトから保存対象の配列を作成する。
  // date: 対象日 (YYYY-MM-DD)
  // slots: 現在ロードされているスロット群 (slot.id, teacher 参照用)
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

        if (row.action === "sub" && row.sub) {
          draftSubs.push({
            date,
            slotId,
            originalTeacher: slot.teacher,
            substitute: row.sub.substitute || "",
            status: row.sub.status || "requested",
            memo: row.sub.memo || "",
          });
        }

        if (row.action === "combine" && row.combine) {
          draftAdjustments.push({
            date,
            type: "combine",
            slotId,
            combineSlotIds: [...(row.combine.absorbedSlotIds || [])],
            memo: row.combine.memo || "",
          });
        }

        if (row.action === "move" && row.move?.targetTime) {
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
    setAction,
    updateSub,
    updateMove,
    setCombine,
    clearCombine,
    updateOverride,
    toBatchPayload,
  };
}
