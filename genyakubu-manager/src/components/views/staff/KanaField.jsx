import { useEffect, useState } from "react";
import { colors } from "../../../styles/tokens";

// 講師 1 人ぶんの「よみ」入力欄。バイト一覧タブと常勤講師タブで共用する。
//
// よみは講師名を五十音順に並べる**唯一の手掛かり**なので、未設定の人が
// 目で分かるように枠と注記で強調する (漢字の名前は読み順に並べられない —
// localeCompare("ja") は部首・画数順になる)。
//
// 保存は blur / Enter のタイミング。1 文字ごとに保存すると Firebase へ
// 打鍵ぶんの書き込みが飛ぶため、確定してから 1 回だけ上げる。
export function KanaField({ name, kana = "", onSave, disabled }) {
  const [draft, setDraft] = useState(kana);

  // 取り込み (📥 通常時間割作成から) や他端末の同期で外から変わったら追従する。
  // 編集中の draft を潰さないよう、保存済みの値が変わったときだけ入れ直す。
  useEffect(() => {
    setDraft(kana);
  }, [kana]);

  const commit = () => {
    if (draft.trim() === kana.trim()) return;
    onSave(name, draft);
  };

  const unset = !kana.trim();

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <label
        htmlFor={`kana-${name}`}
        style={{ fontSize: 11, color: unset ? colors.accentOrange : "#888" }}
      >
        よみ
      </label>
      <input
        id={`kana-${name}`}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(kana);
          }
        }}
        placeholder="ほりかみ"
        aria-label={`${name} のよみ`}
        style={{
          width: 110,
          padding: "3px 6px",
          fontSize: 12,
          borderRadius: 4,
          border: `1px solid ${unset ? colors.accentOrange : "#ccc"}`,
          background: disabled ? "#f5f5f5" : "#fff",
        }}
      />
    </div>
  );
}
