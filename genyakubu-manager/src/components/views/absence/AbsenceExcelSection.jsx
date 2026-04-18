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

// ─── Absence Excel Section (one table per department) ─────────────
// Dashboard の ExcelSection の欠勤ワークフロー版。
// ドラッグ＆ドロップのターゲットは「セル」で、ドロップ時は時間のみを
// 更新する (学年・クラス・教室は変更しない — 欠勤 move ドラフトの仕様)。
// セルには該当する effective-time のスロットを複数縦スタックして表示する
// (移動衝突時に両方のカードが見えるように)。
export function AbsenceExcelSection({
  label,
  headerColor,
  slots, // effective-time を持つ (s._time | s.time) 可視スロット
  originalSlots, // move ドラフト適用前 — カラム定義に使う
  day,
  sectionFilterFn,
  renderCard,
  onTimeDrop,
  dragState,
  setDragState,
}) {
  // カラム定義は ドラフト非適用の元スロットから生成する。これにより move が
  // 新しい学年/クラス/教室の列を作らない。
  const { gradeGroups } = useMemo(
    () => buildColumnDefs(originalSlots, day, sectionFilterFn),
    [originalSlots, day, sectionFilterFn]
  );

  // このセクションに属する元スロット (colSpan 計算用)
  const sectionOriginalSlots = useMemo(
    () => originalSlots.filter((s) => s.day === day && sectionFilterFn(s)),
    [originalSlots, day, sectionFilterFn]
  );

  // このセクションに属する effective スロット (配置用)
  const sectionEffectiveSlots = useMemo(
    () => slots.filter((s) => s.day === day && sectionFilterFn(s)),
    [slots, day, sectionFilterFn]
  );

  // 時間行: 元の時間 ∪ 移動先の時間。移動先に元々コマがない時間でもドロップ
  // 可能にするため。
  const timeRows = useMemo(() => {
    const times = new Set();
    for (const s of sectionOriginalSlots) times.add(s.time);
    for (const s of sectionEffectiveSlots) {
      const t = s._time || s.time;
      times.add(t);
    }
    return [...times].sort(
      (a, b) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0])
    );
  }, [sectionOriginalSlots, sectionEffectiveSlots]);

  const totalColumns = useMemo(
    () => gradeGroups.reduce((n, g) => n + g.columns.length, 0),
    [gradeGroups]
  );

  const allColumns = useMemo(
    () =>
      gradeGroups.flatMap((g) =>
        g.columns.map((c) => ({ ...c, grade: g.grade }))
      ),
    [gradeGroups]
  );

  if (gradeGroups.length === 0 || timeRows.length === 0) {
    return (
      <div>
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
        </div>
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

  const slotCount = weightedSlotCount(sectionOriginalSlots);

  // セルに入れる effective スロット (複数) を抽出。個別コマのみ。
  const findCardsForCell = (time, grade, cls, room) => {
    return sectionEffectiveSlots.filter((s) => {
      const t = s._time || s.time;
      if (t !== time) return false;
      if (s.grade !== grade) return false;
      if (s.room !== room) return false;
      if (isCombinedCls(s.cls)) return false;
      return classMatchesColumn(s.cls, cls);
    });
  };

  // 合同コマ (cls がレンジ指定) も effective-time の一致で探す
  const findCombinedCardsForCell = (time, grade) => {
    return sectionEffectiveSlots.filter((s) => {
      const t = s._time || s.time;
      return t === time && s.grade === grade && isCombinedCls(s.cls);
    });
  };

  return (
    <div>
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
        <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
          {formatCount(slotCount)}コマ
        </span>
      </div>
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
            {/* Grade header row */}
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
            {/* Class header row */}
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
            {/* Room header row */}
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
              const consumed = new Set();

              // 合同コマ (cls レンジ) を先に確保し colSpan で表示する
              const combinedByGrade = new Map();
              for (const g of gradeGroups) {
                // colSpan の計算は元スロット基準 (列が存在する前提)
                const origCombined = findCombinedSlots(
                  sectionOriginalSlots,
                  day,
                  time,
                  g.grade
                );
                // effective で同じ (cls, room) の合同コマを表示対象にする
                const effCombined = findCombinedCardsForCell(time, g.grade);
                const list = [];
                for (const orig of origCombined) {
                  const effMatches = effCombined.filter(
                    (e) => e.cls === orig.cls && e.room === orig.room
                  );
                  if (effMatches.length > 0) {
                    list.push({ orig, cards: effMatches });
                  }
                }
                // 元スロットと一致しない effective 合同 (移動で入ってきた) も表示
                for (const eff of effCombined) {
                  const already = list.find(
                    (x) => x.orig.cls === eff.cls && x.orig.room === eff.room
                  );
                  if (!already) {
                    list.push({ orig: eff, cards: [eff] });
                  }
                }
                if (list.length > 0) combinedByGrade.set(g.grade, list);
              }

              const combinedCells = []; // { colIdx, span, cards }
              for (const [grade, entries] of combinedByGrade) {
                const gradeColumns =
                  gradeGroups.find((g) => g.grade === grade)?.columns || [];
                for (const entry of entries) {
                  const spanInfo = getCombinedSpan(entry.orig, gradeColumns);
                  if (!spanInfo) continue;
                  let absStart = 0;
                  for (const g of gradeGroups) {
                    if (g.grade === grade) break;
                    absStart += g.columns.length;
                  }
                  const absIdx = absStart + spanInfo.startIdx;
                  combinedCells.push({
                    colIdx: absIdx,
                    span: spanInfo.span,
                    cards: entry.cards,
                  });
                  for (let i = absIdx; i < absIdx + spanInfo.span; i++) {
                    consumed.add(i);
                  }
                }
              }

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
                      if (combined) {
                        const cellKey = `${time}__combined_${colIdx}`;
                        return (
                          <AbsenceExcelCell
                            key={cellKey}
                            cards={combined.cards}
                            colSpan={combined.span}
                            isDragOver={dragState.overCell === cellKey}
                            onDragOver={() =>
                              setDragState((prev) =>
                                prev.overCell === cellKey
                                  ? prev
                                  : { ...prev, overCell: cellKey }
                              )
                            }
                            onDragLeave={() =>
                              setDragState((prev) =>
                                prev.overCell === cellKey
                                  ? { ...prev, overCell: null }
                                  : prev
                              )
                            }
                            onDrop={(slotId) => {
                              setDragState({ draggingId: null, overCell: null });
                              onTimeDrop(slotId, time);
                            }}
                            renderCard={renderCard}
                          />
                        );
                      }
                      return null;
                    }

                    const cards = findCardsForCell(
                      time,
                      col.grade,
                      col.cls,
                      col.room
                    );
                    const cellKey = `${time}_${col.grade}_${col.cls}_${col.room}`;
                    return (
                      <AbsenceExcelCell
                        key={cellKey}
                        cards={cards}
                        colSpan={1}
                        isDragOver={dragState.overCell === cellKey}
                        onDragOver={() =>
                          setDragState((prev) =>
                            prev.overCell === cellKey
                              ? prev
                              : { ...prev, overCell: cellKey }
                          )
                        }
                        onDragLeave={() =>
                          setDragState((prev) =>
                            prev.overCell === cellKey
                              ? { ...prev, overCell: null }
                              : prev
                          )
                        }
                        onDrop={(slotId) => {
                          setDragState({ draggingId: null, overCell: null });
                          onTimeDrop(slotId, time);
                        }}
                        renderCard={renderCard}
                      />
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
