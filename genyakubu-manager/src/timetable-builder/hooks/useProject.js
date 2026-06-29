import { useCallback } from 'react';
import { useHistoryStack } from './useHistoryStack';
import { useJsonIO } from './useJsonIO';
import { useScheduleActions } from './useScheduleActions';
import { useSubjectActions } from './useSubjectActions';
import { useTeacherActions } from './useTeacherActions';
import { makeKey, migrateProject } from '../utils/scheduleKey';
import { cleanSchedule } from '../utils/constants';

// 講習時間割プロジェクトの一元状態管理フック。
//
// 内訳:
//   - useHistoryStack:    useReducer ベースで project + 履歴 + 自動保存
//   - useJsonIO:          JSON 保存/読込/デフォルト保存/全リセット
//   - useTeacherActions:  講師管理 dispatch ラッパ + externalCounts
//   - useSubjectActions:  科目マスタ管理 + 科目カラー
//   - useScheduleActions: セル操作 dispatch ラッパ + applyPattern + 一括操作
//   - 本ファイル:         残りのアクション (タブ/設定/合同/メタ) と composer
//
// C2 (reducer 化) 以降: 状態変更は全て dispatch 経由。各アクションフックの
// callback は dispatch (stable) のみに依存するので re-render で identity が
// 変わらない。
//
// 公開 API は ProjectContext 経由で全コンポーネントから参照されるため、
// 返り値のキー名・関数シグネチャは安易に変更しない。
export function useProject() {
  const {
    project,
    dispatch,
    history,
    historyIndex,
    saveStatus,
    undo,
    redo,
    loadError,
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
  } = useJsonIO({ project, activeTab, dispatch });

  const teacherActions = useTeacherActions(dispatch);
  const subjectActions = useSubjectActions(dispatch);
  const scheduleActions = useScheduleActions(dispatch, currentSchedule);

  // handleSetNg: cell 位置 → 講師 idx + date.label + period.label を解決し、
  // teacher/toggleNg に委譲する派生 action。元は projectReducer の
  // cell/setNg case に同じロジックが書かれていたが、teacher/toggleNg と重複
  // していたため統合 (D4g)。teacher が未定/未割当のときは no-op。
  const { toggleTeacherNg } = teacherActions;
  const handleSetNg = useCallback((dateId, periodId, classId) => {
    const k = makeKey(dateId, periodId, classId);
    const curr = currentSchedule[k] || {};
    if (!curr.teacher || curr.teacher === '未定') return;
    const teacherIdx = project.teachers.findIndex(t => t.name === curr.teacher);
    if (teacherIdx < 0) return;
    const dateEnt = currentConfig.dates.find(d => d.id === dateId);
    const periodEnt = currentConfig.periods.find(p => p.id === periodId);
    if (!dateEnt || !periodEnt) return;
    toggleTeacherNg(teacherIdx, dateEnt.label, periodEnt.label);
  }, [currentSchedule, project.teachers, currentConfig.dates, currentConfig.periods, toggleTeacherNg]);

  // setProject 互換 (switchTab 以外で project 全体を差し替える稀なケース用)。
  // 履歴に積まない project/setActive を直接呼ぶ。
  const setProject = useCallback((newProject) => {
    dispatch({ type: 'project/setActive', payload: newProject });
  }, [dispatch]);

  // pushHistory 互換: 旧 API を保つために残す。新規コードは dispatch を使うこと。
  const pushHistory = useCallback((newProject) => {
    dispatch({ type: 'project/replace', payload: { project: newProject } });
  }, [dispatch]);

  // --- タブ管理 ---
  const handleAddTab = useCallback((name) => {
    dispatch({ type: 'tab/add', payload: { name } });
  }, [dispatch]);

  const handleDeleteTab = useCallback((id) => {
    dispatch({ type: 'tab/delete', payload: { id } });
  }, [dispatch]);

  const handleRenameTab = useCallback((id, newName) => {
    dispatch({ type: 'tab/rename', payload: { id, name: newName } });
  }, [dispatch]);

  const switchTab = useCallback((id) => {
    dispatch({ type: 'tab/switch', payload: { id } });
  }, [dispatch]);

  // --- タブ別 config (dates/periods/classes/subjectCounts) ---
  const handleListConfigChange = useCallback((key, value) => {
    dispatch({ type: 'config/setList', payload: { key, value } });
  }, [dispatch]);

  const handleSubjectCountChange = useCallback((subject, value) => {
    dispatch({ type: 'config/setSubjectCount', payload: { subject, value } });
  }, [dispatch]);

  // --- メタデータ ---
  const updateProjectName = useCallback((name) => {
    dispatch({ type: 'project/updateName', payload: { name } });
  }, [dispatch]);

  // --- 自動生成パラメータ (E2e) ---
  // { numPatterns?, maxDailyHours?, maxIterations? } の部分更新。
  const updateGenerationParams = useCallback((updates) => {
    dispatch({ type: 'project/setGenerationParams', payload: updates });
  }, [dispatch]);

  // --- スナップショット (E1c) ---
  // createdAt は表示用なので副作用 (時刻取得) は reducer の外で行い、純粋性を保つ。
  const saveSnapshot = useCallback((name) => {
    dispatch({ type: 'snapshot/save', payload: { name, createdAt: new Date().toISOString() } });
  }, [dispatch]);

  const applySnapshot = useCallback((id) => {
    dispatch({ type: 'snapshot/apply', payload: { id } });
  }, [dispatch]);

  const renameSnapshot = useCallback((id, name) => {
    dispatch({ type: 'snapshot/rename', payload: { id, name } });
  }, [dispatch]);

  const removeSnapshot = useCallback((id) => {
    dispatch({ type: 'snapshot/remove', payload: { id } });
  }, [dispatch]);

  // --- テンプレート適用 (E2d) ---
  // payload (保存済みプロジェクト) を migrate + cleanSchedule してから
  // project 全体を差し替える (Undo 可能)。JSON 読込と同じ apply 経路。
  const applyTemplateFull = useCallback((payload) => {
    if (!payload) return;
    const migrated = migrateProject(payload);
    dispatch({ type: 'project/replace', payload: { project: cleanSchedule(migrated) } });
  }, [dispatch]);

  // --- 合同グループ管理 ---
  const addCombinedGroup = useCallback((group) => {
    dispatch({ type: 'combinedGroup/add', payload: { group } });
  }, [dispatch]);

  const updateCombinedGroup = useCallback((id, updates) => {
    dispatch({ type: 'combinedGroup/update', payload: { id, updates } });
  }, [dispatch]);

  const removeCombinedGroup = useCallback((id) => {
    dispatch({ type: 'combinedGroup/remove', payload: { id } });
  }, [dispatch]);

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
    dispatch,
    pushHistory,
    undo,
    redo,
    loadError,
    // タブ管理
    handleAddTab,
    handleDeleteTab,
    handleRenameTab,
    switchTab,
    // タブ別 config
    handleListConfigChange,
    handleSubjectCountChange,
    // 科目マスタ (useSubjectActions)
    ...subjectActions,
    // 講師 (useTeacherActions)
    ...teacherActions,
    // スケジュール (useScheduleActions)
    ...scheduleActions,
    // handleSetNg は scheduleActions に含めず composer で teacher/toggleNg
    // のラッパとして提供 (D4g)。
    handleSetNg,
    // 保存/読込 (useJsonIO)
    handleSaveAsDefault,
    handleResetAll,
    handleLoadJson,
    handleSaveJson,
    // メタデータ
    updateProjectName,
    // 自動生成パラメータ
    updateGenerationParams,
    // スナップショット
    saveSnapshot,
    applySnapshot,
    renameSnapshot,
    removeSnapshot,
    // テンプレート (E2d)
    applyTemplateFull,
    // 合同グループ
    addCombinedGroup,
    updateCombinedGroup,
    removeCombinedGroup,
  };
}
