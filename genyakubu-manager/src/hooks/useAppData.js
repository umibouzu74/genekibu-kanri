import { useCallback, useEffect, useRef } from "react";
import {
  INIT_HOLIDAYS,
  INIT_PART_TIME_STAFF,
  INIT_SLOTS,
  INIT_SUBJECTS,
  INIT_SUBJECT_CATEGORIES,
} from "../data";
import { useSyncedStorage, useSyncedStorageRaw } from "./useSyncedStorage";
import { useLocalStorage } from "./useLocalStorage";
import {
  migrateDaySchedules,
  migrateDisplayCutoff,
  migrateExamPeriods,
  migrateExamPrepSchedules,
  migrateHolidays,
  migratePartTimeStaff,
  migrateSpecialEvents,
  migrateSubs,
} from "./useDataIO";
import { DEFAULT_TIMETABLE, DEFAULT_DISPLAY_CUTOFF } from "../utils/schema";
import { DEFAULT_EVENT_VISIBILITY } from "../components/EventVisibilityToggles";
import { sanitizeKanaMap } from "../utils/teacherKana";
import { LS } from "../constants/storageKeys";

// ─── 本体の永続 state をまとめて持つフック ────────────────────────
// App.jsx にあった 20 本の useSyncedStorage (+ 端末限定の eventVisibility) と
// 保存エラーの通知をここへ移した (2026-09-04)。宣言の中身・キー・migrate は
// 移動前と同じ。App は返り値を分割代入して使う。
//
// 新しい永続 state を足すときはここに宣言を足し、return にも並べる。
// 同期するキーは database.rules.json にも足すこと (列挙制)。
export function useAppData({ toasts, isAdmin }) {
  // Flags to avoid spamming the same toast on every subsequent save.
  const syncAuthNotifiedRef = useRef(false);
  // 権限以外のクラウド書込失敗 / 端末保存失敗も同じく 1 回だけ知らせる
  // (ネットワーク断で連続失敗すると toast が積み上がる)。成功が戻る経路は
  // 無いので 30 秒で再通知できるようにしておく
  const syncFailNotifiedAtRef = useRef(0);

  const onStorageError = useCallback(
    (err, phase) => {
      if (phase === "quota") {
        toasts.error(
          "保存領域の上限に達しました。データ管理からエクスポートして古いデータを整理してください。"
        );
      } else if (phase === "load") {
        toasts.error(
          `保存データの読み込みに失敗しました: ${err?.message || err}`
        );
      } else if (phase === "sync-auth") {
        if (!syncAuthNotifiedRef.current) {
          syncAuthNotifiedRef.current = true;
          toasts.error(
            "クラウドへの書込が拒否されました。管理者ログインが必要です（端末にはローカル保存されています）。"
          );
        }
      } else if (phase === "sync" || phase === "save") {
        // 以前はフッタの同期ドットが赤くなるだけで、気付けなかった
        const now = Date.now();
        if (now - syncFailNotifiedAtRef.current < 30000) return;
        syncFailNotifiedAtRef.current = now;
        toasts.error(
          phase === "sync"
            ? "クラウドへの保存に失敗しました（端末には保存済み。接続が戻れば自動で再送されます）"
            : `端末への保存に失敗しました: ${err?.message || err}`
        );
      }
    },
    [toasts]
  );

  useEffect(() => {
    if (isAdmin) syncAuthNotifiedRef.current = false;
  }, [isAdmin]);

  // ─── Persisted state (synced with Firebase when configured) ───────
  const [slots, saveSlots] = useSyncedStorage(LS.slots, INIT_SLOTS, {
    onError: onStorageError,
  });
  const [holidays, saveHolidays] = useSyncedStorage(LS.holidays, INIT_HOLIDAYS, {
    migrate: migrateHolidays,
    onError: onStorageError,
  });
  const [subs, saveSubs] = useSyncedStorage(LS.subs, [], {
    migrate: migrateSubs,
    onError: onStorageError,
  });
  const [partTimeStaff, savePartTimeStaff] = useSyncedStorage(
    LS.partTime,
    INIT_PART_TIME_STAFF,
    { migrate: migratePartTimeStaff, onError: onStorageError }
  );
  const [subjectCategories, saveSubjectCategories] = useSyncedStorage(
    LS.subjectCategories,
    INIT_SUBJECT_CATEGORIES,
    { onError: onStorageError }
  );
  const [subjects, saveSubjects] = useSyncedStorage(LS.subjects, INIT_SUBJECTS, {
    onError: onStorageError,
  });
  const [biweeklyBase, saveBiweeklyBase] = useSyncedStorageRaw(LS.biweeklyBase, "", {
    onError: onStorageError,
  });
  const [biweeklyAnchors, saveBiweeklyAnchors] = useSyncedStorage(
    LS.biweeklyAnchors,
    [],
    { onError: onStorageError }
  );
  const [adjustments, saveAdjustments] = useSyncedStorage(
    LS.adjustments,
    [],
    { onError: onStorageError }
  );
  const [timetables, saveTimetables] = useSyncedStorage(
    LS.timetables,
    [DEFAULT_TIMETABLE],
    { onError: onStorageError }
  );
  const [displayCutoff, saveDisplayCutoff] = useSyncedStorage(
    LS.displayCutoff,
    DEFAULT_DISPLAY_CUTOFF,
    { migrate: migrateDisplayCutoff, onError: onStorageError }
  );
  const [examPeriods, saveExamPeriods] = useSyncedStorage(
    LS.examPeriods,
    [],
    { migrate: migrateExamPeriods, onError: onStorageError }
  );
  const [examPrepSchedules, saveExamPrepSchedules] = useSyncedStorage(
    LS.examPrepSchedules,
    [],
    { migrate: migrateExamPrepSchedules, onError: onStorageError }
  );
  const [classSets, saveClassSets] = useSyncedStorage(
    LS.classSets,
    [],
    { onError: onStorageError }
  );
  const [sessionOverrides, saveSessionOverrides] = useSyncedStorage(
    LS.sessionOverrides,
    [],
    { onError: onStorageError }
  );
  const [teacherSubjects, saveTeacherSubjects] = useSyncedStorage(
    LS.teacherSubjects,
    {},
    { onError: onStorageError }
  );
  const [teacherKana, saveTeacherKana] = useSyncedStorage(
    LS.teacherKana,
    {},
    { migrate: sanitizeKanaMap, onError: onStorageError }
  );
  const [specialEvents, saveSpecialEvents] = useSyncedStorage(
    LS.specialEvents,
    [],
    { migrate: migrateSpecialEvents, onError: onStorageError }
  );
  const [extraLessons, saveExtraLessons] = useSyncedStorage(
    LS.extraLessons,
    [],
    { onError: onStorageError }
  );
  const [daySchedules, saveDaySchedules] = useSyncedStorage(
    LS.daySchedules,
    [],
    { migrate: migrateDaySchedules, onError: onStorageError }
  );
  // 表示トグルは「人 (端末) 単位の見え方」が望ましいので、Firebase 同期せず
  // localStorage 限定にする (高校部担当 / 担当外で初期表示が違うのを許容)。
  const [eventVisibility, saveEventVisibility] = useLocalStorage(
    LS.eventVisibility,
    DEFAULT_EVENT_VISIBILITY,
    { onError: onStorageError }
  );

  return {
    onStorageError,
    slots,
    saveSlots,
    holidays,
    saveHolidays,
    subs,
    saveSubs,
    partTimeStaff,
    savePartTimeStaff,
    subjectCategories,
    saveSubjectCategories,
    subjects,
    saveSubjects,
    biweeklyBase,
    saveBiweeklyBase,
    biweeklyAnchors,
    saveBiweeklyAnchors,
    adjustments,
    saveAdjustments,
    timetables,
    saveTimetables,
    displayCutoff,
    saveDisplayCutoff,
    examPeriods,
    saveExamPeriods,
    examPrepSchedules,
    saveExamPrepSchedules,
    classSets,
    saveClassSets,
    sessionOverrides,
    saveSessionOverrides,
    teacherSubjects,
    saveTeacherSubjects,
    teacherKana,
    saveTeacherKana,
    specialEvents,
    saveSpecialEvents,
    extraLessons,
    saveExtraLessons,
    daySchedules,
    saveDaySchedules,
    eventVisibility,
    saveEventVisibility,
  };
}
