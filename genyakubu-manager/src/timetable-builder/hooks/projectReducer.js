import { makeKey, parseKey, makeNgKey, makeExternalKey } from '../utils/scheduleKey';
import {
  cleanupOldCombined,
  propagateAssignment,
  propagateTeacherChange,
} from '../utils/combinedPropagation';
import { cleanSchedule } from '../utils/constants';

// プロジェクト状態の遷移を一元化する pure reducer。
//
// state 形状:
//   {
//     project: Project,        // 現在の project
//     history: Project[],      // undo/redo 履歴 (最古 → 最新)
//     historyIndex: number,    // history 内の現在位置 (project === history[historyIndex])
//     loadError: string|null,  // 初期 load 失敗時の説明文
//   }
//
// action.type の分類:
//   - 'history/undo' | 'history/redo': 履歴を移動 (project と historyIndex を更新)
//   - 'project/setActive': project 全体を差し替え (履歴に積まない)
//   - 'tab/switch': activeTabId のみ変更 (履歴に積まない)
//   - その他: applyAction で新 project を生成、変化があれば pushToHistory で履歴に積む
//
// applyAction が同じ project 参照を返した場合は no-op として扱い、履歴も更新しない。

export const MAX_HISTORY = 50;

export function projectReducer(state, action) {
  switch (action.type) {
    case 'history/undo': {
      if (state.historyIndex <= 0) return state;
      const newIdx = state.historyIndex - 1;
      return { ...state, project: state.history[newIdx], historyIndex: newIdx };
    }
    case 'history/redo': {
      if (state.historyIndex >= state.history.length - 1) return state;
      const newIdx = state.historyIndex + 1;
      return { ...state, project: state.history[newIdx], historyIndex: newIdx };
    }
    case 'project/setActive': {
      return { ...state, project: action.payload };
    }
    case 'tab/switch': {
      return { ...state, project: { ...state.project, activeTabId: action.payload.id } };
    }
    default: {
      const newProject = applyAction(state.project, action);
      if (newProject === state.project) return state;
      return pushToHistory(state, newProject);
    }
  }
}

// 履歴に新 project を積む (updatedAt 自動付与、MAX_HISTORY 超は古い順に切る)
function pushToHistory(state, newProject) {
  const updated = { ...newProject, updatedAt: new Date().toISOString() };
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(updated);
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  return {
    ...state,
    project: updated,
    history: newHistory,
    historyIndex: newHistory.length - 1,
  };
}

// 履歴に積む系のアクションを処理する純粋関数。
// 変化が無い (no-op) 場合は引数の project をそのまま返す。
function applyAction(project, action) {
  switch (action.type) {
    // ─── タブ管理 ─────────────────────────
    case 'tab/add': {
      const { name } = action.payload;
      if (!name) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const newId = Math.max(...project.tabs.map(t => t.id)) + 1;
      const configToCopy = JSON.parse(JSON.stringify(activeTab.config));
      const newTab = { id: newId, name, config: configToCopy, schedule: {} };
      return { ...project, tabs: [...project.tabs, newTab], activeTabId: newId };
    }
    case 'tab/delete': {
      const { id } = action.payload;
      if (project.tabs.length <= 1) return project;
      const newTabs = project.tabs.filter(t => t.id !== id);
      return { ...project, tabs: newTabs, activeTabId: newTabs[0].id };
    }
    case 'tab/rename': {
      const { id, name } = action.payload;
      if (!name) return project;
      return { ...project, tabs: project.tabs.map(t => t.id === id ? { ...t, name } : t) };
    }

    // ─── タブ別 config ───────────────────
    case 'config/setList': {
      const { key, value } = action.payload;
      const arr = value.split(',').map(s => s.trim()).filter(s => s);
      const newTabs = project.tabs.map(t =>
        t.id === project.activeTabId ? { ...t, config: { ...t.config, [key]: arr } } : t
      );
      return { ...project, tabs: newTabs };
    }
    case 'config/setSubjectCount': {
      const { subject, value } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const newCounts = { ...activeTab.config.subjectCounts, [subject]: parseInt(value) || 0 };
      const newTabs = project.tabs.map(t =>
        t.id === project.activeTabId ? { ...t, config: { ...t.config, subjectCounts: newCounts } } : t
      );
      return { ...project, tabs: newTabs };
    }

    // ─── 科目マスタ ──────────────────────
    case 'subject/add': {
      const { name } = action.payload;
      if (!name) return project;
      const subjects = project.subjects || [];
      if (subjects.includes(name)) return project;
      const newSubjects = [...subjects, name];
      const newTabs = project.tabs.map(tab => ({
        ...tab,
        config: {
          ...tab.config,
          subjectCounts: { ...tab.config.subjectCounts, [name]: tab.config.subjectCounts[name] || 0 },
        },
      }));
      return { ...project, subjects: newSubjects, tabs: newTabs };
    }
    case 'subject/remove': {
      const { name } = action.payload;
      const newSubjects = (project.subjects || []).filter(s => s !== name);
      const newTabs = project.tabs.map(tab => {
        const newCounts = { ...tab.config.subjectCounts };
        delete newCounts[name];
        const newSch = {};
        Object.keys(tab.schedule).forEach(k => {
          const e = tab.schedule[k];
          newSch[k] = e.subject === name ? { ...e, subject: '', teacher: '' } : e;
        });
        return { ...tab, config: { ...tab.config, subjectCounts: newCounts }, schedule: newSch };
      });
      const newTeachers = project.teachers.map(t => ({
        ...t,
        subjects: t.subjects.filter(s => s !== name),
      }));
      const newColors = { ...(project.subjectColors || {}) };
      delete newColors[name];
      return {
        ...project,
        subjects: newSubjects,
        tabs: newTabs,
        teachers: newTeachers,
        subjectColors: newColors,
      };
    }
    case 'subject/reorder': {
      const { fromIdx, toIdx } = action.payload;
      const subjects = [...(project.subjects || [])];
      const [moved] = subjects.splice(fromIdx, 1);
      subjects.splice(toIdx, 0, moved);
      return { ...project, subjects };
    }
    case 'subject/setColor': {
      const { subject, color } = action.payload;
      const newColors = { ...(project.subjectColors || {}), [subject]: color };
      return { ...project, subjectColors: newColors };
    }

    // ─── 講師 ────────────────────────────
    case 'teacher/add': {
      const { name } = action.payload;
      if (!name) return project;
      return {
        ...project,
        teachers: [
          ...project.teachers,
          { name, subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
        ],
      };
    }
    case 'teacher/remove': {
      const { idx } = action.payload;
      const targetName = project.teachers[idx].name;
      const newTeachers = project.teachers.filter((_, i) => i !== idx);
      const newTabs = project.tabs.map(tab => {
        const newSch = { ...tab.schedule };
        Object.keys(newSch).forEach(k => {
          if (newSch[k].teacher === targetName) newSch[k] = { ...newSch[k], teacher: '' };
        });
        return { ...tab, schedule: newSch };
      });
      return { ...project, teachers: newTeachers, tabs: newTabs };
    }
    case 'teacher/rename': {
      const { idx, newName } = action.payload;
      if (!newName) return project;
      const oldName = project.teachers[idx].name;
      if (oldName === newName) return project;
      const newTeachers = project.teachers.map((t, i) => i === idx ? { ...t, name: newName } : t);
      const newTabs = project.tabs.map(tab => {
        const newSch = {};
        Object.keys(tab.schedule).forEach(k => {
          const e = tab.schedule[k];
          newSch[k] = e.teacher === oldName ? { ...e, teacher: newName } : e;
        });
        return { ...tab, schedule: newSch };
      });
      const newExternal = {};
      if (project.externalCounts) {
        Object.keys(project.externalCounts).forEach(k => {
          const newKey = k.endsWith(`-${oldName}`) ? k.replace(`-${oldName}`, `-${newName}`) : k;
          newExternal[newKey] = project.externalCounts[k];
        });
      }
      return { ...project, teachers: newTeachers, tabs: newTabs, externalCounts: newExternal };
    }
    case 'teacher/toggleSubject': {
      const { idx, subject } = action.payload;
      const newTeachers = [...project.teachers];
      const t = { ...newTeachers[idx] };
      if (t.subjects.includes(subject)) t.subjects = t.subjects.filter(s => s !== subject);
      else t.subjects = [...t.subjects, subject];
      newTeachers[idx] = t;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/toggleNg': {
      const { idx, date, period } = action.payload;
      const newTeachers = [...project.teachers];
      const t = { ...newTeachers[idx] };
      const k = makeNgKey(date, period);
      if (!t.ngSlots) t.ngSlots = [];
      if (t.ngSlots.includes(k)) t.ngSlots = t.ngSlots.filter(x => x !== k);
      else t.ngSlots = [...t.ngSlots, k];
      newTeachers[idx] = t;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/toggleClassPriority': {
      const { idx, className } = action.payload;
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
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/setExternalCount': {
      const { date, teacherName, value } = action.payload;
      const counts = {
        ...(project.externalCounts || {}),
        [makeExternalKey(date, teacherName)]: parseInt(value) || 0,
      };
      return { ...project, externalCounts: counts };
    }

    // ─── セル操作 ────────────────────────
    case 'cell/assign': {
      const { dIdx, pIdx, cIdx, type, val } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = activeTab.config;

      const k = makeKey(dIdx, pIdx, cIdx);
      if (currentSchedule[k]?.locked) return project;

      const e = { ...(currentSchedule[k] || {}) };
      if (type === 'subject') { e.subject = val; e.teacher = ''; } else { e[type] = val; }

      let newSchedule = { ...currentSchedule, [k]: e };
      const groups = project.combinedGroups;

      if (type === 'subject') {
        const oldSubject = (currentSchedule[k] || {}).subject;
        if (oldSubject && oldSubject !== val) {
          newSchedule = cleanupOldCombined(newSchedule, currentConfig, groups, dIdx, pIdx, cIdx, oldSubject);
        }
        newSchedule = propagateAssignment(newSchedule, currentConfig, groups, dIdx, pIdx, cIdx, e);
      } else if (type === 'teacher' && e.subject) {
        newSchedule = propagateTeacherChange(newSchedule, currentConfig, groups, dIdx, pIdx, cIdx, e.subject, val);
      }

      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: newSchedule } : t);
      return { ...project, tabs: newTabs };
    }
    case 'cell/toggleLock': {
      const { dIdx, pIdx, cIdx } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const k = makeKey(dIdx, pIdx, cIdx);
      const e = { ...(activeTab.schedule[k] || {}) };
      e.locked = !e.locked;
      const newTabs = project.tabs.map(t =>
        t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t
      );
      return { ...project, tabs: newTabs };
    }
    case 'cell/clear': {
      const { dIdx, pIdx, cIdx } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = activeTab.config;
      const k = makeKey(dIdx, pIdx, cIdx);
      const curr = currentSchedule[k] || {};
      if (curr.locked) return project;

      let ns = cleanupOldCombined(currentSchedule, currentConfig, project.combinedGroups, dIdx, pIdx, cIdx, curr.subject);
      ns = { ...ns };
      delete ns[k];
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'cell/paste': {
      const { dIdx, pIdx, cIdx, clipboard } = action.payload;
      if (!clipboard) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = activeTab.config;
      const k = makeKey(dIdx, pIdx, cIdx);
      const curr = currentSchedule[k] || {};
      if (curr.locked) return project;

      let ns = { ...currentSchedule };
      const groups = project.combinedGroups;

      if (curr.subject && curr.subject !== clipboard.subject) {
        ns = cleanupOldCombined(ns, currentConfig, groups, dIdx, pIdx, cIdx, curr.subject);
      }

      const newEntry = { ...curr, subject: clipboard.subject, teacher: clipboard.teacher };
      ns[k] = newEntry;
      ns = propagateAssignment(ns, currentConfig, groups, dIdx, pIdx, cIdx, newEntry);

      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'cell/swap': {
      const { sourceKey, sourceData, targetKey, targetData } = action.payload;
      if (targetData.locked) return project;
      const sParsed = parseKey(sourceKey);
      const tParsed = parseKey(targetKey);
      if (!sParsed || !tParsed) return project;

      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = activeTab.config;
      const groups = project.combinedGroups;
      let ns = { ...currentSchedule };

      ns = cleanupOldCombined(ns, currentConfig, groups, sParsed.dIdx, sParsed.pIdx, sParsed.cIdx, sourceData.subject);
      ns = cleanupOldCombined(ns, currentConfig, groups, tParsed.dIdx, tParsed.pIdx, tParsed.cIdx, targetData.subject);

      ns = { ...ns };
      ns[sourceKey] = { ...targetData, locked: false };
      ns[targetKey] = { ...sourceData, locked: false };

      ns = propagateAssignment(ns, currentConfig, groups, sParsed.dIdx, sParsed.pIdx, sParsed.cIdx, ns[sourceKey]);
      ns = propagateAssignment(ns, currentConfig, groups, tParsed.dIdx, tParsed.pIdx, tParsed.cIdx, ns[targetKey]);

      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'cell/setNg': {
      // 指定セルの講師の NG slot を toggle する。teacher が未定 or 未割当なら no-op。
      // handleSetNg のロジックを 1 アクションに集約 (元は cell の state を読んで
      // teacher/toggleNg を呼び出すラッパだった)。
      const { dIdx, pIdx, cIdx } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const k = makeKey(dIdx, pIdx, cIdx);
      const curr = activeTab.schedule[k] || {};
      if (!curr.teacher || curr.teacher === '未定') return project;
      const teacherIdx = project.teachers.findIndex(t => t.name === curr.teacher);
      if (teacherIdx < 0) return project;
      const date = activeTab.config.dates[dIdx];
      const period = activeTab.config.periods[pIdx];
      const newTeachers = [...project.teachers];
      const t = { ...newTeachers[teacherIdx] };
      const ngK = makeNgKey(date, period);
      if (!t.ngSlots) t.ngSlots = [];
      if (t.ngSlots.includes(ngK)) t.ngSlots = t.ngSlots.filter(x => x !== ngK);
      else t.ngSlots = [...t.ngSlots, ngK];
      newTeachers[teacherIdx] = t;
      return { ...project, teachers: newTeachers };
    }

    // ─── スケジュール一括/メタ ───────────
    case 'schedule/renameHeader': {
      const { type, oldVal, newVal } = action.payload;
      if (!newVal || newVal === oldVal) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const newConfig = { ...activeTab.config };
      if (type === 'date') newConfig.dates = newConfig.dates.map(d => d === oldVal ? newVal : d);
      else if (type === 'period') newConfig.periods = newConfig.periods.map(p => p === oldVal ? newVal : p);
      else if (type === 'class') newConfig.classes = newConfig.classes.map(c => c === oldVal ? newVal : c);

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
        return { ...project, teachers: newTeachers, tabs: newTabs };
      }
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: newConfig } : t);
      return { ...project, tabs: newTabs };
    }
    case 'schedule/bulkAction': {
      const { action: bulk, type, val } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = activeTab.config;

      const ns = { ...currentSchedule };
      let upd = false;
      currentConfig.dates.forEach((date, dIdx) => currentConfig.periods.forEach((per, pIdx) => currentConfig.classes.forEach((cls, cIdx) => {
        if ((type === 'date' && date === val) || (type === 'class' && cls === val) || (type === 'period' && per === val)) {
          const k = makeKey(dIdx, pIdx, cIdx);
          if (!ns[k]) ns[k] = {};
          if (bulk === 'lock-all') { ns[k] = { ...ns[k], locked: true }; upd = true; }
          if (bulk === 'unlock-all') { ns[k] = { ...ns[k], locked: false }; upd = true; }
          if (bulk === 'clear-all' && !ns[k].locked) { delete ns[k]; upd = true; }
        }
      })));
      if (!upd) return project;
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'schedule/clearUnlocked': {
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const ns = {};
      Object.keys(activeTab.schedule).forEach(k => {
        if (activeTab.schedule[k].locked) ns[k] = activeTab.schedule[k];
      });
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'schedule/applyPattern': {
      const { pat } = action.payload;
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: pat } : t);
      return cleanSchedule({ ...project, tabs: newTabs });
    }

    // ─── 合同グループ ────────────────────
    case 'combinedGroup/add': {
      const { group } = action.payload;
      const groups = project.combinedGroups || [];
      const newId = groups.reduce((max, g) => Math.max(max, g.id), 0) + 1;
      return { ...project, combinedGroups: [...groups, { ...group, id: newId }] };
    }
    case 'combinedGroup/update': {
      const { id, updates } = action.payload;
      const newGroups = (project.combinedGroups || []).map(g => g.id === id ? { ...g, ...updates } : g);
      return { ...project, combinedGroups: newGroups };
    }
    case 'combinedGroup/remove': {
      const { id } = action.payload;
      const newGroups = (project.combinedGroups || []).filter(g => g.id !== id);
      return { ...project, combinedGroups: newGroups };
    }

    // ─── プロジェクト全体 ────────────────
    case 'project/updateName': {
      return { ...project, name: action.payload.name };
    }
    case 'project/replace': {
      // JSON 読込で project 全体を差し替える (cleanSchedule 済みのものを渡す前提)
      return action.payload.project;
    }

    default:
      return project;
  }
}
