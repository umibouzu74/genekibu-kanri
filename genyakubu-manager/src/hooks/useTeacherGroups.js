import { useMemo } from "react";
import { compareJa } from "../utils/sortJa";

// 教員をカテゴリ (バイト → 英数国理社 → その他) にグループ化する。
// バイトは partTimeStaff にいる名前をそのまま「バイト」グループに入れる。
// それ以外の教員は slots.subj を教科マスター (名前 / 別名) と照合し、
// 最も多く担当している教科を primary として振り分ける。
export function useTeacherGroups({ slots, partTimeStaff, subjects, search }) {
  return useMemo(() => {
    const staffNameSet = new Set(partTimeStaff.map((s) => s.name));

    // slot.subj 文字列から Subject を推定
    const matchSubject = (subjStr) => {
      if (!subjStr) return null;
      const exact = subjects.find((s) => s.name === subjStr);
      if (exact) return exact;
      const byName = subjects.find((s) => subjStr.includes(s.name));
      if (byName) return byName;
      const byAlias = subjects.find(
        (s) =>
          Array.isArray(s.aliases) &&
          s.aliases.some((a) => a && subjStr.includes(a))
      );
      return byAlias || null;
    };

    // 教員ごとの「教科名 → コマ数」集計
    const teacherSubjectCounts = new Map();
    for (const slot of slots) {
      if (!slot.teacher) continue;
      const matched = matchSubject(slot.subj);
      if (!matched) continue;
      if (!teacherSubjectCounts.has(slot.teacher)) {
        teacherSubjectCounts.set(slot.teacher, new Map());
      }
      const m = teacherSubjectCounts.get(slot.teacher);
      m.set(matched.name, (m.get(matched.name) || 0) + 1);
    }

    // 全教員を列挙 (slots + partTimeStaff)
    const allTeachers = new Set();
    for (const s of slots) if (s.teacher) allTeachers.add(s.teacher);
    for (const s of partTimeStaff) allTeachers.add(s.name);

    // バイト / 教科別 / その他 に仕分け
    const staffGroup = [];
    const bySubject = new Map();
    const other = [];
    for (const t of allTeachers) {
      if (staffNameSet.has(t)) {
        staffGroup.push(t);
        continue;
      }
      const counts = teacherSubjectCounts.get(t);
      let primary = null;
      let best = 0;
      if (counts) {
        for (const [name, cnt] of counts) {
          if (cnt > best) {
            best = cnt;
            primary = name;
          }
        }
      }
      if (primary) {
        if (!bySubject.has(primary)) bySubject.set(primary, []);
        bySubject.get(primary).push(t);
      } else {
        other.push(t);
      }
    }

    staffGroup.sort(compareJa);
    for (const arr of bySubject.values()) arr.sort(compareJa);
    other.sort(compareJa);

    // 表示順: バイト → 英数国理社 → それ以外の教科 → その他
    const SUBJECT_ORDER = ["英語", "数学", "国語", "理科", "社会"];
    const groups = [];
    if (staffGroup.length) {
      groups.push({ key: "__staff__", label: "バイト", teachers: staffGroup });
    }
    for (const name of SUBJECT_ORDER) {
      const arr = bySubject.get(name);
      if (arr && arr.length) {
        groups.push({ key: name, label: name, teachers: arr });
      }
    }
    for (const [name, arr] of bySubject) {
      if (!SUBJECT_ORDER.includes(name) && arr.length) {
        groups.push({ key: name, label: name, teachers: arr });
      }
    }
    if (other.length) {
      groups.push({ key: "__other__", label: "その他", teachers: other });
    }

    // 検索フィルタ
    if (search) {
      return groups
        .map((g) => ({
          ...g,
          teachers: g.teachers.filter((t) => t.includes(search)),
        }))
        .filter((g) => g.teachers.length > 0);
    }
    return groups;
  }, [slots, partTimeStaff, subjects, search]);
}
