import { useMemo } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { getSubjectColor, toCircleNum, CONFLICT_CELL_BG, resolveGenerationParams } from '../utils/constants';
import { makeKey, makeNgKey, makeExternalKey, findCombinedGroup, findEntityById, isPrimaryCombinedClass } from '../utils/scheduleKey';
import { resolveTeacherDailyLimit } from '../logic/constraints/teacherConstraints';
import { groupTeachersBySubject } from '../utils/groupTeachersBySubject';
import { useLongPress } from '../hooks/useLongPress';

export default function ScheduleCell({ dateId, periodId, classId, isCompact, onContextMenu, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, isDragOver, isDragSource, highlightTeacher = null }) {
  const {
    project,
    currentSchedule,
    currentConfig,
    commonSubjects,
    analysis,
    handleAssign,
    toggleLock,
  } = useProjectContext();

  const dateEnt = findEntityById(currentConfig.dates, dateId);
  const periodEnt = findEntityById(currentConfig.periods, periodId);
  const classEnt = findEntityById(currentConfig.classes, classId);

  const key = makeKey(dateId, periodId, classId);
  const entry = currentSchedule[key] || {};

  // 教科ごとに optgroup でドロップダウンを分類する。
  // useMemo は早期 return (dateEnt 等が null) の前に呼ぶ必要があるため、
  // ここで先に計算する (rules-of-hooks)。
  // subject 選択済み: 全候補が当該 subject を教えられる前提なので
  //   flatten モードで「<optgroup label=英語>...全員...</optgroup>」の単一
  //   グループに集約する (複数教科担当の '未定' を '複数教科' グループに
  //   逃さないため — code-review P2)。
  // subject 未選択: 通常の教科別分類で全講師を見せる。
  // filter は useMemo 内で実行 (毎回新しい配列リテラルになって memo が
  // 効かないのを防ぐ — code-review P2)。
  const teacherGroups = useMemo(() => {
    const candidates = entry.subject
      ? project.teachers.filter(t => t.subjects.includes(entry.subject))
      : project.teachers;
    return groupTeachersBySubject(
      candidates,
      project.subjects,
      entry.subject ? { flattenIntoSingleSubject: entry.subject } : undefined,
    );
  }, [project.teachers, project.subjects, entry.subject]);

  // タッチ長押しで右クリック相当のコンテキストメニューを開く (E1f)。
  // hooks-rules を守るため早期 return より前で呼ぶ。
  const longPress = useLongPress(({ clientX, clientY }) =>
    onContextMenu({ preventDefault: () => {}, clientX, clientY }, dateId, periodId, classId),
  );

  if (!dateEnt || !periodEnt || !classEnt) return null;
  const dLabel = dateEnt.label;
  const pLabel = periodEnt.label;
  const cLabel = classEnt.label;

  const isLocked = entry.locked;
  const isConflict = analysis.conflictMap[`${dLabel}-${pLabel}-${entry.teacher}`];
  const order = analysis.subjectOrders[key] || 0;
  const maxCnt = currentConfig.subjectCounts[entry.subject] || 0;
  const isOver = maxCnt > 0 && order > maxCnt;

  const subjDupKey = `c${classId}-d${dateId}-${entry.subject}`;
  const isSubjDup = analysis.dailySubjectMap[subjDupKey] > 1;

  // 後から NG 設定された場合に、既に割り当て済みの講師がその日時で
  // NG になっていれば視覚的に警告する。
  // 手動NG (teacher.ngSlots) + 自動NG (他学年セッションとの時間重複) の両方を考慮。
  // '未定' は placeholder 講師として project.teachers に含まれるものの、
  // assignedTeacher の早期 null 化と autoNgByTeacher が '未定' を含まないため
  // 自動NG/手動NG ともに常に false 扱いになる (placeholder にコマ数制限を
  // 課さない既存仕様と整合)。
  const assignedTeacher = (entry.teacher && entry.teacher !== '未定')
    ? project.teachers.find(t => t.name === entry.teacher)
    : null;
  const ngKey = makeNgKey(dLabel, pLabel);
  const isManualNg = !!assignedTeacher?.ngSlots?.includes(ngKey);
  const isAutoNg = !!analysis.autoNgByTeacher?.get(entry.teacher)?.has(ngKey);
  const isNgAssigned = isManualNg || isAutoNg;

  // 合同グループ判定 (label ベース)
  const combinedGroup = entry.subject ? findCombinedGroup(project.combinedGroups, entry.subject, cLabel, dLabel) : null;
  const isCombined = !!combinedGroup;
  const isPrimary = isCombined && isPrimaryCombinedClass(combinedGroup, cLabel);

  // option ループ (講師数×セル数) の内側で毎回呼ばないよう、ここで 1 回だけ解決
  const { maxDailyHours } = resolveGenerationParams(project);

  const cellBgColor = (isConflict || isNgAssigned) ? CONFLICT_CELL_BG : getSubjectColor(entry.subject, project.subjectColors);
  const ngBorder = isNgAssigned && !isLocked ? "border-2 border-builder-red" : "";
  const combinedBorder = isCombined ? (isPrimary ? "border-2 border-builder-primary" : "border-2 border-builder-ink-ghost border-dashed") : "";
  const lockedStyle = isLocked ? "border-2 border-builder-ink-muted opacity-90" : (ngBorder || combinedBorder || "border border-builder-border");
  const cellStyle = {
    ...(cellBgColor ? { backgroundColor: cellBgColor } : {}),
    ...(isLocked ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 10px)' } : {}),
  };

  // 矢印キーナビゲーション: 現在の (dateId, periodId, classId) を起点に隣接セルへ。
  // 隣接は config 配列の並び順で算出する。
  //
  // ロック済み・科目未選択の select は disabled (focus() が no-op) なので、
  // disabled な要素に当たったら同方向へ進み続けて次のフォーカス可能な
  // select を探す。これをしないと空セルの teacher select で横移動が停止し、
  // ロックセルを縦移動で通過できない (E1b「矢印移動が途切れない」の維持)。
  const handleCellNavigation = (e, type) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    // F2b: 修飾キー付きは select のネイティブ操作 (Alt+↓ でドロップダウンを
    // 開く等) なので乗っ取らない。素の矢印だけをセル間ナビに使う。
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const { dates, periods, classes } = currentConfig;

    // 1 ステップ分の移動。端で進めない場合は null (vertical のみ)。
    const step = (pos) => {
      let { d, p, c, t } = pos;
      if (e.key === 'ArrowUp') {
        if (p > 0) p--;
        else if (d > 0) { d--; p = periods.length - 1; }
        else return null;
      } else if (e.key === 'ArrowDown') {
        if (p < periods.length - 1) p++;
        else if (d < dates.length - 1) { d++; p = 0; }
        else return null;
      } else if (e.key === 'ArrowLeft') {
        // 行内で連続移動: teacher→subject、左端の subject では前クラスの teacher へ。
        // 行頭では行末へ wrap (E1b 端動作の統一)。
        if (t === 'teacher') t = 'subject';
        else if (c > 0) { c--; t = 'teacher'; }
        else { c = classes.length - 1; t = 'teacher'; }
      } else if (e.key === 'ArrowRight') {
        if (t === 'subject') t = 'teacher';
        else if (c < classes.length - 1) { c++; t = 'subject'; }
        else { c = 0; t = 'subject'; } // 行末 → 行頭へ wrap
      }
      return { d, p, c, t };
    };

    let pos = {
      d: dates.findIndex(x => x.id === dateId),
      p: periods.findIndex(x => x.id === periodId),
      c: classes.findIndex(x => x.id === classId),
      t: type,
    };
    const startKey = `${pos.d}|${pos.p}|${pos.c}|${pos.t}`;
    const maxSteps = dates.length * periods.length * classes.length * 2 + 2;
    for (let i = 0; i < maxSteps; i++) {
      pos = step(pos);
      if (!pos) return; // 端で移動不能 (vertical)
      if (`${pos.d}|${pos.p}|${pos.c}|${pos.t}` === startKey) return; // 一周した
      const dId = dates[pos.d]?.id;
      const pId = periods[pos.p]?.id;
      const cId = classes[pos.c]?.id;
      if (dId == null || pId == null || cId == null) return;
      // 対象はセル内の select / focusable 要素 (disabled 判定のため cast)
      const el = document.getElementById(`select-${dId}-${pId}-${cId}-${pos.t}`) as HTMLSelectElement | null;
      if (el && !el.disabled) {
        el.focus();
        return;
      }
      // disabled (ロック済み / 科目未選択の teacher) はスキップして続行
    }
  };

  return (
    <td
      id={`select-${dateId}-${periodId}-${classId}-cell`}
      // L2a: 講師ハイライト。ドラッグ中の ring 表示と衝突しないよう、
      // isDragOver 中はハイライトを一時的に譲る
      data-teacher-highlight={!!highlightTeacher && entry.teacher === highlightTeacher ? '' : undefined}
      // N2c: 掴めるセルには cursor-move の手がかりを出す (従来は視覚手がかり
      // ゼロで D&D が発見不能だった)
      className={`border-r last:border-r-0 ${isCompact ? "p-px" : "p-2"} ${!isLocked && entry.subject ? "cursor-move" : ""} ${isDragOver && !isLocked ? "ring-2 ring-builder-blue ring-inset bg-builder-info-soft" : ""} ${isDragOver && isLocked ? "ring-2 ring-builder-red ring-inset cursor-not-allowed" : ""} ${isDragSource ? "opacity-50" : ""} ${!isDragOver && !!highlightTeacher && entry.teacher === highlightTeacher ? "ring-2 ring-builder-blue ring-inset" : ""} ${!!highlightTeacher && entry.teacher !== highlightTeacher ? "opacity-40" : ""}`}
      draggable={!isLocked && !!entry.subject}
      onDragStart={(e) => onDragStart(e, key, entry)}
      onDragOver={(e) => onDragOver(e, key, entry)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, key, entry)}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, dateId, periodId, classId)}
      // タッチ端末で長押しメニューを開く際のテキスト選択抑止セレクタ
      // (tailwind.css の @media (pointer: coarse) ブロック) の対象マーカー
      data-longpress=""
      {...longPress}
    >
      <div className={`flex flex-col rounded h-full ${lockedStyle} ${isCompact ? "gap-0 p-0.5" : "gap-1 p-1.5"}`} style={cellStyle}>
        <div className={`flex justify-between items-center ${isCompact ? "gap-0.5" : "gap-1"}`}>
          <div className="flex-1 min-w-0 flex items-center gap-0.5">
            {/* N2c: ドラッグハンドル。セルの大半は <select> で mousedown を
                奪うため (特にコンパクト表示は padding 1px で余白がほぼ無い)、
                確実に掴める非 select 領域を常設する */}
            {!isLocked && !!entry.subject && (
              <span
                aria-hidden="true"
                title="ドラッグで別のセルと入れ替え"
                className={`shrink-0 select-none cursor-move text-builder-ink-ghost leading-none ${isCompact ? "text-[9px]" : "text-xs"}`}
              >⠿</span>
            )}
            <select
              id={`select-${dateId}-${periodId}-${classId}-subject`}
              aria-label={`${dLabel} ${pLabel} ${cLabel} の科目`}
              className={`flex-1 bg-transparent font-bold focus:outline-none cursor-pointer text-builder-ink min-w-0 ${isSubjDup ? "text-builder-red underline" : ""} ${isCompact ? "text-[11px] leading-tight py-0" : "text-base"}`}
              value={entry.subject || ""}
              onChange={(e) => handleAssign(dateId, periodId, classId, 'subject', e.target.value)}
              onKeyDown={(e) => handleCellNavigation(e, 'subject')}
              // pointer-events-none だけだとキーボードで値を変えられ、reducer
              // 側 guard で state は不変なのに DOM 表示だけ変わる desync が
              // 起きる。disabled なら AT にもロック状態が伝わる。
              disabled={!!isLocked}
            >
              <option value="">-</option>
              {commonSubjects.map(s => {
                const isAlreadyUsed = analysis.dailySubjectMap[`c${classId}-d${dateId}-${s}`] > 0 && entry.subject !== s;
                return <option key={s} value={s} disabled={isAlreadyUsed} className={isAlreadyUsed ? "bg-builder-border" : ""}>{s}</option>;
              })}
            </select>
            {isSubjDup && <span className={`bg-builder-red text-white rounded shrink-0 ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}>⚠️2回</span>}
            {isConflict && <span className={`bg-builder-red text-white rounded animate-pulse shrink-0 ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}>⚠️重複</span>}
            {isNgAssigned && !isConflict && <span className={`bg-builder-red text-white rounded animate-pulse shrink-0 ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}>⚠️NG</span>}
            {entry.subject && !isSubjDup && <span className={`font-bold shrink-0 ${isCompact ? "text-[10px]" : ""} ${isOver ? "text-builder-red" : "text-builder-ink-muted"}`}>{toCircleNum(order)}{isOver && "!"}</span>}
            {isCombined && <span className={`bg-builder-primary text-white rounded shrink-0 ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}>合同</span>}
          </div>
          <button onClick={() => toggleLock(dateId, periodId, classId)} aria-label={isLocked ? "ロック解除" : "ロック"} aria-pressed={!!isLocked} className={`focus:outline-none text-builder-ink-ghost hover:text-builder-ink shrink-0 leading-none ${isCompact ? "text-[9px]" : "text-sm"}`} title={isLocked ? "ロック解除" : "ロック"}>
            {isLocked ? "🔒" : "🔓"}
          </button>
        </div>
        <select
          id={`select-${dateId}-${periodId}-${classId}-teacher`}
          aria-label={`${dLabel} ${pLabel} ${cLabel} の講師`}
          className={`w-full rounded cursor-pointer ${(isConflict || isNgAssigned) ? "text-builder-red font-extrabold" : "text-builder-blue"} ${isCompact ? "text-[10px] py-0 leading-tight" : "text-sm py-1"} ${(!entry.subject || isLocked) ? "opacity-50" : "bg-white/50 hover:bg-builder-surface"}`}
          value={entry.teacher || ""}
          onChange={(e) => handleAssign(dateId, periodId, classId, 'teacher', e.target.value)}
          onKeyDown={(e) => handleCellNavigation(e, 'teacher')}
          disabled={!entry.subject || !!isLocked}
        >
          <option value="">-</option>
          {teacherGroups.map(group => (
            <optgroup key={group.key} label={group.label}>
              {group.teachers.map(t => {
                const dayKey = makeExternalKey(dLabel, t.name);
                const daily = analysis.teacherDailyCounts[dayKey] || { total: 0 };
                const isManual = t.ngSlots?.includes(makeNgKey(dLabel, pLabel));
                const isAuto = !!analysis.autoNgByTeacher?.get(t.name)?.has(ngKey);
                const isNg = isManual || isAuto;
                let label = t.name;
                if (t.name !== "未定") {
                  if (isNg) label += isAuto && !isManual ? " (NG:他学年)" : " (NG)";
                  else label += ` (計${daily.total})`;
                }
                // 現在割当済みの講師が NG の場合は選択肢としても残して disabled に
                // しない (= 違反として表示しつつ、ユーザに気付かせる)。それ以外は disabled。
                const shouldDisable = isNg && entry.teacher !== t.name;
                // 上限到達済み (これ以上選ぶと超過) の講師を警告色にする。
                // 閾値は設定可能な maxDailyHours に追従 (旧: 4 固定)。
                // §M: L3a の講師個別上限があればそちらを優先 (分析・solver と
                // 同じ判定にしないと、警告なしで選べて直後に違反表示になる)。
                const nearLimit = daily.total >= resolveTeacherDailyLimit(t, maxDailyHours);
                return <option key={t.name} value={t.name} className={isNg ? "bg-builder-border text-builder-ink-ghost" : (nearLimit ? "bg-builder-warning-soft" : "")} disabled={shouldDisable}>{label}</option>;
              })}
            </optgroup>
          ))}
        </select>
        {isConflict && !isCompact && <div className="text-[10px] text-builder-red font-bold text-center bg-builder-danger-soft rounded mt-1 border border-builder-danger-border">⚠️ 重複</div>}
        {isNgAssigned && !isConflict && !isCompact && <div className="text-[10px] text-builder-red font-bold text-center bg-builder-danger-soft rounded mt-1 border border-builder-danger-border">⚠️ NG設定違反</div>}
      </div>
    </td>
  );
}
