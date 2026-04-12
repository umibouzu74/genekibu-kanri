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

// Migrate helpers (duplicated from App for encapsulation)
const migrateHolidays = (arr) =>
  Array.isArray(arr) ? arr.map((x) => ({ ...x, scope: x.scope || ["全部"] })) : arr;

const migratePartTimeStaff = (arr) =>
  Array.isArray(arr)
    ? arr.map((x) =>
        typeof x === "string"
          ? { name: x, subjectIds: [] }
          : { name: x?.name ?? "", subjectIds: Array.isArray(x?.subjectIds) ? x.subjectIds : [] }
      )
    : arr;

const migrateSubs = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => (s?.status === "completed" ? { ...s, status: "confirmed" } : s))
    : arr;

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
  }, [slots, holidays, biweeklyBase, biweeklyAnchors, adjustments, subs, partTimeStaff, subjectCategories, subjects, timetables, displayCutoff, toasts]);

  const handleImport = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
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
    setActiveTimetableId,
    setSelected,
    setView,
    setShowDataMgr,
    defaultView,
  ]);

  return { handleExport, handleImport, handleReset, migrateHolidays, migratePartTimeStaff, migrateSubs };
}

// Re-export migrate functions for useLocalStorage initial setup
export { migrateHolidays, migratePartTimeStaff, migrateSubs };
