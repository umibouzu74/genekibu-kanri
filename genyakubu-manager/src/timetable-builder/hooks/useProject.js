import { useCallback } from 'react';
import { useHistoryStack } from './useHistoryStack';
import { useJsonIO } from './useJsonIO';
import { useScheduleActions } from './useScheduleActions';
import { useSubjectActions } from './useSubjectActions';
import { useTeacherActions } from './useTeacherActions';

// 講習時間割プロジェクトの一元状態管理フック。
//
// 内訳:
//   - useHistoryStack:    project state + Undo/Redo + LocalStorage 自動保存
//   - useJsonIO:          JSON 保存/読込/デフォルト保存/全リセット
//   - useTeacherActions:  講師管理アクション + externalCounts
//   - useSubjectActions:  科目マスタ管理 + 科目カラー
//   - useScheduleActions: セル操作 (合同伝播は combinedPropagation 委譲) +
//                         applyPattern + 一括操作
//   - 本ファイル:         残りのアクション (タブ/設定/合同/メタ) と composer
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
  } = useJsonIO({ project, activeTab, pushHistory });

  const teacherActions = useTeacherActions({ project, pushHistory });
  const subjectActions = useSubjectActions({ project, pushHistory });
  const scheduleActions = useScheduleActions({
    project,
    pushHistory,
    currentConfig,
    currentSchedule,
    toggleTeacherNg: teacherActions.toggleTeacherNg,
  });

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

  // --- タブ別 config (dates/periods/classes/subjectCounts) ---
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

  // --- メタデータ ---
  const updateProjectName = useCallback((name) => {
    pushHistory({ ...project, name });
  }, [project, pushHistory]);

  // --- 合同グループ管理 ---
  const addCombinedGroup = useCallback((group) => {
    const groups = project.combinedGroups || [];
    const newId = groups.reduce((max, g) => Math.max(max, g.id), 0) + 1;
    pushHistory({ ...project, combinedGroups: [...groups, { ...group, id: newId }] });
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
