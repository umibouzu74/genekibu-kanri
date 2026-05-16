import { useCallback } from 'react';
import { makeNgKey, makeExternalKey } from '../utils/scheduleKey';

// 講師管理に関するアクションをまとめたフック。
// useProject から抽出し、teacher 配列・schedule 内の teacher 名・externalCounts
// キーの cascade を一箇所で扱う。
export function useTeacherActions({ project, pushHistory }) {
  const addTeacher = useCallback((name) => {
    if (name) {
      pushHistory({
        ...project,
        teachers: [
          ...project.teachers,
          { name, subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
        ],
      });
    }
  }, [project, pushHistory]);

  const removeTeacher = useCallback((idx) => {
    const targetName = project.teachers[idx].name;
    const newTeachers = project.teachers.filter((_, i) => i !== idx);
    const newTabs = project.tabs.map(tab => {
      const newSch = { ...tab.schedule };
      Object.keys(newSch).forEach(k => {
        if (newSch[k].teacher === targetName) newSch[k] = { ...newSch[k], teacher: '' };
      });
      return { ...tab, schedule: newSch };
    });
    pushHistory({ ...project, teachers: newTeachers, tabs: newTabs });
  }, [project, pushHistory]);

  const renameTeacher = useCallback((idx, newName) => {
    if (!newName) return;
    const oldName = project.teachers[idx].name;
    if (oldName === newName) return;
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
    pushHistory({ ...project, teachers: newTeachers, tabs: newTabs, externalCounts: newExternal });
  }, [project, pushHistory]);

  const toggleTeacherSubject = useCallback((idx, subj) => {
    const newTeachers = [...project.teachers];
    const t = { ...newTeachers[idx] };
    if (t.subjects.includes(subj)) t.subjects = t.subjects.filter(s => s !== subj);
    else t.subjects = [...t.subjects, subj];
    newTeachers[idx] = t;
    pushHistory({ ...project, teachers: newTeachers });
  }, [project, pushHistory]);

  const toggleTeacherNg = useCallback((idx, date, period) => {
    const newTeachers = [...project.teachers];
    const t = { ...newTeachers[idx] };
    const k = makeNgKey(date, period);
    if (!t.ngSlots) t.ngSlots = [];
    if (t.ngSlots.includes(k)) t.ngSlots = t.ngSlots.filter(x => x !== k);
    else t.ngSlots = [...t.ngSlots, k];
    newTeachers[idx] = t;
    pushHistory({ ...project, teachers: newTeachers });
  }, [project, pushHistory]);

  const toggleTeacherClassPriority = useCallback((idx, className) => {
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
    pushHistory({ ...project, teachers: newTeachers });
  }, [project, pushHistory]);

  const handleExternalCountChange = useCallback((date, teacherName, v) => {
    const counts = {
      ...(project.externalCounts || {}),
      [makeExternalKey(date, teacherName)]: parseInt(v) || 0,
    };
    pushHistory({ ...project, externalCounts: counts });
  }, [project, pushHistory]);

  return {
    addTeacher,
    removeTeacher,
    renameTeacher,
    toggleTeacherSubject,
    toggleTeacherNg,
    toggleTeacherClassPriority,
    handleExternalCountChange,
  };
}
