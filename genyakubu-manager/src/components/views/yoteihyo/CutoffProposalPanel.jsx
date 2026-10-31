// 予定表から終講日 (コース別終講日) を設定する。予定表の講座ごとの最後の
// 授業日を、そのコマのコースの終講日の案として並べ、選んだものをまとめて
// 時間割管理の「コース別 終講日設定」(displayCutoff.cohorts) に書く。
// 案の作り方は utils/yoteihyo/cutoffProposals。書き込み・確認・元に戻すは親。
// 開くまでは案を並べない (ボタン 1 つ)。紙面には出さない (no-print)。

import { useId, useMemo, useState } from "react";
import { S } from "../../../styles/common";
import { colors } from "../../../styles/tokens";
import { courseLabel, dateLabel } from "../../../utils/yoteihyo/labels";
import { END_MARGIN } from "../../../utils/yoteihyo/cutoffProposals";
import { WARN_TEXT } from "./styles";

const td = { padding: "6px 8px", borderBottom: "1px solid #eee", fontSize: 12, verticalAlign: "top" };

export function CutoffProposalPanel({ plan, courses, onApply }) {
  const idBase = useId();
  const [open, setOpen] = useState(false);
  // 選ばない案 (cohortId)。既定は、続きの予定表がありそうな案だけ外す
  const [unchecked, setUnchecked] = useState(null);
  const proposals = useMemo(() => plan?.proposals ?? [], [plan]);
  const off = unchecked ?? new Set(proposals.filter((p) => p.mayContinue).map((p) => p.key));
  const chosen = proposals.filter((p) => !off.has(p.key));
  const toggle = (id) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setUnchecked(next);
  };

  return (
    <section className="no-print" aria-labelledby={`${idBase}-h`} style={{ ...S.panel, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 id={`${idBase}-h`} style={{ fontSize: 14, fontWeight: 800, margin: 0, color: colors.ink }}>
          コース別終講日
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ ...S.btn(false), padding: "3px 12px", fontSize: 12 }}
        >
          {open ? "閉じる" : "予定表から終講日を設定"}
        </button>
        {!open && (
          <span style={{ fontSize: 12, color: colors.inkMuted }}>
            {proposals.length
              ? `予定表の最後の授業日と違うコースが ${proposals.length} 件あります`
              : "どのコースも、終講日は予定表の最後の授業日と同じです"}
          </span>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, margin: "0 0 8px" }}>
            {"予定表の講座ごとの最後の授業日を、その講座のコマのコース (時間割管理の「コース別 終講日設定」) の" +
              "終講日の案にしています。1 つのコースに予定表の講座がいくつか当たるときは、遅い方の日にします。" +
              "今の終講日と同じコースは出していません。"}
          </p>
          {proposals.length === 0 ? (
            <p style={{ fontSize: 12, color: colors.inkMuted, margin: 0 }}>設定する案はありません。</p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      {["設定する", "コース", "今の終講日", "予定表の最後の授業日"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          style={{ ...td, textAlign: "left", fontWeight: 700, color: colors.ink, background: "#f5f5f7" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => (
                      <tr key={p.key}>
                        <td style={td}>
                          <input
                            type="checkbox"
                            checked={!off.has(p.key)}
                            onChange={() => toggle(p.key)}
                            aria-label={`${p.label} の終講日を ${dateLabel(p.proposed)} にする`}
                          />
                        </td>
                        <td style={td}>
                          <div>{p.label}</div>
                          <div style={{ color: colors.inkMuted, fontSize: 11 }}>
                            予定表: {p.courses.map((c) => courseLabel(courses.get(c.key)) || c.key).join("、")}
                          </div>
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {p.current ? (
                            dateLabel(p.current)
                          ) : (
                            <span style={{ color: colors.inkMuted }}>
                              未設定
                              {p.groupDate ? ` (表示期間設定の終了日 ${dateLabel(p.groupDate)})` : ""}
                            </span>
                          )}
                        </td>
                        <td style={td}>
                          <div style={{ fontWeight: 700 }}>{dateLabel(p.proposed)}</div>
                          {p.courses.length > 1 && (
                            <div style={{ color: colors.inkMuted, fontSize: 11 }}>
                              {`講座 ${p.courses.length} つの最後の授業日のうち遅い方 (` +
                                p.courses.map((c) => dateLabel(c.last)).join("・") +
                                ")"}
                            </div>
                          )}
                          {p.mayContinue && (
                            <div style={{ color: WARN_TEXT, fontSize: 11 }}>
                              {`読み込んだ予定表の終わり (${END_MARGIN} 日以内) まで授業があります。` +
                                "この後の予定表で授業が続くかもしれません。"}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onApply(chosen)}
                  disabled={chosen.length === 0}
                  style={{ ...S.btn(true), padding: "4px 12px", fontSize: 12 }}
                >
                  選んだ {chosen.length} コースの終講日を設定
                </button>
                <span style={{ fontSize: 12, color: colors.inkMuted }}>
                  設定した後も、時間割管理の「コース別 終講日設定」で 1 件ずつ直せます。
                </span>
              </div>
            </>
          )}
          {plan?.noCohort?.length > 0 && (
            <p style={{ fontSize: 12, color: colors.inkMuted, lineHeight: 1.7, margin: "8px 0 0" }}>
              {"コースの無いコマの講座 (高1・高2 の英数以外など。表示期間設定の終了日に従います): " +
                plan.noCohort.map((x) => courseLabel(courses.get(x.key)) || x.key).join("、")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
