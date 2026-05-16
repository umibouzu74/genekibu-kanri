import { useCallback } from 'react';
import { useHistoryStack } from './useHistoryStack';
import { useJsonIO } from './useJsonIO';
import { useScheduleActions } from './useScheduleActions';
import { useSubjectActions } from './useSubjectActions';
import { useTeacherActions } from './useTeacherActions';

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
    // 保存/読込 (useJsonIO)
    handleSaveAsDefault,
    handleResetAll,
    handleLoadJson,
    handleSaveJson,
    // メタデータ
    updateProjectName,
    // 合同グループ
    addCombinedGroup,
    updateCombinedGroup,
    removeCombinedGroup,
  };
}
