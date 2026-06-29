import { makeKey, parseKey, makeNgKey, makeExternalKey, activeDatesForTab } from '../utils/scheduleKey';
import {
  cleanupOldCombined,
  propagateAssignment,
  propagateTeacherChange,
} from '../utils/combinedPropagation';
import { cleanSchedule, clampGenerationParam } from '../utils/constants';

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
    case 'project/reset': {
      // 全リセット: project を差し替えて history も初期化。Undo で reset 前の
      // 状態に戻れないようにする (戻れると誤クリックで全部消えるリスクが大きい)。
      const fresh = action.payload;
      return { project: fresh, history: [fresh], historyIndex: 0, loadError: null };
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

// ─── cascade cleanup ヘルパー ────────────────────────────────────
// combinedGroups と externalCounts はラベルベースで cross-tab 参照されるため、
// クラス/日付/科目/講師の編集に応じて孤児を防ぐ。

// 残るラベル集合に合うよう combinedGroups から消えたものを filter。
// dimension: 'classes' | 'dates'
function cleanCombinedGroupsForLabelChange(groups, dimension, validLabelSet) {
  return groups
    .map(g => {
      if (dimension === 'classes') {
        const newClasses = g.classes.filter(c => validLabelSet.has(c));
        return { ...g, classes: newClasses };
      }
      // dimension === 'dates' (null は全日扱いで不変)
      if (g.dates === null) return g;
      const newDates = g.dates.filter(d => validLabelSet.has(d));
      return { ...g, dates: newDates };
    })
    .filter(g => {
      if (dimension === 'classes') return g.classes.length >= 2; // 1 クラスでは合同にならない
      // dates の全消失は「全日無し」= 対象が無いので drop。null (全日) は残す。
      return g.dates === null || g.dates.length > 0;
    });
}

// 科目削除に伴う combinedGroups の cleanup。subject 一致グループを drop。
function cleanCombinedGroupsForSubjectRemoval(groups, removedSubject) {
  return groups.filter(g => g.subject !== removedSubject);
}

// クラス/日付ラベルのリネームに伴う combinedGroups の label 書き換え。
function renameCombinedGroupsLabel(groups, dimension, oldLabel, newLabel) {
  return groups.map(g => {
    if (dimension === 'classes') {
      return { ...g, classes: g.classes.map(c => c === oldLabel ? newLabel : c) };
    }
    // dimension === 'dates'
    if (g.dates === null) return g;
    return { ...g, dates: g.dates.map(d => d === oldLabel ? newLabel : d) };
  });
}

// 講師削除に伴う externalCounts の cleanup。`{date}-{teacherName}` 形式のキーを
// 末尾一致で drop する。
function cleanExternalCountsForTeacher(externalCounts, teacherName) {
  if (!externalCounts) return externalCounts;
  const suffix = `-${teacherName}`;
  const out = {};
  Object.keys(externalCounts).forEach(k => {
    if (!k.endsWith(suffix)) out[k] = externalCounts[k];
  });
  return out;
}

// 講師削除に伴う externalSessions の cleanup。teacherName が一致する
// 詳細セッションを drop する。残しておくと「孤児セッション」として UI に
// 表示されるが自動NGの対象から外れ、状態が乖離する。
function cleanExternalSessionsForTeacher(externalSessions, teacherName) {
  if (!externalSessions) return externalSessions;
  return externalSessions.filter(s => s.teacherName !== teacherName);
}

// 講師リネームに伴う externalSessions の teacherName 書き換え。
function renameExternalSessionsTeacher(externalSessions, oldName, newName) {
  if (!externalSessions) return externalSessions;
  return externalSessions.map(s =>
    s.teacherName === oldName ? { ...s, teacherName: newName } : s
  );
}

// 日付ラベルのリネームに伴う externalCounts キーの書き換え。
// キー形式は `{dateLabel}-{teacherName}` で、dateLabel が先頭一致するものを更新。
function renameExternalCountsDateLabel(externalCounts, oldLabel, newLabel) {
  if (!externalCounts) return externalCounts;
  const prefix = `${oldLabel}-`;
  const out = {};
  Object.keys(externalCounts).forEach(k => {
    if (k.startsWith(prefix)) {
      out[`${newLabel}-${k.substring(prefix.length)}`] = externalCounts[k];
    } else {
      out[k] = externalCounts[k];
    }
  });
  return out;
}

// v4: dates / periods は project 共通。tab.config (classes / subjectCounts) に
// project の dates / periods をマージした『実効 config』を返す。schedule の
// cascade ロジック (combinedPropagation 等) は config.dates / .periods を読むため、
// reducer 内でもこの実効 config を渡す必要がある。
function effectiveConfig(project, tab) {
  // dates は『このタブが使う日』(activeDateIds で絞った subset)、periods は project 共通。
  return { ...tab.config, dates: activeDatesForTab(project.dates, tab), periods: project.periods || [] };
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
      // 削除タブに紐づくスナップショットも併せて掃除 (orphan 防止)。
      const snapshots = project.snapshots || [];
      const newSnapshots = snapshots.filter(s => s.tabId !== id);
      return {
        ...project,
        tabs: newTabs,
        activeTabId: newTabs[0].id,
        ...(newSnapshots.length !== snapshots.length ? { snapshots: newSnapshots } : {}),
      };
    }
    case 'tab/rename': {
      const { id, name } = action.payload;
      if (!name) return project;
      return { ...project, tabs: project.tabs.map(t => t.id === id ? { ...t, name } : t) };
    }

    // ─── タブ別 config ───────────────────
    case 'config/setList': {
      // value はカンマ区切りのラベル文字列。key は 'dates' | 'periods' | 'classes'。
      // v3: 既存ラベル一致 entity は ID を維持、新規ラベルには nextId を採番、
      // 消えたラベルの entity は drop。これで schedule キー (ID ベース) の継続性を
      // 担保しつつ UI 編集 (ラベル並び替え/追加/削除) を反映できる。
      // 重複ラベルは dedupe (同じラベルが複数あっても entity は 1 つに集約)。
      // v4: key='dates' | 'periods' は project 共通 (全タブに反映)、
      // key='classes' は従来どおり active タブ単位。
      const { key, value } = action.payload;
      const isShared = key === 'dates' || key === 'periods';
      const rawLabels = value.split(',').map(s => s.trim()).filter(s => s);
      const newLabels = [...new Set(rawLabels)]; // 重複除去 (順序は保つ)
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const oldArr = isShared ? (project[key] || []) : (activeTab.config[key] || []);
      const oldByLabel = new Map(oldArr.map(e => [e.label, e]));
      const resultArr = [];
      newLabels.forEach(label => {
        const existing = oldByLabel.get(label);
        if (existing) {
          resultArr.push(existing);
        } else {
          // nextId はこれまでの (resultArr に積んだ + 元 oldArr の) ID 全体から max+1
          const usedIds = new Set([...resultArr.map(e => e.id), ...oldArr.map(e => e.id)]);
          let candidate = 1;
          while (usedIds.has(candidate)) candidate++;
          resultArr.push({ id: candidate, label });
        }
      });
      // 書き込み先: shared は project[key]、classes は active タブの config。
      const baseProject = isShared
        ? { ...project, [key]: resultArr }
        : {
            ...project,
            tabs: project.tabs.map(t =>
              t.id === project.activeTabId ? { ...t, config: { ...t.config, [key]: resultArr } } : t
            ),
          };
      // ラベル削除に伴う combinedGroups の cascade cleanup:
      // - key='classes': 消えたクラスを groups[*].classes から filter、結果が <2
      //   なら group ごと削除
      // - key='dates': 消えたラベルを groups[*].dates から filter (null は全日扱いで不変)
      //   結果が空配列ならグループ自体は残す? UI 上は「対象日なし」になるので drop。
      // - key='periods': groups に period 次元は無いので影響無し
      let newCombined = baseProject.combinedGroups;
      if (key === 'classes' || key === 'dates') {
        newCombined = cleanCombinedGroupsForLabelChange(
          baseProject.combinedGroups || [],
          key === 'classes' ? 'classes' : 'dates',
          new Set(newLabels)
        );
      }
      // cleanSchedule で消えた entity を参照する schedule キーを掃除する
      // (dates/periods は project 共通なので全タブの schedule が対象)。
      return cleanSchedule({ ...baseProject, combinedGroups: newCombined });
    }
    case 'config/setSubjectCount': {
      // tabId 省略時はアクティブタブを対象にする (従来挙動)。
      // SubjectManager の「タブ別コマ数」編集では各タブの id を明示で渡す。
      const { subject, value, tabId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId) || project.tabs[0];
      if (!target) return project;
      const newCounts = { ...target.config.subjectCounts, [subject]: parseInt(value) || 0 };
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, subjectCounts: newCounts } } : t
      );
      return { ...project, tabs: newTabs };
    }

    // ─── タブ別『使う日』(activeDateIds) + 共通日付プール ─────
    // v4(Y): project.dates は全タブの和集合プール (NG はこの全日に設定可)。
    // 各タブは config.activeDateIds で『この学年が使う日』を選ぶ (未指定=全日)。

    // ラベル配列でタブの使う日を設定する。新規ラベルはプールへ merge (id 採番)、
    // タブの activeDateIds を該当 id 群に更新。手動入力 / 自動生成の両方が使う。
    // プールから日付を削除はしない (削除は dates/removeFromPool)。
    case 'tabDates/setByLabels': {
      const { tabId, labels } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId) || project.tabs[0];
      if (!target) return project;
      const cleanLabels = [...new Set((labels || []).map(s => String(s).trim()).filter(Boolean))];
      const pool = project.dates || [];
      const poolByLabel = new Map(pool.map(d => [d.label, d]));
      let nextIdNum = pool.reduce((max, d) => Math.max(max, d.id), 0) + 1;
      const newPool = [...pool];
      const activeIds = [];
      cleanLabels.forEach(label => {
        let ent = poolByLabel.get(label);
        if (!ent) {
          ent = { id: nextIdNum++, label };
          newPool.push(ent);
          poolByLabel.set(label, ent);
        }
        activeIds.push(ent.id);
      });
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, activeDateIds: activeIds } } : t
      );
      // プールは増えるだけなので cell は落ちないが、整合のため cleanSchedule を通す。
      return cleanSchedule({ ...project, dates: newPool, tabs: newTabs });
    }

    // チェックリストの単一トグル。プールは変更せず active 集合だけ更新する
    // (off にしてもその日付の cell / NG は保持され、再 on で復活する)。
    case 'tabDates/toggle': {
      const { tabId, dateId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId) || project.tabs[0];
      if (!target) return project;
      const pool = project.dates || [];
      if (!pool.some(d => d.id === dateId)) return project;
      const current = target.config.activeDateIds ?? pool.map(d => d.id);
      const set = new Set(current);
      if (set.has(dateId)) set.delete(dateId); else set.add(dateId);
      const activeIds = pool.map(d => d.id).filter(id => set.has(id));
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, activeDateIds: activeIds } } : t
      );
      return { ...project, tabs: newTabs };
    }

    // 全選択 (active=true → null = 全日) / 全解除 (active=false → []).
    case 'tabDates/setAllActive': {
      const { tabId, active } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId) || project.tabs[0];
      if (!target) return project;
      const activeDateIds = active ? null : [];
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, activeDateIds } } : t
      );
      return { ...project, tabs: newTabs };
    }

    // 日付をプールから完全削除 (全タブ・NG から消える)。cascade で schedule /
    // combinedGroups を掃除し、全タブの activeDateIds からも除去する。
    case 'dates/removeFromPool': {
      const { dateId } = action.payload;
      const pool = project.dates || [];
      const target = pool.find(d => d.id === dateId);
      if (!target) return project;
      const newPool = pool.filter(d => d.id !== dateId);
      const newTabs = project.tabs.map(t => {
        const ids = t.config.activeDateIds;
        if (!ids || !ids.includes(dateId)) return t;
        return { ...t, config: { ...t.config, activeDateIds: ids.filter(id => id !== dateId) } };
      });
      const newCombined = cleanCombinedGroupsForLabelChange(
        project.combinedGroups || [],
        'dates',
        new Set(newPool.map(d => d.label)),
      );
      return cleanSchedule({ ...project, dates: newPool, tabs: newTabs, combinedGroups: newCombined });
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
      // 削除された科目を参照する合同グループも drop (cascade)
      const newCombined = cleanCombinedGroupsForSubjectRemoval(project.combinedGroups || [], name);
      return {
        ...project,
        subjects: newSubjects,
        tabs: newTabs,
        teachers: newTeachers,
        subjectColors: newColors,
        combinedGroups: newCombined,
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
      // 同名講師は許可しない。許すと NG / クラス優先度 / 他学年セッション
      // 等が teacher.name で参照されるため UI 上どちらの行を操作している
      // のか区別できず silent data 混線を生む (code-review P1)。
      if (project.teachers.some(t => t.name === name)) return project;
      return {
        ...project,
        teachers: [
          ...project.teachers,
          { name, subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
        ],
      };
    }
    case 'teacher/import': {
      // D6a: CSV から複数講師を atomic に投入する。
      // mode='append' (デフォルト): 既存に追加、同名は subjects を新しい
      //   値で上書きしつつ ngSlots/ngClasses/priorityClasses は維持。
      // mode='replace': 既存の teachers を全て破棄して payload に置き換える。
      //   ng/priority と externalCounts/externalSessions も新講師リストに
      //   含まれないものは孤児になるので drop。
      const { teachers: incoming, mode = 'append' } = action.payload;
      if (!Array.isArray(incoming) || incoming.length === 0) return project;
      if (mode === 'replace') {
        const newTeachers = incoming.map(t => ({
          name: t.name,
          subjects: Array.isArray(t.subjects) ? t.subjects : [],
          ngSlots: [],
          ngClasses: [],
          priorityClasses: [],
        }));
        // 新講師リストに含まれない名前のセッションは孤児なので drop。
        // externalCounts キー (`{date}-{teacherName}`) も同様。
        const validNames = new Set(newTeachers.map(t => t.name));
        const newSessions = (project.externalSessions || []).filter(s => validNames.has(s.teacherName));
        const newExternalCounts = {};
        Object.keys(project.externalCounts || {}).forEach(k => {
          // suffix が validNames に含まれるかは末尾一致でチェック
          for (const name of validNames) {
            if (k.endsWith(`-${name}`)) {
              newExternalCounts[k] = project.externalCounts[k];
              break;
            }
          }
        });
        return {
          ...project,
          teachers: newTeachers,
          externalSessions: newSessions,
          externalCounts: newExternalCounts,
        };
      }
      const map = new Map(project.teachers.map(t => [t.name, t]));
      incoming.forEach(t => {
        const subjects = Array.isArray(t.subjects) ? t.subjects : [];
        const existing = map.get(t.name);
        if (existing) {
          map.set(t.name, { ...existing, subjects });
        } else {
          map.set(t.name, { name: t.name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [] });
        }
      });
      return { ...project, teachers: Array.from(map.values()) };
    }
    case 'teacher/remove': {
      const { idx } = action.payload;
      if (idx == null || idx < 0 || idx >= project.teachers.length) return project;
      const targetName = project.teachers[idx].name;
      const newTeachers = project.teachers.filter((_, i) => i !== idx);
      const newTabs = project.tabs.map(tab => {
        const newSch = { ...tab.schedule };
        Object.keys(newSch).forEach(k => {
          if (newSch[k].teacher === targetName) newSch[k] = { ...newSch[k], teacher: '' };
        });
        return { ...tab, schedule: newSch };
      });
      // 削除された講師の externalCounts キーと externalSessions も drop
      // (孤児化防止)。残すと UI には表示されるのに自動NG派生の対象から
      // 外れて状態が乖離する。
      const newExternal = cleanExternalCountsForTeacher(project.externalCounts, targetName);
      const newSessions = cleanExternalSessionsForTeacher(project.externalSessions, targetName);
      return { ...project, teachers: newTeachers, tabs: newTabs, externalCounts: newExternal, externalSessions: newSessions };
    }
    case 'teacher/rename': {
      const { idx, newName } = action.payload;
      if (!newName) return project;
      if (idx == null || idx < 0 || idx >= project.teachers.length) return project;
      const oldName = project.teachers[idx].name;
      if (oldName === newName) return project;
      // 別の講師と同名になるリネームは reject (同名チェックは teacher/add と
      // 同じ理由: silent data 混線を防ぐ)
      if (project.teachers.some((t, i) => i !== idx && t.name === newName)) return project;
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
      // externalSessions の teacherName も追従させる (孤児化防止)。
      const newSessions = renameExternalSessionsTeacher(project.externalSessions, oldName, newName);
      return { ...project, teachers: newTeachers, tabs: newTabs, externalCounts: newExternal, externalSessions: newSessions };
    }
    case 'teacher/toggleSubject': {
      const { idx, subject } = action.payload;
      if (idx == null || idx < 0 || idx >= project.teachers.length) return project;
      const newTeachers = [...project.teachers];
      const t = { ...newTeachers[idx] };
      if (t.subjects.includes(subject)) t.subjects = t.subjects.filter(s => s !== subject);
      else t.subjects = [...t.subjects, subject];
      newTeachers[idx] = t;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/toggleNg': {
      const { idx, date, period } = action.payload;
      // idx 不正 (undefined / 範囲外) は no-op。UI 側の teacherIdxByName 解決が
      // 失敗した場合に reducer まで届くので、ここで防衛しておくと
      // 'newTeachers[undefined] = t' で arrays が文字列キーで汚染される
      // 事故を防げる (code-review P3)。
      if (idx == null || idx < 0 || idx >= project.teachers.length) return project;
      const newTeachers = [...project.teachers];
      const t = { ...newTeachers[idx] };
      const k = makeNgKey(date, period);
      if (!t.ngSlots) t.ngSlots = [];
      if (t.ngSlots.includes(k)) t.ngSlots = t.ngSlots.filter(x => x !== k);
      else t.ngSlots = [...t.ngSlots, k];
      newTeachers[idx] = t;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/setNgBatch': {
      const { idxs, dateLabels, periodLabels, value } = action.payload;
      if (!idxs?.length || !dateLabels?.length || !periodLabels?.length) return project;
      const newTeachers = [...project.teachers];
      let changed = false;
      for (const idx of idxs) {
        if (idx < 0 || idx >= newTeachers.length) continue;
        const t = newTeachers[idx];
        const ngSet = new Set(t.ngSlots || []);
        const before = ngSet.size;
        for (const d of dateLabels) {
          for (const p of periodLabels) {
            const k = makeNgKey(d, p);
            if (value) ngSet.add(k);
            else ngSet.delete(k);
          }
        }
        if (ngSet.size !== before) {
          newTeachers[idx] = { ...t, ngSlots: Array.from(ngSet) };
          changed = true;
        }
      }
      if (!changed) return project;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/importNg': {
      // E2a: NG 日時 CSV を atomic に投入する。entries は
      // [{ name, date, period }]。name が既存講師に一致する行のみ反映し、
      // makeNgKey(date, period) を ngSlots に追加 (dedupe)。一致しない name は
      // skip (CSV パース側で unknownTeachers として warning 済み)。
      const { entries } = action.payload;
      if (!Array.isArray(entries) || entries.length === 0) return project;
      // name → 追加すべき ngKey の集合
      const addByName = new Map();
      for (const e of entries) {
        if (!e || !e.name || !e.date || !e.period) continue;
        const k = makeNgKey(e.date, e.period);
        if (!addByName.has(e.name)) addByName.set(e.name, new Set());
        addByName.get(e.name).add(k);
      }
      if (addByName.size === 0) return project;
      let changed = false;
      const newTeachers = project.teachers.map(t => {
        const toAdd = addByName.get(t.name);
        if (!toAdd) return t;
        const ngSet = new Set(t.ngSlots || []);
        const before = ngSet.size;
        toAdd.forEach(k => ngSet.add(k));
        if (ngSet.size === before) return t;
        changed = true;
        return { ...t, ngSlots: Array.from(ngSet) };
      });
      if (!changed) return project;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/toggleClassPriority': {
      const { idx, className } = action.payload;
      if (idx == null || idx < 0 || idx >= project.teachers.length) return project;
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
    case 'teacher/addExternalSession': {
      // 構造化時刻 (startTime / endTime, HH:mm) は省略可。あれば
      // 自動NG派生 (utils/autoNg) の対象になる。空文字列は格納しない。
      // endTime だけが指定されて startTime が空の場合は endTime も
      // 落とす (orphan endTime を残すと getSessionTimeRange が start を
      // 復元できず、データだけが残って自動NGに反映されない silent failure
      // になるため)。
      const { date, teacherName, label, memo, startTime, endTime } = action.payload;
      if (!date || !teacherName) return project;
      const sessions = project.externalSessions || [];
      const newId = sessions.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      const newSession = { id: newId, date, teacherName, label: label || '', memo: memo || '' };
      if (startTime) {
        newSession.startTime = startTime;
        if (endTime) newSession.endTime = endTime;
      }
      return {
        ...project,
        externalSessions: [...sessions, newSession],
      };
    }
    case 'teacher/addExternalSessions': {
      // 複数日の詳細セッションを 1 アクションで atomic に追加する
      // (UI でレンジ指定された場合に N 件の dispatch にならないように)。
      // payload.items = [{ date, teacherName, label, memo, startTime?, endTime? }, ...]
      const { items } = action.payload;
      if (!Array.isArray(items) || items.length === 0) return project;
      const sessions = project.externalSessions || [];
      let nextId = sessions.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      const newOnes = [];
      for (const it of items) {
        if (!it?.date || !it?.teacherName) continue;
        const ns = { id: nextId++, date: it.date, teacherName: it.teacherName, label: it.label || '', memo: it.memo || '' };
        if (it.startTime) {
          ns.startTime = it.startTime;
          if (it.endTime) ns.endTime = it.endTime;
        }
        newOnes.push(ns);
      }
      if (newOnes.length === 0) return project;
      return { ...project, externalSessions: [...sessions, ...newOnes] };
    }
    case 'teacher/removeExternalSession': {
      const { id } = action.payload;
      const sessions = project.externalSessions || [];
      const filtered = sessions.filter(s => s.id !== id);
      if (filtered.length === sessions.length) return project;
      return { ...project, externalSessions: filtered };
    }

    // ─── 他学年セッションプリセット ─────────
    // 「予備校 12:25-13:35 を 7/24~7/31」のような頻出パターンを保存し、
    // 詳細セッション登録フォームから 1 クリックで呼び出せるようにする。
    // payload で受け取る fields は全て optional (id/name 以外)。空文字は省く。
    case 'preset/add': {
      const { name, startTime, endTime, startDateLabel, endDateLabel, memo } = action.payload;
      if (!name) return project;
      const presets = project.externalSessionPresets || [];
      const newId = presets.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      const newPreset = { id: newId, name };
      if (startTime) newPreset.startTime = startTime;
      if (startTime && endTime) newPreset.endTime = endTime;
      if (startDateLabel) newPreset.startDateLabel = startDateLabel;
      if (endDateLabel) newPreset.endDateLabel = endDateLabel;
      if (memo) newPreset.memo = memo;
      return { ...project, externalSessionPresets: [...presets, newPreset] };
    }
    case 'preset/update': {
      const { id, updates } = action.payload;
      const presets = project.externalSessionPresets || [];
      const target = presets.find(p => p.id === id);
      if (!target) return project;
      // updates のフィールドは空文字なら削除、値があれば上書き。
      // startTime が落ちる場合は endTime も落とす (orphan endTime 防止)。
      const merged = { ...target };
      const writeOrDelete = (key, val) => {
        if (val == null || val === '') delete merged[key];
        else merged[key] = val;
      };
      if ('name' in updates) {
        if (!updates.name) return project; // name は必須なので空は no-op
        merged.name = updates.name;
      }
      if ('startTime' in updates) writeOrDelete('startTime', updates.startTime);
      if ('endTime' in updates) writeOrDelete('endTime', updates.endTime);
      if ('startDateLabel' in updates) writeOrDelete('startDateLabel', updates.startDateLabel);
      if ('endDateLabel' in updates) writeOrDelete('endDateLabel', updates.endDateLabel);
      if ('memo' in updates) writeOrDelete('memo', updates.memo);
      if (!merged.startTime) delete merged.endTime;
      return {
        ...project,
        externalSessionPresets: presets.map(p => p.id === id ? merged : p),
      };
    }
    case 'preset/remove': {
      const { id } = action.payload;
      const presets = project.externalSessionPresets || [];
      const filtered = presets.filter(p => p.id !== id);
      if (filtered.length === presets.length) return project;
      return { ...project, externalSessionPresets: filtered };
    }

    // ─── セル操作 ────────────────────────
    // payload の dateId/periodId/classId は v3 の永続 ID (number)。
    case 'cell/assign': {
      const { dateId, periodId, classId, type, val } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = effectiveConfig(project, activeTab);

      const k = makeKey(dateId, periodId, classId);
      if (currentSchedule[k]?.locked) return project;

      const e = { ...(currentSchedule[k] || {}) };
      if (type === 'subject') { e.subject = val; e.teacher = ''; } else { e[type] = val; }

      let newSchedule = { ...currentSchedule, [k]: e };
      const groups = project.combinedGroups;

      if (type === 'subject') {
        const oldSubject = (currentSchedule[k] || {}).subject;
        if (oldSubject && oldSubject !== val) {
          newSchedule = cleanupOldCombined(newSchedule, currentConfig, groups, dateId, periodId, classId, oldSubject);
        }
        newSchedule = propagateAssignment(newSchedule, currentConfig, groups, dateId, periodId, classId, e);
      } else if (type === 'teacher' && e.subject) {
        newSchedule = propagateTeacherChange(newSchedule, currentConfig, groups, dateId, periodId, classId, e.subject, val);
      }

      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: newSchedule } : t);
      return { ...project, tabs: newTabs };
    }
    case 'cell/toggleLock': {
      const { dateId, periodId, classId } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const k = makeKey(dateId, periodId, classId);
      const e = { ...(activeTab.schedule[k] || {}) };
      e.locked = !e.locked;
      const newTabs = project.tabs.map(t =>
        t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t
      );
      return { ...project, tabs: newTabs };
    }
    case 'cell/clear': {
      const { dateId, periodId, classId } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = effectiveConfig(project, activeTab);
      const k = makeKey(dateId, periodId, classId);
      const curr = currentSchedule[k] || {};
      if (curr.locked) return project;

      let ns = cleanupOldCombined(currentSchedule, currentConfig, project.combinedGroups, dateId, periodId, classId, curr.subject);
      ns = { ...ns };
      delete ns[k];
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'cell/paste': {
      const { dateId, periodId, classId, clipboard } = action.payload;
      if (!clipboard) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = effectiveConfig(project, activeTab);
      const k = makeKey(dateId, periodId, classId);
      const curr = currentSchedule[k] || {};
      if (curr.locked) return project;

      let ns = { ...currentSchedule };
      const groups = project.combinedGroups;

      if (curr.subject && curr.subject !== clipboard.subject) {
        ns = cleanupOldCombined(ns, currentConfig, groups, dateId, periodId, classId, curr.subject);
      }

      const newEntry = { ...curr, subject: clipboard.subject, teacher: clipboard.teacher };
      ns[k] = newEntry;
      ns = propagateAssignment(ns, currentConfig, groups, dateId, periodId, classId, newEntry);

      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'cell/swap': {
      const { sourceKey, sourceData, targetKey, targetData } = action.payload;
      // どちらかが locked なら swap しない。UI 側でも guard しているが、
      // dispatch 経由で source が locked のまま渡ると line `locked: false` で
      // lock が剥がれてしまうため、ここでも防衛する。
      if (sourceData.locked || targetData.locked) return project;
      const sParsed = parseKey(sourceKey);
      const tParsed = parseKey(targetKey);
      if (!sParsed || !tParsed) return project;

      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = effectiveConfig(project, activeTab);
      const groups = project.combinedGroups;
      let ns = { ...currentSchedule };

      ns = cleanupOldCombined(ns, currentConfig, groups, sParsed.dateId, sParsed.periodId, sParsed.classId, sourceData.subject);
      ns = cleanupOldCombined(ns, currentConfig, groups, tParsed.dateId, tParsed.periodId, tParsed.classId, targetData.subject);

      ns = { ...ns };
      ns[sourceKey] = { ...targetData, locked: false };
      ns[targetKey] = { ...sourceData, locked: false };

      ns = propagateAssignment(ns, currentConfig, groups, sParsed.dateId, sParsed.periodId, sParsed.classId, ns[sourceKey]);
      ns = propagateAssignment(ns, currentConfig, groups, tParsed.dateId, tParsed.periodId, tParsed.classId, ns[targetKey]);

      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    // ─── スケジュール一括/メタ ───────────
    case 'schedule/renameHeader': {
      // type は 'date' | 'period' | 'class'。oldVal / newVal はラベル文字列。
      // v3: entity の label のみ書き換え、id は不変。schedule キーは ID ベース
      // なので影響なし。ただし以下の label-based 参照は cascade で更新する:
      //   - 講師の ngSlots キー (`{date}-{period}` 形式、date/period 変更時)
      //   - externalCounts キー (`{date}-{teacher}` 形式、date 変更時)
      //   - combinedGroups の classes/dates 配列 (class/date 変更時)
      const { type, oldVal, newVal } = action.payload;
      if (!newVal || newVal === oldVal) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const renameLabel = (arr) => (arr || []).map(e => e.label === oldVal ? { ...e, label: newVal } : e);
      // v4: date / period は project 共通、class は active タブ単位。
      let newTabs = project.tabs;
      let newDates = project.dates;
      let newPeriods = project.periods;
      if (type === 'date') newDates = renameLabel(project.dates);
      else if (type === 'period') newPeriods = renameLabel(project.periods);
      else if (type === 'class') {
        const newConfig = { ...activeTab.config, classes: renameLabel(activeTab.config.classes) };
        newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: newConfig } : t);
      }

      let newTeachers = project.teachers;
      let newExternal = project.externalCounts;
      let newCombined = project.combinedGroups;
      let newSessions = project.externalSessions;
      let newPresets = project.externalSessionPresets;

      if (type === 'date' || type === 'period') {
        // NG slot のキーを書き換え
        newTeachers = project.teachers.map(t => {
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
      }

      if (type === 'date') {
        newExternal = renameExternalCountsDateLabel(project.externalCounts, oldVal, newVal);
        newCombined = renameCombinedGroupsLabel(project.combinedGroups || [], 'dates', oldVal, newVal);
        // externalSessions の date と externalSessionPresets の
        // startDateLabel / endDateLabel もラベル基準なので追従させる。
        newSessions = (project.externalSessions || []).map(s =>
          s.date === oldVal ? { ...s, date: newVal } : s
        );
        newPresets = (project.externalSessionPresets || []).map(p => {
          let q = p;
          if (q.startDateLabel === oldVal) q = { ...q, startDateLabel: newVal };
          if (q.endDateLabel === oldVal) q = { ...q, endDateLabel: newVal };
          return q;
        });
      } else if (type === 'class') {
        newCombined = renameCombinedGroupsLabel(project.combinedGroups || [], 'classes', oldVal, newVal);
      }

      return {
        ...project,
        dates: newDates,
        periods: newPeriods,
        tabs: newTabs,
        teachers: newTeachers,
        externalCounts: newExternal,
        externalSessions: newSessions,
        externalSessionPresets: newPresets,
        combinedGroups: newCombined,
      };
    }
    case 'schedule/bulkAction': {
      // val はラベル文字列 (UI で選択された日付/時限/クラス名)。
      const { action: bulk, type, val } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      const currentConfig = effectiveConfig(project, activeTab);

      const ns = { ...currentSchedule };
      let upd = false;
      currentConfig.dates.forEach((date) => currentConfig.periods.forEach((per) => currentConfig.classes.forEach((cls) => {
        if ((type === 'date' && date.label === val) || (type === 'class' && cls.label === val) || (type === 'period' && per.label === val)) {
          const k = makeKey(date.id, per.id, cls.id);
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

    // ─── スナップショット (E1c) ───────────
    // ユーザが明示的に名前を付けて保存する「現在のタブの状態」。
    // タブ単位で source tabId を記録し、apply で同じタブへ復元する。
    // undo/redo の単線履歴とは別に、試行錯誤の分岐を残せる手段。
    case 'snapshot/save': {
      const { name, createdAt } = action.payload;
      if (!name) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const snapshots = project.snapshots || [];
      const newId = snapshots.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      const snapshot = {
        id: newId,
        name,
        tabId: activeTab.id,
        createdAt: createdAt || null,
        schedule: JSON.parse(JSON.stringify(activeTab.schedule)),
      };
      return { ...project, snapshots: [...snapshots, snapshot] };
    }
    case 'snapshot/apply': {
      const { id } = action.payload;
      const snapshot = (project.snapshots || []).find(s => s.id === id);
      if (!snapshot) return project;
      // 記録元タブが存在しなければ no-op (削除済みタブのスナップショット)。
      if (!project.tabs.some(t => t.id === snapshot.tabId)) return project;
      const restored = JSON.parse(JSON.stringify(snapshot.schedule));
      const newTabs = project.tabs.map(t => t.id === snapshot.tabId ? { ...t, schedule: restored } : t);
      // 復元先タブを active にして結果が見えるようにする。
      // save は raw schedule を保存するが、apply 側で cleanSchedule して
      // 「保存後に config から消えた entity」を取り除く (非対称だが意図的)。
      return cleanSchedule({ ...project, tabs: newTabs, activeTabId: snapshot.tabId });
    }
    case 'snapshot/rename': {
      const { id, name } = action.payload;
      if (!name) return project;
      const snapshots = project.snapshots || [];
      if (!snapshots.some(s => s.id === id)) return project;
      return { ...project, snapshots: snapshots.map(s => s.id === id ? { ...s, name } : s) };
    }
    case 'snapshot/remove': {
      const { id } = action.payload;
      const snapshots = project.snapshots || [];
      const next = snapshots.filter(s => s.id !== id);
      if (next.length === snapshots.length) return project;
      return { ...project, snapshots: next };
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
    case 'project/setGenerationParams': {
      // 自動生成パラメータ (numPatterns / maxDailyHours / maxIterations) を
      // 部分更新する。渡されたキーのみ clamp して反映 (未指定は据え置き)。
      const updates = action.payload || {};
      const next = { ...project };
      let changed = false;
      for (const key of ['numPatterns', 'maxDailyHours', 'maxIterations', 'maxConsecutivePeriods']) {
        if (updates[key] === undefined) continue;
        const clamped = clampGenerationParam(key, updates[key]);
        if (next[key] !== clamped) {
          next[key] = clamped;
          changed = true;
        }
      }
      return changed ? next : project;
    }
    case 'project/replace': {
      // JSON 読込で project 全体を差し替える (cleanSchedule 済みのものを渡す前提)
      return action.payload.project;
    }

    default:
      return project;
  }
}
