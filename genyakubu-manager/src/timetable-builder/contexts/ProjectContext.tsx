import { useMemo } from 'react';
import { useProject } from '../hooks/useProject';
import { useAnalysis } from '../hooks/useAnalysis';
import { ProjectContext } from './projectContextValue';
import type { ReactNode } from 'react';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const projectState = useProject();
  const { analysis, dashboard } = useAnalysis(
    projectState.project,
    projectState.currentSchedule,
    projectState.currentConfig
  );

  // useContext consumer の再レンダーを抑えるため value object を memo 化する。
  // 注意: projectState 全体は useProject の戻り値で毎レンダー新規 object literal
  // になるので、それを deps に置くと memo は効かない。代わりに state-driving
  // な fields だけを deps にする:
  //   - projectState.project: project state 本体
  //   - projectState.saveStatus: project 変化なしで debounce 経由でも変わる独立 state
  //   - history / historyIndex / activeTab 等: project と相関するため省略可
  //   - callbacks (handleAssign 等): C2 以降 dispatch のみに依存し re-render で
  //     identity が変わらないため省略可
  // exhaustive-deps は projectState 全体を要求するが、その場合 memo が
  // 無効化されてしまうため意図的に抑制する。
  const value = useMemo(
    () => ({ ...projectState, analysis, dashboard }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectState.project, projectState.saveStatus, analysis, dashboard],
  );

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}
