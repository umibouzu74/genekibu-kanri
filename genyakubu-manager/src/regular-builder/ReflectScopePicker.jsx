import { availableScope, describeScope, isScopeLimited } from "./reflectScope";

// ─── 反映する範囲の選択 (学年 × 曜日) ───────────────────────────────
//
// 「土曜だけ組み直した」「中3 だけ差し替えたい」ときに、プロジェクト全体を
// 反映せずに済ませるための絞り込み。既定は**全体**で、絞るのは明示的な
// 選択にする (従来の運用を黙って変えない)。
//
// 学年と曜日は **AND**。どちらの軸も「何も選ばない = その軸では絞らない」
// にしてあるので、「中3 だけ (曜日は全部)」「土曜だけ (学年は全部)」が
// 自然に書ける。
//
// 置き換えモードでは**範囲外のコマは触らない**のが要点なので、その件数を
// ここに出す (削除件数だけ見せると範囲外まで消えるように読める)。

function Chip({ checked, onChange, label, disabled }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 9px",
        borderRadius: 14,
        fontSize: 11,
        cursor: disabled ? "default" : "pointer",
        background: checked ? "#2a4a8e" : "#fff",
        color: checked ? "#fff" : "#555",
        border: `1px solid ${checked ? "#2a4a8e" : "#ccc"}`,
        fontWeight: checked ? 700 : 400,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ margin: 0, accentColor: "#2a4a8e" }}
      />
      {label}
    </label>
  );
}

export function ReflectScopePicker({
  project,
  /** チェックの状態そのもの (未正規化) */
  scope,
  onChange,
  /**
   * 正規化後の範囲。表示文はこちらを使う — 全曜日を選んだ状態は
   * normalizeScope が「絞らない」にたたむので、`scope` を表示すると
   * 「月・火・土曜のみ」と絞っているように嘘をつく
   */
  effectiveScope,
  limited,
  onLimitedChange,
  /** 範囲内に入った下書きのコマ数 */
  inScopeCount,
  /** 置き換えモードで範囲外のため触らない既存コマ数 (新規作成では null) */
  untouchedCount,
}) {
  const avail = availableScope(project);
  if (avail.days.length === 0 && avail.grades.length === 0) return null;

  const toggle = (axis, value) => {
    const cur = scope[axis] || [];
    onChange({
      ...scope,
      [axis]: cur.includes(value)
        ? cur.filter((x) => x !== value)
        : [...cur, value],
    });
  };

  return (
    <div
      style={{
        background: "#f6f6fb",
        border: "1px solid #dcdce8",
        borderRadius: 8,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <label
        style={{ display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 700 }}
      >
        <input
          type="checkbox"
          checked={limited}
          onChange={(e) => {
            onLimitedChange(e.target.checked);
            if (!e.target.checked) onChange({ days: [], grades: [] });
          }}
          style={{ marginTop: 2 }}
        />
        <span>
          反映する範囲を絞る（学年・曜日）
          <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.7 }}>
            入れないとプロジェクト全体を反映します（既定）。「土曜だけ組み直した」
            「中3 だけ差し替えたい」ときに使います。
          </div>
        </span>
      </label>

      {limited && (
        <>
          {avail.grades.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                学年
                <span style={{ fontWeight: 400, color: "#888", marginLeft: 6 }}>
                  未選択 = すべての学年
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {avail.grades.map((g) => (
                  <Chip
                    key={g}
                    label={g}
                    checked={(scope.grades || []).includes(g)}
                    onChange={() => toggle("grades", g)}
                  />
                ))}
              </div>
            </div>
          )}

          {avail.days.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                曜日
                <span style={{ fontWeight: 400, color: "#888", marginLeft: 6 }}>
                  未選択 = すべての曜日
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {avail.days.map((d) => (
                  <Chip
                    key={d}
                    label={d}
                    checked={(scope.days || []).includes(d)}
                    onChange={() => toggle("days", d)}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.7 }}>
            {!isScopeLimited(effectiveScope) ? (
              // 何も選んでいない / 全部選んだ = 絞れていない。黙って全体を
              // 反映すると「絞ったつもり」との食い違いになるので明示する
              <span style={{ color: "#9a6b00" }}>
                ⚠ まだ絞られていません（{inScopeCount} コマ = プロジェクト全体を
                反映します）。学年か曜日を選んでください
              </span>
            ) : (
              <>
                反映するのは <strong>{describeScope(effectiveScope)}</strong> の{" "}
                <strong>{inScopeCount}</strong> コマです。
                {untouchedCount != null &&
                  (untouchedCount > 0 ? (
                    <>
                      <br />
                      置き換え先の
                      <strong>範囲外の {untouchedCount} コマは触りません</strong>
                      （削除もされません）。
                    </>
                  ) : (
                    <>
                      <br />
                      <span style={{ color: "#9a6b00" }}>
                        ⚠ 置き換え先に範囲外のコマがありません。この範囲で絞っても
                        結果は全体を反映するのと同じです
                      </span>
                    </>
                  ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
