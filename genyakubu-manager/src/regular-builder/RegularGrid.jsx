import { useCallback, useRef, useState } from "react";
import { makeCellKey, tabPeriods } from "./model";
import { splitTeacherField } from "../utils/biweekly";
import { RegularCell } from "./RegularCell";

// ─── スケジュール表 (曜日 × 時限 × クラス) ──────────────────────────
// 講習ビルダーの ScheduleTable と同じ構造の単一テーブル。
// - ヘッダ (クラス列) は sticky で濃紺、曜日・時限列は sticky 左固定
// - 曜日の区切りは濃色の帯 (講習の日付区切りと同じ)
// - セルは RegularCell (科目カラー + プルダウン + D&D 入替 + 矢印移動)
// 「空行を隠す」はセルが 1 つも無い時限行 (と空の曜日) を表示から省く。

// スティッキー列の幅 (講習の COL_WIDTHS と同じ方式で CSS 変数的に使う)
const COL_WIDTHS = {
  compact: { dayCol: "2.75rem", periodCol: "5rem" },
  normal: { dayCol: "3.5rem", periodCol: "7rem" },
};

export function RegularGrid({
  project,
  tab,
  onCellChange,
  onSwapCells,
  conflictsByRef,
  highlightTeacher,
  hideEmptyRows = false,
  isCompact = false,
}) {
  const containerRef = useRef(null);
  const [dragSource, setDragSource] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);

  // セルへ渡すハンドラは恒久的に同一参照にする (RegularCell の memo を
  // 効かせるため)。実体は毎レンダー implRef に差し替え、最新のクロージャ
  // (rows / dragSource など) を参照する。
  const implRef = useRef(null);
  const onNavigate = useCallback((...a) => implRef.current.navigate(...a), []);
  const onDragStart = useCallback((...a) => implRef.current.dragStart(...a), []);
  const onDragOver = useCallback((...a) => implRef.current.dragOver(...a), []);
  const onDragLeave = useCallback((...a) => implRef.current.dragLeave(...a), []);
  const onDrop = useCallback((...a) => implRef.current.drop(...a), []);
  const onDragEnd = useCallback((...a) => implRef.current.dragEnd(...a), []);

  const allPeriods = tabPeriods(project, tab);
  let days = tab.days || [];

  if (days.length === 0 || allPeriods.length === 0 || tab.classes.length === 0) {
    return (
      <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
        「⚙ タブ設定」で曜日・使う時限・クラスを設定するとマス目が表示されます。
      </div>
    );
  }

  // 「空行を隠す」: 曜日ごとに、セルが 1 つも無い時限行を除く。
  // 全行が空の曜日はセクションごと省く (表示のみ、データは不変)。
  const periodsByDay = new Map();
  for (const day of days) {
    const periods = hideEmptyRows
      ? allPeriods.filter((per) =>
          tab.classes.some((cls) => tab.schedule[makeCellKey(day, per.id, cls.id)])
        )
      : allPeriods;
    periodsByDay.set(day, periods);
  }
  if (hideEmptyRows) days = days.filter((d) => periodsByDay.get(d).length > 0);
  if (days.length === 0) {
    return (
      <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
        入力済みのセルがありません（「▤ 空行を隠す」を解除すると全マス目が表示されます）。
      </div>
    );
  }

  // ── D&D 入替 (講習の handleSwapCells 相当) ──────────────────────
  const handleDragStart = (e, key, cell) => {
    if (!cell.subj) {
      e.preventDefault();
      return;
    }
    setDragSource(key);
    // Firefox はデータ項目をセットしないと HTML5 drag を開始しない
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e, targetKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect =
      !dragSource || dragSource === targetKey ? "none" : "move";
    setDragOverKey(targetKey);
  };
  const handleDragLeave = () => setDragOverKey(null);
  const handleDrop = (e, targetKey) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!dragSource || dragSource === targetKey) return;
    onSwapCells(dragSource, targetKey);
    setDragSource(null);
  };
  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverKey(null);
  };

  // ドラッグ中のオートスクロール (講習 N2b と同じ)。掴んだ元と落とし先が
  // 同時に画面内に無くても、コンテナ端に寄せると少しずつスクロールする。
  const handleContainerDragOver = (e) => {
    const el = containerRef.current;
    if (!el || !dragSource) return;
    const EDGE = 56;
    const rect = el.getBoundingClientRect();
    const step = (dist) => Math.ceil((EDGE - dist) / 3);
    if (e.clientY - rect.top < EDGE) el.scrollTop -= step(e.clientY - rect.top);
    else if (rect.bottom - e.clientY < EDGE) el.scrollTop += step(rect.bottom - e.clientY);
    if (e.clientX - rect.left < EDGE) el.scrollLeft -= step(e.clientX - rect.left);
    else if (rect.right - e.clientX < EDGE) el.scrollLeft += step(rect.right - e.clientX);
  };

  // ── 矢印キーでセル間を移動 (講習 E1b の簡易版) ──────────────────
  // 行 = 表示中の (曜日, 時限) を平坦化した並び。↑↓ は行移動、←→ は
  // 教科 ⇄ 講師 ⇄ 隣クラスへ連続移動 (行内は端で wrap)。disabled な
  // 講師 select はスキップして次のフォーカス可能な要素を探す。
  const rows = [];
  for (const day of days) {
    for (const per of periodsByDay.get(day)) rows.push({ day, periodId: per.id });
  }
  const handleNavigate = (e, cellKey, field) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    // 修飾キー付きは select のネイティブ操作 (Alt+↓ など) なので乗っ取らない
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const classes = tab.classes;
    const [day, periodIdStr, classIdStr] = cellKey.split("|");
    let pos = {
      r: rows.findIndex((x) => x.day === day && x.periodId === Number(periodIdStr)),
      c: classes.findIndex((x) => x.id === Number(classIdStr)),
      f: field,
    };
    if (pos.r < 0 || pos.c < 0) return;

    const step = (p) => {
      let { r, c, f } = p;
      if (e.key === "ArrowUp") {
        if (r > 0) r--;
        else return null;
      } else if (e.key === "ArrowDown") {
        if (r < rows.length - 1) r++;
        else return null;
      } else if (e.key === "ArrowLeft") {
        if (f === "teacher") f = "subj";
        else if (c > 0) { c--; f = "teacher"; }
        else { c = classes.length - 1; f = "teacher"; } // 行頭 → 行末へ wrap
      } else if (e.key === "ArrowRight") {
        if (f === "subj") f = "teacher";
        else if (c < classes.length - 1) { c++; f = "subj"; }
        else { c = 0; f = "subj"; } // 行末 → 行頭へ wrap
      }
      return { r, c, f };
    };

    const startKey = `${pos.r}|${pos.c}|${pos.f}`;
    const maxSteps = rows.length * classes.length * 2 + 2;
    for (let i = 0; i < maxSteps; i++) {
      pos = step(pos);
      if (!pos) return; // 端で移動不能 (vertical)
      if (`${pos.r}|${pos.c}|${pos.f}` === startKey) return; // 一周した
      const row = rows[pos.r];
      const cls = tab.classes[pos.c];
      if (!row || !cls) return;
      const el = document.getElementById(
        `regb-${makeCellKey(row.day, row.periodId, cls.id)}-${pos.f}`
      );
      if (el && !el.disabled) {
        el.focus();
        return;
      }
      // 要素が無い / disabled ならスキップして次の候補へ (保険)
    }
  };

  // 最新のクロージャを stable ハンドラから参照できるようにする
  implRef.current = {
    navigate: handleNavigate,
    dragStart: handleDragStart,
    dragOver: handleDragOver,
    dragLeave: handleDragLeave,
    drop: handleDrop,
    dragEnd: handleDragEnd,
  };

  const widths = isCompact ? COL_WIDTHS.compact : COL_WIDTHS.normal;
  const dayColStyle = { left: 0, width: widths.dayCol, minWidth: widths.dayCol };
  const periodColStyle = {
    left: widths.dayCol,
    width: widths.periodCol,
    minWidth: widths.periodCol,
  };

  return (
    <div
      ref={containerRef}
      onDragOver={handleContainerDragOver}
      className={`overflow-auto shadow border border-builder-border max-h-[70vh] bg-builder-bg print-container ${isCompact ? "text-xs" : "text-sm"}`}
    >
      <table className="w-full border-collapse text-left relative" aria-label="通常時間割表">
        <thead className="sticky top-0 z-30 bg-builder-primary text-white shadow-md">
          <tr>
            <th
              scope="col"
              className={`border-r border-builder-primary-hover sticky z-40 bg-builder-primary ${isCompact ? "p-1" : "p-2"}`}
              style={dayColStyle}
            >
              曜日
            </th>
            <th
              scope="col"
              className={`border-r border-builder-primary-hover sticky z-40 bg-builder-primary ${isCompact ? "p-1" : "p-2"}`}
              style={periodColStyle}
            >
              時限
            </th>
            {tab.classes.map((cls) => (
              <th
                key={cls.id}
                scope="col"
                className={`border-r border-builder-primary-hover ${isCompact ? "p-1 min-w-[90px]" : "p-2 min-w-[150px]"}`}
              >
                {cls.label || "(クラス名未設定)"}
                {cls.room && (
                  <span className="font-normal opacity-70 ml-1 text-[11px]">{cls.room}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        {days.map((day, dIdx) => {
          const periods = periodsByDay.get(day);
          return (
            <tbody key={day}>
              {periods.map((per, pIdx) => (
                <tr
                  key={per.id}
                  className="bg-builder-surface border-b border-builder-border hover:bg-builder-bg"
                >
                  {pIdx === 0 && (
                    <th
                      scope="rowgroup"
                      rowSpan={periods.length}
                      className={`font-extrabold align-top text-builder-ink bg-builder-bg border-r border-builder-border sticky z-20 ${isCompact ? "p-1 text-sm" : "p-2 text-base"}`}
                      style={dayColStyle}
                    >
                      {day}
                    </th>
                  )}
                  <th
                    scope="row"
                    className={`font-normal border-r border-builder-border bg-builder-surface-alt text-builder-ink sticky z-10 whitespace-nowrap ${isCompact ? "p-1" : "p-2"}`}
                    style={periodColStyle}
                  >
                    {/* ラベル未設定 (取込直後など) は時刻だけを見出しにする */}
                    {per.label ? (
                      <>
                        <span className="font-bold">{per.label}</span>
                        {per.time && (
                          <div className="text-builder-ink-subtle text-[10px]">{per.time}</div>
                        )}
                      </>
                    ) : (
                      per.time
                    )}
                  </th>
                  {tab.classes.map((cls) => {
                    const key = makeCellKey(day, per.id, cls.id);
                    const cell = tab.schedule[key];
                    const reasons = conflictsByRef.get(`${tab.id}:${key}`);
                    const highlighted =
                      !!highlightTeacher &&
                      splitTeacherField(cell?.teacher).includes(highlightTeacher);
                    return (
                      <RegularCell
                        // タブ / プロジェクトをまたいで同じ cellKey が再利用
                        // されるため、ローカル state (直接入力モード) が別
                        // タブのセルへ残留しないよう id を key に含める
                        key={`${project.id}:${tab.id}:${key}`}
                        cellKey={key}
                        cell={cell}
                        subjects={project.subjects}
                        teachers={project.teachers}
                        conflictText={reasons ? reasons.join("\n") : ""}
                        highlighted={highlighted}
                        dimmed={!!highlightTeacher && !highlighted}
                        roomPlaceholder={cls.room}
                        ariaBase={`${day} ${per.label || per.time} ${cls.label}`}
                        isCompact={isCompact}
                        onCellChange={onCellChange}
                        onNavigate={onNavigate}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onDragEnd={onDragEnd}
                        isDragOver={dragOverKey === key}
                        isDragSource={dragSource === key}
                      />
                    );
                  })}
                </tr>
              ))}
              {dIdx < days.length - 1 && (
                <tr aria-hidden="true" className="bg-builder-ink">
                  <td
                    className="sticky z-20 bg-builder-ink p-0"
                    style={{ ...dayColStyle, height: "6px" }}
                  ></td>
                  <td
                    className="sticky z-10 bg-builder-ink p-0"
                    style={{ ...periodColStyle, height: "6px" }}
                  ></td>
                  <td
                    colSpan={tab.classes.length}
                    className="bg-builder-ink p-0"
                    style={{ height: "6px" }}
                  ></td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
