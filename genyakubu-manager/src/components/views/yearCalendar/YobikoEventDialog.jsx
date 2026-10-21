import { useId, useState } from "react";
import { Modal } from "../../Modal";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { YOBIKO_EVENT_KINDS, isYobikoDayMark } from "../../../constants/yobikoEvents";
import {
  draftFromYobikoEvent,
  emptyYobikoDraft,
  validateYobikoDraft,
} from "../../../utils/yobikoEvents";

// 予備校部の予定 1 件の登録・編集。種別が日の種別 (休校日など) なら名称は
// 任意 (空なら種別の名前で出す)。削除は cascade が無いので呼び出し側の
// removeWithUndo (6 秒の「元に戻す」)。
export function YobikoEventDialog({ event = null, initialDate = "", onSubmit, onDelete, onClose }) {
  const ids = useId();
  const [draft, setDraft] = useState(() =>
    event ? draftFromYobikoEvent(event) : emptyYobikoDraft(initialDate)
  );
  const [error, setError] = useState("");
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError("");
  };
  const submit = (e) => {
    e.preventDefault();
    const res = validateYobikoDraft(draft);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSubmit(res.event);
  };
  const mark = isYobikoDayMark(draft.kind);
  const label = (text, htmlFor) => (
    <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4 }}>
      {text}
    </label>
  );

  return (
    <Modal
      title={event ? "予備校部の予定を編集" : "予備校部の予定を追加"}
      onClose={onClose}
      width="min(460px, 100%)"
    >
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 150px" }}>
            {label("開始日", `${ids}-start`)}
            <input
              id={`${ids}-start`}
              type="date"
              value={draft.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              style={S.input}
            />
          </div>
          <div style={{ flex: "1 1 150px" }}>
            {label("終了日 (単日なら空)", `${ids}-end`)}
            <input
              id={`${ids}-end`}
              type="date"
              value={draft.endDate}
              min={draft.startDate || undefined}
              onChange={(e) => set({ endDate: e.target.value })}
              style={S.input}
            />
          </div>
        </div>
        <div>
          {label("種別", `${ids}-kind`)}
          <select
            id={`${ids}-kind`}
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value })}
            style={S.input}
          >
            {YOBIKO_EVENT_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          {mark && (
            <div style={{ fontSize: 11, color: colors.inkMuted, marginTop: 4 }}>
              日付の数字をこの種別の色で塗ります。名称を書くと欄にも出ます (例: 休校日の「スポーツの日」)
            </div>
          )}
        </div>
        <div>
          {label(mark ? "名称 (任意)" : "名称", `${ids}-name`)}
          <input
            id={`${ids}-name`}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={mark ? "例: スポーツの日" : "例: マークテスト⑤ (国・理・地公)"}
            style={S.input}
          />
        </div>
        <div>
          {label("メモ (任意)", `${ids}-memo`)}
          <input
            id={`${ids}-memo`}
            value={draft.memo}
            onChange={(e) => set({ memo: e.target.value })}
            placeholder="例: 月曜授業+自習 (3校時迄)"
            style={S.input}
          />
        </div>
        <div>
          {label("出典 (任意)", `${ids}-source`)}
          <input
            id={`${ids}-source`}
            value={draft.source}
            onChange={(e) => set({ source: e.target.value })}
            placeholder="例: 2026予備校部 年間行事予定表"
            style={S.input}
          />
        </div>
        {error && (
          <div role="alert" style={{ color: colors.danger, fontSize: 12 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {event && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(event)}
              style={{ ...S.btn(false), color: colors.danger, marginRight: "auto" }}
            >
              削除
            </button>
          )}
          <button type="button" onClick={onClose} style={S.btn(false)}>
            キャンセル
          </button>
          <button type="submit" style={S.btn(true)}>
            {event ? "更新" : "追加"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
