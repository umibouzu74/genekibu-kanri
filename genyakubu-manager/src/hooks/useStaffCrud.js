import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
import { nextNumericId } from "../utils/schema";
import { removeStaffFromSchedules } from "../utils/examPrepHelpers";
import {
  kanaEntriesFromRegularBuilder,
  mergeTeacherKana,
  setTeacherKana,
} from "../utils/teacherKana";
import { LS } from "../constants/storageKeys";

// バイト・教科カテゴリ・教科の CRUD ロジック。
export function useStaffCrud({
  partTimeStaff,
  savePartTimeStaff,
  subs,
  slots,
  subjects,
  saveSubjects,
  subjectCategories,
  saveSubjectCategories,
  teacherSubjects,
  saveTeacherSubjects,
  teacherKana = {},
  saveTeacherKana,
  examPrepSchedules = [],
  saveExamPrepSchedules,
}) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const addStaff = (name) => {
    const n = name.trim();
    if (!n) return false;
    if (partTimeStaff.some((s) => s.name === n)) {
      toasts.error(`「${n}」は既に登録されています`);
      return false;
    }
    savePartTimeStaff([...partTimeStaff, { name: n, subjectIds: [] }]);
    toasts.success(`「${n}」を追加しました`);
    return true;
  };

  const delStaff = async (name) => {
    const usedInSubs = subs.some(
      (s) => s.originalTeacher === name || s.substitute === name
    );
    const assignedSlots = slots.filter((s) => s.teacher === name);
    const prepDayCount = (examPrepSchedules || []).reduce(
      (acc, sch) =>
        acc +
        (sch.days || []).filter(
          (d) => d.assignments && name in d.assignments
        ).length,
      0
    );
    const warnings = [];
    if (assignedSlots.length) {
      warnings.push(`※ ${assignedSlots.length} 件のコマで担当講師として登録されています`);
    }
    if (usedInSubs) {
      warnings.push("※ 過去の代行記録は削除されません");
    }
    if (prepDayCount > 0) {
      warnings.push(`※ ${prepDayCount} 日分の特訓シフト出勤が取り消されます`);
    }
    const extra = warnings.length ? "\n" + warnings.join("\n") : "";
    const ok = await confirm({
      title: "バイトの削除",
      message: `「${name}」をバイト一覧から削除しますか？${extra}`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    savePartTimeStaff(partTimeStaff.filter((s) => s.name !== name));
    if (prepDayCount > 0 && saveExamPrepSchedules) {
      saveExamPrepSchedules(removeStaffFromSchedules(examPrepSchedules, name));
    }
    toasts.success(`「${name}」を削除しました`);
  };

  const toggleStaffSubject = (name, subjectId) => {
    // バイトの場合は partTimeStaff を更新
    const isPT = partTimeStaff.some((s) => s.name === name);
    if (isPT) {
      savePartTimeStaff(
        partTimeStaff.map((s) => {
          if (s.name !== name) return s;
          const has = s.subjectIds.includes(subjectId);
          return {
            ...s,
            subjectIds: has
              ? s.subjectIds.filter((id) => id !== subjectId)
              : [...s.subjectIds, subjectId],
          };
        })
      );
    }
    // 全講師共通: teacherSubjects マップも更新
    const current = teacherSubjects[name] || [];
    const has = current.includes(subjectId);
    saveTeacherSubjects({
      ...teacherSubjects,
      [name]: has
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId],
    });
  };

  // よみ (かな) の設定。バイトにも常勤講師にも同じ map で付ける。
  // 空にすると未設定に戻る (setTeacherKana がキーごと消す)。
  const setStaffKana = (name, kana) => {
    if (!saveTeacherKana) return;
    saveTeacherKana(setTeacherKana(teacherKana, name, kana));
  };

  // 通常時間割作成の講師マスタに入っているよみを一括で取り込む。
  // **一度きりの入力補助**で常時同期ではない (正はそれぞれのマスタ)。
  // 既に入っているよみは上書きしない — 手入力を黙って書き換えないため。
  const importKanaFromRegularBuilder = () => {
    if (!saveTeacherKana) return;
    let workspace = null;
    try {
      const raw = localStorage.getItem(LS.regularBuilderProject);
      workspace = raw ? JSON.parse(raw) : null;
    } catch {
      workspace = null;
    }
    const entries = kanaEntriesFromRegularBuilder(workspace);
    if (entries.length === 0) {
      toasts.error("通常時間割作成の講師マスタによみが登録されていません");
      return;
    }
    const { map, added, skipped } = mergeTeacherKana(teacherKana, entries);
    if (added === 0) {
      toasts.success(`新しく取り込めるよみはありませんでした（${skipped} 件は設定済み）`);
      return;
    }
    saveTeacherKana(map);
    toasts.success(
      skipped > 0
        ? `よみを ${added} 件取り込みました（${skipped} 件は設定済みのため据え置き）`
        : `よみを ${added} 件取り込みました`
    );
  };

  const saveCategory = (cat) => {
    if (cat.id) {
      saveSubjectCategories(
        subjectCategories.map((c) => (c.id === cat.id ? { ...c, ...cat } : c))
      );
    } else {
      const id = nextNumericId(subjectCategories);
      saveSubjectCategories([...subjectCategories, { ...cat, id }]);
      toasts.success("カテゴリを追加しました");
    }
  };

  const delCategory = async (id) => {
    const childSubjects = subjects.filter((s) => s.categoryId === id);
    const extra = childSubjects.length
      ? `\n※このカテゴリ配下の ${childSubjects.length} 件の教科も削除されます。`
      : "";
    const ok = await confirm({
      title: "カテゴリの削除",
      message: `このカテゴリを削除しますか？${extra}`,
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    const removedSubjectIds = new Set(childSubjects.map((s) => s.id));
    saveSubjects(subjects.filter((s) => s.categoryId !== id));
    saveSubjectCategories(subjectCategories.filter((c) => c.id !== id));
    if (removedSubjectIds.size) {
      savePartTimeStaff(
        partTimeStaff.map((s) => ({
          ...s,
          subjectIds: s.subjectIds.filter((sid) => !removedSubjectIds.has(sid)),
        }))
      );
      const updated = {};
      for (const [k, v] of Object.entries(teacherSubjects)) {
        updated[k] = v.filter((sid) => !removedSubjectIds.has(sid));
      }
      saveTeacherSubjects(updated);
    }
    toasts.success("カテゴリを削除しました");
  };

  const saveSubject = (subj) => {
    if (subj.id) {
      saveSubjects(
        subjects.map((s) => (s.id === subj.id ? { ...s, ...subj } : s))
      );
    } else {
      const id = nextNumericId(subjects);
      saveSubjects([...subjects, { ...subj, id }]);
      toasts.success("教科を追加しました");
    }
  };

  const delSubject = async (id) => {
    const ok = await confirm({
      title: "教科の削除",
      message: "この教科を削除しますか？\n※全講師の担当教科設定からも除外されます。",
      okLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    saveSubjects(subjects.filter((s) => s.id !== id));
    savePartTimeStaff(
      partTimeStaff.map((s) => ({
        ...s,
        subjectIds: s.subjectIds.filter((sid) => sid !== id),
      }))
    );
    // teacherSubjects からも除外
    const updated = {};
    for (const [k, v] of Object.entries(teacherSubjects)) {
      updated[k] = v.filter((sid) => sid !== id);
    }
    saveTeacherSubjects(updated);
    toasts.success("教科を削除しました");
  };

  return {
    addStaff,
    delStaff,
    toggleStaffSubject,
    setStaffKana,
    importKanaFromRegularBuilder,
    saveCategory,
    delCategory,
    saveSubject,
    delSubject,
  };
}
