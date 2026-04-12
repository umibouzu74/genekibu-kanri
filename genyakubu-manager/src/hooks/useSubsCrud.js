import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
import { nextNumericId } from "../utils/schema";

// Substitute (代行) の CRUD ロジック。
export function useSubsCrud({ subs, saveSubs }) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const save = (editSub, f, setEditSub) => {
    const ts = new Date().toISOString();

    // 1日分モードからの一括保存 (配列)
    if (Array.isArray(f)) {
      let next = subs.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;
      const newRecords = f.map((r) => ({
        ...r,
        status: r.substitute ? r.status : "requested",
        id: next++,
        createdAt: ts,
        updatedAt: ts,
      }));
      saveSubs([...subs, ...newRecords]);
      toasts.success(`代行を ${newRecords.length} 件追加しました`);
      setEditSub(null);
      return;
    }

    const normalized = { ...f, status: f.substitute ? f.status : "requested" };
    if (editSub === "new") {
      saveSubs([
        ...subs,
        { ...normalized, id: nextNumericId(subs), createdAt: ts, updatedAt: ts },
      ]);
      toasts.success("代行を追加しました");
    } else {
      saveSubs(
        subs.map((s) =>
          s.id === editSub.id
            ? { ...normalized, id: s.id, createdAt: s.createdAt, updatedAt: ts }
            : s
        )
      );
      toasts.success("代行を更新しました");
    }
    setEditSub(null);
  };

  const del = async (id) => {
    const ok = await confirm({
      title: "代行の削除",
      message: "この代行記録を削除しますか？",
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    saveSubs(subs.filter((s) => s.id !== id));
    toasts.success("代行記録を削除しました");
  };

  return { save, del };
}
