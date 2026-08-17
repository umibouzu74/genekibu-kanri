import { useState } from "react";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";

// よみの設定状況を出す帯 (バイト一覧 / 常勤講師 タブの上)。
//
// **漢字の名前は読み順に並べられない** (localeCompare("ja") は部首・画数順)
// ため、代行候補や講師フィルタを五十音順に出せるかどうかは、よみが
// 入っているかだけで決まる。未設定の人は勝手に別の順序にせず末尾に置く
// 方針なので、「誰が未設定なのか」をここで見せて埋めてもらう。
const MAX_NAMES = 12;

export function KanaStatusBanner({ missing = [], total = 0, onImportKana, isAdmin }) {
  const [expanded, setExpanded] = useState(false);

  if (total === 0) return null;

  const done = missing.length === 0;
  const shown = expanded ? missing : missing.slice(0, MAX_NAMES);
  const rest = missing.length - shown.length;

  return (
    <div
      style={{
        background: done ? colors.successSoft : "#fffbe6",
        border: `1px solid ${done ? colors.successBorder : "#ffe08a"}`,
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 12,
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div>
          {done ? (
            <>
              ✅ <strong>{total} 名すべてによみが入っています</strong>
              <span style={{ color: "#888", marginLeft: 8 }}>
                代行候補や講師フィルタが五十音順で並びます
              </span>
            </>
          ) : (
            <>
              ⚠ <strong>よみ未設定 {missing.length} 名</strong>
              <span style={{ color: "#888", marginLeft: 8 }}>
                （{total} 名中）よみを入れると代行候補や講師フィルタが五十音順に並びます。
                漢字だけでは読み順に並べられないため、未設定の講師は一覧の末尾に置かれます
              </span>
            </>
          )}
        </div>
        {isAdmin && onImportKana && (
          <button
            type="button"
            onClick={onImportKana}
            title="通常時間割作成の講師マスタに入っているよみを取り込みます（既に入っているよみは上書きしません）"
            style={S.btn(false)}
          >
            📥 通常時間割作成から取り込む
          </button>
        )}
      </div>

      {!done && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {shown.map((n) => (
            <span
              key={n}
              style={{
                background: "#fff",
                border: "1px solid #e6d08a",
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: 11,
              }}
            >
              {n}
            </span>
          ))}
          {rest > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: colors.accentBlue,
                textDecoration: "underline",
                padding: 0,
              }}
            >
              ほか {rest} 名
            </button>
          )}
        </div>
      )}
    </div>
  );
}
