import { useCallback, useState } from "react";

// ─── Teacher Absence workflow: local draft state ──────────────────
// 代行・合同/移動/振替・回数補正の下書きを slot ごとに保持する。
// sub / move / combine / reschedule / override はいずれも独立フィールドで、
// 同一スロット上で任意の組み合わせが共存できる (例: 時間を移動した上で
// さらに代行を割り当てる)。ただし move と reschedule、sub と reschedule は
// 意味的に排他のため、片方を設定するともう片方は自動で解除する。
// combine で吸収された側 (absorbedBy != null) は表示対象から除外される
// ため、個別の sub/move/reschedule は持たない。
//
// 代行 (欠勤) だけは **1 コマに複数件**持てる。プレップのように 1 コマを
// 3 人で担当するコマがあり、「香川と福江は休むが川井は出る」を表せないと
// 欠勤登録そのものが成立しないため、`subs` は元講師をキーにした辞書。
//
// draft shape:
//   {
//     [slotId]: {
//       subs?:        { [originalTeacher]: { substitute, status, memo } },
//       move?:        { targetTime },
//       reschedule?:  { targetDate, targetTime, targetTeacher, memo },
//       combine?:     { absorbedSlotIds },   // この slot が host
//       absorbedBy?:  number,                // 逆向き: 他の slot (host) に吸収
//       override?:    { mode, value?, displayAs?, memo },
//     }
//   }

const emptyRow = () => ({
  subs: null,
  move: null,
  reschedule: null,
  combine: null,
  absorbedBy: null,
  override: null,
});

// row が "空" (全フィールド null) なら true
function isEmptyRow(row) {
  return (
    !row.subs &&
    !row.move &&
    !row.reschedule &&
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
  // 保存済み adjustments の解除マーク (UI 上で取消した既存 combine/move/reschedule の id)
  const [removedAdjustmentIds, setRemovedAdjustmentIds] = useState(() => new Set());
  // 保存済み substitute の解除マーク (振替設定時など、既存代行を解除する場合)
  const [removedSubIds, setRemovedSubIds] = useState(() => new Set());

  const reset = useCallback(() => {
    setDraft({});
    setRemovedAdjustmentIds(new Set());
    setRemovedSubIds(new Set());
  }, []);

  const markAdjustmentRemoved = useCallback((id) => {
    setRemovedAdjustmentIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const unmarkAdjustmentRemoved = useCallback((id) => {
    setRemovedAdjustmentIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const markSubRemoved = useCallback((id) => {
    setRemovedSubIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const unmarkSubRemoved = useCallback((id) => {
    setRemovedSubIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // 代行 / 欠勤の下書き。teacher (元講師) ごとに 1 件持つ。
  // 単一担任のコマでも teacher を渡すこと (誰の欠勤かはレコードの意味その
  // もので、slot.teacher から後で引き直すと隔週の週で食い違う)。
  const updateSub = useCallback((slotId, teacher, patch) => {
    if (!teacher) return;
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      return patchRow(prev, slotId, {
        subs: {
          ...(cur.subs || {}),
          [teacher]: {
            substitute: "",
            status: "confirmed",
            memo: "",
            ...(cur.subs?.[teacher] || {}),
            ...patch,
          },
        },
      });
    });
  }, []);

  // teacher 省略時はそのコマの下書きを全部消す (合同・振替に切り替えたとき)。
  const clearSub = useCallback((slotId, teacher) => {
    setDraft((prev) => {
      const cur = prev[slotId];
      if (!cur?.subs) return prev;
      if (!teacher) return patchRow(prev, slotId, { subs: null });
      if (!(teacher in cur.subs)) return prev;
      const next = { ...cur.subs };
      delete next[teacher];
      return patchRow(prev, slotId, {
        subs: Object.keys(next).length > 0 ? next : null,
      });
    });
  }, []);

  const updateMove = useCallback((slotId, targetTime) => {
    setDraft((prev) =>
      // 同日内の時間移動と他日への振替は排他
      patchRow(prev, slotId, { move: { targetTime }, reschedule: null })
    );
  }, []);

  const clearMove = useCallback((slotId) => {
    setDraft((prev) => patchRow(prev, slotId, { move: null }));
  }, []);

  // 振替 (他日への移動): targetDate は必須、targetTime / targetTeacher は省略可
  // (省略時はそれぞれ元コマの時間 / 元担当を使う前提)。
  // 合同に取り込まれている / 合同 host のコマには振替を設定できない
  // (意味的に排他のため呼び出し側で防ぐ前提だが、防衛的に黙って no-op)。
  const updateReschedule = useCallback((slotId, patch) => {
    setDraft((prev) => {
      const cur = prev[slotId] || emptyRow();
      if (cur.absorbedBy != null || cur.combine?.absorbedSlotIds?.length) {
        return prev;
      }
      // 振替を設定したら move / sub は解除 (意味的に排他)
      return patchRow(prev, slotId, {
        reschedule: {
          targetDate: "",
          targetTime: "",
          targetTeacher: "",
          memo: "",
          ...(cur.reschedule || {}),
          ...patch,
        },
        move: null,
        subs: null,
      });
    });
  }, []);

  const clearReschedule = useCallback((slotId) => {
    setDraft((prev) => patchRow(prev, slotId, { reschedule: null }));
  }, []);

  // 合同: host に combine.absorbedSlotIds[] を、absorbed 側に absorbedBy=host を
  // 設定する。吸収された slot は host と統合されるため、独自の sub/move/reschedule は
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
          subs: null,
          move: null,
          reschedule: null,
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
  // existingAdjustments を渡すと、draft で上書きされる同 slot の既存 combine/move を
  // 自動的に removedAdjustmentIds に追加する (二重保存防止)。
  // existingSubs も同じで、同じ (日付, コマ, 元講師) の保存済み代行があれば
  // 解除マークに回す。**これを外すと「代行未定で欠勤登録 → 後から代行を
  // 割り当て」で 2 本のレコードが残り、画面が古い方 (未定) を拾う。**
  // 元講師は下書きのキーそのもの。隔週の A/B 週の解決は登録する側
  // (欠勤組み換えの画面・一括登録) で済ませてから渡す。
  const toBatchPayload = useCallback(
    (date, slots, existingAdjustments = [], existingSubs = []) => {
      const draftSubs = [];
      const draftAdjustments = [];
      const draftOverrides = [];
      const autoRemovedIds = new Set();
      const autoRemovedSubIds = new Set();

      const slotById = new Map();
      for (const s of slots) slotById.set(s.id, s);

      // 既存調整: (slotId, type) -> adjustment id (同日)
      const existingBySlotType = new Map();
      for (const adj of existingAdjustments || []) {
        if (adj.date !== date) continue;
        existingBySlotType.set(`${adj.slotId}|${adj.type}`, adj.id);
      }

      for (const [sidStr, row] of Object.entries(draft)) {
        const slotId = Number(sidStr);
        const slot = slotById.get(slotId);
        if (!slot) continue;

        // 代行 (欠勤) は元講師ごとに 1 件。多担任コマでは複数件出る。
        for (const [originalTeacher, sub] of Object.entries(row.subs || {})) {
          draftSubs.push({
            date,
            slotId,
            originalTeacher,
            substitute: sub.substitute || "",
            status: sub.status || "requested",
            memo: sub.memo || "",
          });
          for (const ex of existingSubs || []) {
            if (ex.date !== date) continue;
            if (ex.slotId !== slotId) continue;
            if (ex.originalTeacher !== originalTeacher) continue;
            autoRemovedSubIds.add(ex.id);
          }
        }

        if (row.combine?.absorbedSlotIds?.length) {
          draftAdjustments.push({
            date,
            type: "combine",
            slotId,
            combineSlotIds: [...row.combine.absorbedSlotIds],
            memo: row.combine.memo || "",
          });
          const existingId = existingBySlotType.get(`${slotId}|combine`);
          if (existingId != null) autoRemovedIds.add(existingId);
        }

        if (row.move?.targetTime) {
          draftAdjustments.push({
            date,
            type: "move",
            slotId,
            targetTime: row.move.targetTime,
            memo: `${slot.time} → ${row.move.targetTime}`,
          });
          const existingId = existingBySlotType.get(`${slotId}|move`);
          if (existingId != null) autoRemovedIds.add(existingId);
        }

        if (row.reschedule?.targetDate) {
          // 合同との二重指定はデータ上不整合のため、combine 優先で reschedule
          // を黙って落とす (UI 側で排他にしているが防衛策)。
          const conflictsWithCombine =
            row.combine?.absorbedSlotIds?.length || row.absorbedBy != null;
          if (!conflictsWithCombine) {
            const entry = {
              date,
              type: "reschedule",
              slotId,
              targetDate: row.reschedule.targetDate,
              memo: row.reschedule.memo || "",
            };
            if (row.reschedule.targetTime) {
              entry.targetTime = row.reschedule.targetTime;
            }
            if (row.reschedule.targetTeacher) {
              entry.targetTeacher = row.reschedule.targetTeacher;
            }
            draftAdjustments.push(entry);
            const existingId = existingBySlotType.get(`${slotId}|reschedule`);
            if (existingId != null) autoRemovedIds.add(existingId);
          }
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

      const mergedRemoved = new Set([...removedAdjustmentIds, ...autoRemovedIds]);
      const mergedRemovedSubs = new Set([...removedSubIds, ...autoRemovedSubIds]);
      return {
        draftSubs,
        draftAdjustments,
        draftOverrides,
        removedAdjustmentIds: [...mergedRemoved],
        removedSubIds: [...mergedRemovedSubs],
        // 「解除」ではなく draft で置き換わった分 (欠勤 → 代行の付け替え)。
        // 保存メッセージで解除件数と混ぜないために分けて返す。
        replacedSubIds: [...autoRemovedSubIds],
      };
    },
    [draft, removedAdjustmentIds, removedSubIds]
  );

  return {
    draft,
    removedAdjustmentIds,
    removedSubIds,
    reset,
    updateSub,
    clearSub,
    updateMove,
    clearMove,
    updateReschedule,
    clearReschedule,
    setCombine,
    clearCombine,
    updateOverride,
    markAdjustmentRemoved,
    unmarkAdjustmentRemoved,
    markSubRemoved,
    unmarkSubRemoved,
    toBatchPayload,
  };
}
