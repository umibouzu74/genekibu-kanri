import { useCallback, useEffect, useRef, useState } from "react";
import { makeCellKey, makeCellRef, parseCellKey, parseCellRef } from "./model";
import { computeBusyTeachers } from "./conflicts";
import { splitTeacherField } from "../utils/biweekly";
import { gradeColor } from "../constants/colors";
import { RegularCell } from "./RegularCell";

// ─── スケジュール表 (選択曜日 × 全学年一覧) ─────────────────────────
// ダッシュボードの時間割ビューと同じレイアウト: 1 つの曜日について、
// 行 = 時限 (時刻順)、列 = 学年グループ (gradeColor のヘッダ) × クラス。
// すべての学年を横に並べるので、学年横断の講師のやりくりを見ながら組める。
//
// - その学年が使わない時限のマスはグレーで塞ぐ (設定は学年チップから)
// - セルは display-first (テキスト表示、クリックで編集)。D&D は学年を
//   またいだ入替もできる (swapCellsAcrossTabs)
// - 「空行を隠す」はセルが 1 つも無い時限行を表示から省く (データ不変)

// 時刻 "HH:MM-..." の開始分。パース不能 (時刻未設定) は末尾送り
const startMin = (time) => {
  const m = /^(\d{1,2}):(\d{2})/.exec((time || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

// 学年グループの境目に引く縦の区切り罫
const GROUP_BOUNDARY = "border-l-2 border-l-builder-ink-muted";

export function RegularGrid({
  project,
  day,
  onCellChange,
  onClearCell,
  onSwapCells,
  conflictsByRef,
  highlightTeacher,
  hideEmptyRows = false,
  isCompact = false,
}) {
  const containerRef = useRef(null);
  const [dragSource, setDragSource] = useState(null);
  const [dragOverRef, setDragOverRef] = useState(null);

  // display-first 編集: 編集中セルは常に 1 つ (null = 全セル表示モード)。
  // フォーカスは「編集開始 → 編集セルの select」「Enter/Escape で終了 →
  // 表示セル (td)」へ、レンダー後に pendingFocusRef 経由で移す。
  const [editRef, setEditRef] = useState(null);
  const pendingFocusRef = useRef(null);
  useEffect(() => {
    const p = pendingFocusRef.current;
    if (!p) return;
    pendingFocusRef.current = null;
    document.getElementById(`regb-${p.ref}-${p.field}`)?.focus();
  });

  const onStartEdit = useCallback((ref, field = "subj") => {
    pendingFocusRef.current = { ref, field };
    setEditRef(ref);
  }, []);
  const onEndEdit = useCallback((ref, refocus) => {
    if (refocus && ref) pendingFocusRef.current = { ref, field: "cell" };
    setEditRef(null);
  }, []);

  // プロジェクト / 曜日を切り替えたら編集状態は持ち越さない
  useEffect(() => {
    setEditRef(null);
    pendingFocusRef.current = null;
  }, [project.id, day]);

  // セルへ渡すハンドラは恒久的に同一参照にする (RegularCell の memo を
  // 効かせるため)。実体は毎レンダー implRef に差し替え、最新のクロージャ
  // (periods / cols / dragSource など) を参照する。
  const implRef = useRef(null);
  const onNavigate = useCallback((...a) => implRef.current.navigate(...a), []);
  const onDragStart = useCallback((...a) => implRef.current.dragStart(...a), []);
  const onDragOver = useCallback((...a) => implRef.current.dragOver(...a), []);
  const onDragLeave = useCallback((...a) => implRef.current.dragLeave(...a), []);
  const onDrop = useCallback((...a) => implRef.current.drop(...a), []);
  const onDragEnd = useCallback((...a) => implRef.current.dragEnd(...a), []);

  // この曜日を使う学年 (クラス・時限が設定済みのもの)
  const dayTabs = (project.tabs || []).filter(
    (t) =>
      (t.days || []).includes(day) &&
      (t.classes || []).length > 0 &&
      (t.periodIds || []).length > 0
  );
  if (dayTabs.length === 0) {
    return (
      <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
        {day}曜日を使う学年がありません。学年チップから曜日・使う時限・クラスを設定してください。
      </div>
    );
  }

  // 行 = この曜日で使われる時限の合併 (時刻順、時刻なしは末尾にプール順)
  const usedIds = new Set(dayTabs.flatMap((t) => t.periodIds));
  let periods = project.periods
    .filter((p) => usedIds.has(p.id))
    .map((p, i) => ({ p, i }))
    .sort((x, y) => startMin(x.p.time) - startMin(y.p.time) || x.i - y.i)
    .map((x) => x.p);

  if (hideEmptyRows) {
    periods = periods.filter((per) =>
      dayTabs.some(
        (t) =>
          t.periodIds.includes(per.id) &&
          t.classes.some((cls) => t.schedule[makeCellKey(day, per.id, cls.id)])
      )
    );
    if (periods.length === 0) {
      return (
        <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
          入力済みのセルがありません（「▤ 空行を隠す」を解除すると全マス目が表示されます）。
        </div>
      );
    }
  }

  // 列 = 学年ごとのクラスを平坦化 (groupStart = 学年グループの先頭列)
  const cols = dayTabs.flatMap((t) =>
    t.classes.map((cls, ci) => ({ tab: t, cls, groupStart: ci === 0 }))
  );
  const available = (per, col) => col.tab.periodIds.includes(per.id);

  // 講師プルダウンの「(重複)」予告用: 学年ごとの同時間帯・割当済み講師
  const busyByTab = new Map(dayTabs.map((t) => [t.id, computeBusyTeachers(project, t)]));

  // ── D&D 入替 (学年をまたいだ入替も可) ───────────────────────────
  const handleDragStart = (e, ref, cell) => {
    if (!cell.subj) {
      e.preventDefault();
      return;
    }
    setDragSource(ref);
    // Firefox はデータ項目をセットしないと HTML5 drag を開始しない
    e.dataTransfer.setData("text/plain", ref);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e, targetRef) => {
    e.preventDefault();
    e.dataTransfer.dropEffect =
      !dragSource || dragSource === targetRef ? "none" : "move";
    setDragOverRef(targetRef);
  };
  const handleDragLeave = () => setDragOverRef(null);
  const handleDrop = (e, targetRef) => {
    e.preventDefault();
    setDragOverRef(null);
    if (!dragSource || dragSource === targetRef) return;
    onSwapCells(dragSource, targetRef);
    setDragSource(null);
  };
  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverRef(null);
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

  // ── 矢印キーでセル間を移動 ──────────────────────────────────────
  // 行 = 時限、列 = 全学年のクラスを平坦化した並び。↑↓ は行移動、←→ は
  // 教科 ⇄ 講師 ⇄ 隣クラス (学年をまたいで連続、行内は端で wrap)。
  // その学年が使わない時限のマス (グレー) はスキップして同方向へ進む。
  // 編集中は移動先セルが自動で編集モードに入る。表示セル (field="cell")
  // では td のフォーカス移動になる。
  const handleNavigate = (e, cellRef, field) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    // 修飾キー付きは select のネイティブ操作 (Alt+↓ など) なので乗っ取らない
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const { tabId, key } = parseCellRef(cellRef);
    const { periodId, classId } = parseCellKey(key);
    let r = periods.findIndex((p) => p.id === periodId);
    let c = cols.findIndex((x) => x.tab.id === tabId && x.cls.id === classId);
    let f = field;
    if (r < 0 || c < 0) return;

    const step = () => {
      if (e.key === "ArrowUp") {
        if (r > 0) r--;
        else return false; // 上端
      } else if (e.key === "ArrowDown") {
        if (r < periods.length - 1) r++;
        else return false; // 下端
      } else if (e.key === "ArrowLeft") {
        if (f === "teacher") f = "subj";
        else {
          c = c > 0 ? c - 1 : cols.length - 1; // 行頭 → 行末へ wrap
          if (f === "subj") f = "teacher";
        }
      } else if (e.key === "ArrowRight") {
        if (f === "subj") f = "teacher";
        else {
          c = c < cols.length - 1 ? c + 1 : 0; // 行末 → 行頭へ wrap
          if (f === "teacher") f = "subj";
        }
      }
      return true;
    };

    const start = `${r}|${c}|${f}`;
    const maxSteps = periods.length * cols.length * 2 + 2;
    for (let i = 0; i < maxSteps; i++) {
      if (!step()) return;
      if (`${r}|${c}|${f}` === start) return; // 一周した
      const per = periods[r];
      const col = cols[c];
      if (!per || !col) return;
      if (!available(per, col)) continue; // 使えないマスはスキップ
      const targetRef = makeCellRef(col.tab.id, makeCellKey(day, per.id, col.cls.id));
      if (f === "cell") {
        document.getElementById(`regb-${targetRef}-cell`)?.focus();
      } else {
        // 編集対象を移す (表示セルの select はまだ DOM に無いため、編集開始
        // → レンダー後に pendingFocusRef が該当 select へフォーカスする)
        onStartEdit(targetRef, f);
      }
      return;
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

  const periodColW = isCompact ? "5rem" : "7rem";
  const periodColStyle = { left: 0, width: periodColW, minWidth: periodColW };

  return (
    <div
      ref={containerRef}
      onDragOver={handleContainerDragOver}
      className={`overflow-auto shadow border border-builder-border max-h-[75vh] bg-builder-bg print-container ${isCompact ? "text-xs" : "text-sm"}`}
    >
      <table className="w-full border-collapse text-left relative" aria-label="通常時間割表">
        <thead className="sticky top-0 z-30 shadow-md">
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={`bg-builder-primary text-white sticky z-40 border-r border-builder-primary-hover align-middle ${isCompact ? "p-1" : "p-2"}`}
              style={periodColStyle}
            >
              時限
            </th>
            {dayTabs.map((t, ti) => {
              const gc = gradeColor(t.grade || t.name);
              return (
                <th
                  key={t.id}
                  scope="colgroup"
                  colSpan={t.classes.length}
                  className={`border-r border-builder-border text-center font-extrabold ${isCompact ? "p-0.5 text-[11px]" : "p-1.5 text-sm"} ${ti > 0 ? GROUP_BOUNDARY : ""}`}
                  style={{ background: gc.b, color: gc.f }}
                >
                  {t.name}
                </th>
              );
            })}
          </tr>
          <tr>
            {cols.map((col, i) => (
              <th
                key={`${col.tab.id}-${col.cls.id}`}
                scope="col"
                className={`bg-builder-surface-alt text-builder-ink border-r border-b border-builder-border font-bold ${isCompact ? "p-0.5 text-[10px] min-w-[80px]" : "p-1 text-xs min-w-[130px]"} ${col.groupStart && i > 0 ? GROUP_BOUNDARY : ""}`}
              >
                {col.cls.label || "(クラス名未設定)"}
                {/* クラス名がそのまま教室名の列 (亀21 等) は二重表示しない */}
                {col.cls.room && col.cls.room !== col.cls.label && (
                  <span className="font-normal text-builder-ink-subtle ml-1">
                    {col.cls.room}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        {/* builder-day-group は印刷スタイル (printStyle.js) の改ページ制御対象 */}
        <tbody className="builder-day-group">
          {periods.map((per) => (
            <tr key={per.id} className="bg-builder-surface border-b border-builder-border">
              <th
                scope="row"
                className={`font-normal border-r border-builder-border bg-builder-surface-alt text-builder-ink sticky z-10 whitespace-nowrap align-top ${isCompact ? "p-1" : "p-2"}`}
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
              {cols.map((col, i) => {
                const boundary = col.groupStart && i > 0 ? GROUP_BOUNDARY : "";
                if (!available(per, col)) {
                  // この学年が使わない時限 (時刻体系の違い) はグレーで塞ぐ
                  return (
                    <td
                      key={`${col.tab.id}-${col.cls.id}`}
                      aria-hidden="true"
                      className={`border-r border-builder-border last:border-r-0 bg-builder-bg ${boundary}`}
                    />
                  );
                }
                const key = makeCellKey(day, per.id, col.cls.id);
                const ref = makeCellRef(col.tab.id, key);
                const cell = col.tab.schedule[key];
                const reasons = conflictsByRef.get(ref);
                const highlighted =
                  !!highlightTeacher &&
                  splitTeacherField(cell?.teacher).includes(highlightTeacher);
                return (
                  <RegularCell
                    // プロジェクトをまたいで同じ ref が再利用されないよう
                    // key に project.id も含める (直接入力モードの残留防止)
                    key={`${project.id}:${ref}`}
                    cellRef={ref}
                    cell={cell}
                    subjects={project.subjects}
                    teachers={project.teachers}
                    conflictText={reasons ? reasons.join("\n") : ""}
                    // "·" 区切りの文字列で渡す (配列だと毎レンダー新参照に
                    // なり memo が効かない。値が同じなら文字列は等価)
                    busyTeachers={(busyByTab.get(col.tab.id)?.get(key) || []).join("·")}
                    highlighted={highlighted}
                    dimmed={!!highlightTeacher && !highlighted}
                    roomPlaceholder={col.cls.room}
                    ariaBase={`${day} ${per.label || per.time} ${col.tab.name} ${col.cls.label}`}
                    tdExtra={boundary}
                    isCompact={isCompact}
                    isEditing={editRef === ref}
                    onStartEdit={onStartEdit}
                    onEndEdit={onEndEdit}
                    onCellChange={onCellChange}
                    onClearCell={onClearCell}
                    onNavigate={onNavigate}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    isDragOver={dragOverRef === ref}
                    isDragSource={dragSource === ref}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
