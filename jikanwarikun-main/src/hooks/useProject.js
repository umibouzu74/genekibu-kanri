import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DEFAULT_INITIAL_TEACHERS,
  DEFAULT_TAB_CONFIG_BASE,
  DEFAULT_SUBJECTS,
  DEFAULT_SUBJECT_COLORS,
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_USER_DEFAULTS,
  LEGACY_STORAGE_KEYS,
  CURRENT_PROJECT_VERSION,
  cleanSchedule,
} from '../utils/constants';
import { makeKey, parseKey, makeNgKey, makeExternalKey, migrateProject, findCombinedGroup } from '../utils/scheduleKey';

// 講師マスタの差分を検出する
function detectTeacherDiffs(currentTeachers, loadedTeachers) {
  const diffs = [];
  const currentNames = new Set(currentTeachers.map(t => t.name));
  const loadedNames = new Set(loadedTeachers.map(t => t.name));

  // 読み込みデータにのみ存在する講師
  const added = loadedTeachers.filter(t => !currentNames.has(t.name));
  if (added.length > 0) {
    diffs.push(`【追加】${added.map(t => t.name).join('、')}`);
  }

  // 現在のデータにのみ存在する講師
  const removed = currentTeachers.filter(t => !loadedNames.has(t.name));
  if (removed.length > 0) {
    diffs.push(`【削除】${removed.map(t => t.name).join('、')}`);
  }

  // 担当科目が異なる講師
  loadedTeachers.forEach(lt => {
    const ct = currentTeachers.find(t => t.name === lt.name);
    if (ct) {
      const currentSubjects = [...ct.subjects].sort().join(',');
      const loadedSubjects = [...(lt.subjects || [])].sort().join(',');
      if (currentSubjects !== loadedSubjects) {
        diffs.push(`【科目変更】${lt.name}: ${ct.subjects.join('/')} → ${lt.subjects.join('/')}`);
      }
    }
  });

  return diffs;
}

function createNewProject(tabs, teachers, subjectColors, subjects) {
  return {
    version: CURRENT_PROJECT_VERSION,
    name: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    teachers: teachers || DEFAULT_INITIAL_TEACHERS,
    activeTabId: tabs[0]?.id || 1,
    tabs,
    subjects: subjects || [...DEFAULT_SUBJECTS],
    subjectColors: subjectColors || { ...DEFAULT_SUBJECT_COLORS },
    combinedGroups: [],
    externalCounts: {},
  };
}

function loadInitialProject() {
  try {
    // 新キーから読み込み
    let savedProject = localStorage.getItem(STORAGE_KEY_PROJECT);

    // 旧キーからのマイグレーション
    if (!savedProject) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        savedProject = localStorage.getItem(legacyKey);
        if (savedProject) {
          // 新キーに移行して旧キーを削除
          localStorage.setItem(STORAGE_KEY_PROJECT, savedProject);
          localStorage.removeItem(legacyKey);
          break;
        }
      }
    }

    if (savedProject) {
      const parsed = JSON.parse(savedProject);
      return migrateProject(parsed);
    }

    const savedDefaults = localStorage.getItem(STORAGE_KEY_USER_DEFAULTS);
    // 旧キーのデフォルト設定も参照
    const legacyDefaults = !savedDefaults ? localStorage.getItem('winter_schedule_user_defaults') : null;
    const defaultsStr = savedDefaults || legacyDefaults;
    if (defaultsStr) {
      const defaults = JSON.parse(defaultsStr);
      return createNewProject(
        [{ id: 1, name: "メイン", config: defaults.config || DEFAULT_TAB_CONFIG_BASE, schedule: {} }],
        defaults.teachers || DEFAULT_INITIAL_TEACHERS,
      );
    }
  } catch (e) { console.error("Load failed", e); }

  return createNewProject([
    {
      id: 1,
      name: "中３",
      config: { ...DEFAULT_TAB_CONFIG_BASE, classes: ["３S", "３A", "３B", "３C"] },
      schedule: {}
    },
    {
      id: 2,
      name: "中１・２",
      config: { ...DEFAULT_TAB_CONFIG_BASE, classes: ["１S", "１AB", "１附属", "２S", "２AB", "２C", "２附属"] },
      schedule: {}
    }
  ]);
}

export function useProject() {
  const [project, setProject] = useState(loadInitialProject);
  const [history, setHistory] = useState(() => [project]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState("✅ 保存済");

  const fileInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const isInitialMount = useRef(true);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = history;
  historyIndexRef.current = historyIndex;

  // localStorage 自動保存
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(project));
    setSaveStatus("💾 保存中...");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus("✅ 保存済"), 800);
  }, [project]);

  const pushHistory = useCallback((newProject) => {
    const updated = { ...newProject, updatedAt: new Date().toISOString() };
    setHistory(prev => {
      const idx = historyIndexRef.current;
      const newHistory = prev.slice(0, idx + 1);
      newHistory.push(updated);
      if (newHistory.length > 50) newHistory.shift();
      const newIdx = newHistory.length - 1;
      setHistoryIndex(newIdx);
      historyIndexRef.current = newIdx;
      return newHistory;
    });
    setProject(updated);
  }, []);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx > 0) {
      setHistoryIndex(idx - 1);
      historyIndexRef.current = idx - 1;
      setProject(hist[idx - 1]);
    }
  }, []);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx < hist.length - 1) {
      setHistoryIndex(idx + 1);
      historyIndexRef.current = idx + 1;
      setProject(hist[idx + 1]);
    }
  }, []);

  // 派生データ
  const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  const currentConfig = activeTab.config;
  const commonSubjects = project.subjects || Object.keys(currentConfig.subjectCounts);

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
  }, [project]);

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
                const { [gk]: _, ...rest } = newSchedule;
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

  // --- 保存/読込 ---
  const handleSaveAsDefault = useCallback(() => {
    const defaults = { teachers: project.teachers, config: activeTab.config };
    localStorage.setItem(STORAGE_KEY_USER_DEFAULTS, JSON.stringify(defaults));
  }, [project, activeTab]);

  const handleResetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_PROJECT);
    LEGACY_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    window.location.reload();
  }, []);

  const applyPattern = useCallback((pat) => {
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: pat } : t);
    pushHistory({ ...project, tabs: newTabs });
  }, [project, pushHistory]);

  const handleLoadJson = useCallback((e, onNotify, onConfirm) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const migrated = migrateProject(data);

        // 講師マスタの差分検出
        const diffs = detectTeacherDiffs(project.teachers, migrated.teachers || []);
        if (diffs.length > 0 && onConfirm) {
          const diffText = diffs.join("\n");
          const confirmed = await onConfirm(
            `読み込むデータの講師マスタに現在のプロジェクトとの差分があります:\n\n${diffText}\n\nこのまま読み込みますか？`,
            { title: "講師マスタの差分検出", confirmLabel: "読み込む" }
          );
          if (!confirmed) return;
        }

        pushHistory(cleanSchedule(migrated));
        if (onNotify) onNotify("読込完了", "success");
      } catch {
        if (onNotify) onNotify("読み込みエラー", "error");
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }, [project.teachers, pushHistory]);

  const handleSaveJson = useCallback(() => {
    const cleaned = cleanSchedule(project);
    const b = new Blob([JSON.stringify(cleaned, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    const datePart = new Date().toISOString().slice(0, 10);
    const namePart = (project.name || "時間割").replace(/[\\/:?*[\]<>|"]/g, "");
    a.download = `${namePart}_${datePart}.json`;
    a.click();
    URL.revokeObjectURL(u);
  }, [project]);

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
