import { useState } from "react";
import { S, colors } from "../styles/common";
import { HANDOVER_CATEGORIES } from "../utils/handoverNotes";

// 引継ぎメモの入力欄。画面 (HandoverView) の追加・編集と、どこからでも開ける
// 「✏ 引継ぎメモを書く」ダイアログ (HandoverQuickAddDialog) で共有する。
// 詳細 (経緯・次の担当者へ・毎年・いつでも) は既定で畳み、日々の 1 行メモの
// 手間を増やさない。
export function HandoverNoteForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  defaultOpen = false,
  idPrefix,
  titleRef,
}) {
  const [open, setOpen] = useState(
    defaultOpen || Boolean(draft.body || draft.advice || draft.annual || draft.pinned)
  );
  const set = (patch) => onChange({ ...draft, ...patch });
  const submitOnCtrlEnter = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => set({ date: e.target.value })}
          aria-label="日付"
          style={{ ...S.input, width: 150, padding: "6px 8px" }}
        />
        <select
          value={draft.category}
          onChange={(e) => set({ category: e.target.value })}
          aria-label="分類"
          style={{ ...S.input, width: 130, padding: "6px 8px" }}
        >
          {HANDOVER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {!HANDOVER_CATEGORIES.includes(draft.category) && (
            <option value={draft.category}>{draft.category}</option>
          )}
        </select>
        <input
          ref={titleRef}
          type="text"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="何があったか (例: 事務よりズバリ的中の提出催促)"
          aria-label="メモ"
          style={{ ...S.input, flex: "1 1 260px", width: "auto", padding: "6px 8px" }}
        />
        <button type="submit" style={{ ...S.btn(true), padding: "6px 14px" }}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ ...S.btn(false), padding: "6px 12px" }}>
            キャンセル
          </button>
        )}
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 12,
            color: colors.accentBlue,
            cursor: "pointer",
          }}
        >
          ▸ 詳しく書く (経緯・次の担当者へ・毎年あること)
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={`${idPrefix}-body`} style={{ ...S.formLabel, marginBottom: 0 }}>
            経緯・詳細
          </label>
          <textarea
            id={`${idPrefix}-body`}
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            onKeyDown={submitOnCtrlEnter}
            rows={2}
            placeholder="例: 9月の会議で告知済み"
            style={{ ...S.input, fontSize: 13, resize: "vertical" }}
          />
          <label htmlFor={`${idPrefix}-advice`} style={{ ...S.formLabel, marginBottom: 0 }}>
            次の担当者へ
          </label>
          <textarea
            id={`${idPrefix}-advice`}
            value={draft.advice}
            onChange={(e) => set({ advice: e.target.value })}
            onKeyDown={submitOnCtrlEnter}
            rows={2}
            placeholder="例: 9月の会議で告知したあと、月末に講師へ念押ししておくと催促が来ない"
            style={{ ...S.input, fontSize: 13, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={draft.annual}
                onChange={(e) => set({ annual: e.target.checked })}
              />
              🔁 毎年この時期にあること
            </label>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={draft.pinned}
                onChange={(e) => set({ pinned: e.target.checked })}
              />
              📚 日付に関係なくいつでも必要なこと (手順・連絡先・置き場所など)
            </label>
          </div>
        </div>
      )}
    </form>
  );
}
