import { useMemo } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { getSubjectColor, toCircleNum, CONFLICT_CELL_BG, resolveGenerationParams } from '../utils/constants';
import { makeKey, makeNgKey, makeExternalKey, findCombinedGroup, findEntityById, isPrimaryCombinedClass } from '../utils/scheduleKey';
import { quotaForClass } from '../utils/subjectQuota';
import { resolveTeacherDailyLimit } from '../logic/constraints/teacherConstraints';
import { groupTeachersBySubject } from '../utils/groupTeachersBySubject';
import { useLongPress } from '../hooks/useLongPress';
import { autoNgSourceLabel } from '../utils/autoNg';
import { AVAILABILITY_SYMBOL, BLANK_SYMBOL, getAvailabilityMark } from '../utils/availability';

export default function ScheduleCell({ dateId, periodId, classId, isCompact, onContextMenu, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, isDragOver, isDragSource, highlightTeacher = null, isSelected = false, onCellSelect }) {
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
  // N2a: 長押しの onClickCapture (ゴースト click 抑止) と選択クリックを
  // 1 つの onClickCapture に合成する ({...spread} の上書き事故を防ぐため分離)
  const { onClickCapture: longPressClickCapture, ...longPressHandlers } = longPress;

  if (!dateEnt || !periodEnt || !classEnt) return null;
  const dLabel = dateEnt.label;
  const pLabel = periodEnt.label;
  const cLabel = classEnt.label;

  const isLocked = entry.locked;
  const isConflict = analysis.conflictMap[`${dLabel}-${pLabel}-${entry.teacher}`];
  const order = analysis.subjectOrders[key] || 0;
  // §N: クォータはこのセルのクラスで解決 (クラス別上書き対応)
  const maxCnt = entry.subject ? quotaForClass(currentConfig, classId, entry.subject) : 0;
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
  // 出勤可能調査: 割り当てた講師が △ (相談) / 未記入のマスなら目印を出す
  // (× は上の自動NG に合流済み)。今の調査に回答の無い講師 (調査していない常勤・
  // 前の季節の回答だけ残っている人) は出さない
  const surveyAnswered = analysis.surveyAnsweredTeachers;
  const assignedMark = assignedTeacher ? getAvailabilityMark(assignedTeacher, dLabel, pLabel) : null;
  const assignedSurveyHint = !assignedTeacher || isNgAssigned
    ? null
    : assignedMark === 'maybe'
      ? 'maybe'
      : (!assignedMark && surveyAnswered?.has(assignedTeacher.name) ? 'blank' : null);

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
      // N2a: 選択中は太い primary ring (ドラッグ ring より優先度低・ハイライトより高)
      className={`border-r last:border-r-0 ${isCompact ? "p-px" : "p-2"} ${!isLocked && entry.subject ? "cursor-move" : ""} ${isDragOver && !isLocked ? "ring-2 ring-builder-blue ring-inset bg-builder-info-soft" : ""} ${isDragOver && isLocked ? "ring-2 ring-builder-red ring-inset cursor-not-allowed" : ""} ${isDragSource ? "opacity-50" : ""} ${!isDragOver && isSelected ? "ring-2 ring-builder-primary ring-inset bg-builder-info-soft" : ""} ${!isDragOver && !isSelected && !!highlightTeacher && entry.teacher === highlightTeacher ? "ring-2 ring-builder-blue ring-inset" : ""} ${!isSelected && !!highlightTeacher && entry.teacher !== highlightTeacher ? "opacity-40" : ""}`}
      data-selected={isSelected ? '' : undefined}
      // N2a: Ctrl(⌘)/Shift+クリックで選択。mousedown を capture で止めないと
      // <select> のドロップダウンが開いてしまう
      onMouseDownCapture={(e) => {
        if (onCellSelect && (e.ctrlKey || e.metaKey || e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClickCapture={(e) => {
        longPressClickCapture(e);
        if (onCellSelect && (e.ctrlKey || e.metaKey || e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
          onCellSelect(e, key);
        }
      }}
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
      {...longPressHandlers}
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
              // min-w: 目印 (⚠️2回・合同 等) が並んでも科目名が矢印だけに潰れないように。
              // 枠はセル (カード) 側にあるので select 自体は枠なし
              className={`flex-1 bg-transparent font-bold focus:outline-none cursor-pointer text-builder-ink border-0 ${isCompact ? "min-w-[2.5rem]" : "min-w-[3.5rem]"} ${isSubjDup ? "text-builder-red underline" : ""} ${isCompact ? "text-[11px] leading-tight py-0" : "text-base"}`}
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
            {/* 標準表示は下の帯 (⚠️ 重複 / ⚠️ NG設定違反) で出すので、横並びの目印は
                縮小表示だけ (両方出すと科目名の幅を食い、同じ警告が 2 回並んでいた) */}
            {isCompact && isConflict && <span className="bg-builder-red text-white rounded animate-pulse shrink-0 text-[8px] px-0.5">⚠️重複</span>}
            {isCompact && isNgAssigned && !isConflict && <span className="bg-builder-red text-white rounded animate-pulse shrink-0 text-[8px] px-0.5">⚠️NG</span>}
            {assignedSurveyHint && (
              <span
                className={`rounded border shrink-0 ${assignedSurveyHint === 'maybe' ? 'border-builder-warning-border bg-builder-warning-soft text-builder-orange' : 'border-builder-border bg-builder-surface text-builder-ink-muted'} ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}
                title={assignedSurveyHint === 'maybe'
                  ? `出勤可能調査: ${entry.teacher} はこの時間「△ 相談」`
                  : `出勤可能調査: ${entry.teacher} はこの時間が未記入 (出られるか未確認)`}
              >
                {assignedSurveyHint === 'maybe' ? AVAILABILITY_SYMBOL.maybe : BLANK_SYMBOL}
              </span>
            )}
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
          className={`w-full rounded cursor-pointer border border-builder-border ${(isConflict || isNgAssigned) ? "text-builder-red font-extrabold" : "text-builder-blue"} ${isCompact ? "text-[10px] py-0 leading-tight" : "text-sm py-1"} ${(!entry.subject || isLocked) ? "opacity-50" : "bg-white/50 hover:bg-builder-surface"}`}
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
                const autoEntry = analysis.autoNgByTeacher?.get(t.name)?.get(ngKey);
                const isAuto = !!autoEntry;
                const isNg = isManual || isAuto;
                let label = t.name;
                if (t.name !== "未定") {
                  // 自動NG の由来は「他学年」(他学年セッション) / 「調査」(出勤可能調査の ×)
                  if (isNg) label += isAuto && !isManual ? ` (NG:${autoNgSourceLabel(autoEntry)})` : " (NG)";
                  else {
                    // 出勤可能調査の ○ / △ / 未記入 (?) を計の前に添える。回答の無い講師は何も付けない
                    const mark = getAvailabilityMark(t, dLabel, pLabel);
                    const surveyPrefix = mark ? `${AVAILABILITY_SYMBOL[mark]} ` : (surveyAnswered?.has(t.name) ? `${BLANK_SYMBOL} ` : '');
                    label += ` (${surveyPrefix}計${daily.total})`;
                  }
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
