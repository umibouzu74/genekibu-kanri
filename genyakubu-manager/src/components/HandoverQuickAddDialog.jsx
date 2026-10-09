import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { HandoverNoteForm } from "./HandoverNoteForm";
import { useToday } from "../hooks/useToday";
import { useToasts } from "../hooks/useToasts";
import {
  addHandoverNote,
  emptyHandoverDraft,
  validateHandoverDraft,
} from "../utils/handoverNotes";

// どの画面からでも開ける「✏ 引継ぎメモを書く」(Cmd+K / ダッシュボードの
// 「📌 去年のこの時期」)。気付いたその場で 1 行書いて閉じられるように、
// 引継ぎメモの画面へ移らずに済ませる。保存後の toast から一覧を開ける。
export function HandoverQuickAddDialog({ notes, onSave, onClose, onOpenNote }) {
  const today = useToday();
  const toasts = useToasts();
  const [draft, setDraft] = useState(() => emptyHandoverDraft(today));
  // 開いたらすぐ打てるように。Modal の focus trap が先に ✕ へフォーカスする
  // (子の effect が先に走る) ので、親であるここの effect で入れ直す
  const titleRef = useRef(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = () => {
    const err = validateHandoverDraft(draft);
    if (err) {
      toasts.error(err);
      return;
    }
    const next = addHandoverNote(notes, draft, new Date().toISOString());
    onSave(next);
    const added = next[next.length - 1];
    toasts.push("引継ぎメモを追加しました", {
      tone: "success",
      duration: 6000,
      action: onOpenNote
        ? { label: "一覧で見る", onClick: () => onOpenNote(added.id) }
        : undefined,
    });
    onClose();
  };

  return (
    <Modal title="✏ 引継ぎメモを書く" onClose={onClose} width="min(640px, 100%)">
      <HandoverNoteForm
        idPrefix="handover-quick"
        draft={draft}
        onChange={setDraft}
        onSubmit={submit}
        onCancel={onClose}
        submitLabel="＋ 追加"
        titleRef={titleRef}
      />
    </Modal>
  );
}
