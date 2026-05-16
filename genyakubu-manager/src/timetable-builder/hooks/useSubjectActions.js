import { useCallback } from 'react';

// 科目マスタに関するアクションをまとめたフック。useProject から抽出。
// 削除時の cascade は subjects / subjectCounts / schedule / teachers /
// subjectColors の 5 箇所に渡るので、ここで一括して扱う。
export function useSubjectActions({ project, pushHistory }) {
  const addSubject = useCallback((name) => {
    if (!name) return;
    const subjects = project.subjects || [];
    if (subjects.includes(name)) return;
    const newSubjects = [...subjects, name];
    const newTabs = project.tabs.map(tab => ({
      ...tab,
      config: {
        ...tab.config,
        subjectCounts: { ...tab.config.subjectCounts, [name]: tab.config.subjectCounts[name] || 0 },
      },
    }));
    pushHistory({ ...project, subjects: newSubjects, tabs: newTabs });
  }, [project, pushHistory]);

  const removeSubject = useCallback((name) => {
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
    pushHistory({
      ...project,
      subjects: newSubjects,
      tabs: newTabs,
      teachers: newTeachers,
      subjectColors: newColors,
    });
  }, [project, pushHistory]);

  const reorderSubjects = useCallback((fromIdx, toIdx) => {
    const subjects = [...(project.subjects || [])];
    const [moved] = subjects.splice(fromIdx, 1);
    subjects.splice(toIdx, 0, moved);
    pushHistory({ ...project, subjects });
  }, [project, pushHistory]);

  const updateSubjectColor = useCallback((subject, color) => {
    const newColors = { ...(project.subjectColors || {}), [subject]: color };
    pushHistory({ ...project, subjectColors: newColors });
  }, [project, pushHistory]);

  return {
    addSubject,
    removeSubject,
    reorderSubjects,
    updateSubjectColor,
  };
}
