import { useState } from 'react';

// 1 行の入力欄 (教室・クラス名・他学年セッションの講座名)。DraftListTextarea と同じく、確定は欄を離れた
// とき / Enter (IME の確定の Enter は除く)。Esc で編集を取り消す
export default function DraftLineInput({ value, onCommit, ariaLabel, placeholder = '', className }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft != null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent?.isComposing) {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          if (e.nativeEvent?.isComposing) return;
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
