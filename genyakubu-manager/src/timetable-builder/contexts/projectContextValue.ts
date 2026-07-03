import { createContext, useContext } from 'react';
import type { useProject } from '../hooks/useProject';
import type { useAnalysis } from '../hooks/useAnalysis';

// Provider (ProjectContext.jsx) は useProject の戻り値 + useAnalysis の
// { analysis, dashboard } を value に詰める。型はその合成として導出する
// (手書きの interface だと useProject の公開 API 変更に追従できない)。
export type ProjectContextValue = ReturnType<typeof useProject> & ReturnType<typeof useAnalysis>;

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider');
  return ctx;
}
