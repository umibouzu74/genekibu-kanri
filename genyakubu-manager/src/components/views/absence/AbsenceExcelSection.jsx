import { useMemo } from "react";
import { gradeColor as GC, timeToMin } from "../../../data";
import { formatCount, weightedSlotCount } from "../../../utils/biweekly";
import {
  buildColumnDefs,
  classMatchesColumn,
  findCombinedSlots,
  getCombinedSpan,
  isCombinedCls,
  splitTime,
} from "../../../utils/excelGrid";
import { AbsenceExcelCell } from "./AbsenceExcelCell";

// Dashboard の ExcelSection の欠勤ワークフロー版。
// カラム定義は move 適用前の `originalSlots` から作ることで、移動ドラフトが
// 新しい学年・クラス・教室の列を生やさないようにする。ドロップ時は時間のみを
// 更新 — 学年・クラス・教室は変更しない (欠勤 move ドラフトの仕様)。
export function AbsenceExcelSection({
  label,
  headerColor,
  slots,
  originalSlots,
  day,
  sectionFilterFn,
  renderCard,
  onTimeDrop,
}) {
  const { gradeGroups } = useMemo(
    () => buildColumnDefs(originalSlots, day, sectionFilterFn),
    [originalSlots, day, sectionFilterFn]
  );

  const sectionOriginalSlots = useMemo(
    () => originalSlots.filter((s) => s.day === day && sectionFilterFn(s)),
    [originalSlots, day, sectionFilterFn]
  );

  const sectionEffectiveSlots = useMemo(
    () => slots.filter((s) => s.day === day && sectionFilterFn(s)),
    [slots, day, sectionFilterFn]
  );

  // 移動先に元々コマがない時間でもドロップ可能にするため、元時間と移動先時間
  // の両方を時間行に含める。
  const timeRows = useMemo(() => {
    const times = new Set();
    for (const s of sectionOriginalSlots) times.add(s.time);
    for (const s of sectionEffectiveSlots) times.add(s._time || s.time);
    return [...times].sort(
      (a, b) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
    );
  }, [sectionOriginalSlots, sectionEffectiveSlots]);

  const { allColumns, totalColumns } = useMemo(() => {
    const all = gradeGroups.flatMap((g) =>
      g.columns.map((c) => ({ ...c, grade: g.grade }))
    );
    return { allColumns: all, totalColumns: all.length };
  }, [gradeGroups]);

  // 個別コマを (time, grade, cls, room) でバケット化。セル描画を O(1) 参照にする。
  const cardsByCell = useMemo(() => {
    const map = new Map();
    for (const s of sectionEffectiveSlots) {
      if (isCombinedCls(s.cls)) continue;
      const t = s._time || s.time;
      // 合同範囲 "S/AB" などと個別 cls の突き合わせは classMatchesColumn に任せる
      // 必要があるので、ここでは (t, grade, room) でグルーピングしておき、
      // 取得時に cls マッチを最終チェックする。
      const key = `${t}|${s.grade}|${s.room}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = [];
        map.set(key, bucket);
      }
      bucket.push(s);
    }
    return map;
  }, [sectionEffectiveSlots]);

  // 合同コマ (cls がレンジ指定) は colSpan で表示する。
  // 時間×学年ごとに「元スロット (colSpan 計算用)」「表示用 effective スロット」
  // の対応を先に全時間行ぶん構築し、row ループ中のループ回数を減らす。
  const combinedByTime = useMemo(() => {
    const effCombinedByTimeGrade = new Map();
    for (const s of sectionEffectiveSlots) {
      if (!isCombinedCls(s.cls)) continue;
      const t = s._time || s.time;
      const key = `${t}|${s.grade}`;
      let bucket = effCombinedByTimeGrade.get(key);
      if (!bucket) {
        bucket = [];
        effCombinedByTimeGrade.set(key, bucket);
      }
      bucket.push(s);
    }

    const byTime = new Map();
    for (const time of timeRows) {
      const cells = []; // { colIdx, span, cards }
      const consumed = new Set();
      for (const g of gradeGroups) {
        const origCombined = findCombinedSlots(
          sectionOriginalSlots,
          day,
          time,
          g.grade
        );
        const effCombined =
          effCombinedByTimeGrade.get(`${time}|${g.grade}`) || [];
        const effMatched = new Set();

        const entries = [];
        for (const orig of origCombined) {
          const cards = effCombined.filter(
            (e) => e.cls === orig.cls && e.room === orig.room
          );
          if (cards.length > 0) {
            entries.push({ orig, cards });
            cards.forEach((c) => effMatched.add(c.id));
          }
        }
        // 移動で入ってきた合同コマ (元位置に対応スロットが無い)
        for (const eff of effCombined) {
          if (effMatched.has(eff.id)) continue;
          entries.push({ orig: eff, cards: [eff] });
        }

        let absStart = 0;
        for (const gg of gradeGroups) {
          if (gg.grade === g.grade) break;
          absStart += gg.columns.length;
        }
        for (const entry of entries) {
          const spanInfo = getCombinedSpan(entry.orig, g.columns);
          if (!spanInfo) continue;
          const colIdx = absStart + spanInfo.startIdx;
          cells.push({ colIdx, span: spanInfo.span, cards: entry.cards });
          for (let i = colIdx; i < colIdx + spanInfo.span; i++) {
            consumed.add(i);
          }
        }
      }
      byTime.set(time, { cells, consumed });
    }
    return byTime;
  }, [
    timeRows,
    gradeGroups,
    sectionEffectiveSlots,
    sectionOriginalSlots,
    day,
  ]);

  const sectionHeader = (
    <div
      style={{
        background: headerColor,
        color: "#fff",
        padding: "6px 14px",
        borderRadius: "8px 8px 0 0",
        fontWeight: 800,
        fontSize: 13,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{label}</span>
      {sectionOriginalSlots.length > 0 && (
        <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
          {formatCount(weightedSlotCount(sectionOriginalSlots))}コマ
        </span>
      )}
    </div>
  );

  if (gradeGroups.length === 0 || timeRows.length === 0) {
    return (
      <div>
        {sectionHeader}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderTop: "none",
            borderRadius: "0 0 8px 8px",
            padding: 20,
            color: "#bbb",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          授業なし
        </div>
      </div>
    );
  }

  const getCardsForCell = (time, grade, cls, room) => {
    const bucket = cardsByCell.get(`${time}|${grade}|${room}`);
    if (!bucket) return [];
    return bucket.filter((s) => classMatchesColumn(s.cls, cls));
  };

  const renderCellAt = (cellKey, time, cards, colSpan) => (
    <AbsenceExcelCell
      key={cellKey}
      cards={cards}
      colSpan={colSpan}
      renderCard={renderCard}
      onDrop={(slotId) => onTimeDrop(slotId, time)}
    />
  );

  return (
    <div>
      {sectionHeader}
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #ccc",
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 13,
            width: "100%",
            minWidth: totalColumns * 120 + 80,
          }}
        >
          <thead>
            <tr>
              <th
                rowSpan={3}
                style={{
                  background: "#f5f5f5",
                  border: "1px solid #ccc",
                  padding: "4px 8px",
                  fontWeight: 700,
                  fontSize: 11,
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  minWidth: 70,
                  textAlign: "center",
                  verticalAlign: "middle",
                }}
              >
                時間
              </th>
              {gradeGroups.map((g) => {
                const gc = GC(g.grade);
                return (
                  <th
                    key={g.grade}
                    colSpan={g.columns.length}
                    style={{
                      background: gc.b,
                      color: gc.f,
                      border: "1px solid #ccc",
                      padding: "6px 8px",
                      fontSize: 14,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    {g.grade}
                  </th>
                );
              })}
            </tr>
            <tr>
              {allColumns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    background: "#f0f0f0",
                    border: "1px solid #ccc",
                    padding: "3px 6px",
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: "center",
                  }}
                >
                  {col.cls === "-" ? "−" : col.cls}
                </th>
              ))}
            </tr>
            <tr>
              {allColumns.map((col) => (
                <th
                  key={col.key + "_room"}
                  style={{
                    background: "#fafafa",
                    border: "1px solid #ccc",
                    padding: "2px 6px",
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  {col.room}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeRows.map((time) => {
              const tp = splitTime(time);
              const { cells: combinedCells, consumed } = combinedByTime.get(
                time
              ) || { cells: [], consumed: new Set() };

              return (
                <tr key={time}>
                  <td
                    style={{
                      background: "#f8f8f8",
                      border: "1px solid #ccc",
                      padding: "4px 6px",
                      fontWeight: 700,
                      fontSize: 11,
                      textAlign: "center",
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      whiteSpace: "nowrap",
                      lineHeight: 1.5,
                    }}
                  >
                    {tp.start}
                    <br />
                    <span style={{ fontSize: 9, color: "#999" }}>〜</span>
                    <br />
                    {tp.end}
                  </td>
                  {allColumns.map((col, colIdx) => {
                    if (consumed.has(colIdx)) {
                      const combined = combinedCells.find(
                        (c) => c.colIdx === colIdx
                      );
                      if (!combined) return null;
                      return renderCellAt(
                        `${time}__combined_${colIdx}`,
                        time,
                        combined.cards,
                        combined.span
                      );
                    }
                    const cards = getCardsForCell(
                      time,
                      col.grade,
                      col.cls,
                      col.room
                    );
                    return renderCellAt(
                      `${time}_${col.grade}_${col.cls}_${col.room}`,
                      time,
                      cards,
                      1
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
