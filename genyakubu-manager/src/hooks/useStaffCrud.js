import { useToasts } from "./useToasts";
import { useConfirm } from "./useConfirm";
import { nextNumericId } from "../utils/schema";

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
    const warnings = [];
    if (assignedSlots.length) {
      warnings.push(`※ ${assignedSlots.length} 件のコマで担当講師として登録されています`);
    }
    if (usedInSubs) {
      warnings.push("※ 過去の代行記録は削除されません");
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
    toasts.success(`「${name}」を削除しました`);
  };

  const toggleStaffSubject = (name, subjectId) => {
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
      message: "この教科を削除しますか？\n※バイトの担当教科設定からも除外されます。",
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
    toasts.success("教科を削除しました");
  };

  return {
    addStaff,
    delStaff,
    toggleStaffSubject,
    saveCategory,
    delCategory,
    saveSubject,
    delSubject,
  };
}
