import { useMemo } from "react";
import { compareTeacherNames, teacherMatchesQuery } from "../utils/teacherKana";
import { getSlotTeachers } from "../utils/biweekly";
import {
  LEAVE_CATEGORY,
  PART_TIME_CATEGORY,
  RETIRED_CATEGORY,
  indexAffiliationChanges,
  resolveAffiliation,
} from "../utils/teacherAffiliations";

/** 講師の所属で分けたグループの key (現役部 常勤 / バイト以外の現役部 非常勤) */
export const GENYAKU_FULLTIME_GROUP_KEY = "__genyaku_fulltime__";
export const GENYAKU_PARTTIME_GROUP_KEY = "__genyaku_parttime__";

// 教員をカテゴリ (バイト → 英数国理社 → その他) にグループ化する。
// バイトは partTimeStaff にいる名前をそのまま「バイト」グループに入れる。
// それ以外の教員は slots.subj を教科マスター (名前 / 別名) と照合し、
// 最も多く担当している教科を primary として振り分ける。
//
// 講師の所属 (affiliations、utils/teacherAffiliations) を渡すと、year (年度) の
// 区分で「現役部 常勤」「現役部 非常勤」(バイト以外) のグループを先頭に作り、
// 教科別のグループは予備校部の人だけになる (section: "yobiko")。所属を誰も
// 分けていないときは従来どおり (機能を使わない人の見た目を変えない)。
// 現役部 常勤の人はコマが無くても並べる (有給・半休を月間で見るため)。
export function useTeacherGroups({
  slots,
  partTimeStaff,
  subjects,
  teacherKana,
  affiliations = null,
  year = null,
}) {
  return useMemo(
    () => buildTeacherGroups({ slots, partTimeStaff, subjects, teacherKana, affiliations, year }),
    [slots, partTimeStaff, subjects, teacherKana, affiliations, year]
  );
}

/** useTeacherGroups の中身 (純粋関数) */
export function buildTeacherGroups({
  slots,
  partTimeStaff,
  subjects,
  teacherKana,
  affiliations = null,
  year = null,
}) {
  const staffNameSet = new Set(partTimeStaff.map((s) => s.name));
  const affIndex =
    Array.isArray(affiliations) && affiliations.length > 0 && year != null
      ? indexAffiliationChanges(affiliations)
      : null;
  const rawCategoryOf = (t) =>
    affIndex ? resolveAffiliation(affIndex, t, year, staffNameSet).category : null;
  // 区分で分けた見た目にするのは、退職以外の区分を誰かに付けたときだけ
  // (退職を付けただけで、所属を使っていない人のサイドバーの見た目を変えない)
  const grouped = !!affIndex && affiliations.some((c) => c?.category !== RETIRED_CATEGORY);
  const categoryOf = (t) => (grouped ? rawCategoryOf(t) : null);

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
    for (const t of getSlotTeachers(slot)) {
      if (!teacherSubjectCounts.has(t)) {
        teacherSubjectCounts.set(t, new Map());
      }
      const m = teacherSubjectCounts.get(t);
      m.set(matched.name, (m.get(matched.name) || 0) + 1);
    }
  }

  // 全教員を列挙 (slots + partTimeStaff)
  const allTeachers = new Set();
  const slotTeachers = new Set();
  for (const s of slots) for (const t of getSlotTeachers(s)) slotTeachers.add(t);
  for (const t of slotTeachers) allTeachers.add(t);
  for (const s of partTimeStaff) allTeachers.add(s.name);
  // 現役部 常勤はコマが無くても並べる
  if (affIndex) {
    for (const t of affIndex.keys()) {
      if (categoryOf(t) === LEAVE_CATEGORY) allTeachers.add(t);
    }
  }

  // 現役部 常勤 / 現役部 非常勤 (バイト以外) / バイト / 教科別 / その他 に仕分け
  const genyakuFulltime = [];
  const genyakuParttime = [];
  const staffGroup = [];
  const bySubject = new Map();
  const other = [];
  for (const t of allTeachers) {
    const cat = categoryOf(t);
    // 退職・非表示の人は、時間割にコマが残っているときだけ (教科別に) 並べる
    const retired = rawCategoryOf(t) === RETIRED_CATEGORY;
    if (retired && !slotTeachers.has(t)) continue;
    if (cat === LEAVE_CATEGORY) {
      genyakuFulltime.push(t);
      continue;
    }
    if (staffNameSet.has(t) && !retired) {
      staffGroup.push(t);
      continue;
    }
    if (cat === PART_TIME_CATEGORY) {
      genyakuParttime.push(t);
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

  // グループ内はよみのあいうえお順 (漢字は読み順に並べられないため、
  // よみ未設定の講師はグループ内の末尾で従来どおりの文字列順)。
  const cmp = compareTeacherNames(teacherKana);
  genyakuFulltime.sort(cmp);
  genyakuParttime.sort(cmp);
  staffGroup.sort(cmp);
  for (const arr of bySubject.values()) arr.sort(cmp);
  other.sort(cmp);

  // 表示順: バイト → 英数国理社 → それ以外の教科 → その他
  const SUBJECT_ORDER = ["英語", "数学", "国語", "理科", "社会"];
  // section: 所属を分けているときだけ "genyaku" / "yobiko" (サイドバーが
  // 「予備校部」の見出しを挟む)。分けていなければ付けない
  const sec = (v) => (grouped ? { section: v } : {});
  const groups = [];
  if (genyakuFulltime.length) {
    groups.push({
      key: GENYAKU_FULLTIME_GROUP_KEY,
      label: "現役部 常勤",
      teachers: genyakuFulltime,
      ...sec("genyaku"),
    });
  }
  if (genyakuParttime.length) {
    groups.push({
      key: GENYAKU_PARTTIME_GROUP_KEY,
      label: "現役部 非常勤",
      teachers: genyakuParttime,
      ...sec("genyaku"),
    });
  }
  if (staffGroup.length) {
    groups.push({ key: "__staff__", label: "バイト", teachers: staffGroup, ...sec("genyaku") });
  }
  for (const name of SUBJECT_ORDER) {
    const arr = bySubject.get(name);
    if (arr && arr.length) {
      groups.push({ key: name, label: name, teachers: arr, ...sec("yobiko") });
    }
  }
  for (const [name, arr] of bySubject) {
    if (!SUBJECT_ORDER.includes(name) && arr.length) {
      groups.push({ key: name, label: name, teachers: arr, ...sec("yobiko") });
    }
  }
  if (other.length) {
    groups.push({ key: "__other__", label: "その他", teachers: other, ...sec("yobiko") });
  }

  // 検索で絞るのは表示側 (Sidebar) が filterTeacherGroups で行う。
  // ここで受けると検索の打鍵ごとに App が再描画される
  return groups;
}

/**
 * 検索文字列で講師グループを絞る純粋関数。空なら元の配列をそのまま返す。
 * 名前に加えて**よみ**でも当てる (「ほり」で 堀上。teacherMatchesQuery)
 */
export function filterTeacherGroups(groups, search, kanaMap) {
  if (!search) return groups;
  return groups
    .map((g) => ({
      ...g,
      teachers: g.teachers.filter((t) => teacherMatchesQuery(t, search, kanaMap)),
    }))
    .filter((g) => g.teachers.length > 0);
}
