import { createContext, useContext } from 'react';

export const ProjectContext = createContext(null);

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider');
  return ctx;
}
