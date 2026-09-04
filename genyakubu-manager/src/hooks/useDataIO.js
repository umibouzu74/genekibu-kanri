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
  migrateDaySchedules,
  migrateDisplayCutoff,
  migrateExamPeriods,
  migrateExamPrepSchedules,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSpecialEvents,
  migrateSubs,
} from "../utils/migrate";
import { detectOrphans, describeOrphanDetection } from "../utils/orphanCleanup";
import { sanitizeKanaMap } from "../utils/teacherKana";

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
  teacherKana,
  specialEvents,
  extraLessons,
  daySchedules,
  activeTimetableId,
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
  saveTeacherKana,
  saveSpecialEvents,
  saveExtraLessons,
  saveDaySchedules,
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
          teacherKana,
          specialEvents,
          extraLessons,
          daySchedules,
          // インポート先で timetables に対する選択が宙吊りにならないよう
          // アクティブな時間割 ID も持ち出す
          activeTimetableId,
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
  }, [slots, holidays, biweeklyBase, biweeklyAnchors, adjustments, subs, partTimeStaff, subjectCategories, subjects, timetables, displayCutoff, examPeriods, examPrepSchedules, classSets, sessionOverrides, teacherSubjects, teacherKana, specialEvents, extraLessons, daySchedules, activeTimetableId, toasts]);

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
          // 参照先の無いレコード (古いバックアップの孤立データ) は拒否せず
          // 取り込み、件数を案内する。掃除は下の detectOrphans → 同じ画面の
          // 「孤立データ掃除」で (2026-09-04: 以前は丸ごと拒否していて、
          // 反映で孤立が残ったバックアップが復元できなかった)
          if (result.warnings?.length) {
            console.warn("[import] referential warnings:", result.warnings);
          }
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
          // migrate を通す (cohorts 等の後付けフィールド補完)。他リソースは
          // import 時に migrate 済みなのに displayCutoff だけ素通しだった
          if (d.displayCutoff && d.displayCutoff.groups)
            saveDisplayCutoff(migrateDisplayCutoff(d.displayCutoff));
          if (Array.isArray(d.examPeriods)) saveExamPeriods(migrateExamPeriods(d.examPeriods));
          if (Array.isArray(d.examPrepSchedules) && saveExamPrepSchedules)
            saveExamPrepSchedules(migrateExamPrepSchedules(d.examPrepSchedules));
          if (Array.isArray(d.classSets)) saveClassSets(d.classSets);
          if (Array.isArray(d.sessionOverrides)) saveSessionOverrides(d.sessionOverrides);
          if (Array.isArray(d.specialEvents) && saveSpecialEvents) {
            saveSpecialEvents(migrateSpecialEvents(d.specialEvents));
          }
          if (Array.isArray(d.extraLessons) && saveExtraLessons) {
            saveExtraLessons(d.extraLessons);
          }
          if (Array.isArray(d.daySchedules) && saveDaySchedules) {
            saveDaySchedules(migrateDaySchedules(d.daySchedules));
          }
          if (d.teacherSubjects && typeof d.teacherSubjects === "object" && !Array.isArray(d.teacherSubjects)) {
            saveTeacherSubjects(d.teacherSubjects);
          }
          // 旧バックアップには teacherKana が無い (よみ機能より前) ので、
          // 欠けているときは現状維持 — 空 map で上書きしない
          if (d.teacherKana && typeof d.teacherKana === "object" && !Array.isArray(d.teacherKana) && saveTeacherKana) {
            saveTeacherKana(sanitizeKanaMap(d.teacherKana));
          }
          // 取り込んだ timetables に存在する ID のときだけ復元する
          // (無い/不正なら現状維持 — 旧バックアップには含まれない)
          if (
            setActiveTimetableId &&
            typeof d.activeTimetableId === "number" &&
            Array.isArray(d.timetables) &&
            d.timetables.some((t) => t?.id === d.activeTimetableId)
          ) {
            setActiveTimetableId(d.activeTimetableId);
          }
          toasts.success("データをインポートしました");

          // 古いバックアップには cascade 削除前の孤立データが含まれることが
          // ある。導入直後にユーザが気付けるよう件数を案内 (削除は強制しない)。
          // 検出件数 > 0 なら「孤立データ掃除」ボタンが同モーダル内にあるので
          // モーダルは閉じずに残す。0 件ならスムーズに閉じる。
          const orphanCounts = detectOrphans({
            slots: Array.isArray(d.slots) ? d.slots : [],
            subs: Array.isArray(d.substitutions) ? d.substitutions : [],
            adjustments: Array.isArray(d.adjustments) ? d.adjustments : [],
            sessionOverrides: Array.isArray(d.sessionOverrides)
              ? d.sessionOverrides
              : [],
            classSets: Array.isArray(d.classSets) ? d.classSets : [],
          });
          if (orphanCounts.total > 0) {
            toasts.info(
              `参照先が消えた孤立データを ${orphanCounts.total} 件検出しました (${describeOrphanDetection(orphanCounts)})。同じ画面の「孤立データ掃除」で整理できます。`,
              { duration: 10000 }
            );
          } else if (result.warnings?.length) {
            // detectOrphans が見ないもの (subjects の categoryId 等)
            toasts.info(
              `参照先の無いデータが ${result.warnings.length} 件あります: ${result.warnings[0]}`,
              { duration: 10000 }
            );
          } else {
            setShowDataMgr(false);
          }
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
      saveTeacherKana,
      saveSpecialEvents,
      saveExtraLessons,
      saveDaySchedules,
      setActiveTimetableId,
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
    if (saveExtraLessons) saveExtraLessons([]);
    if (saveDaySchedules) saveDaySchedules([]);
    // localStorage キーの removeItem だけでは React state と Firebase 側が
    // 残り、リロード / 他端末同期で復活してしまうので save で明示的に空にする
    // (export / import には含まれるのに reset だけ漏れていた)
    saveTeacherSubjects({});
    if (saveTeacherKana) saveTeacherKana({});
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
    saveTeacherSubjects,
    saveTeacherKana,
    saveSpecialEvents,
    saveExtraLessons,
    saveDaySchedules,
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
  migrateDaySchedules,
  migrateDisplayCutoff,
  migrateExamPeriods,
  migrateExamPrepSchedules,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSpecialEvents,
  migrateSubs,
};
