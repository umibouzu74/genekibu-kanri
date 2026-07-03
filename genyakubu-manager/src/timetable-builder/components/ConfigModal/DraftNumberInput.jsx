import { useState } from 'react';

// F2l: 即時 commit だった数値入力の draft 化。フォーカス中はローカル draft を
// 表示し、blur / Enter のときだけ onCommit(rawString) を 1 回呼ぶ。
// keystroke ごとの dispatch は「12 と打つ途中の 1」のような中間値で履歴・
// 分析・ソルバ入力を汚す (Undo 1 回で 1 文字ずつしか戻らない) ため。
//
// - 値の解釈 (parseInt / clamp / 空文字の扱い) は呼び出し側の責務。既存の
//   即時 commit ハンドラをそのまま onCommit に渡せる
// - 変更が無ければ commit しない (reducer の同値 no-op ガード F2d と二重の
//   防衛になるが、こちらは dispatch 自体を発生させない)
// - Escape は draft を破棄して編集前の値に戻す。IME 変換中の Esc (変換
//   キャンセル) では破棄しない + ConfigModal の focus trap まで届いて
//   モーダルごと閉じないよう stopPropagation (DraftListTextarea と同じ)
// - value は number でも文字列でも良い (externalCounts は未入力 '' と
//   明示的 0 を区別するため文字列 '' が来る)
export default function DraftNumberInput({ value, onCommit, ...inputProps }) {
  const [draft, setDraft] = useState(null); // null = 非編集 (外部 value を表示)

  const commit = () => {
    if (draft != null && draft !== String(value)) onCommit(draft);
    setDraft(null);
  };

  return (
    <input
      type="number"
      {...inputProps}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setDraft((d) => d ?? String(value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') {
          if (e.nativeEvent?.isComposing) return;
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
