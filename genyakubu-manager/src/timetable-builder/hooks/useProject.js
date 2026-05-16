import { useCallback } from 'react';
import { makeKey, parseKey, makeNgKey, makeExternalKey, findCombinedGroup } from '../utils/scheduleKey';
import { cleanSchedule } from '../utils/constants';
import { useHistoryStack } from './useHistoryStack';
import { useJsonIO } from './useJsonIO';

// 講習時間割プロジェクトの一元状態管理フック。
//
// 内訳:
//   - useHistoryStack: project state + Undo/Redo + LocalStorage 自動保存
//   - useJsonIO:       JSON 保存/読込/デフォルト保存/全リセット
//   - 本ファイル:      残りのアクション (タブ/科目/講師/セル/合同) と
//                      派生データ (activeTab, currentSchedule, etc.) を集約
//
// 公開 API は ProjectContext 経由で全コンポーネントから参照されるため、
// 返り値のキー名・関数シグネチャは安易に変更しない。
export function useProject() {
  const {
    project,
    setProject,
    history,
    historyIndex,
    saveStatus,
    pushHistory,
    undo,
    redo,
  } = useHistoryStack();

  // 派生データ
  const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  const currentConfig = activeTab.config;
  const commonSubjects = project.subjects || Object.keys(currentConfig.subjectCounts);

  const {
    fileInputRef,
    handleSaveAsDefault,
    handleResetAll,
    handleLoadJson,
    handleSaveJson,
  } = useJsonIO({ project, activeTab, pushHistory });

  // --- タブ管理 ---
  const handleAddTab = useCallback((name) => {
    if (!name) return;
    const newId = Math.max(...project.tabs.map(t => t.id)) + 1;
    const configToCopy = JSON.parse(JSON.stringify(activeTab.config));
    const newTab = { id: newId, name, config: configToCopy, schedule: {} };
    pushHistory({ ...project, tabs: [...project.tabs, newTab], activeTabId: newId });
  }, [project, activeTab, pushHistory]);

  const handleDeleteTab = useCallback((id) => {
    if (project.tabs.length <= 1) return;
    const newTabs = project.tabs.filter(t => t.id !== id);
    pushHistory({ ...project, tabs: newTabs, activeTabId: newTabs[0].id });
  }, [project, pushHistory]);

  const handleRenameTab = useCallback((id, newName) => {
    if (newName) pushHistory({ ...project, tabs: project.tabs.map(t => t.id === id ? { ...t, name: newName } : t) });
  }, [project, pushHistory]);

  const switchTab = useCallback((id) => {
    setProject({ ...project, activeTabId: id });
  }, [project, setProject]);

  // --- 設定変更 ---
  const handleListConfigChange = useCallback((key, value) => {
    const arr = value.split(',').map(s => s.trim()).filter(s => s);
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: { ...t.config, [key]: arr } } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, pushHistory]);

  const handleSubjectCountChange = useCallback((subj, val) => {
    const newCounts = { ...currentConfig.subjectCounts, [subj]: parseInt(val) || 0 };
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: { ...t.config, subjectCounts: newCounts } } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentConfig, pushHistory]);

  // --- 科目マスタ管理 ---
  const addSubject = useCallback((name) => {
    if (!name) return;
    const subjects = project.subjects || [];
    if (subjects.includes(name)) return;
    const newSubjects = [...subjects, name];
    // 全タブの subjectCounts にも追加（初期値 0）
    const newTabs = project.tabs.map(tab => ({
      ...tab,
      config: {
        ...tab.config,
        subjectCounts: { ...tab.config.subjectCounts, [name]: tab.config.subjectCounts[name] || 0 },
      },
    }));
    pushHistory({ ...project, subjects: newSubjects, tabs: newTabs });
  }, [project, pushHistory]);

  const removeSubject = useCallback((name) => {
    const newSubjects = (project.subjects || []).filter(s => s !== name);
    // 全タブの subjectCounts からも削除
    const newTabs = project.tabs.map(tab => {
      const newCounts = { ...tab.config.subjectCounts };
      delete newCounts[name];
      // スケジュールからも該当科目をクリア
      const newSch = {};
      Object.keys(tab.schedule).forEach(k => {
        const e = tab.schedule[k];
        newSch[k] = e.subject === name ? { ...e, subject: "", teacher: "" } : e;
      });
      return { ...tab, config: { ...tab.config, subjectCounts: newCounts }, schedule: newSch };
    });
    // 講師の担当科目からも削除
    const newTeachers = project.teachers.map(t => ({
      ...t,
      subjects: t.subjects.filter(s => s !== name),
    }));
    // カラー設定からも削除
    const newColors = { ...(project.subjectColors || {}) };
    delete newColors[name];
    pushHistory({ ...project, subjects: newSubjects, tabs: newTabs, teachers: newTeachers, subjectColors: newColors });
  }, [project, pushHistory]);

  const reorderSubjects = useCallback((fromIdx, toIdx) => {
    const subjects = [...(project.subjects || [])];
    const [moved] = subjects.splice(fromIdx, 1);
    subjects.splice(toIdx, 0, moved);
    pushHistory({ ...project, subjects });
  }, [project, pushHistory]);

  // --- 講師管理 ---
  const addTeacher = useCallback((name) => {
    if (name) pushHistory({ ...project, teachers: [...project.teachers, { name, subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] }] });
  }, [project, pushHistory]);

  const removeTeacher = useCallback((idx) => {
    const targetName = project.teachers[idx].name;
    const newTeachers = project.teachers.filter((_, i) => i !== idx);
    const newTabs = project.tabs.map(tab => {
      const newSch = { ...tab.schedule };
      Object.keys(newSch).forEach(k => { if (newSch[k].teacher === targetName) newSch[k] = { ...newSch[k], teacher: "" }; });
      return { ...tab, schedule: newSch };
    });
    pushHistory({ ...project, teachers: newTeachers, tabs: newTabs });
  }, [project, pushHistory]);

  const renameTeacher = useCallback((idx, newName) => {
    if (!newName) return;
    const oldName = project.teachers[idx].name;
    if (oldName === newName) return;
    const newTeachers = project.teachers.map((t, i) => i === idx ? { ...t, name: newName } : t);
    // 全タブのスケジュールデータの講師名を更新
    const newTabs = project.tabs.map(tab => {
      const newSch = {};
      Object.keys(tab.schedule).forEach(k => {
        const e = tab.schedule[k];
        newSch[k] = e.teacher === oldName ? { ...e, teacher: newName } : e;
      });
      return { ...tab, schedule: newSch };
    });
    // 外部カウントのキーも更新
    const newExternal = {};
    if (project.externalCounts) {
      Object.keys(project.externalCounts).forEach(k => {
        const newKey = k.endsWith(`-${oldName}`) ? k.replace(`-${oldName}`, `-${newName}`) : k;
        newExternal[newKey] = project.externalCounts[k];
      });
    }
    pushHistory({ ...project, teachers: newTeachers, tabs: newTabs, externalCounts: newExternal });
  }, [project, pushHistory]);

  const toggleTeacherSubject = useCallback((idx, subj) => {
    const newTeachers = [...project.teachers];
    const t = { ...newTeachers[idx] };
    if (t.subjects.includes(subj)) t.subjects = t.subjects.filter(s => s !== subj);
    else t.subjects = [...t.subjects, subj];
    newTeachers[idx] = t;
    pushHistory({ ...project, teachers: newTeachers });
  }, [project, pushHistory]);

  const toggleTeacherNg = useCallback((idx, date, period) => {
    const newTeachers = [...project.teachers];
    const t = { ...newTeachers[idx] };
    const k = makeNgKey(date, period);
    if (!t.ngSlots) t.ngSlots = [];
    if (t.ngSlots.includes(k)) t.ngSlots = t.ngSlots.filter(x => x !== k);
    else t.ngSlots = [...t.ngSlots, k];
    newTeachers[idx] = t;
    pushHistory({ ...project, teachers: newTeachers });
  }, [project, pushHistory]);

  const toggleTeacherClassPriority = useCallback((idx, className) => {
    const newTeachers = [...project.teachers];
    const t = { ...newTeachers[idx] };
    if (!t.ngClasses) t.ngClasses = [];
    if (!t.priorityClasses) t.priorityClasses = [];
    const isNg = t.ngClasses.includes(className);
    const isPri = t.priorityClasses.includes(className);
    if (!isNg && !isPri) { t.priorityClasses = [...t.priorityClasses, className]; }
    else if (isPri) { t.priorityClasses = t.priorityClasses.filter(c => c !== className); t.ngClasses = [...t.ngClasses, className]; }
    else { t.ngClasses = t.ngClasses.filter(c => c !== className); }
    newTeachers[idx] = t;
    pushHistory({ ...project, teachers: newTeachers });
  }, [project, pushHistory]);

  // --- スケジュール操作 ---
  // dIdx, pIdx, cIdx をインデックスとして受け取る
  const handleAssign = useCallback((dIdx, pIdx, cIdx, type, val) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    if (currentSchedule[k]?.locked) return;
    const e = { ...(currentSchedule[k] || {}) };
    if (type === 'subject') { e.subject = val; e.teacher = ""; } else { e[type] = val; }

    let newSchedule = { ...currentSchedule, [k]: e };

    // 合同グループの伝播
    const date = currentConfig.dates[dIdx];
    const subject = type === 'subject' ? val : e.subject;

    if (type === 'subject') {
      // 旧科目の合同グループをクリア
      const oldSubject = (currentSchedule[k] || {}).subject;
      if (oldSubject && oldSubject !== val) {
        const oldClassName = currentConfig.classes[cIdx];
        const oldGroup = findCombinedGroup(project.combinedGroups, oldSubject, oldClassName, date);
        if (oldGroup) {
          oldGroup.classes.forEach(gc => {
            const gci = currentConfig.classes.indexOf(gc);
            if (gci >= 0 && gci !== cIdx) {
              const gk = makeKey(dIdx, pIdx, gci);
              if (newSchedule[gk]?.subject === oldSubject && !newSchedule[gk]?.locked) {
                const { [gk]: _removed, ...rest } = newSchedule;
                newSchedule = rest;
              }
            }
          });
        }
      }
      // 新科目の合同グループに伝播
      if (val) {
        const className = currentConfig.classes[cIdx];
        const group = findCombinedGroup(project.combinedGroups, val, className, date);
        if (group) {
          group.classes.forEach(gc => {
            const gci = currentConfig.classes.indexOf(gc);
            if (gci >= 0 && gci !== cIdx) {
              const gk = makeKey(dIdx, pIdx, gci);
              if (!newSchedule[gk]?.locked) {
                newSchedule[gk] = { ...(newSchedule[gk] || {}), subject: val, teacher: "" };
              }
            }
          });
        }
      }
    } else if (type === 'teacher' && subject) {
      // 講師変更を合同グループに伝播
      const className = currentConfig.classes[cIdx];
      const group = findCombinedGroup(project.combinedGroups, subject, className, date);
      if (group) {
        group.classes.forEach(gc => {
          const gci = currentConfig.classes.indexOf(gc);
          if (gci >= 0 && gci !== cIdx) {
            const gk = makeKey(dIdx, pIdx, gci);
            if (newSchedule[gk]?.subject === subject && !newSchedule[gk]?.locked) {
              newSchedule[gk] = { ...newSchedule[gk], teacher: val };
            }
          }
        });
      }
    }

    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: newSchedule } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, currentConfig, pushHistory]);

  const toggleLock = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const e = { ...(currentSchedule[k] || {}) };
    e.locked = !e.locked;
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, pushHistory]);

  const handleRenameHeader = useCallback((type, oldVal, newVal) => {
    if (!newVal || newVal === oldVal) return;
    const newConfig = { ...currentConfig };
    if (type === 'date') newConfig.dates = newConfig.dates.map(d => d === oldVal ? newVal : d);
    else if (type === 'period') newConfig.periods = newConfig.periods.map(p => p === oldVal ? newVal : p);
    else if (type === 'class') newConfig.classes = newConfig.classes.map(c => c === oldVal ? newVal : c);

    // インデックスベースのキーは config の名称変更に影響されないため、
    // スケジュールキーの付け替えは不要。
    // ただし NG スロットの名称も更新する
    if (type === 'date' || type === 'period') {
      const newTeachers = project.teachers.map(t => {
        if (!t.ngSlots || t.ngSlots.length === 0) return t;
        const newNgSlots = t.ngSlots.map(slot => {
          if (type === 'date' && slot.startsWith(`${oldVal}-`)) {
            return slot.replace(`${oldVal}-`, `${newVal}-`);
          }
          if (type === 'period' && slot.endsWith(`-${oldVal}`)) {
            return slot.substring(0, slot.lastIndexOf(`-${oldVal}`)) + `-${newVal}`;
          }
          return slot;
        });
        return { ...t, ngSlots: newNgSlots };
      });
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: newConfig } : t);
      pushHistory({ ...project, teachers: newTeachers, tabs: newTabs });
    } else {
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: newConfig } : t);
      pushHistory({ ...project, tabs: newTabs });
    }
  }, [project, currentConfig, pushHistory]);

  const handleBulkAction = useCallback((action, type, val) => {
    const ns = { ...currentSchedule };
    let upd = false;
    currentConfig.dates.forEach((date, dIdx) => currentConfig.periods.forEach((per, pIdx) => currentConfig.classes.forEach((cls, cIdx) => {
      if ((type === 'date' && date === val) || (type === 'class' && cls === val) || (type === 'period' && per === val)) {
        const k = makeKey(dIdx, pIdx, cIdx);
        if (!ns[k]) ns[k] = {};
        if (action === 'lock-all') { ns[k] = { ...ns[k], locked: true }; upd = true; }
        if (action === 'unlock-all') { ns[k] = { ...ns[k], locked: false }; upd = true; }
        if (action === 'clear-all' && !ns[k].locked) { delete ns[k]; upd = true; }
      }
    })));
    if (upd) {
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      pushHistory({ ...project, tabs: newTabs });
    }
  }, [project, currentConfig, currentSchedule, pushHistory]);

  const handleCellCopy = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (curr.subject) return { subject: curr.subject, teacher: curr.teacher };
    return null;
  }, [currentSchedule]);

  const handleCellPaste = useCallback((dIdx, pIdx, cIdx, clipboard) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (clipboard && !curr.locked) {
      let ns = { ...currentSchedule };
      const date = currentConfig.dates[dIdx];
      const className = currentConfig.classes[cIdx];

      // 旧科目の合同グループをクリア
      if (curr.subject && curr.subject !== clipboard.subject) {
        const oldGroup = findCombinedGroup(project.combinedGroups, curr.subject, className, date);
        if (oldGroup) {
          oldGroup.classes.forEach(gc => {
            const gci = currentConfig.classes.indexOf(gc);
            if (gci >= 0 && gci !== cIdx) {
              const gk = makeKey(dIdx, pIdx, gci);
              if (ns[gk]?.subject === curr.subject && !ns[gk]?.locked) {
                delete ns[gk];
              }
            }
          });
        }
      }

      // ペースト実行
      ns[k] = { ...curr, subject: clipboard.subject, teacher: clipboard.teacher };

      // 新科目の合同グループに伝播
      if (clipboard.subject) {
        const newGroup = findCombinedGroup(project.combinedGroups, clipboard.subject, className, date);
        if (newGroup) {
          newGroup.classes.forEach(gc => {
            const gci = currentConfig.classes.indexOf(gc);
            if (gci >= 0 && gci !== cIdx) {
              const gk = makeKey(dIdx, pIdx, gci);
              if (!ns[gk]?.locked) {
                ns[gk] = { ...(ns[gk] || {}), subject: clipboard.subject, teacher: clipboard.teacher };
              }
            }
          });
        }
      }

      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      pushHistory({ ...project, tabs: newTabs });
    }
  }, [project, currentSchedule, currentConfig, pushHistory]);

  const handleCellClear = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (!curr.locked) {
      const ns = { ...currentSchedule };
      // 合同グループの連動クリア
      if (curr.subject) {
        const date = currentConfig.dates[dIdx];
        const className = currentConfig.classes[cIdx];
        const group = findCombinedGroup(project.combinedGroups, curr.subject, className, date);
        if (group) {
          group.classes.forEach(gc => {
            const gci = currentConfig.classes.indexOf(gc);
            if (gci >= 0 && gci !== cIdx) {
              const gk = makeKey(dIdx, pIdx, gci);
              if (ns[gk]?.subject === curr.subject && !ns[gk]?.locked) {
                delete ns[gk];
              }
            }
          });
        }
      }
      delete ns[k];
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      pushHistory({ ...project, tabs: newTabs });
    }
  }, [project, currentSchedule, currentConfig, pushHistory]);

  const handleSetNg = useCallback((dIdx, pIdx, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const curr = currentSchedule[k] || {};
    if (curr.teacher && curr.teacher !== "未定") {
      const teacherIdx = project.teachers.findIndex(t => t.name === curr.teacher);
      if (teacherIdx >= 0) {
        const date = currentConfig.dates[dIdx];
        const period = currentConfig.periods[pIdx];
        toggleTeacherNg(teacherIdx, date, period);
      }
    }
  }, [currentSchedule, currentConfig, project.teachers, toggleTeacherNg]);

  const handleClearUnlocked = useCallback(() => {
    const ns = {};
    Object.keys(currentSchedule).forEach(k => { if (currentSchedule[k].locked) ns[k] = currentSchedule[k]; });
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, pushHistory]);

  const handleExternalCountChange = useCallback((date, teacherName, v) => {
    const counts = { ...(project.externalCounts || {}), [makeExternalKey(date, teacherName)]: parseInt(v) || 0 };
    pushHistory({ ...project, externalCounts: counts });
  }, [project, pushHistory]);

  const handleSwapCells = useCallback((sourceKey, sourceData, targetKey, targetData) => {
    if (targetData.locked) return;
    const sParsed = parseKey(sourceKey);
    const tParsed = parseKey(targetKey);
    if (!sParsed || !tParsed) return;

    const ns = { ...currentSchedule };

    // スワップ前: 旧合同グループのセカンダリをクリア
    const clearOldCombined = (parsed, data) => {
      if (!data.subject) return;
      const date = currentConfig.dates[parsed.dIdx];
      const cls = currentConfig.classes[parsed.cIdx];
      const group = findCombinedGroup(project.combinedGroups, data.subject, cls, date);
      if (group) {
        group.classes.forEach(gc => {
          const gci = currentConfig.classes.indexOf(gc);
          if (gci >= 0 && gci !== parsed.cIdx) {
            const gk = makeKey(parsed.dIdx, parsed.pIdx, gci);
            if (ns[gk]?.subject === data.subject && !ns[gk]?.locked) {
              delete ns[gk];
            }
          }
        });
      }
    };
    clearOldCombined(sParsed, sourceData);
    clearOldCombined(tParsed, targetData);

    // スワップ実行
    ns[sourceKey] = { ...targetData, locked: false };
    ns[targetKey] = { ...sourceData, locked: false };

    // スワップ後: 新合同グループに伝播
    const propagateNewCombined = (parsed, entry) => {
      if (!entry.subject) return;
      const date = currentConfig.dates[parsed.dIdx];
      const cls = currentConfig.classes[parsed.cIdx];
      const group = findCombinedGroup(project.combinedGroups, entry.subject, cls, date);
      if (group) {
        group.classes.forEach(gc => {
          const gci = currentConfig.classes.indexOf(gc);
          if (gci >= 0 && gci !== parsed.cIdx) {
            const gk = makeKey(parsed.dIdx, parsed.pIdx, gci);
            if (!ns[gk]?.locked) {
              ns[gk] = { ...(ns[gk] || {}), subject: entry.subject, teacher: entry.teacher };
            }
          }
        });
      }
    };
    propagateNewCombined(sParsed, ns[sourceKey]);
    propagateNewCombined(tParsed, ns[targetKey]);

    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, currentSchedule, currentConfig, pushHistory]);

  // --- 自動生成パターン適用 ---
  // pat は生成時の project スナップショットを前提にしたインデックスベース
  // キー (d0-p0-c0 等) を持つ。生成中〜採用までの間にユーザが config の
  // dates/periods/classes を編集していた場合、無効キーが残ると以後の集計や
  // 表示が壊れるので cleanSchedule で範囲外キーを破棄する。
  const applyPattern = useCallback((pat) => {
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: pat } : t);
    pushHistory(cleanSchedule({ ...project, tabs: newTabs }));
  }, [project, pushHistory]);

  // --- メタデータ ---
  const updateProjectName = useCallback((name) => {
    pushHistory({ ...project, name });
  }, [project, pushHistory]);

  const updateSubjectColor = useCallback((subject, color) => {
    const newColors = { ...(project.subjectColors || {}), [subject]: color };
    pushHistory({ ...project, subjectColors: newColors });
  }, [project, pushHistory]);

  // --- 合同グループ管理 ---
  const addCombinedGroup = useCallback((group) => {
    const groups = project.combinedGroups || [];
    const newId = groups.reduce((max, g) => Math.max(max, g.id), 0) + 1;
    const newGroup = { ...group, id: newId };
    pushHistory({ ...project, combinedGroups: [...groups, newGroup] });
  }, [project, pushHistory]);

  const updateCombinedGroup = useCallback((id, updates) => {
    const newGroups = (project.combinedGroups || []).map(g => g.id === id ? { ...g, ...updates } : g);
    pushHistory({ ...project, combinedGroups: newGroups });
  }, [project, pushHistory]);

  const removeCombinedGroup = useCallback((id) => {
    const newGroups = (project.combinedGroups || []).filter(g => g.id !== id);
    pushHistory({ ...project, combinedGroups: newGroups });
  }, [project, pushHistory]);

  return {
    project,
    setProject,
    history,
    historyIndex,
    saveStatus,
    fileInputRef,
    activeTab,
    currentSchedule,
    currentConfig,
    commonSubjects,
    pushHistory,
    undo,
    redo,
    // タブ管理
    handleAddTab,
    handleDeleteTab,
    handleRenameTab,
    switchTab,
    // 設定
    handleListConfigChange,
    handleSubjectCountChange,
    // 科目マスタ
    addSubject,
    removeSubject,
    reorderSubjects,
    // 講師
    addTeacher,
    removeTeacher,
    renameTeacher,
    toggleTeacherSubject,
    toggleTeacherNg,
    toggleTeacherClassPriority,
    // スケジュール
    handleAssign,
    toggleLock,
    handleRenameHeader,
    handleBulkAction,
    handleCellCopy,
    handleCellPaste,
    handleCellClear,
    handleSetNg,
    handleClearUnlocked,
    handleExternalCountChange,
    handleSwapCells,
    // 保存/読込
    handleSaveAsDefault,
    handleResetAll,
    applyPattern,
    handleLoadJson,
    handleSaveJson,
    // メタデータ
    updateProjectName,
    // 科目カラー
    updateSubjectColor,
    // 合同グループ
    addCombinedGroup,
    updateCombinedGroup,
    removeCombinedGroup,
  };
}
