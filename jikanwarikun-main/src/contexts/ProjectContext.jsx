import React from 'react';
import { useProject } from '../hooks/useProject';
import { useAnalysis } from '../hooks/useAnalysis';
import { ProjectContext } from './projectContextValue';

export function ProjectProvider({ children }) {
  const projectState = useProject();
  const { analysis, dashboard } = useAnalysis(
    projectState.project,
    projectState.currentSchedule,
    projectState.currentConfig
  );

  const value = {
    ...projectState,
    analysis,
    dashboard,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}
