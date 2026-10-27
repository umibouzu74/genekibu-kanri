// effectiveConfigForTab はこのファイル内の従来名 effectiveConfig で使う
// (呼び出し 6 箇所の命名統一。alias 定数を挟むと同一関数が 2 名で混在する)。
import { makeKey, parseKey, makeNgKey, makeExternalKey, effectiveConfigForTab as effectiveConfig, nextId } from '../utils/scheduleKey';
import {
  cleanupOldCombined,
  propagateAssignment,
  propagateTeacherChange,
} from '../utils/combinedPropagation';
import {
  renameNgDate,
  renameNgPeriod,
  renameExternalTeacher,
  renameExternalDate,
  dropExternalForTeacher,
  makeDateKeyDropMatcher,
  makePeriodKeyDropMatcher,
  renameClassInTeachers,
  cleanClassRefsInTeachers,
  cleanCombinedGroupsForLabelChange,
  cleanCombinedGroupsForSubjectRemoval,
  renameCombinedGroupsLabel,
} from '../utils/labelRefs';
import { cleanSchedule, clampGenerationParam } from '../utils/constants';
import {
  applyAvailabilityMarks,
  dropAvailabilityDates,
  dropAvailabilityPeriods,
  isAvailabilityMark,
  mapTeachersAvailability,
  renameAvailabilityDate,
  renameAvailabilityPeriod,
  withAvailability,
} from '../utils/availabilityShape';
import { computePresetMemoBackfill } from '../utils/presetMemoBackfill';
import { computePresetRenameSyncIds, presetSessionLabel } from '../utils/presetRenameSync';
import { framePublishState, isPublishState, leastPublished, projectPublishState, publishStateForTab } from '../utils/publishState';
import { computeCourseSplit, externalSessionContentKey, isExternalOnlyDate, normalizeSessionCourse } from '../utils/externalSessionShape';
import { normalizeEventName } from '../utils/eventName';
import type {
  AvailabilityMark,
  CombinedGroup,
  DayStatus,
  ExternalSession,
  ExternalSessionPreset,
  Frame,
  GenerationParamKey,
  Project,
  ProjectState,
  PublishState,
  Schedule,
  Teacher,
} from '../types';

// ─── アクション型 (E5e) ──────────────────────────────────────────
// dispatch できる全アクションの discriminated union。各 case の payload 形状は
// ここが単一の正 (アクションフックはこの型の薄いラッパ)。新しいアクションを
// 足すときはここに 1 エントリ追加してから reducer に case を書くこと。
export type ProjectAction =
  | { type: 'history/undo' }
  | { type: 'history/redo' }
  | { type: 'project/setActive'; payload: Project }
  | { type: 'project/reset'; payload: Project }
  | { type: 'tab/switch'; payload: { id: number } }
  | { type: 'tab/add'; payload: { name: string } }
  | { type: 'tab/delete'; payload: { id: number } }
  | { type: 'tab/rename'; payload: { id: number; name: string } }
  | { type: 'tab/reorder'; payload: { fromIdx: number; toIdx: number } }
  | { type: 'tab/setDayStatus'; payload: { dateId: number; status: DayStatus | null; tabId?: number } }
  | { type: 'config/setList'; payload: { key: 'dates' | 'periods' | 'classes'; value: string } }
  | { type: 'config/setSubjectCount'; payload: { subject: string; value: unknown; tabId?: number } }
  | { type: 'config/setClassRoom'; payload: { classId: number; room: string; tabId?: number } }
  | { type: 'config/setClassSubjectCount'; payload: { subject: string; classId: number; value: unknown; tabId?: number } }
  | { type: 'config/setClassSubjectCountsMode'; payload: { tabId: number; enabled: boolean } }
  | { type: 'config/fillSubjectCounts'; payload: { tabId: number; value: unknown } }
  | { type: 'subject/addMany'; payload: { names: string[] } }
  | { type: 'config/copySubjectCountsToOthers'; payload: { sourceTabId: number } }
  | { type: 'tabDates/setByLabels'; payload: { tabId?: number; labels: string[] } }
  | { type: 'tabDates/toggle'; payload: { tabId?: number; dateId: number } }
  | { type: 'tabDates/setAllActive'; payload: { tabId?: number; active: boolean } }
  | { type: 'dates/removeFromPool'; payload: { dateId: number } }
  | { type: 'dates/removeUnusedFromPool' }
  | { type: 'dates/addExternalOnly'; payload: { labels: string[] } }
  | { type: 'tabDates/copyActiveToOthers'; payload: { sourceTabId: number } }
  | { type: 'tabPeriods/copyActiveToOthers'; payload: { sourceTabId: number } }
  | { type: 'tabPeriods/toggle'; payload: { tabId?: number; periodId: number } }
  | { type: 'tabPeriods/setAllActive'; payload: { tabId?: number; active: boolean } }
  | { type: 'subject/add'; payload: { name: string } }
  | { type: 'subject/remove'; payload: { name: string } }
  | { type: 'subject/reorder'; payload: { fromIdx: number; toIdx: number } }
  | { type: 'subject/setColor'; payload: { subject: string; color: string } }
  | { type: 'teacher/add'; payload: { name: string } }
  | { type: 'teacher/import'; payload: { teachers: Array<{ name: string; subjects?: string[] }>; mode?: 'append' | 'replace' } }
  | { type: 'teacher/remove'; payload: { idx: number } }
  | { type: 'teacher/removeByNames'; payload: { names: string[] } }
  | { type: 'teacher/rename'; payload: { idx: number; newName: string } }
  | { type: 'teacher/toggleSubject'; payload: { idx: number; subject: string } }
  | { type: 'teacher/setLimit'; payload: { idx: number; key: 'maxDailyHours' | 'maxTotalHours' | 'maxConsecutivePeriods'; value: unknown } }
  | { type: 'teacher/toggleNg'; payload: { idx: number; date: string; period: string } }
  | { type: 'teacher/setNgBatch'; payload: { idxs: number[]; dateLabels: string[]; periodLabels: string[]; value: boolean } }
  | { type: 'teacher/importNg'; payload: { entries: Array<{ name: string; date: string; period: string }> } }
  | { type: 'teacher/clearAllManualNg' }
  | { type: 'teacher/clearAllNg' }
  | { type: 'teacher/setAvailability'; payload: { name: string; cells: Array<{ date: string; period: string }>; mark: AvailabilityMark | null } }
  | { type: 'teacher/clearAvailability'; payload: { name: string } }
  | { type: 'teacher/setAvailabilityMemo'; payload: { name: string; memo: string } }
  | { type: 'teacher/toggleClassPriority'; payload: { idx: number; className: string } }
  | { type: 'teacher/setExternalCount'; payload: { date: string; teacherName: string; value: unknown } }
  | { type: 'teacher/addExternalSession'; payload: { date: string; teacherName: string; label?: string; memo?: string; course?: string; startTime?: string; endTime?: string } }
  | { type: 'teacher/addExternalSessions'; payload: { items: Array<{ date: string; teacherName: string; label?: string; memo?: string; course?: string; startTime?: string; endTime?: string }> } }
  | { type: 'teacher/removeExternalSession'; payload: { id: number } }
  | { type: 'teacher/updateExternalSession'; payload: { id: number; updates: { memo?: string; course?: string } } }
  | { type: 'teacher/applyPresetMemos' }
  | { type: 'teacher/splitSessionCourses' }
  | { type: 'preset/add'; payload: { name: string; startTime?: string; endTime?: string; startDateLabel?: string; endDateLabel?: string; memo?: string; teachers?: string[] } }
  | { type: 'preset/update'; payload: { id: number; updates: Partial<Omit<ExternalSessionPreset, 'id'>>; syncSessionMemos?: boolean } }
  | { type: 'preset/remove'; payload: { id: number } }
  | { type: 'cell/assign'; payload: { dateId: number; periodId: number; classId: number; type: 'subject' | 'teacher'; val: string } }
  | { type: 'cell/toggleLock'; payload: { dateId: number; periodId: number; classId: number } }
  | { type: 'cell/clear'; payload: { dateId: number; periodId: number; classId: number } }
  | { type: 'cell/bulkClear'; payload: { keys: string[] } }
  | { type: 'cell/bulkSetLock'; payload: { keys: string[]; locked: boolean } }
  | { type: 'cell/paste'; payload: { dateId: number; periodId: number; classId: number; clipboard: { subject?: string; teacher?: string } | null } }
  | { type: 'cell/swap'; payload: { sourceKey: string; targetKey: string } }
  | { type: 'cell/applyToAllDates'; payload: { dateId: number; periodId: number; classId: number } }
  | { type: 'schedule/copyDateColumn'; payload: { sourceDateId: number; targetDateId: number } }
  | { type: 'schedule/renameHeader'; payload: { type: 'date' | 'period' | 'class'; oldVal: string; newVal: string } }
  | { type: 'schedule/bulkAction'; payload: { action: 'lock-all' | 'unlock-all' | 'clear-all'; type: 'date' | 'period' | 'class'; val: string } }
  | { type: 'schedule/clearUnlocked' }
  | { type: 'schedule/applyPattern'; payload: { pat: Schedule; tabId?: number } }
  | { type: 'schedule/copyFromTab'; payload: { sourceTabId: number } }
  | { type: 'schedule/importCells'; payload: { writes: Array<{ tabId: number; key: string; subject: string; teacher: string }> } }
  | { type: 'snapshot/save'; payload: { name: string; createdAt?: string | null } }
  | { type: 'snapshot/apply'; payload: { id: number } }
  | { type: 'snapshot/rename'; payload: { id: number; name: string } }
  | { type: 'snapshot/remove'; payload: { id: number } }
  | { type: 'combinedGroup/add'; payload: { group: Omit<CombinedGroup, 'id'> } }
  | { type: 'combinedGroup/update'; payload: { id: number; updates: Partial<Omit<CombinedGroup, 'id'>> } }
  | { type: 'combinedGroup/remove'; payload: { id: number } }
  | { type: 'project/updateName'; payload: { name: string } }
  | { type: 'project/setPublishState'; payload: { state: PublishState } }
  | { type: 'frame/add'; payload: { name: string; tabIds?: number[] } }
  | { type: 'frame/rename'; payload: { id: number; name: string } }
  | { type: 'frame/remove'; payload: { id: number } }
  | { type: 'frame/setTab'; payload: { tabId: number; frameId: number | null } }
  | { type: 'frame/setPeriods'; payload: { id: number; value: string } }
  | { type: 'frame/setPublishState'; payload: { id: number; state: PublishState } }
  | { type: 'courseEvents/setLink'; payload: { tabId: number; name: string; linked: boolean } }
  | { type: 'courseEvents/linkMany'; payload: { links: Array<{ tabId: number; name: string }> } }
  | { type: 'courseEvents/setIgnored'; payload: { name: string; ignored: boolean } }
  | { type: 'project/setGenerationParams'; payload: Partial<Record<GenerationParamKey, unknown>> }
  | { type: 'project/replace'; payload: { project: Project } };

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

// 日付プールから複数日をまとめて削除する共通処理 (dates/removeFromPool と
// L4b の dates/removeUnusedFromPool、季節の作り直しの utils/seasonStart が共用)。
// ラベルベース参照の cascade cleanup を怠ると、同じラベルの日付を後で再追加した
// ときに古い NG・外部コマ数・他学年セッションが silent に復活する (UI の確認文言も「講師不在
// /NG から消えます」と約束している)。NG キーは makeNgKey(date, period) =
// `${date}-${period}`、externalCounts キーは makeExternalKey(date, teacher)。
// 照合は prefix 一致だが、「8/1」と「8/1-補講」のように一方が他方の prefix
// になるラベルの巻き添えを避けるため、プール全ラベルの中で最長一致した
// ものが削除対象のときだけ消す (makeDateKeyDropMatcher)。
export function removeDatesFromPool(project: Project, dateIds: number[]): Project {
  const pool = project.dates || [];
  const idSet = new Set(dateIds);
  const targets = pool.filter(d => idSet.has(d.id));
  if (targets.length === 0) return project;
  const targetLabels = targets.map(d => d.label);
  const targetLabelSet = new Set(targetLabels);
  const newPool = pool.filter(d => !idSet.has(d.id));
  const newTabs = project.tabs.map(t => {
    const ids = t.config.activeDateIds;
    // 日付ごとの手動チェック (dayStatuses) も削除日の分を掃除する
    const statuses = t.dayStatuses;
    const staleStatusKeys = statuses
      ? Object.keys(statuses).filter(k => idSet.has(Number(k)))
      : [];
    const idsChanged = !!ids && ids.some(id => idSet.has(id));
    if (!idsChanged && staleStatusKeys.length === 0) return t;
    const next = { ...t };
    if (idsChanged && ids) {
      next.config = { ...t.config, activeDateIds: ids.filter(id => !idSet.has(id)) };
    }
    if (staleStatusKeys.length > 0 && statuses) {
      const cleaned = { ...statuses };
      staleStatusKeys.forEach(k => { delete cleaned[k]; });
      next.dayStatuses = cleaned;
    }
    return next;
  });
  const newCombined = cleanCombinedGroupsForLabelChange(
    project.combinedGroups || [],
    'dates',
    new Set(newPool.map(d => d.label)),
  );
  const shouldDropDateKey = makeDateKeyDropMatcher(pool.map(d => d.label), targetLabels);
  const newTeachers = mapTeachersAvailability(
    (project.teachers || []).map(t => {
      const ngSlots = t.ngSlots || [];
      const filtered = ngSlots.filter(k => !shouldDropDateKey(k));
      return filtered.length === ngSlots.length ? t : { ...t, ngSlots: filtered };
    }),
    // 出勤可能調査の回答も同じ理由で消す (同ラベル再追加で古い回答が復活しない)
    map => dropAvailabilityDates(map, targetLabelSet),
  );
  const newExternal: Record<string, number> = {};
  Object.keys(project.externalCounts || {}).forEach(k => {
    if (!shouldDropDateKey(k)) newExternal[k] = project.externalCounts[k];
  });
  const newSessions = (project.externalSessions || []).filter(s => !targetLabelSet.has(s.date));
  // K2c: externalSessionPresets の日付範囲参照も掃除する (renameHeader は
  // 追従させているのに削除だけ放置だと、同名ラベルを後で再追加したとき
  // 古いプリセットが別の日を指す)。該当フィールドだけ未指定に戻す。
  const presets = project.externalSessionPresets || [];
  const newPresets = presets.map(p => {
    const dropStart = p.startDateLabel !== undefined && targetLabelSet.has(p.startDateLabel);
    const dropEnd = p.endDateLabel !== undefined && targetLabelSet.has(p.endDateLabel);
    if (!dropStart && !dropEnd) return p;
    const next = { ...p };
    if (dropStart) delete next.startDateLabel;
    if (dropEnd) delete next.endDateLabel;
    return next;
  });
  const presetsChanged = newPresets.some((p, i) => p !== presets[i]);
  return cleanSchedule({
    ...project,
    dates: newPool,
    tabs: newTabs,
    combinedGroups: newCombined,
    teachers: newTeachers,
    externalCounts: newExternal,
    externalSessions: newSessions,
    ...(presetsChanged ? { externalSessionPresets: newPresets } : {}),
  });
}

// 時限をプールから削除する共通処理 (枠の時限の編集 frame/setPeriods が使う)。
// config/setList('periods') と同じ cascade: 全タブの使う時限・枠の時限から外し、
// NG キー (`${date}-${period}`)・出勤可能調査の回答を掃除して cleanSchedule。
export function removePeriodsFromPool(project: Project, periodIds: number[]): Project {
  const pool = project.periods || [];
  const idSet = new Set(periodIds);
  const targets = pool.filter(p => idSet.has(p.id));
  if (targets.length === 0) return project;
  const removedLabels = targets.map(p => p.label);
  const shouldDrop = makePeriodKeyDropMatcher(pool.map(p => p.label), removedLabels);
  const teachers = mapTeachersAvailability(
    (project.teachers || []).map(t => {
      const ngSlots = t.ngSlots || [];
      const filtered = ngSlots.filter(k => !shouldDrop(k));
      return filtered.length === ngSlots.length ? t : { ...t, ngSlots: filtered };
    }),
    map => dropAvailabilityPeriods(map, removedLabels),
  );
  const tabs = project.tabs.map(t => {
    const ids = t.config.activePeriodIds;
    if (!ids || !ids.some(id => idSet.has(id))) return t;
    return { ...t, config: { ...t.config, activePeriodIds: ids.filter(id => !idSet.has(id)) } };
  });
  const frames = project.frames?.map(f =>
    f.periodIds.some(id => idSet.has(id)) ? { ...f, periodIds: f.periodIds.filter(id => !idSet.has(id)) } : f);
  return cleanSchedule({
    ...project,
    periods: pool.filter(p => !idSet.has(p.id)),
    tabs,
    teachers,
    ...(frames ? { frames } : {}),
  });
}

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
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
      // 存在しないタブ ID を許すと、以降の書き込み系 (t.id === activeTabId で
      // map) が全て silent no-op になり「表示は tabs[0]・編集はどこにも
      // 書かれない」状態になるため弾く。
      if (!state.project.tabs.some(t => t.id === action.payload.id)) return state;
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
function pushToHistory(state: ProjectState, newProject: Project): ProjectState {
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
// クラス/日付/科目/講師の編集に応じて孤児を防ぐ。ラベルキーのパース知識を
// 伴うヘルパーは utils/labelRefs.js に一元化した (F2k)。ここに残るのは
// フィールド参照だけの externalSessions 系のみ。

// 講師削除に伴う externalSessions の cleanup。teacherName が一致する
// 詳細セッションを drop する。残しておくと「孤児セッション」として UI に
// 表示されるが自動NGの対象から外れ、状態が乖離する。
function cleanExternalSessionsForTeacher(
  externalSessions: ExternalSession[] | undefined,
  teacherName: string,
): ExternalSession[] | undefined {
  if (!externalSessions) return externalSessions;
  return externalSessions.filter(s => s.teacherName !== teacherName);
}

// 講師リネームに伴う externalSessions の teacherName 書き換え。
function renameExternalSessionsTeacher(
  externalSessions: ExternalSession[] | undefined,
  oldName: string,
  newName: string,
): ExternalSession[] | undefined {
  if (!externalSessions) return externalSessions;
  return externalSessions.map(s =>
    s.teacherName === oldName ? { ...s, teacherName: newName } : s
  );
}

// v4: dates / periods は project 共通。schedule の cascade ロジック
// (combinedPropagation 等) は config.dates / .periods を読むため、reducer 内でも
// 実効 config (F2i: effectiveConfigForTab) を渡す必要がある。periods を
// プール全体にすると schedule/bulkAction の一括操作が非表示時限まで走査し、
// 「使わない時限のセルは温存」の不変条件 (schedule/clearUnlocked,
// tabPeriods/toggle) を破ったり {locked:true} のゴミセルを非表示時限に
// 生成したりする。cell/* 系の対象セルは可視セル (= active な時限) なので
// 絞っても影響しない。

// 履歴に積む系のアクションを処理する純粋関数。
// 変化が無い (no-op) 場合は引数の project をそのまま返す。
function applyAction(project: Project, action: ProjectAction): Project {
  switch (action.type) {
    // ─── タブ管理 ─────────────────────────
    case 'tab/add': {
      const { name } = action.payload;
      if (!name) return project;
      // K3i: 重複タブ名は no-op (teacher/subject の重複ガードと同じ扱い。
      // 生成結果パネル等の「対象タブ: {name}」表示が曖昧になるため)
      if (project.tabs.some(t => t.name === name)) return project;
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
        // 非アクティブタブを削除した場合は作業中のタブを維持する
        activeTabId: id === project.activeTabId ? newTabs[0].id : project.activeTabId,
        ...(newSnapshots.length !== snapshots.length ? { snapshots: newSnapshots } : {}),
      };
    }
    case 'tab/rename': {
      const { id, name } = action.payload;
      if (!name) return project;
      // F2d: 同名 rename は履歴を汚さない (実効 Undo 深度 MAX 50 を守る)
      const target = project.tabs.find(t => t.id === id);
      if (!target || target.name === name) return project;
      // K3i: 他タブと重複する名前への rename も no-op (UI 側でも toast で
      // reject するが、直接 dispatch 経路も守る)
      if (project.tabs.some(t => t.name === name && t.id !== id)) return project;
      return { ...project, tabs: project.tabs.map(t => t.id === id ? { ...t, name } : t) };
    }

    // 日付ごとの手動チェック (OK / 要確認)。status=null でチェック解除。
    // 「不備あり」は schedule から導出する表示専用の状態なので、この case は
    // 手動 2 値 ('ok' | 'check') の保存だけを担う。キーは dateId の文字列化
    // (schedule と同じ ID 参照 — 日付ラベルの rename に追従し、プール削除は
    // removeDatesFromPool が掃除する)。
    case 'tab/setDayStatus': {
      const { dateId, status, tabId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId);
      if (!target) return project;
      if (!(project.dates || []).some(d => d.id === dateId)) return project;
      const key = String(dateId);
      const current = target.dayStatuses || {};
      if ((current[key] ?? null) === status) return project; // 同値 no-op (F2d)
      const next = { ...current };
      if (status == null) delete next[key];
      else next[key] = status;
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, dayStatuses: next } : t
      );
      return { ...project, tabs: newTabs };
    }

    case 'tab/reorder': {
      // N2d: 学年タブの並べ替え (subject/reorder と同型)。作成順を後から
      // 直せるようにする。印刷・Excel の学年順 (tabs の並び) にも効く。
      const { fromIdx, toIdx } = action.payload;
      const tabs = [...project.tabs];
      if (fromIdx < 0 || fromIdx >= tabs.length || toIdx < 0 || toIdx >= tabs.length) return project;
      if (fromIdx === toIdx) return project;
      const [moved] = tabs.splice(fromIdx, 1);
      tabs.splice(toIdx, 0, moved);
      return { ...project, tabs };
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
      const oldByLabel = new Map(oldArr.map(e => [e.label, e] as const));
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
      // key='periods' はプールから消えた id を全タブの activePeriodIds からも
      // 除去する (dates/removeFromPool の cascade と同じ考え方。periods には
      // 専用の removeFromPool アクションが無く、このテキストエリア編集がその役目を兼ねる)。
      const resultIds = new Set(resultArr.map(e => e.id));
      const baseProject = isShared
        ? {
            ...project,
            [key]: resultArr,
            // 枠の時限からもプールから消えた時限を外す
            ...(key === 'periods' && project.frames ? {
              frames: project.frames.map(f =>
                f.periodIds.every(id => resultIds.has(id)) ? f : { ...f, periodIds: f.periodIds.filter(id => resultIds.has(id)) }),
            } : {}),
            ...(key === 'periods' ? {
              tabs: project.tabs.map(t => {
                const ids = t.config.activePeriodIds;
                if (!ids) return t;
                const filtered = ids.filter(id => resultIds.has(id));
                return filtered.length === ids.length ? t : { ...t, config: { ...t.config, activePeriodIds: filtered } };
              }),
            } : {}),
          }
        : {
            ...project,
            tabs: project.tabs.map(t => {
              if (t.id !== project.activeTabId) return t;
              // §N: classes 編集で消えたクラス id のクラス別コマ数上書きも
              // 落とす。setList は空いた id を再利用するため、残すと後で
              // 追加された無関係な新クラスに旧上書きが silent に付く。
              let classCounts = t.config.classSubjectCounts;
              if (key === 'classes' && classCounts) {
                const stale = Object.keys(classCounts).filter(cid => !resultIds.has(Number(cid)));
                if (stale.length > 0) {
                  const next = { ...classCounts };
                  stale.forEach(cid => { delete next[cid]; });
                  classCounts = next;
                }
              }
              return {
                ...t,
                config: {
                  ...t.config,
                  [key]: resultArr,
                  ...(classCounts !== t.config.classSubjectCounts ? { classSubjectCounts: classCounts } : {}),
                },
              };
            }),
          };
      // key='periods' のプール削除では NG キー (`${date}-${period}`) も掃除する
      // (dates/removeFromPool と同じ理由: 残すと同ラベル再追加で古い NG が
      // silent に復活し、ラベル不在の間は NG パネルに表示されず消せない)。
      // 照合はラベルの suffix 一致だが、「1限」と「番外-1限」のように一方が
      // 他方の suffix になるラベルの誤射を避けるため、旧ラベル全体の中で
      // 最長一致したものが削除対象のときだけ消す。
      let cascadedTabsProject = baseProject;
      if (key === 'periods') {
        const newLabelSet = new Set(newLabels);
        const removedLabels = oldArr.map(e => e.label).filter(l => !newLabelSet.has(l));
        if (removedLabels.length > 0) {
          const shouldDrop = makePeriodKeyDropMatcher(oldArr.map(e => e.label), removedLabels);
          const newTeachers = mapTeachersAvailability(
            (baseProject.teachers || []).map(t => {
              const ngSlots = t.ngSlots || [];
              const filtered = ngSlots.filter(k2 => !shouldDrop(k2));
              return filtered.length === ngSlots.length ? t : { ...t, ngSlots: filtered };
            }),
            // 出勤可能調査の回答は時限ラベルをキーに持つので完全一致で消せる
            map => dropAvailabilityPeriods(map, removedLabels),
          );
          cascadedTabsProject = { ...baseProject, teachers: newTeachers };
        }
      }
      // ラベル削除に伴う combinedGroups の cascade cleanup:
      // - key='classes': 消えたクラスを groups[*].classes から filter、結果が <2
      //   なら group ごと削除
      // - key='dates': 消えたラベルを groups[*].dates から filter (null は全日扱いで不変)
      //   結果が空配列ならグループ自体は残す? UI 上は「対象日なし」になるので drop。
      // - key='periods': groups に period 次元は無いので影響無し
      let newCombined = baseProject.combinedGroups;
      if (key === 'classes' || key === 'dates') {
        // combinedGroups は project 全体で共有 (タブ ID を持たない) なので、
        // key='classes' のときは「編集したタブの新ラベル + 他タブの既存ラベル」
        // の和集合で判定する。アクティブタブの newLabels だけを渡すと、
        // 他タブのクラスを参照する合同グループが全て巻き添えで削除される。
        const validLabels = new Set(newLabels);
        if (key === 'classes') {
          project.tabs.forEach(t => {
            if (t.id === activeTab.id) return;
            (t.config.classes || []).forEach(c => validLabels.add(c.label));
          });
        }
        newCombined = cleanCombinedGroupsForLabelChange(
          baseProject.combinedGroups || [],
          key === 'classes' ? 'classes' : 'dates',
          validLabels
        );
        // H5: クラス削除に teacher.ngClasses / priorityClasses も追従させる
        // (combinedGroups と同じ validLabels = 他タブの同名ラベルは温存)。
        if (key === 'classes') {
          const cleanedTeachers = cleanClassRefsInTeachers(cascadedTabsProject.teachers || [], validLabels);
          if (cleanedTeachers !== cascadedTabsProject.teachers) {
            cascadedTabsProject = { ...cascadedTabsProject, teachers: cleanedTeachers };
          }
        }
      }
      // cleanSchedule で消えた entity を参照する schedule キーを掃除する
      // (dates/periods は project 共通なので全タブの schedule が対象)。
      return cleanSchedule({ ...cascadedTabsProject, combinedGroups: newCombined });
    }
    case 'config/setClassRoom': {
      // クラスの教室 (2026-10-27)。空にしたら room を持たない。ラベル参照は
      // 変わらないので cascade は要らない
      const { classId, room, tabId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const value = String(room ?? '').trim();
      let changed = false;
      const newTabs = project.tabs.map(t => {
        if (t.id !== targetId) return t;
        const classes = (t.config.classes || []).map(c => {
          if (c.id !== classId) return c;
          const current = typeof c.room === 'string' ? c.room : '';
          if (current === value) return c;
          changed = true;
          if (!value) {
            const { room: _room, ...rest } = c;
            return rest;
          }
          return { ...c, room: value };
        });
        return changed ? { ...t, config: { ...t.config, classes } } : t;
      });
      return changed ? { ...project, tabs: newTabs } : project;
    }
    case 'config/setSubjectCount': {
      // tabId 省略時はアクティブタブを対象にする (従来挙動)。
      // SubjectManager の「タブ別コマ数」編集では各タブの id を明示で渡す。
      const { subject, value, tabId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId) || project.tabs[0];
      if (!target) return project;
      // F5o: 負数の直接入力 (input の min はスピナーにしか効かない) を 0 に
      // clamp。負のコマ数は分析の合計を狂わせる。
      const clamped = Math.max(0, parseInt(String(value)) || 0);
      // F2d: 同値なら no-op (blur 等での再 commit が履歴を汚さない)
      if (target.config.subjectCounts[subject] === clamped) return project;
      const newCounts = { ...target.config.subjectCounts, [subject]: clamped };
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, subjectCounts: newCounts } } : t
      );
      return { ...project, tabs: newTabs };
    }
    case 'config/setClassSubjectCount': {
      // §N: クラス別コマ数の上書き。共通値 (subjectCounts) と同じ値になったら
      // 上書きエントリを消して共通値追従へ戻す (データを最小に保つ。クラス別
      // モード中は共通値の変更経路が一括入力しか無いので挙動差は出ない)。
      const { subject, classId, value, tabId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId);
      if (!target) return project;
      const clamped = Math.max(0, parseInt(String(value)) || 0);
      const key = String(classId);
      const overrides = target.config.classSubjectCounts || {};
      const current = overrides[key]?.[subject];
      const base = target.config.subjectCounts[subject] || 0;
      const effective = (typeof current === 'number' && Number.isFinite(current)) ? current : base;
      if (effective === clamped) return project; // F2d: 同値 no-op
      const newByClass = { ...(overrides[key] || {}) };
      if (clamped === base) {
        delete newByClass[subject];
      } else {
        newByClass[subject] = clamped;
      }
      const newOverrides = { ...overrides, [key]: newByClass };
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, classSubjectCounts: newOverrides } } : t
      );
      return { ...project, tabs: newTabs };
    }
    case 'config/setClassSubjectCountsMode': {
      // §N: クラス別モードの ON/OFF。ON は空マップ {} を置く (上書きは個別
      // 編集で積む)。OFF はフィールドごと落とし、全クラス共通値へ戻す
      // (上書きの破棄は UI 側で確認済み。Undo で復元可能)。
      const { tabId, enabled } = action.payload;
      const target = project.tabs.find(t => t.id === tabId);
      if (!target) return project;
      const isOn = !!target.config.classSubjectCounts;
      if (enabled === isOn) return project; // F2d: 同状態 no-op
      const newTabs = project.tabs.map(t => {
        if (t.id !== target.id) return t;
        if (enabled) return { ...t, config: { ...t.config, classSubjectCounts: {} } };
        const { classSubjectCounts: _omit, ...restConfig } = t.config;
        return { ...t, config: restConfig };
      });
      return { ...project, tabs: newTabs };
    }
    case 'config/fillSubjectCounts': {
      // L4a: あるタブの全科目のコマ数を一括で同じ値にする (18 マス手入力の
      // 解消)。atomic で Undo 1 ステップ。全科目が既に同値なら no-op (F2d)。
      const { tabId, value } = action.payload;
      const target = project.tabs.find(t => t.id === tabId);
      if (!target) return project;
      const clamped = Math.max(0, parseInt(String(value)) || 0);
      const subjects = project.subjects || [];
      if (subjects.length === 0) return project;
      // §N: クラス別上書きが残っていれば「全科目を N コマに」の意図に合わせて
      // クリアする (残すと表示値が N にならないクラスが出る)。
      const hasOverrides = Object.values(target.config.classSubjectCounts || {})
        .some(byClass => byClass && Object.keys(byClass).length > 0);
      if (!hasOverrides && subjects.every(s => (target.config.subjectCounts[s] || 0) === clamped)) return project;
      const newCounts = { ...target.config.subjectCounts };
      subjects.forEach(s => { newCounts[s] = clamped; });
      const newTabs = project.tabs.map(t =>
        t.id === target.id
          ? {
              ...t,
              config: {
                ...t.config,
                subjectCounts: newCounts,
                // クラス別モード自体は維持し、上書きだけ空にする
                ...(t.config.classSubjectCounts ? { classSubjectCounts: {} } : {}),
              },
            }
          : t
      );
      return { ...project, tabs: newTabs };
    }
    case 'config/copySubjectCountsToOthers': {
      // L4a: あるタブの科目コマ数を他の全タブへコピー (「中3 の値を
      // 中1・2 にも」)。変更の無いタブは同一参照を維持し、全タブ同値なら
      // no-op (F2d)。
      const { sourceTabId } = action.payload;
      const source = project.tabs.find(t => t.id === sourceTabId);
      if (!source || project.tabs.length < 2) return project;
      const subjects = project.subjects || [];
      if (subjects.length === 0) return project;
      let changed = false;
      const newTabs = project.tabs.map(t => {
        if (t.id === sourceTabId) return t;
        // §N: コピー先にクラス別上書きが残っていると「上書きされます」の
        // 約束に反して実効値がソースと一致しないため、上書きもクリアする
        // (クラスはタブ固有なのでソースの上書き自体はコピーしない)。
        const hasOverrides = Object.values(t.config.classSubjectCounts || {})
          .some(byClass => byClass && Object.keys(byClass).length > 0);
        const tabChanged = hasOverrides || subjects.some(
          s => (t.config.subjectCounts[s] || 0) !== (source.config.subjectCounts[s] || 0));
        if (!tabChanged) return t;
        changed = true;
        const newCounts = { ...t.config.subjectCounts };
        subjects.forEach(s => { newCounts[s] = source.config.subjectCounts[s] || 0; });
        return {
          ...t,
          config: {
            ...t.config,
            subjectCounts: newCounts,
            ...(t.config.classSubjectCounts ? { classSubjectCounts: {} } : {}),
          },
        };
      });
      if (!changed) return project;
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
      const poolByLabel = new Map(pool.map(d => [d.label, d] as const));
      let nextIdNum = nextId(pool);
      // 外部授業だけの日をタブが使い始めたら印を外す (時間割に出る日になる)
      const usedLabels = new Set(cleanLabels);
      const newPool = pool.map(d => {
        if (!isExternalOnlyDate(d) || !usedLabels.has(d.label)) return d;
        const { externalOnly: _flag, ...rest } = d;
        return rest;
      });
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
      // 全日使う (null) タブの「今使っている日」に外部授業だけの日は入らない
      const current = target.config.activeDateIds ?? pool.filter(d => !isExternalOnlyDate(d)).map(d => d.id);
      const set = new Set(current);
      const turningOn = !set.has(dateId);
      if (set.has(dateId)) set.delete(dateId); else set.add(dateId);
      const activeIds = pool.map(d => d.id).filter(id => set.has(id));
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, activeDateIds: activeIds } } : t
      );
      // 外部授業だけの日をタブで使うことにしたら印を外す (時間割に出る日になる)
      const dates = turningOn && pool.some(d => d.id === dateId && isExternalOnlyDate(d))
        ? pool.map(d => {
          if (d.id !== dateId) return d;
          const { externalOnly: _flag, ...rest } = d;
          return rest;
        })
        : pool;
      return { ...project, tabs: newTabs, ...(dates !== pool ? { dates } : {}) };
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
    // 実体は removeDatesFromPool (L4b の一括削除と共通)。
    case 'dates/removeFromPool': {
      return removeDatesFromPool(project, [action.payload.dateId]);
    }

    // L4b: どのタブも使っていない日をまとめてプールから削除する。プールは
    // 「増える一方」(tabDates/setByLabels は追加のみ) なので、生成をやり直す
    // たびに溜まるゴミ日付の掃除経路。activeDateIds 未指定のタブは「全日
    // 使う」の意味なので、その場合は何も削除しない。
    // 外部授業だけの日 (印の付いた日) は人が残すと決めた日なので消さない。
    case 'dates/removeUnusedFromPool': {
      const pool = project.dates || [];
      if (project.tabs.some(t => !t.config.activeDateIds)) return project;
      const unused = pool
        .filter(d => !isExternalOnlyDate(d) && project.tabs.every(t => !t.config.activeDateIds.includes(d.id)))
        .map(d => d.id);
      if (unused.length === 0) return project;
      return removeDatesFromPool(project, unused);
    }

    // 外部授業だけの日を足す (2026-10-27)。どのタブの時間割にも出さず、他学年セッション
    // の登録・本体の月間・講師別 Excel の対象にだけする日 (12/24 の高3 Ⅰ期の初日など)。
    // プールに無い日は印を付けて足す。プールにあってどのタブも使っていない日は印を
    // 付ける (前の季節の残りと区別する)。タブが使っている日は講習の日なので触らない
    case 'dates/addExternalOnly': {
      const labels = [...new Set((action.payload.labels || []).map(l => String(l).trim()).filter(Boolean))];
      if (labels.length === 0) return project;
      const pool = project.dates || [];
      const usedIds = new Set<number>();
      let allDays = false;
      project.tabs.forEach(t => {
        if (!t.config.activeDateIds) allDays = true;
        else t.config.activeDateIds.forEach(id => usedIds.add(id));
      });
      const byLabel = new Map(pool.map(d => [d.label, d] as const));
      let nextIdNum = nextId(pool);
      let changed = false;
      const newPool = pool.map(d => {
        if (!labels.includes(d.label) || isExternalOnlyDate(d)) return d;
        // 全日使うタブがあると、印の無い日はどれも講習の日
        if (allDays || usedIds.has(d.id)) return d;
        changed = true;
        return { ...d, externalOnly: true };
      });
      labels.forEach(label => {
        if (byLabel.has(label)) return;
        newPool.push({ id: nextIdNum++, label, externalOnly: true });
        changed = true;
      });
      return changed ? { ...project, dates: newPool } : project;
    }

    // periods 版 tabDates/toggle・tabDates/setAllActive (E-3)。プールの追加/削除は
    // 引き続き config/setList('periods') のテキストエリア編集で行う (periods は
    // 自動生成が無く手打ちの短いリストなので、日付のような setByLabels は不要)。
    case 'tabPeriods/toggle': {
      const { tabId, periodId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId) || project.tabs[0];
      if (!target) return project;
      const pool = project.periods || [];
      if (!pool.some(p => p.id === periodId)) return project;
      // 枠に入ったタブは枠の時限からだけ選ぶ
      const frame = (project.frames || []).find(f => f.id === target.config.frameId);
      if (frame && !frame.periodIds.includes(periodId)) return project;
      const current = target.config.activePeriodIds ?? pool.map(p => p.id);
      const set = new Set(current);
      if (set.has(periodId)) set.delete(periodId); else set.add(periodId);
      const activeIds = pool.map(p => p.id).filter(id => set.has(id));
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, activePeriodIds: activeIds } } : t
      );
      return { ...project, tabs: newTabs };
    }

    case 'tabPeriods/setAllActive': {
      const { tabId, active } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      const target = project.tabs.find(t => t.id === targetId) || project.tabs[0];
      if (!target) return project;
      // 枠に入ったタブの「全選択」は枠の全時限 (null = プールの全部にしない)
      const frame = (project.frames || []).find(f => f.id === target.config.frameId);
      const activePeriodIds = active ? (frame ? [...frame.periodIds] : null) : [];
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, config: { ...t.config, activePeriodIds } } : t
      );
      return { ...project, tabs: newTabs };
    }

    // L4g: あるタブの「使う日 / 使う時限」の選択を他の全タブへコピーする
    // (「中3 と同じ日程に合わせる」を手作業のチェックし直し無しで)。
    // falsy (null/undefined) は「全部使う」の意味なので null に正規化して
    // コピーする (setAllActive の慣習と同じ)。全タブ同値なら no-op (F2d)。
    case 'tabDates/copyActiveToOthers':
    case 'tabPeriods/copyActiveToOthers': {
      const { sourceTabId } = action.payload;
      const key = action.type === 'tabDates/copyActiveToOthers' ? 'activeDateIds' : 'activePeriodIds';
      const source = project.tabs.find(t => t.id === sourceTabId);
      if (!source || project.tabs.length < 2) return project;
      const src = source.config[key];
      // 季節の中の枠があれば、写す先は同じ枠のタブだけ (冬期講習の日程を直前ポイント演習の
      // タブへ写さない。時限も枠ごと)
      const sameFrame = (t: typeof source) => (t.config.frameId ?? null) === (source.config.frameId ?? null);
      let changed = false;
      const newTabs = project.tabs.map(t => {
        if (t.id === sourceTabId || !sameFrame(t)) return t;
        const curr = t.config[key];
        // §M: 同値判定は Set 比較 (length + includes だと外部 JSON 由来の
        // 重複 id 入り配列を multiset として誤同一視しうる)
        const srcSet = Array.isArray(src) ? new Set(src) : null;
        const currSet = Array.isArray(curr) ? new Set(curr) : null;
        const same = (!src && !curr) ||
          (srcSet !== null && currSet !== null &&
            srcSet.size === currSet.size && [...srcSet].every(id => currSet.has(id)));
        if (same) return t;
        changed = true;
        return { ...t, config: { ...t.config, [key]: Array.isArray(src) ? [...src] : null } };
      });
      if (!changed) return project;
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
    case 'subject/addMany': {
      // L4d/L4c: 複数科目の一括追加 (カンマ区切り入力・CSV 未登録科目の
      // 一括登録)。既存と重複する名前・空文字は除外し、atomic で
      // Undo 1 ステップ。追加対象が無ければ no-op。
      const names = (action.payload.names || [])
        .map(n => (typeof n === 'string' ? n.trim() : ''))
        .filter(Boolean);
      const subjects = project.subjects || [];
      const seen = new Set(subjects);
      const fresh: string[] = [];
      names.forEach(n => {
        if (seen.has(n)) return;
        seen.add(n);
        fresh.push(n);
      });
      if (fresh.length === 0) return project;
      const newSubjects = [...subjects, ...fresh];
      const newTabs = project.tabs.map(tab => {
        const newCounts = { ...tab.config.subjectCounts };
        fresh.forEach(n => { newCounts[n] = newCounts[n] || 0; });
        return { ...tab, config: { ...tab.config, subjectCounts: newCounts } };
      });
      return { ...project, subjects: newSubjects, tabs: newTabs };
    }
    case 'subject/remove': {
      const { name } = action.payload;
      const newSubjects = (project.subjects || []).filter(s => s !== name);
      const newTabs = project.tabs.map(tab => {
        const newCounts = { ...tab.config.subjectCounts };
        delete newCounts[name];
        // §N: クラス別上書きからも該当科目を落とす (残すと同名科目の再追加で
        // 古い上書きが silent に復活する)
        let newClassCounts = tab.config.classSubjectCounts;
        if (newClassCounts) {
          let touched = false;
          const next: Record<string, Record<string, number>> = {};
          Object.entries(newClassCounts).forEach(([cid, byClass]) => {
            if (byClass && name in byClass) {
              const { [name]: _omit, ...rest } = byClass;
              next[cid] = rest;
              touched = true;
            } else {
              next[cid] = byClass;
            }
          });
          if (touched) newClassCounts = next;
        }
        const newSch = {};
        Object.keys(tab.schedule).forEach(k => {
          const e = tab.schedule[k];
          if (e.subject === name) {
            // K2b: locked も落とす。残すと「空 + ロック = この枠は空けて
            // おく」(F5w) に静かに変換され、科目削除がロックセルを solver の
            // 生成対象から黙って除外してしまう。ロックの対象 (科目割当) が
            // 消えた以上、セルは通常の未充填に戻すのが自然
            newSch[k] = { subject: '', teacher: '' };
          } else {
            newSch[k] = e;
          }
        });
        return {
          ...tab,
          config: {
            ...tab.config,
            subjectCounts: newCounts,
            ...(newClassCounts !== tab.config.classSubjectCounts ? { classSubjectCounts: newClassCounts } : {}),
          },
          schedule: newSch,
        };
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
      // 範囲外 idx を許すと splice(-1) の末尾誤移動や undefined 混入が起きる
      if (fromIdx < 0 || fromIdx >= subjects.length || toIdx < 0 || toIdx >= subjects.length) return project;
      const [moved] = subjects.splice(fromIdx, 1);
      subjects.splice(toIdx, 0, moved);
      return { ...project, subjects };
    }
    case 'subject/setColor': {
      const { subject, color } = action.payload;
      // F2d: 同色なら no-op (カラーピッカーの連続イベント対策)
      if ((project.subjectColors || {})[subject] === color) return project;
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
      const map = new Map(project.teachers.map(t => [t.name, t] as const));
      incoming.forEach(t => {
        const subjects = Array.isArray(t.subjects) ? t.subjects : [];
        const existing = map.get(t.name);
        if (existing) {
          // N1c: 取込行の担当科目が空なら既存の担当を維持する (L5a 親取込の
          // 「同名かつ担当空は除外」ガードと同思想)。雛形 CSV の科目列を
          // 空欄のまま取り込んで既存講師の担当が全消去される事故を防ぐ。
          const nextSubjects = subjects.length > 0 ? subjects : (existing.subjects || []);
          map.set(t.name, { ...existing, subjects: nextSubjects } as Teacher);
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
      const newExternal = dropExternalForTeacher(project.externalCounts, targetName);
      const newSessions = cleanExternalSessionsForTeacher(project.externalSessions, targetName);
      return { ...project, teachers: newTeachers, tabs: newTabs, externalCounts: newExternal, externalSessions: newSessions };
    }
    case 'teacher/removeByNames': {
      // 何人かをまとめて外す (本体で退職にした講師を講師マスタから外す)。
      // 1 人ずつは teacher/remove と同じ後始末 (割当の講師を空に・他学年
      // セッションと外部コマを消す)。Undo 1 回で戻せるよう 1 アクションにする
      const names = new Set(action.payload.names || []);
      let next = project;
      for (const name of names) {
        const idx = next.teachers.findIndex(t => t.name === name);
        if (idx >= 0) next = applyAction(next, { type: 'teacher/remove', payload: { idx } });
      }
      return next;
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
      // F2o: suffix を slice で置換する (replace の最初の一致置換は、日付
      // ラベルが `-旧名` を含むケースで日付側を書き換えてしまう)。
      const newExternal = renameExternalTeacher(project.externalCounts, oldName, newName) || {};
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
    case 'teacher/setLimit': {
      // L3a/L3b/N3a: 講師個別のコマ数上限 (1 日 / 通算 / 連続)。value が正の
      // 有限数でなければ「未設定」としてフィールドごと落とす。同値は no-op (F2d)。
      const { idx, key, value } = action.payload;
      if (idx == null || idx < 0 || idx >= project.teachers.length) return project;
      if (key !== 'maxDailyHours' && key !== 'maxTotalHours' && key !== 'maxConsecutivePeriods') return project;
      const num = Math.round(Number(value));
      const v = Number.isFinite(num) && num > 0 ? num : undefined;
      const curr = project.teachers[idx][key];
      if ((curr ?? undefined) === v) return project;
      const newTeachers = [...project.teachers];
      const t = { ...newTeachers[idx] };
      if (v === undefined) delete t[key];
      else t[key] = v;
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
      const addByName = new Map<string, Set<string>>();
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
    case 'teacher/clearAllManualNg': {
      // 全講師の手動NG (ngSlots) を一括解除する。他学年セッション由来の
      // 自動NGは externalSessions から導出されるため影響を受けない。
      let changed = false;
      const newTeachers = project.teachers.map(t => {
        if (!t.ngSlots || t.ngSlots.length === 0) return t;
        changed = true;
        return { ...t, ngSlots: [] };
      });
      if (!changed) return project;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/clearAllNg': {
      // 全NG設定の一括解除 = 手動NG (ngSlots) + 他学年セッション
      // (externalSessions)。自動NGはセッションから導出されるので、消すには
      // 派生元のセッション自体を削除するしかない。プリセットと
      // externalCounts (クイック数値入力) はNGを生まないため残す。
      let teachersChanged = false;
      const newTeachers = project.teachers.map(t => {
        if (!t.ngSlots || t.ngSlots.length === 0) return t;
        teachersChanged = true;
        return { ...t, ngSlots: [] };
      });
      const sessionsChanged = (project.externalSessions || []).length > 0;
      if (!teachersChanged && !sessionsChanged) return project;
      return {
        ...project,
        ...(teachersChanged ? { teachers: newTeachers } : {}),
        ...(sessionsChanged ? { externalSessions: [] } : {}),
      };
    }
    // ─── 出勤可能調査 ─────────────────────
    // 回答は Teacher.availability (日付 → 時限 → 記号)。× は autoNg が自動NG に
    // 合流させる (手動NG の ngSlots には書かない)。講師は名前で指す (画面が
    // 古い index を握ったまま dispatch しても別の講師を書き換えないように)。
    case 'teacher/setAvailability': {
      const { name, cells, mark } = action.payload;
      if (!name || name === '未定' || !Array.isArray(cells) || cells.length === 0) return project;
      if (mark != null && !isAvailabilityMark(mark)) return project;
      const idx = project.teachers.findIndex(t => t.name === name);
      if (idx < 0) return project;
      const t = project.teachers[idx];
      const next = applyAvailabilityMarks(t.availability, cells, mark);
      if (next === t.availability) return project; // F2d: 同値 no-op
      const newTeachers = [...project.teachers];
      newTeachers[idx] = withAvailability(t, next);
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/clearAvailability': {
      const idx = project.teachers.findIndex(t => t.name === action.payload.name);
      if (idx < 0) return project;
      const t = project.teachers[idx];
      if (t.availability === undefined && t.availabilityMemo === undefined) return project;
      const { availability: _a, availabilityMemo: _m, ...rest } = t;
      const newTeachers = [...project.teachers];
      newTeachers[idx] = rest as Teacher;
      return { ...project, teachers: newTeachers };
    }
    case 'teacher/setAvailabilityMemo': {
      const idx = project.teachers.findIndex(t => t.name === action.payload.name);
      if (idx < 0) return project;
      const t = project.teachers[idx];
      const memo = String(action.payload.memo ?? '').trim();
      if ((t.availabilityMemo ?? '') === memo) return project;
      const newTeachers = [...project.teachers];
      if (memo) {
        newTeachers[idx] = { ...t, availabilityMemo: memo };
      } else {
        const { availabilityMemo: _m, ...rest } = t;
        newTeachers[idx] = rest as Teacher;
      }
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
      // F5o: 負数は 0 に clamp (負の外部コマ数は講師の日次合計を過小評価し、
      // 過負荷警告を見逃す)。
      const key = makeExternalKey(date, teacherName);
      const clamped = Math.max(0, parseInt(String(value)) || 0);
      // F2d: 同値なら no-op (履歴を汚さない)
      if ((project.externalCounts || {})[key] === clamped) return project;
      const counts = { ...(project.externalCounts || {}), [key]: clamped };
      return { ...project, externalCounts: counts };
    }
    case 'teacher/addExternalSession': {
      // 構造化時刻 (startTime / endTime, HH:mm) は省略可。あれば
      // 自動NG派生 (utils/autoNg) の対象になる。空文字列は格納しない。
      // endTime だけが指定されて startTime が空の場合は endTime も
      // 落とす (orphan endTime を残すと getSessionTimeRange が start を
      // 復元できず、データだけが残って自動NGに反映されない silent failure
      // になるため)。
      const { date, teacherName, label, memo, course, startTime, endTime } = action.payload;
      if (!date || !teacherName) return project;
      const sessions = project.externalSessions || [];
      const newId = sessions.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      const newSession: ExternalSession = { id: newId, date, teacherName, label: label || '', memo: memo || '' };
      const courseText = normalizeSessionCourse(course);
      if (courseText) newSession.course = courseText;
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
      // N1i: 内容が完全一致する既存セッションはスキップする (NG CSV の
      // dedupe = F2h と同思想)。同条件の再登録で一覧に二重に溜まるのを防ぐ。
      // バッチ内の重複も同じキーで弾く (キーは utils/externalSessionShape の 1 か所)。
      const contentKey = externalSessionContentKey;
      const seen = new Set(sessions.map(contentKey));
      let nextId = sessions.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      const newOnes: ExternalSession[] = [];
      for (const it of items) {
        if (!it?.date || !it?.teacherName) continue;
        const ns: ExternalSession = { id: nextId, date: it.date, teacherName: it.teacherName, label: it.label || '', memo: it.memo || '' };
        const courseText = normalizeSessionCourse(it.course);
        if (courseText) ns.course = courseText;
        if (it.startTime) {
          ns.startTime = it.startTime;
          if (it.endTime) ns.endTime = it.endTime;
        }
        const key = contentKey(ns);
        if (seen.has(key)) continue;
        seen.add(key);
        nextId++;
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

    // 登録済みのセッションのメモ・講座名を直す (日付ごとの一覧から)。空にしたら
    // 講座名は持たない。同じ値なら何もしない
    case 'teacher/updateExternalSession': {
      const { id, updates } = action.payload;
      const sessions = project.externalSessions || [];
      const target = sessions.find(s => s.id === id);
      if (!target || !updates) return project;
      const next: ExternalSession = { ...target };
      if ('memo' in updates) next.memo = String(updates.memo ?? '').trim();
      if ('course' in updates) {
        const courseText = normalizeSessionCourse(updates.course);
        if (courseText) next.course = courseText;
        else delete next.course;
      }
      if ((next.memo || '') === (target.memo || '') && (next.course || '') === (target.course || '')) return project;
      return { ...project, externalSessions: sessions.map(s => (s.id === id ? next : s)) };
    }

    // 講座名の欄ができる前に「プリセットの名前 + 講座名」をメモに入れていたセッションを、
    // メモと講座名に分ける (utils/externalSessionShape.computeCourseSplit)。分けると
    // プリセットの改名のメモ同期が効くようになる。Undo 1 回で戻せる
    case 'teacher/splitSessionCourses': {
      const sessions = project.externalSessions || [];
      const assignments = computeCourseSplit(sessions, project.externalSessionPresets || []);
      if (assignments.length === 0) return project;
      const byId = new Map(assignments.map(a => [a.sessionId, a]));
      return {
        ...project,
        externalSessions: sessions.map(s => {
          const a = byId.get(s.id);
          return a ? { ...s, memo: a.memo, course: a.course } : s;
        }),
      };
    }

    // メモ未設定のセッションへ、時刻が一致するプリセットの名前を一括適用する
    // (プリセット名メモ対応以前に登録された既存データの後付け用)。突き合わせは
    // computePresetMemoBackfill (純粋関数) — 既存メモは上書きせず、複数
    // プリセットに一致して判別できないセッションは触らない。Undo 1 回で戻せる。
    case 'teacher/applyPresetMemos': {
      const sessions = project.externalSessions || [];
      const { assignments } = computePresetMemoBackfill(
        sessions,
        project.externalSessionPresets || [],
        project.dates || [],
      );
      if (assignments.length === 0) return project;
      const memoById = new Map(assignments.map(a => [a.sessionId, a.memo]));
      const newSessions = sessions.map(s =>
        memoById.has(s.id) ? { ...s, memo: memoById.get(s.id) } : s
      );
      return { ...project, externalSessions: newSessions };
    }

    // ─── 他学年セッションプリセット ─────────
    // 「予備校 12:25-13:35 を 7/24~7/31」のような頻出パターンを保存し、
    // 詳細セッション登録フォームから 1 クリックで呼び出せるようにする。
    // payload で受け取る fields は全て optional (id/name 以外)。空文字は省く。
    case 'preset/add': {
      const { name, startTime, endTime, startDateLabel, endDateLabel, memo, teachers } = action.payload;
      if (!name) return project;
      const presets = project.externalSessionPresets || [];
      const newId = presets.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      const newPreset: ExternalSessionPreset = { id: newId, name };
      if (startTime) newPreset.startTime = startTime;
      if (startTime && endTime) newPreset.endTime = endTime;
      if (startDateLabel) newPreset.startDateLabel = startDateLabel;
      if (endDateLabel) newPreset.endDateLabel = endDateLabel;
      if (memo) newPreset.memo = memo;
      // N4c: 対象講師 (任意)。空配列は「講師なし」としてフィールドごと省く
      if (Array.isArray(teachers) && teachers.length > 0) newPreset.teachers = [...teachers];
      return { ...project, externalSessionPresets: [...presets, newPreset] };
    }
    case 'preset/update': {
      const { id, updates, syncSessionMemos } = action.payload;
      const presets = project.externalSessionPresets || [];
      const target = presets.find(p => p.id === id);
      if (!target) return project;
      // updates のフィールドは空文字なら削除、値があれば上書き。
      // startTime が落ちる場合は endTime も落とす (orphan endTime 防止)。
      const merged: ExternalSessionPreset = { ...target };
      const writeOrDelete = (
        key: 'startTime' | 'endTime' | 'startDateLabel' | 'endDateLabel' | 'memo',
        val: string | null | undefined,
      ) => {
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
      // N4c: teachers は空配列で削除、非空配列で上書き (文字列フィールドの
      // 「空文字なら削除」と同じ意味論)
      if ('teachers' in updates) {
        if (Array.isArray(updates.teachers) && updates.teachers.length > 0) merged.teachers = [...updates.teachers];
        else delete merged.teachers;
      }
      if (!merged.startTime) delete merged.endTime;
      // syncSessionMemos: 名称 / メモの変更を登録済みセッションへ同期する
      // (プリセット名の間違いを後から直すケース)。突き合わせは
      // computePresetRenameSyncIds (純粋関数) — 変更前のラベル + 時刻が
      // 一致するセッションのみ。preset とセッションを同一 action で更新
      // するので Undo 1 回で両方戻せる。
      let newSessions = project.externalSessions;
      if (syncSessionMemos) {
        const oldLabel = presetSessionLabel(target);
        const newLabel = presetSessionLabel(merged);
        if (oldLabel && newLabel && oldLabel !== newLabel) {
          const ids = new Set(computePresetRenameSyncIds(project.externalSessions, target));
          if (ids.size > 0) {
            newSessions = (project.externalSessions || []).map(s =>
              ids.has(s.id) ? { ...s, memo: newLabel } : s,
            );
          }
        }
      }
      return {
        ...project,
        externalSessionPresets: presets.map(p => p.id === id ? merged : p),
        ...(newSessions !== project.externalSessions ? { externalSessions: newSessions } : {}),
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
      if (type === 'subject') {
        // 講師が新しい科目も担当できる場合は保持する (判定はドロップダウン
        // 候補と同じ subjects.includes)。担当不可・科目クリア時のみ空へ。
        const keepTeacher = !!val && !!e.teacher &&
          project.teachers.some(t => t.name === e.teacher && t.subjects.includes(val));
        e.subject = val;
        if (!keepTeacher) e.teacher = '';
      } else { e[type] = val; }

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
    case 'cell/bulkClear': {
      // N2a: 選択セルの一括クリア。単一 clear と同じ意味論 (locked はスキップ・
      // 合同 secondary の cleanup 込み) を選択集合へ atomic に適用 (Undo 1 回)。
      const { keys } = action.payload;
      if (!Array.isArray(keys) || keys.length === 0) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentConfig = effectiveConfig(project, activeTab);
      let ns = activeTab.schedule;
      let changed = false;
      for (const k of keys) {
        const parsed = parseKey(k);
        if (!parsed) continue;
        const curr = ns[k];
        if (!curr || curr.locked) continue;
        if (!curr.subject && !curr.teacher) continue; // 空 entry は変化なし
        ns = cleanupOldCombined(ns, currentConfig, project.combinedGroups, parsed.dateId, parsed.periodId, parsed.classId, curr.subject);
        ns = { ...ns };
        delete ns[k];
        changed = true;
      }
      if (!changed) return project;
      return { ...project, tabs: project.tabs.map(t => t.id === activeTab.id ? { ...t, schedule: ns } : t) };
    }
    case 'cell/bulkSetLock': {
      // N2a: 選択セルの一括ロック/解除。空セルのロックは「空けておく」(F5w)
      // の意思表示として許可 (単一 toggleLock と同じ)。同値はスキップし、
      // 全て同値なら no-op (F2d)。
      const { keys, locked } = action.payload;
      if (!Array.isArray(keys) || keys.length === 0) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      let ns: typeof activeTab.schedule | null = null;
      for (const k of keys) {
        if (!parseKey(k)) continue;
        const curr = activeTab.schedule[k] || {};
        if (!!curr.locked === !!locked) continue;
        if (ns === null) ns = { ...activeTab.schedule };
        ns[k] = { ...curr, locked: !!locked };
      }
      if (ns === null) return project;
      return { ...project, tabs: project.tabs.map(t => t.id === activeTab.id ? { ...t, schedule: ns } : t) };
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
      const { sourceKey, targetKey } = action.payload;
      if (sourceKey === targetKey) return project;
      const sParsed = parseKey(sourceKey);
      const tParsed = parseKey(targetKey);
      if (!sParsed || !tParsed) return project;

      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentSchedule = activeTab.schedule;
      // F2e: dragstart 時点の payload を信頼せず、dispatch 時点の schedule を
      // 正とする。payload 経由だと dragstart 後にセルが変わった場合 (undo /
      // 他操作の狭い競合窓) に stale な内容を書き戻したり、lock された
      // セルの lock を剥がしたりする。
      const sourceData = currentSchedule[sourceKey];
      const targetData = currentSchedule[targetKey] || {};
      // source が空になっていたら swap の意味が無いので no-op (UI は
      // subject 無しセルの drag を開始しない)。locked はどちらか一方でも
      // 立っていれば no-op (下の `locked: false` で剥がさないための防衛)。
      if (!sourceData?.subject) return project;
      if (sourceData.locked || targetData.locked) return project;

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
    case 'cell/applyToAllDates': {
      // L2c: 起点セルの割当 (科目 + 講師) を、使う全日の同じ時限・クラスへ
      // 適用する。「クラスA 1限は毎日 英語 (田中)」の反復入力を 1 操作に。
      // ロック済みセルと同値セルはスキップ。cascade は cell/paste と同じ
      // (旧科目の合同 cleanup → 上書き → 合同伝播)。
      const { dateId, periodId, classId } = action.payload;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentConfig = effectiveConfig(project, activeTab);
      const srcKey = makeKey(dateId, periodId, classId);
      const src = activeTab.schedule[srcKey];
      if (!src?.subject) return project;
      const srcTeacher = src.teacher || '';
      const groups = project.combinedGroups;
      let ns = { ...activeTab.schedule };
      let changed = false;
      currentConfig.dates.forEach(d => {
        if (d.id === dateId) return;
        const k = makeKey(d.id, periodId, classId);
        const curr = ns[k] || {};
        if (curr.locked) return;
        if (curr.subject === src.subject && (curr.teacher || '') === srcTeacher) return;
        if (curr.subject && curr.subject !== src.subject) {
          ns = cleanupOldCombined(ns, currentConfig, groups, d.id, periodId, classId, curr.subject);
        }
        const newEntry = { ...(ns[k] || {}), subject: src.subject, teacher: srcTeacher };
        ns[k] = newEntry;
        ns = propagateAssignment(ns, currentConfig, groups, d.id, periodId, classId, newEntry);
        changed = true;
      });
      if (!changed) return project;
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'schedule/copyDateColumn': {
      // L2c: 1 日分の列 (全時限 × 全クラス) を別の日へ複製する。「8/1 を
      // 8/2 にコピーして微修正」の頻出操作。ロック済みの複製先はスキップ、
      // 複製元が空のセルは複製先も空にする (複製の意味論)。Undo 1 ステップ。
      //
      // §M: 実装は verbatim copy (cleanup / 伝播を呼ばない)。per-cell の
      // paste 意味論を列内で積み重ねると、後続クラスの cleanupOldCombined が
      // 直前に複製したばかりの合同セルを巻き添えで消す (合同グループは同一
      // (日付, 時限) 内で閉じるため)。複製元の列は編集時点で既に伝播済みの
      // 整合状態なので、そのまま写すのが「複製」の約束に一致し、列全体を
      // 写す限り dangling な合同参照も生じない。ロック済み複製先だけは
      // 温存され、その場合の列内整合はユーザのロック判断に従う。
      const { sourceDateId, targetDateId } = action.payload;
      if (sourceDateId === targetDateId) return project;
      const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
      const currentConfig = effectiveConfig(project, activeTab);
      const activeIds = new Set(currentConfig.dates.map(d => d.id));
      if (!activeIds.has(sourceDateId) || !activeIds.has(targetDateId)) return project;
      const ns = { ...activeTab.schedule };
      let changed = false;
      currentConfig.periods.forEach(p => {
        currentConfig.classes.forEach(c => {
          const src = ns[makeKey(sourceDateId, p.id, c.id)];
          const tgtK = makeKey(targetDateId, p.id, c.id);
          const curr = ns[tgtK] || {};
          if (curr.locked) return;
          const srcSubject = src?.subject || '';
          const srcTeacher = src?.teacher || '';
          if ((curr.subject || '') === srcSubject && (curr.teacher || '') === srcTeacher) return;
          if (!srcSubject) {
            if (ns[tgtK]) {
              delete ns[tgtK]; // ns はこの case 冒頭で複製済みなので直接消してよい
              changed = true;
            }
            return;
          }
          ns[tgtK] = { ...curr, subject: srcSubject, teacher: srcTeacher };
          changed = true;
        });
      });
      if (!changed) return project;
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
      // H3: リネーム先が同じ次元の既存ラベルと重複する場合は reject する。
      // 許すと 2 entity が同ラベルになり、NG キー / externalCounts キーが
      // 衝突して片方が silent に消える (Object キーの上書き) など、ラベル
      // 参照が混線する。UI 側 (ContextMenu) でも同じ判定で toast を出す。
      const dupIn = (arr) => (arr || []).some(e => e.label === newVal);
      if (type === 'date' && dupIn(project.dates)) return project;
      if (type === 'period' && dupIn(project.periods)) return project;
      if (type === 'class' && dupIn(activeTab.config.classes)) return project;
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
        // NG slot のキーを書き換え (パースの詳細は labelRefs.js に一元化)
        newTeachers = project.teachers.map(t => {
          if (!t.ngSlots || t.ngSlots.length === 0) return t;
          const newNgSlots = type === 'date'
            ? renameNgDate(t.ngSlots, oldVal, newVal)
            : renameNgPeriod(t.ngSlots, oldVal, newVal);
          return { ...t, ngSlots: newNgSlots };
        });
        // 出勤可能調査の回答 (日付 → 時限 → 記号) も追従させる。改名先は
        // プールに無いラベル (上で重複を reject 済み) なので、そこに残っている
        // 回答は前に消した日付・時限の残り。動かしてきた回答を優先する
        newTeachers = mapTeachersAvailability(newTeachers, map => (
          type === 'date'
            ? renameAvailabilityDate(map, oldVal, newVal, 'moved')
            : renameAvailabilityPeriod(map, oldVal, newVal, 'moved')
        ));
      }

      if (type === 'date') {
        newExternal = renameExternalDate(project.externalCounts, oldVal, newVal);
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
        // H5: クラス優先度 / NG クラス (teacher.priorityClasses / ngClasses)
        // もラベル参照なので追従させる。
        newTeachers = renameClassInTeachers(project.teachers, oldVal, newVal);
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
      // 「使う日・使う時限」から外れて非表示のまま温存されているセルは
      // クリア対象外 (tabDates/toggle の「off にしてもセルは保持、再 on で
      // 復活」という不変条件を守る)。画面に見えているセルだけを消す。
      const visibleCfg = effectiveConfig(project, activeTab);
      const visibleDateIds = new Set(visibleCfg.dates.map(d => d.id));
      const visiblePeriodIds = new Set(visibleCfg.periods.map(p => p.id));
      const ns = {};
      Object.keys(activeTab.schedule).forEach(k => {
        const entry = activeTab.schedule[k];
        if (entry.locked) { ns[k] = entry; return; }
        const parsed = parseKey(k);
        const hidden = parsed && (!visibleDateIds.has(parsed.dateId) || !visiblePeriodIds.has(parsed.periodId));
        if (hidden) ns[k] = entry;
      });
      const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
      return { ...project, tabs: newTabs };
    }
    case 'schedule/applyPattern': {
      // tabId = 生成時のタブ。結果パネルはタブ切替後も表示されたままなので、
      // dispatch 時点の activeTabId に書くと別タブのスケジュールを上書き
      // してしまう (クラス ID はタブ間で再利用されるため silent に混入する)。
      // snapshot/apply と同じく「記録されたタブへ適用 + そのタブを active に」。
      // tabId 省略時は従来互換でアクティブタブ。
      const { pat, tabId } = action.payload;
      const targetId = tabId ?? project.activeTabId;
      // 生成後にタブが削除されたケースは no-op (snapshot/apply と同じ扱い)
      if (!project.tabs.some(t => t.id === targetId)) return project;
      const newTabs = project.tabs.map(t => t.id === targetId ? { ...t, schedule: pat } : t);
      return cleanSchedule({ ...project, tabs: newTabs, activeTabId: targetId });
    }

    // ─── タブ間複製 (K4a) ─────────────────
    // 別タブの割当を「現在のタブ」へ複製する (例: 中3 タブの割当を
    // 中1・2 タブへ流用して手直しする)。dates / periods は project 共通
    // (v4) なので変換不要だが、classes はタブごとに別 entity なので
    // 「label 一致を優先、無ければ同じ並び位置 (index)」で対応付ける。
    // 対象タブが使わない日付・時限 (activeDateIds/activePeriodIds の絞り) の
    // セルは複製しない (不可視セルへのゴミ書込を防ぐ。E-3 と同じ扱い)。
    case 'schedule/copyFromTab': {
      const { sourceTabId } = action.payload;
      const target = project.tabs.find(t => t.id === project.activeTabId);
      const source = project.tabs.find(t => t.id === sourceTabId);
      if (!source || !target || source.id === target.id) return project;
      const srcClasses = source.config.classes || [];
      const tgtClasses = target.config.classes || [];
      const classIdMap = new Map<number, number>();
      srcClasses.forEach((sc, i) => {
        const byLabel = tgtClasses.find(tc => tc.label === sc.label);
        const tgt = byLabel ?? tgtClasses[i];
        if (tgt) classIdMap.set(sc.id, tgt.id);
      });
      const tgtEffective = effectiveConfig(project, target);
      const visibleDateIds = new Set(tgtEffective.dates.map(d => d.id));
      const visiblePeriodIds = new Set(tgtEffective.periods.map(p => p.id));
      const newSchedule: Schedule = {};
      Object.entries(source.schedule || {}).forEach(([key, entry]) => {
        const parsed = parseKey(key);
        if (!parsed) return;
        if (!visibleDateIds.has(parsed.dateId) || !visiblePeriodIds.has(parsed.periodId)) return;
        const tgtClassId = classIdMap.get(parsed.classId);
        if (tgtClassId === undefined) return;
        newSchedule[makeKey(parsed.dateId, parsed.periodId, tgtClassId)] = { ...entry };
      });
      const newTabs = project.tabs.map(t =>
        t.id === target.id ? { ...t, schedule: newSchedule } : t
      );
      return cleanSchedule({ ...project, tabs: newTabs });
    }

    // ─── 前の講習の時間割を写す (2026-10-27、utils/timetableCopy) ───
    // 写す計画 (planTimetableCopy) が決めたセルに科目・講師を書く。ロックした
    // セルには書かない (計画の後にロックされた場合も)。存在しないタブ・キーの
    // セルは cleanSchedule が落とす
    case 'schedule/importCells': {
      const writes = action.payload.writes || [];
      if (writes.length === 0) return project;
      const byTab = new Map<number, typeof writes>();
      writes.forEach(w => {
        if (!byTab.has(w.tabId)) byTab.set(w.tabId, []);
        byTab.get(w.tabId).push(w);
      });
      let changed = false;
      const newTabs = project.tabs.map(tab => {
        const list = byTab.get(tab.id);
        if (!list) return tab;
        const schedule = { ...tab.schedule };
        list.forEach(w => {
          if (!w.subject && !w.teacher) return;
          if (schedule[w.key]?.locked) return;
          schedule[w.key] = { subject: w.subject, teacher: w.teacher };
          changed = true;
        });
        return { ...tab, schedule };
      });
      if (!changed) return project;
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
      const groups = project.combinedGroups || [];
      const target = groups.find(g => g.id === id);
      if (!target) return project;
      // F2d: 全フィールド同値なら no-op。classes / dates は小さい配列なので
      // JSON 比較で十分 (dates: null = 全日程 も正しく比較される)。
      const same = Object.entries(updates || {}).every(
        ([k, v]) => JSON.stringify(target[k]) === JSON.stringify(v)
      );
      if (same) return project;
      const newGroups = groups.map(g => g.id === id ? { ...g, ...updates } : g);
      return { ...project, combinedGroups: newGroups };
    }
    case 'combinedGroup/remove': {
      const { id } = action.payload;
      const newGroups = (project.combinedGroups || []).filter(g => g.id !== id);
      return { ...project, combinedGroups: newGroups };
    }

    // ─── プロジェクト全体 ────────────────
    case 'project/updateName': {
      // F2d: 同名なら no-op (Header の blur 再 commit 対策)
      if (action.payload.name === project.name) return project;
      return { ...project, name: action.payload.name };
    }
    // ─── 季節の中の枠 (utils/frames) ─────
    // 枠を作る。指定したタブを入れ、枠の時限はそのタブが今使っている時限 (和集合)。
    // 新しい枠の「月間の予定」は入れるタブの今の状態から (作っただけで月間から消えない・出ない)
    case 'frame/add': {
      const name = String(action.payload.name ?? '').trim();
      const frames = project.frames || [];
      if (!name || frames.some(f => f.name === name)) return project;
      const id = frames.reduce((m, f) => Math.max(m, f.id), 0) + 1;
      const tabIds = new Set(action.payload.tabIds || []);
      const used = new Set<number>();
      project.tabs.forEach(t => {
        if (tabIds.has(t.id)) effectiveConfig(project, t).periods.forEach(p => used.add(p.id));
      });
      const periodIds = (project.periods || []).map(p => p.id).filter(pid => used.has(pid));
      // 入れるタブの今の状態のうち、いちばん出していないもの (作成中のタブを入れただけで
      // 月間に出ないように)。タブを入れなければ project の状態
      const tabStates = project.tabs.filter(t => tabIds.has(t.id)).map(t => publishStateForTab(project, t));
      const initialState = tabStates.length > 0 ? leastPublished(tabStates) : projectPublishState(project);
      const frame: Frame = { id, name, periodIds, publishState: initialState };
      const tabs = project.tabs.map(t => {
        if (!tabIds.has(t.id)) return t;
        const active = effectiveConfig(project, t).periods.map(p => p.id);
        return { ...t, config: { ...t.config, frameId: id, activePeriodIds: active } };
      });
      return { ...project, frames: [...frames, frame], tabs };
    }
    case 'frame/rename': {
      const name = String(action.payload.name ?? '').trim();
      const frames = project.frames || [];
      const target = frames.find(f => f.id === action.payload.id);
      if (!target || !name || target.name === name || frames.some(f => f.name === name)) return project;
      return { ...project, frames: frames.map(f => (f.id === target.id ? { ...f, name } : f)) };
    }
    // 枠を消す (タブは枠なしに戻り、使う時限はそのまま。時限・コマは消さない)
    case 'frame/remove': {
      const frames = project.frames || [];
      if (!frames.some(f => f.id === action.payload.id)) return project;
      const rest = frames.filter(f => f.id !== action.payload.id);
      const tabs = project.tabs.map(t => {
        if (t.config.frameId !== action.payload.id) return t;
        const { frameId: _frameId, ...config } = t.config;
        return { ...t, config };
      });
      const next = { ...project, tabs, frames: rest };
      if (rest.length === 0) delete next.frames;
      return next;
    }
    // タブを枠に入れる / 外す。入れるときの使う時限は、今の時限のうち枠にあるもの
    // (1 つも無ければ枠の全時限)。外すときは今の時限のまま
    case 'frame/setTab': {
      const { tabId, frameId } = action.payload;
      const tab = project.tabs.find(t => t.id === tabId);
      if (!tab || (tab.config.frameId ?? null) === frameId) return project;
      if (frameId == null) {
        const { frameId: _frameId, ...config } = tab.config;
        const active = effectiveConfig(project, tab).periods.map(p => p.id);
        return { ...project, tabs: project.tabs.map(t => (t.id === tabId ? { ...t, config: { ...config, activePeriodIds: active } } : t)) };
      }
      const frame = (project.frames || []).find(f => f.id === frameId);
      if (!frame) return project;
      const allowed = new Set(frame.periodIds);
      let active = effectiveConfig(project, tab).periods.map(p => p.id).filter(id => allowed.has(id));
      if (active.length === 0) active = [...frame.periodIds];
      return {
        ...project,
        tabs: project.tabs.map(t => (t.id === tabId ? { ...t, config: { ...t.config, frameId, activePeriodIds: active } } : t)),
      };
    }
    // 枠の時限をカンマ区切りで直す。名前の同じ時限はプールの時限をそのまま使い (枠を
    // またいで同じ時限)、無い名前は足す。枠から外した時限は、ほかの枠・枠に入っていない
    // タブも使っていなければプールから消す (config/setList と同じ cascade)。足した時限は
    // 枠のタブの使う時限にも足す。プールの並びは枠の並びにそろえる (時間割の行の順)
    case 'frame/setPeriods': {
      const { id, value } = action.payload;
      const frames = project.frames || [];
      const frame = frames.find(f => f.id === id);
      if (!frame) return project;
      const labels = [...new Set(String(value ?? '').split(',').map(s => s.trim()).filter(Boolean))];
      if (labels.length === 0) return project;
      const pool = project.periods || [];
      const byLabel = new Map(pool.map(p => [p.label, p] as const));
      let next = nextId(pool);
      const created: Array<{ id: number; label: string }> = [];
      const newIds = labels.map(label => {
        const hit = byLabel.get(label);
        if (hit) return hit.id;
        const ent = { id: next++, label };
        created.push(ent);
        byLabel.set(label, ent);
        return ent.id;
      });
      const oldIds = frame.periodIds;
      const sameList = newIds.length === oldIds.length && newIds.every((v, i) => v === oldIds[i]);
      if (sameList && created.length === 0) return project;
      const newIdSet = new Set(newIds);
      const added = newIds.filter(pid => !oldIds.includes(pid));
      const removed = oldIds.filter(pid => !newIdSet.has(pid));
      // プールの並び: この枠の時限を、最初の時限があった位置に枠の並びでまとめる
      const allEntities = [...pool, ...created];
      const entById = new Map(allEntities.map(p => [p.id, p] as const));
      const firstIdx = pool.findIndex(p => newIdSet.has(p.id) || oldIds.includes(p.id));
      const without = pool.filter(p => !newIdSet.has(p.id));
      const insertAt = firstIdx < 0 ? without.length : without.filter(p => pool.indexOf(p) < firstIdx).length;
      const periods = [...without.slice(0, insertAt), ...newIds.map(pid => entById.get(pid)!), ...without.slice(insertAt)];
      const tabs = project.tabs.map(t => {
        if (t.config.frameId !== id) return t;
        const current = t.config.activePeriodIds || [];
        const active = [...current.filter(pid => newIdSet.has(pid)), ...added.filter(pid => !current.includes(pid))];
        return { ...t, config: { ...t.config, activePeriodIds: active } };
      });
      let result: Project = {
        ...project,
        periods,
        tabs,
        frames: frames.map(f => (f.id === id ? { ...f, periodIds: newIds } : f)),
      };
      // 外した時限のうち、どこも使っていないものはプールから消す
      const otherFrameIds = new Set(frames.filter(f => f.id !== id).flatMap(f => f.periodIds));
      const unframed = result.tabs.filter(t => !(result.frames || []).some(f => f.id === t.config.frameId));
      const unframedAll = unframed.some(t => !t.config.activePeriodIds);
      const unframedIds = new Set(unframed.flatMap(t => t.config.activePeriodIds || []));
      const drop = removed.filter(pid => !otherFrameIds.has(pid) && !unframedAll && !unframedIds.has(pid));
      if (drop.length > 0) result = removePeriodsFromPool(result, drop);
      return result;
    }
    case 'frame/setPublishState': {
      const { id, state } = action.payload;
      const frames = project.frames || [];
      const target = frames.find(f => f.id === id);
      if (!target || !isPublishState(state) || framePublishState(project, target) === state) return project;
      return { ...project, frames: frames.map(f => (f.id === id ? { ...f, publishState: state } : f)) };
    }

    // ─── 本体の行事予定 (講習) との結び付け (utils/courseEventCheck) ─────
    // タブに行事予定の名前を結び付ける / 外す。名前は表記ゆれ (全角半角・空白) を
    // 同じものとして扱う。対象外にした行事予定を結び付けたら対象外から外す
    case 'courseEvents/setLink':
    case 'courseEvents/linkMany': {
      const links = action.type === 'courseEvents/setLink'
        ? [{ tabId: action.payload.tabId, name: action.payload.name, linked: action.payload.linked }]
        : action.payload.links.map(l => ({ ...l, linked: true }));
      let tabs = project.tabs;
      let ignored = project.ignoredCourseEvents || [];
      for (const { tabId, name, linked } of links) {
        const key = normalizeEventName(name);
        const tab = tabs.find(t => t.id === tabId);
        if (!key || !tab) continue;
        const current = tab.config.courseEventNames || [];
        const has = current.some(n => normalizeEventName(n) === key);
        if (has === linked) continue;
        const nextNames = linked ? [...current, String(name).trim()] : current.filter(n => normalizeEventName(n) !== key);
        tabs = tabs.map(t => {
          if (t.id !== tabId) return t;
          const { courseEventNames: _old, ...config } = t.config;
          return { ...t, config: nextNames.length > 0 ? { ...config, courseEventNames: nextNames } : config };
        });
        if (linked) ignored = ignored.filter(n => normalizeEventName(n) !== key);
      }
      if (tabs === project.tabs) return project;
      const next: Project = { ...project, tabs };
      if (ignored.length > 0) next.ignoredCourseEvents = ignored;
      else delete next.ignoredCourseEvents;
      return next;
    }
    // 行事予定を「この講習の対象外」にする / 戻す (対象外にしたらタブの結び付けも外す)
    case 'courseEvents/setIgnored': {
      const { name, ignored: value } = action.payload;
      const key = normalizeEventName(name);
      if (!key) return project;
      const current = project.ignoredCourseEvents || [];
      const has = current.some(n => normalizeEventName(n) === key);
      if (has === value) return project;
      const names = value ? [...current, String(name).trim()] : current.filter(n => normalizeEventName(n) !== key);
      const tabs = value
        ? project.tabs.map(t => {
          const list = t.config.courseEventNames || [];
          if (!list.some(n => normalizeEventName(n) === key)) return t;
          const rest = list.filter(n => normalizeEventName(n) !== key);
          const { courseEventNames: _old, ...config } = t.config;
          return { ...t, config: rest.length > 0 ? { ...config, courseEventNames: rest } : config };
        })
        : project.tabs;
      const next: Project = { ...project, tabs };
      if (names.length > 0) next.ignoredCourseEvents = names;
      else delete next.ignoredCourseEvents;
      return next;
    }

    case 'project/setPublishState': {
      // 月間の予定へ出すか (作成中 / 仮確定 / 確定)。Undo で戻せる (履歴に積む)
      const { state } = action.payload;
      if (!isPublishState(state) || projectPublishState(project) === state) return project;
      return { ...project, publishState: state };
    }
    case 'project/setGenerationParams': {
      // 自動生成パラメータ (numPatterns / maxDailyHours / maxIterations) を
      // 部分更新する。渡されたキーのみ clamp して反映 (未指定は据え置き)。
      const updates = action.payload || {};
      const next = { ...project };
      let changed = false;
      const paramKeys: GenerationParamKey[] = ['numPatterns', 'maxDailyHours', 'maxIterations', 'maxConsecutivePeriods', 'generationSeed'];
      for (const key of paramKeys) {
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
