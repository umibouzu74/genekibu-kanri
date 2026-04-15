// ─── localStorage keys ──────────────────────────────────────────────
// Single source of truth for all localStorage key strings used by the
// application.  Shared between App (read/write) and ErrorBoundary
// (clear-all on fatal error).

export const LS = {
  slots: "genyakubu-slots",
  holidays: "genyakubu-holidays",
  subs: "genyakubu-substitutions",
  partTime: "genyakubu-part-time-staff",
  subjectCategories: "genyakubu-subject-categories",
  subjects: "genyakubu-subjects",
  biweeklyBase: "genyakubu-biweekly-base",
  biweeklyAnchors: "genyakubu-biweekly-anchors",
  adjustments: "genyakubu-adjustments",
  timetables: "genyakubu-timetables",
  displayCutoff: "genyakubu-display-cutoff",
  activeTimetableId: "genyakubu-active-timetable",
  examPeriods: "genyakubu-exam-periods",
  teacherSubjects: "genyakubu-teacher-subjects",
  classSets: "genyakubu-class-sets",
};
