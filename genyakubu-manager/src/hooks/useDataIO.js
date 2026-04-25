import { useCallback } from "react";
import { fmtDate, INIT_HOLIDAYS, INIT_PART_TIME_STAFF, INIT_SLOTS, INIT_SUBJECTS, INIT_SUBJECT_CATEGORIES } from "../data";
import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_TIMETABLE,
  DEFAULT_DISPLAY_CUTOFF,
  migrateExportBundle,
  validateExportBundle,
} from "../utils/schema";
import {
  migrateExamPeriods,
  migrateExamPrepSchedules,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSpecialEvents,
  migrateSubs,
} from "../utils/migrate";

// Export / Import / Reset のロジック。
export function useDataIO({
  slots,
  holidays,
  biweeklyBase,
  biweeklyAnchors,
  adjustments,
  subs,
  partTimeStaff,
  subjectCategories,
  subjects,
  timetables,
  displayCutoff,
  examPeriods,
  examPrepSchedules,
  classSets,
  sessionOverrides,
  teacherSubjects,
  specialEvents,
  saveSlots,
  saveHolidays,
  saveBiweeklyBase,
  saveBiweeklyAnchors,
  saveAdjustments,
  saveSubs,
  savePartTimeStaff,
  saveSubjectCategories,
  saveSubjects,
  saveTimetables,
  saveDisplayCutoff,
  saveExamPeriods,
  saveExamPrepSchedules,
  saveClassSets,
  saveSessionOverrides,
  saveTeacherSubjects,
  saveSpecialEvents,
  lsKeys,
  setImporting,
  setShowDataMgr,
  setSelected,
  setView,
  setActiveTimetableId,
  defaultView,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const handleExport = useCallback(() => {
    try {
      const data = JSON.stringify(
        {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          slots,
          holidays,
          biweeklyBase,
          biweeklyAnchors,
          adjustments,
          substitutions: subs,
          partTimeStaff,
          subjectCategories,
          subjects,
          timetables,
          displayCutoff,
          examPeriods,
          examPrepSchedules,
          classSets,
          sessionOverrides,
          teacherSubjects,
          specialEvents,
        },
        null,
        2
      );
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `genyakubu-backup-${fmtDate(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toasts.success("バックアップをダウンロードしました");
    } catch (err) {
      console.error(err);
      toasts.error("エクスポートに失敗しました");
    }
  }, [slots, holidays, biweeklyBase, biweeklyAnchors, adjustments, subs, partTimeStaff, subjectCategories, subjects, timetables, displayCutoff, examPeriods, examPrepSchedules, classSets, sessionOverrides, teacherSubjects, specialEvents, toasts]);

  const handleImport = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const MAX_IMPORT_SIZE = 10 * 1024 * 1024; // 10 MB
      if (file.size > MAX_IMPORT_SIZE) {
        toasts.error("ファイルサイズが大きすぎます（上限: 10MB）");
        e.target.value = "";
        return;
      }
      if (file.type && !file.type.includes("json") && !file.name.endsWith(".json")) {
        toasts.error("JSONファイルを選択してください");
        e.target.value = "";
        return;
      }

      const ok = await confirm({
        title: "データのインポート",
        message: `「${file.name}」を読み込みます。\n現在のデータは上書きされます。よろしいですか？`,
        okLabel: "読み込む",
        tone: "danger",
      });
      if (!ok) {
        e.target.value = "";
        return;
      }
      setImporting(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const raw = JSON.parse(ev.target.result);
          const migrated = migrateExportBundle(raw);
          const result = validateExportBundle(migrated);
          if (!result.ok) {
            console.error("[import] validation failed:", result);
            toasts.error(`インポートに失敗: ${result.error}`);
            return;
          }
          const d = result.data;
          if (Array.isArray(d.slots)) saveSlots(d.slots);
          if (Array.isArray(d.holidays)) saveHolidays(migrateHolidays(d.holidays));
          if (d.biweeklyBase) saveBiweeklyBase(d.biweeklyBase);
          if (Array.isArray(d.biweeklyAnchors)) saveBiweeklyAnchors(d.biweeklyAnchors);
          if (Array.isArray(d.adjustments)) saveAdjustments(d.adjustments);
          if (Array.isArray(d.substitutions)) saveSubs(migrateSubs(d.substitutions));
          if (Array.isArray(d.partTimeStaff))
            savePartTimeStaff(migratePartTimeStaff(d.partTimeStaff));
          if (Array.isArray(d.subjectCategories)) saveSubjectCategories(d.subjectCategories);
          if (Array.isArray(d.subjects)) saveSubjects(d.subjects);
          if (Array.isArray(d.timetables)) saveTimetables(d.timetables);
          if (d.displayCutoff && d.displayCutoff.groups) saveDisplayCutoff(d.displayCutoff);
          if (Array.isArray(d.examPeriods)) saveExamPeriods(migrateExamPeriods(d.examPeriods));
          if (Array.isArray(d.examPrepSchedules) && saveExamPrepSchedules)
            saveExamPrepSchedules(migrateExamPrepSchedules(d.examPrepSchedules));
          if (Array.isArray(d.classSets)) saveClassSets(d.classSets);
          if (Array.isArray(d.sessionOverrides)) saveSessionOverrides(d.sessionOverrides);
          if (Array.isArray(d.specialEvents) && saveSpecialEvents) {
            saveSpecialEvents(migrateSpecialEvents(d.specialEvents));
          }
          if (d.teacherSubjects && typeof d.teacherSubjects === "object" && !Array.isArray(d.teacherSubjects)) {
            saveTeacherSubjects(d.teacherSubjects);
          }
          setShowDataMgr(false);
          toasts.success("データをインポートしました");
        } catch (err) {
          console.error(err);
          toasts.error("JSONファイルの読み込みに失敗しました");
        } finally {
          setImporting(false);
        }
      };
      reader.onerror = () => {
        setImporting(false);
        toasts.error("ファイル読み込み中にエラーが発生しました");
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [
      confirm,
      toasts,
      saveSlots,
      saveHolidays,
      saveBiweeklyBase,
      saveBiweeklyAnchors,
      saveAdjustments,
      saveSubs,
      savePartTimeStaff,
      saveSubjectCategories,
      saveSubjects,
      saveTimetables,
      saveDisplayCutoff,
      saveExamPeriods,
      saveExamPrepSchedules,
      saveClassSets,
      saveSessionOverrides,
      saveTeacherSubjects,
      saveSpecialEvents,
      setImporting,
      setShowDataMgr,
    ]
  );

  const handleReset = useCallback(async () => {
    const ok = await confirm({
      title: "データの初期化",
      message: "データを初期状態に戻しますか？\n現在のデータは失われます。",
      okLabel: "初期化",
      tone: "danger",
    });
    if (!ok) return;
    Object.values(lsKeys).forEach((k) => localStorage.removeItem(k));
    saveSlots(INIT_SLOTS);
    saveHolidays(INIT_HOLIDAYS);
    saveBiweeklyBase("");
    saveBiweeklyAnchors([]);
    saveAdjustments([]);
    saveSubs([]);
    savePartTimeStaff(INIT_PART_TIME_STAFF);
    saveSubjectCategories(INIT_SUBJECT_CATEGORIES);
    saveSubjects(INIT_SUBJECTS);
    saveTimetables([DEFAULT_TIMETABLE]);
    saveDisplayCutoff(DEFAULT_DISPLAY_CUTOFF);
    saveExamPeriods([]);
    if (saveExamPrepSchedules) saveExamPrepSchedules([]);
    saveClassSets([]);
    saveSessionOverrides([]);
    if (saveSpecialEvents) saveSpecialEvents([]);
    if (setActiveTimetableId) setActiveTimetableId(1);
    setSelected(null);
    setView(defaultView);
    setShowDataMgr(false);
    toasts.success("データを初期化しました");
  }, [
    confirm,
    toasts,
    lsKeys,
    saveSlots,
    saveHolidays,
    saveBiweeklyBase,
    saveBiweeklyAnchors,
    saveAdjustments,
    saveSubs,
    savePartTimeStaff,
    saveSubjectCategories,
    saveSubjects,
    saveTimetables,
    saveDisplayCutoff,
    saveExamPeriods,
    saveExamPrepSchedules,
    saveClassSets,
    saveSessionOverrides,
    saveSpecialEvents,
    setActiveTimetableId,
    setSelected,
    setView,
    setShowDataMgr,
    defaultView,
  ]);

  return { handleExport, handleImport, handleReset, migrateHolidays, migratePartTimeStaff, migrateSubs };
}

// Re-export migrate functions for convenience
export {
  migrateExamPeriods,
  migrateExamPrepSchedules,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSpecialEvents,
  migrateSubs,
};
