import { useMemo } from "react";
import { DEPT_COLOR, sortSlots as sortS } from "../../../data";
import { getDashSections } from "../../../constants/schedule";
import { AbsenceSectionColumn } from "./AbsenceSectionColumn";

// 欠勤組み換え用の 1 日分 3 カラム時間割。
// Dashboard の DashDayRow (閲覧専用) の fork。
// AbsenceSectionColumn を getDashSections(dow) に従って並べる。
//
// props:
//   dow        - 曜日。水/土 は特殊レイアウト
//   slots      - effective slots (absorbed 除外済みを親で filter 済み)
//   renderCard - 個々のスロットカードを描画する関数 (親で draft 状態を保持)
//   onTimeDrop - 時間行にドロップされたとき呼ばれる (slotId, time)
export function AbsenceDashDayRow({ dow, slots, renderCard, onTimeDrop }) {
  const sections = useMemo(() => getDashSections(dow), [dow]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 10,
      }}
    >
      {sections.map((sec) => {
        const secSlots = sortS(slots.filter(sec.filterFn));
        const color =
          sec.color ||
          DEPT_COLOR[sec.dept] ||
          { b: "#e8e8e8", f: "#444", accent: "#888" };
        return (
          <AbsenceSectionColumn
            key={sec.key}
            label={sec.label}
            color={color}
            sl={secSlots}
            renderCard={renderCard}
            onTimeDrop={onTimeDrop}
          />
        );
      })}
    </div>
  );
}
