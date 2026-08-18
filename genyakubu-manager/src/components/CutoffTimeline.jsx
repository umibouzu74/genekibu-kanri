import { useMemo, useState } from "react";
import { fmtDate } from "../utils/dateHelpers";
import { buildCutoffTimeline } from "../utils/cutoffTimeline";

// ─── 期間の全体像 (時間割 / 学年グループ / コース) ────────────────────
// 「時間割の有効期間」「表示期間設定」「コース別終講日」は別々のフィルタで、
// どれか 1 つが旧期で終わっていると画面からコマが消える。3 つを同じ物差しで
// 並べると、期切替の伸ばし忘れ (時間割はまだ有効なのに表示期間が先に
// 終わっている = 斜線の区間) が一目で分かる。
//
// 設定そのものは下の 2 枚のカード (表示期間設定 / コース別終講日) で編集する。
// ここは「読む」ための面。
//
// 「実際の最終授業日」は帯に出さない (半年〜1 年の物差しでは終了日との差が
// 1〜数日しか無く、必ずバーの端に重なって読めないため)。日付は下の
// 表示期間設定カードに数字で出している。

const TONE = {
  timetable: { bar: "#8fa6cc", text: "#3a5a8e", label: "時間割" },
  group: { bar: "#7ac08a", text: "#2a6a3a", label: "学年グループ" },
  cohort: { bar: "#b8d8be", text: "#4a7a58", label: "コース終講" },
};
const INVALID_BAR = "#e08080";
const LABEL_W = 150;

const pct = (v) => `${(v * 100).toFixed(2)}%`;

export function CutoffTimeline({ timetables, slots, displayCutoff }) {
  const [showCohorts, setShowCohorts] = useState(true);
  const todayStr = useMemo(() => fmtDate(new Date()), []);

  const timeline = useMemo(
    () =>
      buildCutoffTimeline({
        timetables: timetables || [],
        slots: slots || [],
        displayCutoff,
        todayStr,
        includeCohorts: showCohorts,
      }),
    [timetables, slots, displayCutoff, todayStr, showCohorts]
  );

  const uncoveredCount = timeline.rows.filter((r) => r.uncovered).length;
  const invalidCount = timeline.rows.filter((r) => r.invalid).length;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e0e0e0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          background: "#fafafa",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span style={{ fontWeight: 800, fontSize: 14 }}>期間の全体像</span>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
            時間割の有効期間・学年グループの表示期間・コース別終講日を同じ物差しで
            並べます。設定の変更は下の 2 枚のカードで行います。
          </div>
        </div>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "#555",
          }}
        >
          <input
            type="checkbox"
            checked={showCohorts}
            onChange={(e) => setShowCohorts(e.target.checked)}
            style={{ margin: 0 }}
          />
          コース別終講日も出す
        </label>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {timeline.rows.length === 0 ? (
          <div style={{ fontSize: 12, color: "#888" }}>
            時間割と表示期間を設定すると、ここに期間の帯が並びます。
          </div>
        ) : (
          <>
            {/* 月の目盛り */}
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 4 }}>
              <div style={{ width: LABEL_W, flexShrink: 0 }} />
              <div style={{ position: "relative", flex: 1, height: 14 }}>
                {timeline.ticks.map((t) => (
                  <span
                    key={t.label + t.pos}
                    style={{
                      position: "absolute",
                      left: pct(t.pos),
                      transform: "translateX(-50%)",
                      fontSize: 9,
                      color: "#aaa",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {timeline.rows.map((row) => {
                const tone = TONE[row.kind];
                return (
                  <div
                    key={row.key}
                    style={{ display: "flex", alignItems: "center", gap: 0 }}
                    title={`${row.label}: ${row.startDate || "開始日なし"} 〜 ${
                      row.endDate || "終了日なし"
                    }`}
                  >
                    <div
                      style={{
                        width: LABEL_W,
                        flexShrink: 0,
                        paddingRight: 6,
                        fontSize: 11,
                        fontWeight: row.kind === "cohort" ? 500 : 700,
                        color: tone.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        paddingLeft: row.kind === "cohort" ? 10 : 0,
                      }}
                    >
                      {row.label}
                      <span style={{ color: "#bbb", fontWeight: 400, marginLeft: 4 }}>
                        {row.sub}
                      </span>
                    </div>

                    <div
                      style={{
                        position: "relative",
                        flex: 1,
                        height: row.kind === "cohort" ? 12 : 16,
                        background: "#f5f6f8",
                        borderRadius: 3,
                      }}
                    >
                      {/* 今日 */}
                      {timeline.todayPos != null && (
                        <span
                          style={{
                            position: "absolute",
                            left: pct(timeline.todayPos),
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: "#e06060",
                            opacity: 0.6,
                          }}
                        />
                      )}
                      {/* 表示期間が先に終わっている区間 (時間割はまだ有効) */}
                      {row.uncovered && (
                        <span
                          style={{
                            position: "absolute",
                            left: pct(row.uncovered.left),
                            width: pct(row.uncovered.width),
                            top: 0,
                            bottom: 0,
                            borderRadius: 3,
                            background:
                              "repeating-linear-gradient(45deg, #f0d8a8 0 4px, #fff6e4 4px 8px)",
                            border: "1px solid #e0c080",
                          }}
                          title="時間割はまだ有効ですが、表示期間が終わっているのでコマが出ません"
                        />
                      )}
                      {/* 本体の帯 */}
                      <span
                        style={{
                          position: "absolute",
                          left: pct(row.left),
                          width: pct(row.width),
                          top: 2,
                          bottom: 2,
                          borderRadius: 3,
                          background: row.invalid ? INVALID_BAR : tone.bar,
                          opacity: row.kind === "cohort" ? 0.9 : 1,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 凡例 */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 8,
                fontSize: 10,
                color: "#888",
                alignItems: "center",
              }}
            >
              {Object.entries(TONE).map(([kind, t]) => (
                <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span
                    style={{
                      width: 12,
                      height: 8,
                      borderRadius: 2,
                      background: t.bar,
                      display: "inline-block",
                    }}
                  />
                  {t.label}
                </span>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span
                  style={{
                    width: 12,
                    height: 8,
                    borderRadius: 2,
                    display: "inline-block",
                    background:
                      "repeating-linear-gradient(45deg, #f0d8a8 0 3px, #fff6e4 3px 6px)",
                    border: "1px solid #e0c080",
                  }}
                />
                コマが出ない期間
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 1, height: 10, background: "#e06060", display: "inline-block" }} />
                今日
              </span>
            </div>

            {(uncoveredCount > 0 || invalidCount > 0) && (
              <div style={{ fontSize: 11, color: "#a05a00", marginTop: 8, lineHeight: 1.6 }}>
                {uncoveredCount > 0 && (
                  <div>
                    ⚠ {uncoveredCount} つの学年グループで、時間割はまだ有効なのに表示期間が
                    先に終わっています（斜線の区間はコマが画面に出ません）。期を延ばすなら
                    下の「表示期間設定」で終了日を延ばしてください。
                  </div>
                )}
                {invalidCount > 0 && (
                  <div>
                    ⚠ 期間の指定が矛盾している行が {invalidCount} 件あります（赤い帯）。
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
