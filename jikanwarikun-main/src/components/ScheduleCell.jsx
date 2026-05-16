import React from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { getSubjectColor, toCircleNum } from '../utils/constants';
import { makeKey, makeNgKey, makeExternalKey, findCombinedGroup, isPrimaryCombinedClass } from '../utils/scheduleKey';

export default function ScheduleCell({ dIdx, pIdx, cIdx, isCompact, onContextMenu, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, isDragOver, isDragSource }) {
  const {
    project,
    currentSchedule,
    currentConfig,
    commonSubjects,
    analysis,
    handleAssign,
    toggleLock,
  } = useProjectContext();

  const d = currentConfig.dates[dIdx];
  const p = currentConfig.periods[pIdx];

  const key = makeKey(dIdx, pIdx, cIdx);
  const entry = currentSchedule[key] || {};
  const isLocked = entry.locked;
  const isConflict = analysis.conflictMap[`${d}-${p}-${entry.teacher}`];
  const order = analysis.subjectOrders[key] || 0;
  const maxCnt = currentConfig.subjectCounts[entry.subject] || 0;
  const isOver = maxCnt > 0 && order > maxCnt;
  const filteredTeachers = entry.subject ? project.teachers.filter(t => t.subjects.includes(entry.subject)) : project.teachers;

  const subjDupKey = `c${cIdx}-d${dIdx}-${entry.subject}`;
  const isSubjDup = analysis.dailySubjectMap[subjDupKey] > 1;

  // 合同グループ判定
  const className = currentConfig.classes[cIdx];
  const combinedGroup = entry.subject ? findCombinedGroup(project.combinedGroups, entry.subject, className, d) : null;
  const isCombined = !!combinedGroup;
  const isPrimary = isCombined && isPrimaryCombinedClass(combinedGroup, className);

  const cellBgColor = isConflict ? "#FECACA" : getSubjectColor(entry.subject, project.subjectColors);
  const combinedBorder = isCombined ? (isPrimary ? "border-2 border-purple-500" : "border-2 border-purple-300 border-dashed") : "";
  const lockedStyle = isLocked ? "border-2 border-gray-600 opacity-90" : (combinedBorder || "border border-gray-200");
  const cellStyle = {
    ...(cellBgColor ? { backgroundColor: cellBgColor } : {}),
    ...(isLocked ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 10px)' } : {}),
  };

  const handleCellNavigation = (e, type) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      let nextD = dIdx, nextP = pIdx, nextC = cIdx, nextType = type;
      if (e.key === 'ArrowUp') { if (pIdx > 0) nextP--; else if (dIdx > 0) { nextD--; nextP = currentConfig.periods.length - 1; } }
      else if (e.key === 'ArrowDown') { if (pIdx < currentConfig.periods.length - 1) nextP++; else if (dIdx < currentConfig.dates.length - 1) { nextD++; nextP = 0; } }
      else if (e.key === 'ArrowLeft') { if (type === 'teacher') nextType = 'subject'; else if (cIdx > 0) { nextC--; nextType = 'teacher'; } }
      else if (e.key === 'ArrowRight') { if (type === 'subject') nextType = 'teacher'; else if (cIdx < currentConfig.classes.length - 1) { nextC++; nextType = 'subject'; } }
      const nextElement = document.getElementById(`select-${nextD}-${nextP}-${nextC}-${nextType}`);
      if (nextElement) nextElement.focus();
    }
  };

  return (
    <td
      id={`select-${dIdx}-${pIdx}-${cIdx}-cell`}
      className={`border-r last:border-0 ${isCompact ? "p-px" : "p-2"} ${isDragOver && !isLocked ? "ring-2 ring-blue-400 ring-inset bg-blue-50" : ""} ${isDragOver && isLocked ? "ring-2 ring-red-300 ring-inset cursor-not-allowed" : ""} ${isDragSource ? "opacity-50" : ""}`}
      draggable={!isLocked && !!entry.subject}
      onDragStart={(e) => onDragStart(e, key, entry)}
      onDragOver={(e) => onDragOver(e, key, entry)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, key, entry)}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, dIdx, pIdx, cIdx)}
    >
      <div className={`flex flex-col rounded h-full ${lockedStyle} ${isCompact ? "gap-0 p-0.5" : "gap-1 p-1.5"}`} style={cellStyle}>
        <div className={`flex justify-between items-center ${isCompact ? "gap-0.5" : "gap-1"}`}>
          <div className="flex-1 min-w-0 flex items-center gap-0.5">
            <select
              id={`select-${dIdx}-${pIdx}-${cIdx}-subject`}
              className={`flex-1 bg-transparent font-bold focus:outline-none cursor-pointer text-gray-800 min-w-0 ${isSubjDup ? "text-red-600 underline" : ""} ${isCompact ? "text-[11px] leading-tight py-0" : "text-base"} ${isLocked ? "pointer-events-none" : ""}`}
              value={entry.subject || ""}
              onChange={(e) => handleAssign(dIdx, pIdx, cIdx, 'subject', e.target.value)}
              onKeyDown={(e) => handleCellNavigation(e, 'subject')}
            >
              <option value="">-</option>
              {commonSubjects.map(s => {
                const isAlreadyUsed = analysis.dailySubjectMap[`c${cIdx}-d${dIdx}-${s}`] > 0 && entry.subject !== s;
                return <option key={s} value={s} disabled={isAlreadyUsed} className={isAlreadyUsed ? "bg-gray-200" : ""}>{s}</option>;
              })}
            </select>
            {isSubjDup && <span className={`bg-red-600 text-white rounded shrink-0 ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}>⚠️2回</span>}
            {isConflict && <span className={`bg-red-600 text-white rounded animate-pulse shrink-0 ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}>⚠️重複</span>}
            {entry.subject && !isSubjDup && <span className={`font-bold shrink-0 ${isCompact ? "text-[10px]" : ""} ${isOver ? "text-red-600" : "text-gray-700"}`}>{toCircleNum(order)}{isOver && "!"}</span>}
            {isCombined && <span className={`bg-purple-600 text-white rounded shrink-0 ${isCompact ? "text-[8px] px-0.5" : "text-[10px] px-1"}`}>合同</span>}
          </div>
          <button onClick={() => toggleLock(dIdx, pIdx, cIdx)} className={`focus:outline-none text-gray-400 hover:text-gray-800 shrink-0 leading-none ${isCompact ? "text-[9px]" : "text-sm"}`} title={isLocked ? "ロック解除" : "ロック"}>
            {isLocked ? "🔒" : "🔓"}
          </button>
        </div>
        <select
          id={`select-${dIdx}-${pIdx}-${cIdx}-teacher`}
          className={`w-full rounded cursor-pointer ${isConflict ? "text-red-800 font-extrabold" : "text-blue-900"} ${isCompact ? "text-[10px] py-0 leading-tight" : "text-sm py-1"} ${(!entry.subject || isLocked) ? "opacity-50 pointer-events-none" : "bg-white/50 hover:bg-white"}`}
          value={entry.teacher || ""}
          onChange={(e) => handleAssign(dIdx, pIdx, cIdx, 'teacher', e.target.value)}
          onKeyDown={(e) => handleCellNavigation(e, 'teacher')}
        >
          <option value="">-</option>
          {filteredTeachers.map(t => {
            const dayKey = makeExternalKey(d, t.name);
            const daily = analysis.teacherDailyCounts[dayKey] || { total: 0 };
            const isNg = t.ngSlots?.includes(makeNgKey(d, p));
            let label = t.name;
            if (t.name !== "未定") { if (isNg) label += " (NG)"; else label += ` (計${daily.total})`; }
            return <option key={t.name} value={t.name} className={isNg ? "bg-gray-300 text-gray-500" : (daily.total >= 4 ? "bg-yellow-100" : "")} disabled={isNg}>{label}</option>;
          })}
        </select>
        {isConflict && !isCompact && <div className="text-[10px] text-red-700 font-bold text-center bg-red-100 rounded mt-1 border border-red-300">⚠️ 重複</div>}
      </div>
    </td>
  );
}
