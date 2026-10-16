// 予定表の第N回とシステムの第N回の食い違い (compare.compareSessionNumbers)。
// 中学部の「☆14」(プレップ)・「★12」(内申対策)、高校部のマークテストの「⑯」のように、
// 予定表が回数を書いている講座のうち、システムの回数のカウンタが 1 本のものだけ。
// 直すのは回数の数え方の設定 (授業セットの「日数カウント」・コマの「数え始め」・
// 回数補正) なので、この画面からは書き換えない (どれで直すかの案内だけ出す)。

import { colors } from "../../../styles/tokens";
import { courseLabel, dateLabel } from "../../../utils/yoteihyo/labels";
import { WARN_TEXT } from "./styles";

const HINTS = {
  perDay:
    "同じ日に同じ授業が 2 コマあり、システムでは 1 日に 2 回進んでいます。時間割管理 → 授業セットでこのコースを" +
    "セットに登録し「日数カウント」にチェックを入れると、1 日 1 回で数えます。",
  offset:
    "ずっと同じだけずれています。コマの編集の「回数・実施日」→「数え始め」か、回数補正 (欠勤組み換えでコマを" +
    "右クリック →「回数」) で合わせてください。",
  other:
    "途中からずれています。その日の前後の休講・振替の登録、回数補正、不定期のコマの実施日 (コマの編集の" +
    "「回数・実施日」) を確かめてください。",
};

const nos = (list) => `第${list.join("・")}回`;

export function SessionNumberPanel({ items, courses, panelStyle, headingStyle }) {
  if (!items?.length) return null;
  return (
    <section className="no-print" aria-label="第N回の食い違い" style={panelStyle}>
      <h2 style={{ ...headingStyle, color: WARN_TEXT }}>⚠ 第N回の食い違い ({items.length} 講座)</h2>
      <p style={{ fontSize: 12, color: colors.inkMuted, margin: "0 0 8px" }}>
        予定表に書かれた回数と、システムの「第N回」が合わない講座です。この画面からは書き換えません。
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
        {items.map((it) => {
          const course = courses.get(it.courseKey);
          const sym = course?.symbol || "";
          return (
            <li key={it.courseKey} style={{ marginBottom: 6 }}>
              <b>{courseLabel(course)}</b>
              {`: ${dateLabel(it.first.date)} は予定表 ${sym}${it.first.sheetNo}、システム ${nos(it.first.systemNos)}`}
              {it.count > 1 &&
                ` (比べた ${it.compared} 日のうち ${it.count} 日が合いません。最後は ${dateLabel(it.last.date)}: ` +
                  `予定表 ${sym}${it.last.sheetNo}、システム ${nos(it.last.systemNos)})`}
              <div style={{ fontSize: 12, color: colors.inkMuted }}>{HINTS[it.hint || "other"]}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
