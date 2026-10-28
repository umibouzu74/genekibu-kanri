import { useState } from 'react';

// カンマ区切りリスト編集用の textarea。編集中は draft をローカルに持ち、
// フォーカスを外した時にだけ onCommit で確定する。
// keystroke ごとに commit すると (a) ラベルの編集途中の中間状態が
// 「entity 削除 + 新規追加」として reducer に届き、全タブの該当セルが
// cleanSchedule で即消える、(b) 末尾に打ったカンマが state 再導出で即消えて
// 項目を追加できない、(c) 1 打鍵 = 1 Undo 履歴で MAX_HISTORY を食い潰す、
// という 3 重の実害があるため、必ず確定タイミングを blur に寄せること。
export default function DraftListTextarea({ value, onCommit }) {
  const [draft, setDraft] = useState(null); // null = 非編集 (canonical を表示)
  // aria-label は付けない (ラップする <label> の文言が accessible name になる)
  return (
    <textarea
      className="w-full border border-builder-border p-2 text-sm h-16 rounded"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setDraft((d) => d ?? value)}
      onBlur={() => {
        if (draft != null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // IME 変換中の Esc は「変換のキャンセル」であって編集の取り消しでは
          // ない (Chrome は composition 中も key='Escape' の keydown を配信する)。
          // ここで draft を破棄すると未確定の編集内容が丸ごと消える。
          if (e.nativeEvent?.isComposing) return;
          // 編集の取り消し。stopPropagation しないと ConfigModal の
          // focus trap まで届いてモーダルごと閉じてしまう。
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
