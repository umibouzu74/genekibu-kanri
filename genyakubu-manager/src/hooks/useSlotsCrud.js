import { useMemo } from "react";
import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
import { nextNumericId } from "../utils/schema";
import { sortJa } from "../utils/sortJa";
import { BEHAVIOR } from "../constants/layout";

// Slot の CRUD ロジック + SlotForm 用のサジェスト生成をまとめたフック。
// App 本体から約 120 行削減する。
export function useSlotsCrud({
  slots,
  saveSlots,
  subs,
  saveSubs,
  subjects,
  partTimeStaff,
  adjustments = [],
  saveAdjustments,
  sessionOverrides = [],
  saveSessionOverrides,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const nextId = () => nextNumericId(slots);

  // SlotForm 用のサジェスト集合 (時間帯・学年・教室・科目・講師)。
  const suggestions = useMemo(() => {
    const times = new Set();
    const grades = new Set();
    const rooms = new Set();
    const subjs = new Set();
    const teachers = new Set();
    for (const s of slots) {
      if (s.time) times.add(s.time);
      if (s.grade) grades.add(s.grade);
      if (s.room) rooms.add(s.room);
      if (s.subj) subjs.add(s.subj);
      if (s.teacher) teachers.add(s.teacher);
    }
    for (const subj of subjects) if (subj.name) subjs.add(subj.name);
    for (const ps of partTimeStaff) if (ps.name) teachers.add(ps.name);
    return {
      times: sortJa([...times]),
      grades: sortJa([...grades]),
      rooms: sortJa([...rooms]),
      subjs: sortJa([...subjs]),
      teachers: sortJa([...teachers]),
    };
  }, [slots, subjects, partTimeStaff]);

  const save = async (editSlot, f, setEditSlot) => {
    // Double booking detection
    const editingId = editSlot === "new" ? null : editSlot?.id;
    const conflicts = slots.filter(
      (s) =>
        s.id !== editingId &&
        s.teacher === f.teacher &&
        s.day === f.day &&
        s.time === f.time
    );
    if (conflicts.length > 0) {
      const list = conflicts
        .map(
          (c) =>
            `・${c.grade}${c.cls && c.cls !== "-" ? c.cls : ""} ${c.subj}${c.room ? ` (${c.room})` : ""}`
        )
        .join("\n");
      const ok = await confirm({
        title: "ダブルブッキングの可能性",
        message: `「${f.teacher}」は ${f.day}曜 ${f.time} に既に ${conflicts.length} 件のコマがあります:\n\n${list}\n\nこのまま保存しますか？`,
        okLabel: "保存する",
        tone: "danger",
      });
      if (!ok) return;
    }

    // 同一曜日での過度な連続コマ警告
    const sameDayCount =
      slots.filter(
        (s) => s.id !== editingId && s.teacher === f.teacher && s.day === f.day
      ).length + 1; // +1 for this slot
    if (sameDayCount >= BEHAVIOR.SLOT_OVERLOAD_THRESHOLD) {
      toasts.info(
        `注意: ${f.teacher} は ${f.day}曜に ${sameDayCount} コマ目になります`
      );
    }

    if (editSlot === "new") {
      saveSlots([...slots, { ...f, id: nextId() }]);
      toasts.success("コマを追加しました");
    } else {
      saveSlots(slots.map((s) => (s.id === editSlot.id ? { ...f, id: s.id } : s)));
      toasts.success("コマを更新しました");
    }
    setEditSlot(null);
  };

  const del = async (id) => {
    const linkedSubs = subs.filter((s) => s.slotId === id);
    const linkedAdjustments = (adjustments || []).filter(
      (a) =>
        a.slotId === id ||
        (Array.isArray(a.combineSlotIds) && a.combineSlotIds.includes(id))
    );
    const linkedOverrides = (sessionOverrides || []).filter(
      (o) => o.slotId === id
    );
    const extras = [];
    if (linkedSubs.length) extras.push(`代行記録 ${linkedSubs.length} 件`);
    if (linkedAdjustments.length)
      extras.push(`時間割調整 ${linkedAdjustments.length} 件`);
    if (linkedOverrides.length)
      extras.push(`回数補正 ${linkedOverrides.length} 件`);
    const extra = extras.length
      ? `\n※この操作で次のデータも削除されます: ${extras.join(" / ")}`
      : "";
    const ok = await confirm({
      title: "コマの削除",
      message: `このコマを削除しますか？${extra}`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    saveSlots(slots.filter((s) => s.id !== id));
    if (linkedSubs.length) {
      saveSubs(subs.filter((s) => s.slotId !== id));
    }
    if (linkedAdjustments.length && saveAdjustments) {
      // 吸収側 (combineSlotIds) のみに含まれるケースは、host 側の合同から
      // 該当 id を取り除いて存続させる。host 自体が消えるなら adjustment を削除。
      const next = [];
      for (const adj of adjustments) {
        if (adj.slotId === id) continue;
        if (
          adj.type === "combine" &&
          Array.isArray(adj.combineSlotIds) &&
          adj.combineSlotIds.includes(id)
        ) {
          const remaining = adj.combineSlotIds.filter((sid) => sid !== id);
          if (remaining.length === 0) continue;
          next.push({ ...adj, combineSlotIds: remaining });
        } else {
          next.push(adj);
        }
      }
      saveAdjustments(next);
    }
    if (linkedOverrides.length && saveSessionOverrides) {
      saveSessionOverrides(sessionOverrides.filter((o) => o.slotId !== id));
    }
    const removedParts = [];
    if (linkedSubs.length) removedParts.push(`代行 ${linkedSubs.length} 件`);
    if (linkedAdjustments.length)
      removedParts.push(`調整 ${linkedAdjustments.length} 件`);
    if (linkedOverrides.length)
      removedParts.push(`回数補正 ${linkedOverrides.length} 件`);
    toasts.success(
      removedParts.length
        ? `コマと ${removedParts.join(" / ")} を削除しました`
        : "コマを削除しました"
    );
  };

  return { save, del, suggestions };
}
