import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeSections,
  makeCellKey,
  makeCellRef,
  parseCellKey,
  parseCellRef,
} from "./model";
import {
  computeMergeLayout,
  mergeFallback,
  splitSpan,
  visibleClassesForDay,
} from "./mergedColumns";
import {
  computeBusyTeachersForTabs,
  computeNgTeachersForTabs,
} from "./conflicts";
import { splitTeacherField } from "../utils/biweekly";
import { useLongPress } from "../timetable-builder/hooks/useLongPress";
import { DEPT_COLOR, gradeColor } from "../constants/colors";
import { RegularCell } from "./RegularCell";

// ─── スケジュール表 (選択曜日 × セクション別テーブル) ────────────────
// ダッシュボードの時間割ビューと同じ構図: 1 つの曜日について、時間軸を
// 共有する学年のまとまり (セクション = computeSections) ごとに小さな
// テーブルを作り、2 カラムに流し込む。各セクションは自分の時限だけを
// 行に持つので、時刻体系の違う学年同士で空行が乱立しない。
//
// - セクション見出しは部の色 (DEPT_COLOR)、学年グループは gradeColor
// - セルは display-first (テキスト表示、クリックで編集)。D&D は
//   セクション・学年をまたいだ入替もできる (swapCellsAcrossTabs)
// - 矢印キーの移動はセクション内で完結 (行 = 時限、列 = 学年×クラス)
// - 「空行・空列を隠す」(hideEmpty) はセルが 1 つも無い時限行と
//   クラス列を省き、空になった学年・セクションごと隠す (データ不変)
// - 「亀井町を分ける」(splitCampus) は本校と亀井町 (教室「亀◯◯」) の
//   クラス列を別セクションに分け、時限もそれぞれの建物が使うものに絞る
//   (computeSections の splitCampus オプション。データ不変)

// 時刻 "HH:MM-..." の開始分。パース不能 (時刻未設定) は末尾送り
const startMin = (time) => {
  const m = /^(\d{1,2}):(\d{2})/.exec((time || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

// 学年グループの境目に引く縦の区切り罫
const GROUP_BOUNDARY = "border-l-2 border-l-builder-ink-muted";

// 右クリック / 長押しでヘッダの一括操作メニューを開ける th。
// useLongPress は hook なのでループ内の th には直接使えず、小さな
// コンポーネントに切り出す (講習はヘッダをコンポーネント化して対応)
function MenuTh({ onOpenMenu, title, className, children, ...rest }) {
  const longPress = useLongPress(onOpenMenu || null);
  const extra = onOpenMenu
    ? {
        ...longPress,
        onContextMenu: (e) => {
          e.preventDefault();
          onOpenMenu({ clientX: e.clientX, clientY: e.clientY });
        },
        title: title ? `${title}\n右クリックで一括操作` : "右クリックで一括操作",
      }
    : { title };
  return (
    <th {...rest} {...extra} className={className}>
      {children}
    </th>
  );
}

// セクション見出しの配色: 全学年が高校系なら高校部、全て中学系なら
// 中学部 (附属含む)、混在は中立色
const sectionTone = (tabs) => {
  const grades = tabs.map((t) => t.grade || t.name);
  const isHigh = (g) => g.includes("高");
  if (grades.every(isHigh)) return DEPT_COLOR["高校部"];
  if (grades.every((g) => !isHigh(g))) return DEPT_COLOR["中学部"];
  return { b: "#e8e8e8", f: "#444444", accent: "#607080" };
};

export function RegularGrid({
  project,
  day,
  onCellChange,
  onClearCell,
  onSwapCells,
  conflictsByRef,
  /** 未承認の問題が NG のみのセル (バッジを ⚠️NG にする) */
  ngOnlyRefs = null,
  highlightTeacher,
  hideEmpty = false,
  splitCampus = false,
  isCompact = false,
  /** {day, refs, nonce}: 該当セルへスクロールして一時ハイライトする要求 */
  jumpTarget = null,
  /** セルのコンテキストメニューを開く (pos, ref) */
  onOpenCellMenu = null,
  /** ヘッダ (時限行・クラス列) の一括操作メニューを開く (pos, payload) */
  onOpenHeaderMenu = null,
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

  // セクションの折りたたみ (見出しバーのクリックで開閉)。表示のみで
  // データは不変。印刷時は畳んでいても展開して刷る
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());
  useEffect(() => {
    setCollapsedKeys(new Set());
  }, [project.id]);
  const toggleCollapse = (key) =>
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ── 重複ジャンプ / Undo フィードバックのフラッシュ表示 ──────────
  // jumpTarget が来たら対象セルを含む折りたたみ中セクションを展開し、
  // レンダー後に先頭セルへスクロール、対象セルを一時ハイライトする。
  // 列 → セクションの対応はレンダー中に sectionKeyByColRef へ記録しておく
  // (implRef と同じ「最新クロージャ参照」パターン)。ref は曜日を含むため、
  // 曜日切替後に残ったフラッシュが別曜日のセルに当たることはない。
  const [flashRefs, setFlashRefs] = useState([]);
  const sectionKeyByColRef = useRef(new Map());
  useEffect(() => {
    if (!jumpTarget || jumpTarget.day !== day) return undefined;
    const refs = jumpTarget.refs || [];
    if (refs.length === 0) return undefined;
    setCollapsedKeys((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const r of refs) {
        const { tabId, key } = parseCellRef(r);
        const { classId } = parseCellKey(key);
        const sk = sectionKeyByColRef.current.get(`${tabId}:${classId}`);
        if (sk && next.has(sk)) {
          next.delete(sk);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setFlashRefs(refs);
    // 展開・曜日切替のレンダーが反映されてからスクロール
    const t1 = setTimeout(() => {
      document
        .getElementById(`regb-${refs[0]}-cell`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, 80);
    const t2 = setTimeout(() => setFlashRefs([]), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [jumpTarget, day]);

  // セルへ渡すハンドラは恒久的に同一参照にする (RegularCell の memo を
  // 効かせるため)。実体は毎レンダー implRef に差し替え、最新のクロージャ
  // (sections / dragSource など) を参照する。
  const implRef = useRef(null);
  const onNavigate = useCallback((...a) => implRef.current.navigate(...a), []);
  const onDragStart = useCallback((...a) => implRef.current.dragStart(...a), []);
  const onDragOver = useCallback((...a) => implRef.current.dragOver(...a), []);
  const onDragLeave = useCallback((...a) => implRef.current.dragLeave(...a), []);
  const onDrop = useCallback((...a) => implRef.current.drop(...a), []);
  const onDragEnd = useCallback((...a) => implRef.current.dragEnd(...a), []);
  const onOpenMenu = useCallback((...a) => implRef.current.openMenu(...a), []);

  // ── セクション構築 (時限・列・コマ数を確定) ─────────────────────
  const rawSections = computeSections(project, day, { splitCampus });
  if (rawSections.length === 0) {
    return (
      <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
        {day}曜日を使う学年がありません。学年チップから曜日・使う時限・クラスを設定してください。
      </div>
    );
  }

  const sections = rawSections
    .map((s) => {
      // 空列を隠す: この曜日にセルが 1 つも無いクラス列を落とす (合同列の
      // 構成クラスは残す)。列が全部消えた学年はこの曜日の表から外す
      const tabs = hideEmpty
        ? s.tabs
            .map((t) => ({ ...t, classes: visibleClassesForDay(t, day) }))
            .filter((t) => t.classes.length > 0)
        : s.tabs;
      const usedIds = new Set(tabs.flatMap((t) => t.periodIds));
      let periods = project.periods
        .filter((p) => usedIds.has(p.id))
        .map((p, i) => ({ p, i }))
        .sort((x, y) => startMin(x.p.time) - startMin(y.p.time) || x.i - y.i)
        .map((x) => x.p);
      if (hideEmpty) {
        periods = periods.filter((per) =>
          tabs.some(
            (t) =>
              t.periodIds.includes(per.id) &&
              t.classes.some((cls) => t.schedule[makeCellKey(day, per.id, cls.id)])
          )
        );
      }
      // 合同列 (S〜B 等) のセル結合レイアウト。結合表示できないデータの
      // 学年は fallback = true (従来の独立列表示)
      const tabLayouts = new Map();
      for (const t of tabs) {
        const layout = computeMergeLayout(t);
        tabLayouts.set(t.id, {
          ...layout,
          fallback: mergeFallback(t, day, periods, layout),
        });
      }
      // 矢印ナビ用の列の通し並び (範囲列も含む — 結合セルへ移動できるように)
      const cols = tabs.flatMap((t) => {
        const lay = tabLayouts.get(t.id);
        const rangeIds = lay.fallback
          ? new Set()
          : new Set(lay.ranges.map((r) => r.cls.id));
        return t.classes.map((cls) => ({ tab: t, cls, isRange: rangeIds.has(cls.id) }));
      });
      const cellCount = tabs.reduce(
        (n, t) =>
          n +
          Object.keys(t.schedule).filter((k) => {
            const pos = parseCellKey(k);
            return (
              pos.day === day &&
              t.periodIds.includes(pos.periodId) &&
              t.classes.some((c) => c.id === pos.classId)
            );
          }).length,
        0
      );
      return { ...s, tabs, periods, cols, tabLayouts, cellCount, tone: sectionTone(tabs) };
    })
    .filter((s) => s.tabs.length > 0 && s.periods.length > 0);
  if (sections.length === 0) {
    return (
      <div className="text-xs text-builder-ink-subtle px-1.5 py-4">
        入力済みのセルがありません（「▤ 空行・空列を隠す」を解除すると全マス目が表示されます）。
      </div>
    );
  }

  const available = (per, tab) => tab.periodIds.includes(per.id);

  // ジャンプ効果が「どのセクションを展開すべきか」を引けるように、
  // 列 (tabId:classId) → セクション key をレンダーのたびに記録する
  sectionKeyByColRef.current = new Map();
  for (const s of sections) {
    for (const t of s.tabs) {
      for (const c of t.classes) {
        sectionKeyByColRef.current.set(`${t.id}:${c.id}`, s.key);
      }
    }
  }

  // ── ヘッダの一括操作メニュー (時限行 / クラス列) ─────────────────
  // refs は「そのヘッダ配下の全マス」。中身の有無は App 側で絞る
  const openRowMenu = (pos, s, per) => {
    if (!onOpenHeaderMenu) return;
    const refs = [];
    for (const t of s.tabs) {
      if (!available(per, t)) continue;
      for (const cls of t.classes) {
        refs.push(makeCellRef(t.id, makeCellKey(day, per.id, cls.id)));
      }
    }
    onOpenHeaderMenu(pos, {
      kind: "bulk",
      label: `${day}曜 ${per.label || per.time}（${s.name}）`,
      refs,
    });
  };
  const openColMenu = (pos, t, cls2) => {
    if (!onOpenHeaderMenu) return;
    // クラス名の無い列 (取込した高校の講座列など) は列見出しと同じく教室名で呼ぶ
    const colName = [t.name, cls2.label || cls2.room].filter(Boolean).join(" ");
    onOpenHeaderMenu(pos, {
      kind: "bulk",
      label: `${colName}（${day}曜）`,
      refs: (t.periodIds || []).map((pid) =>
        makeCellRef(t.id, makeCellKey(day, pid, cls2.id))
      ),
    });
  };

  // 講師プルダウンの「(重複)」予告用: 学年ごとの同時間帯・割当済み講師
  // (全セルの解決は 1 回で済む一括版を使う)。セクションの tabs は
  // 建物分割・空列非表示で加工した仮想タブなので、元のタブで計算する
  // (busyByTab は tab.id キー — 分割で同じ id が 2 回現れると上書きされ、
  // 片方の建物のセルから重複予告が消えてしまう)
  const sectionTabIds = new Set(sections.flatMap((s) => s.tabs.map((t) => t.id)));
  const origTabs = (project.tabs || []).filter((t) => sectionTabIds.has(t.id));
  const busyByTab = computeBusyTeachersForTabs(project, origTabs);
  // 講師プルダウンの「(NG)」予告 (busy と同じく元タブで計算)
  const ngByTab = computeNgTeachersForTabs(project, origTabs);

  // ── D&D 入替 (セクション・学年をまたいだ入替も可) ────────────────
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

  // ドラッグ中のオートスクロール。セクション表示ではページ側
  // (.app-main) がスクロールペインなので、そちらを端寄せで動かす
  const handleContainerDragOver = (e) => {
    if (!dragSource) return;
    const scroller =
      containerRef.current?.closest(".app-main") || document.scrollingElement;
    if (!scroller) return;
    const isDoc = scroller === document.scrollingElement;
    const rect = isDoc
      ? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
      : scroller.getBoundingClientRect();
    const EDGE = 56;
    const step = (dist) => Math.ceil((EDGE - dist) / 3);
    if (e.clientY - rect.top < EDGE) scroller.scrollTop -= step(e.clientY - rect.top);
    else if (rect.bottom - e.clientY < EDGE)
      scroller.scrollTop += step(rect.bottom - e.clientY);
    if (e.clientX - rect.left < EDGE) scroller.scrollLeft -= step(e.clientX - rect.left);
    else if (rect.right - e.clientX < EDGE)
      scroller.scrollLeft += step(rect.right - e.clientX);
  };

  // ── 矢印キーでセル間を移動 ──────────────────────────────────────
  // ↑↓ は同じセクション内の行移動 (時間軸が違うため縦は跨がない)。
  // ←→ は 教科 ⇄ 講師 ⇄ 隣クラスの連続移動で、セクションの端まで来たら
  // 次/前のセクションへ跨ぐ (行位置は移動先の時間軸に丸める)。使わない
  // 時限のマス・折りたたみ中のセクションはスキップ。編集中は移動先セルが
  // 自動で編集モードに入る。
  const allCols = []; // 全セクションの列の通し並び {sec, col}
  for (const sec of sections) for (const col of sec.cols) allCols.push({ sec, col });

  const handleNavigate = (e, cellRef, field) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    // 修飾キー付きは select のネイティブ操作 (Alt+↓ など) なので乗っ取らない
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const { tabId, key } = parseCellRef(cellRef);
    const { periodId, classId } = parseCellKey(key);
    let ci = allCols.findIndex(
      (x) => x.col.tab.id === tabId && x.col.cls.id === classId
    );
    if (ci < 0) return;
    let sec = allCols[ci].sec;
    let r = sec.periods.findIndex((p) => p.id === periodId);
    let f = field;
    if (r < 0) return;

    const step = () => {
      if (e.key === "ArrowUp") {
        if (r > 0) r--;
        else return false; // 上端
      } else if (e.key === "ArrowDown") {
        if (r < allCols[ci].sec.periods.length - 1) r++;
        else return false; // 下端
      } else if (e.key === "ArrowLeft") {
        if (f === "teacher") f = "subj";
        else {
          ci = ci > 0 ? ci - 1 : allCols.length - 1; // 全体の端で wrap
          if (f === "subj") f = "teacher";
        }
      } else if (e.key === "ArrowRight") {
        if (f === "subj") f = "teacher";
        else {
          ci = ci < allCols.length - 1 ? ci + 1 : 0; // 全体の端で wrap
          if (f === "teacher") f = "subj";
        }
      }
      // セクションを跨いだら行位置を移動先の時間軸に丸める
      const ns = allCols[ci].sec;
      if (ns !== sec) {
        sec = ns;
        r = Math.min(r, sec.periods.length - 1);
      }
      return true;
    };

    const start = `${ci}|${r}|${f}`;
    const maxRows = Math.max(...sections.map((s) => s.periods.length));
    const maxSteps = allCols.length * maxRows * 2 + 2;
    for (let i = 0; i < maxSteps; i++) {
      if (!step()) return;
      if (`${ci}|${r}|${f}` === start) return; // 一周した
      const entry = allCols[ci];
      const per = entry.sec.periods[r];
      if (!per) return;
      if (collapsedKeys.has(entry.sec.key)) continue; // 折りたたみ中は飛ばす
      if (!available(per, entry.col.tab)) continue; // 使えないマスはスキップ
      const targetKey = makeCellKey(day, per.id, entry.col.cls.id);
      const targetRef = makeCellRef(entry.col.tab.id, targetKey);
      // 範囲列 (合同) は中身がある行にしか描画されない — 空の結合位置は飛ばす
      if (
        entry.col.isRange &&
        !entry.col.tab.schedule[targetKey] &&
        targetRef !== editRef
      )
        continue;
      if (f === "cell") {
        document.getElementById(`regb-${targetRef}-cell`)?.focus();
      } else if (targetRef === editRef) {
        // 同じセル内の 教科 ⇄ 講師 移動: editRef が変わらず再レンダーが
        // 走らないため、既に DOM にある select を直接フォーカスする
        document.getElementById(`regb-${targetRef}-${f}`)?.focus();
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
    openMenu: (pos, ref) => onOpenCellMenu?.(pos, ref),
  };

  return (
    <div
      ref={containerRef}
      onDragOver={handleContainerDragOver}
      className={`flex flex-wrap items-start gap-3 print-container ${isCompact ? "text-xs" : "text-sm"}`}
    >
      {sections.map((s) => {
        const collapsed = collapsedKeys.has(s.key);
        return (
        <section
          key={s.key}
          className="regb-section max-w-full bg-builder-surface border border-builder-border rounded-lg shadow overflow-hidden"
        >
          {/* セクション見出し (ダッシュボードの部バーに相当)。クリックで開閉 */}
          <button
            type="button"
            onClick={() => toggleCollapse(s.key)}
            aria-expanded={!collapsed}
            title={collapsed ? "クリックで展開" : "クリックで折りたたむ (印刷時は展開して刷られます)"}
            className={`w-full border-0 cursor-pointer flex items-center justify-between gap-3 text-white font-bold text-left ${isCompact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]"}`}
            style={{ background: s.tone.accent }}
          >
            <span className="truncate">
              <span className="no-print inline-block w-3">{collapsed ? "▸" : "▾"}</span>
              {s.name}
            </span>
            <span className="text-[10px] font-normal opacity-90 shrink-0">
              {s.cellCount}コマ
            </span>
          </button>
          <div className={`overflow-x-auto ${collapsed ? "hidden print:block" : ""}`}>
            <table className="border-collapse text-left" aria-label={`${s.name} の時間割`}>
              <thead>
                <tr>
                  <th
                    scope="col"
                    rowSpan={2}
                    className={`bg-builder-surface-alt text-builder-ink-muted text-center align-middle border-r border-b border-builder-border font-bold ${isCompact ? "p-0.5 text-[10px] min-w-[3.5rem]" : "p-1 text-xs min-w-[4.5rem]"}`}
                  >
                    時間
                  </th>
                  {s.tabs.map((t, ti) => {
                    const gc = gradeColor(t.grade || t.name);
                    const lay = s.tabLayouts.get(t.id);
                    const headCols = lay.fallback ? t.classes : lay.visible;
                    return (
                      <th
                        key={t.id}
                        scope="colgroup"
                        colSpan={headCols.length}
                        className={`border-r border-builder-border text-center font-extrabold ${isCompact ? "p-0.5 text-[11px]" : "p-1 text-[13px]"} ${ti > 0 ? GROUP_BOUNDARY : ""}`}
                        style={{ background: gc.b, color: gc.f }}
                      >
                        {t.name}
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {/* 列見出しは範囲列 (S〜B 等) を除いた表示列のみ。範囲の
                      セルは行内で構成クラスに結合表示される */}
                  {s.tabs.flatMap((t, ti) => {
                    const lay = s.tabLayouts.get(t.id);
                    const headCols = lay.fallback ? t.classes : lay.visible;
                    return headCols.map((cls2, ci) => (
                      <MenuTh
                        key={`${t.id}-${cls2.id}`}
                        scope="col"
                        onOpenMenu={
                          onOpenHeaderMenu ? (pos) => openColMenu(pos, t, cls2) : null
                        }
                        className={`bg-builder-surface-alt text-builder-ink border-r border-b border-builder-border font-bold ${isCompact ? "p-0.5 text-[10px] min-w-[80px]" : "p-1 text-xs min-w-[125px]"} ${ci === 0 && ti > 0 ? GROUP_BOUNDARY : ""}`}
                      >
                        {/* クラス名が無い列 (取込した高校の講座列など) は教室名を見出しに */}
                        {cls2.label || cls2.room || "－"}
                        {cls2.label && cls2.room && cls2.room !== cls2.label && (
                          <span className="font-normal text-builder-ink-subtle ml-1">
                            {cls2.room}
                          </span>
                        )}
                      </MenuTh>
                    ));
                  })}
                </tr>
              </thead>
              {/* builder-day-group は印刷スタイル (printStyle.js) の改ページ制御対象 */}
              <tbody className="builder-day-group">
                {s.periods.map((per) => (
                  <tr key={per.id} className="bg-builder-surface border-b border-builder-border">
                    <MenuTh
                      scope="row"
                      onOpenMenu={
                        onOpenHeaderMenu ? (pos) => openRowMenu(pos, s, per) : null
                      }
                      className={`font-normal border-r border-builder-border bg-builder-surface-alt text-builder-ink whitespace-nowrap align-top ${isCompact ? "p-1" : "p-1.5"}`}
                    >
                      {/* ラベル未設定 (取込直後など) は時刻だけを見出しにする */}
                      {per.label ? (
                        <>
                          <span className="font-bold">{per.label}</span>
                          {per.time && (
                            <div className="text-builder-ink-subtle text-[10px]">
                              {per.time}
                            </div>
                          )}
                        </>
                      ) : (
                        per.time
                      )}
                    </MenuTh>
                    {s.tabs.flatMap((t, ti) => {
                      const lay = s.tabLayouts.get(t.id);
                      const boundary = ti > 0 ? GROUP_BOUNDARY : "";
                      const headCols = lay.fallback ? t.classes : lay.visible;
                      if (!available(per, t)) {
                        // この学年が使わない時限 (時刻体系の違い) はグレーで塞ぐ
                        return (
                          <td
                            key={`blocked-${t.id}`}
                            aria-hidden="true"
                            colSpan={headCols.length}
                            className={`border-r border-builder-border last:border-r-0 bg-builder-bg ${boundary}`}
                          />
                        );
                      }
                      const renderCell = (cls2, extra = {}) => {
                        const key = makeCellKey(day, per.id, cls2.id);
                        const ref = makeCellRef(t.id, key);
                        const cell = t.schedule[key];
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
                            conflictBadge={ngOnlyRefs?.has(ref) ? "NG" : "重複"}
                            // "·" 区切りの文字列で渡す (配列だと毎レンダー新参照に
                            // なり memo が効かない。値が同じなら文字列は等価)
                            busyTeachers={(busyByTab.get(t.id)?.get(key) || []).join("·")}
                            ngTeachers={(ngByTab.get(t.id)?.get(key) || []).join("·")}
                            highlighted={highlighted}
                            dimmed={!!highlightTeacher && !highlighted}
                            roomPlaceholder={cls2.room}
                            displayRoomFallback={extra.displayRoomFallback || ""}
                            ariaBase={`${day} ${per.label || per.time} ${t.name} ${cls2.label || cls2.room}`}
                            tdExtra={extra.tdExtra || ""}
                            colSpan={extra.colSpan || 1}
                            mergeStarters={extra.mergeStarters || ""}
                            isCompact={isCompact}
                            isEditing={editRef === ref}
                            isFlashing={flashRefs.includes(ref)}
                            onStartEdit={onStartEdit}
                            onEndEdit={onEndEdit}
                            onCellChange={onCellChange}
                            onClearCell={onClearCell}
                            onNavigate={onNavigate}
                            onOpenMenu={onOpenCellMenu ? onOpenMenu : null}
                            onDragStart={onDragStart}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            onDragEnd={onDragEnd}
                            isDragOver={dragOverRef === ref}
                            isDragSource={dragSource === ref}
                          />
                        );
                      };
                      if (lay.fallback) {
                        // 結合表示できないデータの学年は従来の独立列表示
                        return t.classes.map((cls2, ci) =>
                          renderCell(cls2, { tdExtra: ci === 0 ? boundary : "" })
                        );
                      }
                      // ── 合同セルの結合表示 ──
                      // この行に中身がある (または編集中の) 範囲セルを集め、
                      // 同一スパンごとにまとめて colSpan で構成クラスに被せる
                      const present = lay.ranges
                        .map((r) => {
                          const key = makeCellKey(day, per.id, r.cls.id);
                          const ref = makeCellRef(t.id, key);
                          return { r, ref, cell: t.schedule[key] };
                        })
                        .filter((x) => x.cell || editRef === x.ref);
                      const bySpan = new Map();
                      for (const p of present) {
                        const k = `${p.r.startIdx}-${p.r.endIdx}`;
                        if (!bySpan.has(k))
                          bySpan.set(k, {
                            startIdx: p.r.startIdx,
                            endIdx: p.r.endIdx,
                            items: [],
                          });
                        bySpan.get(k).items.push(p);
                      }
                      const out = [];
                      let i = 0;
                      while (i < lay.visible.length) {
                        const g = [...bySpan.values()].find((x) => x.startIdx === i);
                        if (g) {
                          const widths = splitSpan(
                            g.endIdx - g.startIdx + 1,
                            g.items.length
                          );
                          g.items.forEach((p, gi) => {
                            // 幅 0 は mergeFallback が事前に弾くため通常来ない (保険)
                            if (widths[gi] <= 0) return;
                            out.push(
                              renderCell(p.r.cls, {
                                colSpan: widths[gi],
                                // 学年境界の太罫は並列の先頭セルだけに引く
                                tdExtra: i === 0 && gi === 0 ? boundary : "",
                                displayRoomFallback: p.r.cls.room,
                              })
                            );
                          });
                          i = g.endIdx + 1;
                        } else {
                          const cls2 = lay.visible[i];
                          // この列から始まる未入力の範囲: ⊞ で合同コマを追加できる。
                          // スパン内に個別コマがある行には出さない (入力すると
                          // クラスの二重在籍になり、確定と同時にフォールバック
                          // 表示へ切り替わって驚かせるため)
                          const starters = lay.ranges
                            .filter(
                              (r) =>
                                r.startIdx === i && !present.some((p) => p.r === r)
                            )
                            .filter((r) => {
                              for (let k2 = r.startIdx; k2 <= r.endIdx; k2++) {
                                const vc = lay.visible[k2];
                                if (vc && t.schedule[makeCellKey(day, per.id, vc.id)])
                                  return false;
                              }
                              return true;
                            })
                            .map(
                              (r) =>
                                `${makeCellRef(t.id, makeCellKey(day, per.id, r.cls.id))}\t${r.cls.label}`
                            )
                            .join("\n");
                          out.push(
                            renderCell(cls2, {
                              tdExtra: i === 0 ? boundary : "",
                              mergeStarters: starters,
                            })
                          );
                          i++;
                        }
                      }
                      return out;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        );
      })}
    </div>
  );
}
