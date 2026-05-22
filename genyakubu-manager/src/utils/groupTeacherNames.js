import { compareJa } from "./sortJa";
import { getSlotTeachers } from "./biweekly";

// 任意の講師名リストを教科ごとにグループ化する純粋関数。
// useTeacherGroups (App-level hook) のコアロジックを切り出し、Sidebar 以外の
// コンポーネント (代行リスト / 休講ドロップダウン等) でもサブセットに対して
// 同じ分類ルールを使えるようにする。
//
// 教科推定ルール (useTeacherGroups と同じ):
//   1. partTimeStaff に名前があれば「バイト」グループ
//   2. それ以外は slots[].subj を subjects (name + aliases) と照合し、最多担当
//      教科を primary として振り分け
//   3. どれも該当しなければ「その他」
//
// 入力:
//   names: string[]        グループ化したい講師名 (重複除去/sort はこの関数が行う)
//   ctx.slots:    Slot[]    (subj/teacher 推定用)
//   ctx.partTimeStaff: PartTimeStaffObject[]
//   ctx.subjects: Subject[]
//
// 戻り値: Array<{ key, label, teachers }>
//   表示順: バイト → 英数国理社 → それ以外の教科 → その他
//   空グループは省く
export const STAFF_GROUP_KEY = "__staff__";
export const OTHER_GROUP_KEY = "__other__";
export const STAFF_GROUP_LABEL = "バイト";
export const OTHER_GROUP_LABEL = "その他";
const SUBJECT_ORDER = ["英語", "数学", "国語", "理科", "社会"];

// 教員名 → primary 教科 (name | null) の Map を構築する純粋関数。
// 「バイト」判定は別途 partTimeStaff 名簿で行う (この関数は subject のみ)。
export function buildTeacherPrimarySubjectMap(slots, subjects) {
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

  const counts = new Map(); // teacher → Map<subjectName, count>
  for (const slot of slots) {
    if (!slot.teacher) continue;
    const matched = matchSubject(slot.subj);
    if (!matched) continue;
    for (const t of getSlotTeachers(slot)) {
      if (!counts.has(t)) counts.set(t, new Map());
      const m = counts.get(t);
      m.set(matched.name, (m.get(matched.name) || 0) + 1);
    }
  }

  const primary = new Map();
  for (const [name, m] of counts) {
    let best = 0;
    let p = null;
    for (const [sname, cnt] of m) {
      if (cnt > best) {
        best = cnt;
        p = sname;
      }
    }
    primary.set(name, p);
  }
  return primary;
}

// 「給与済み」「バイト」「教科別」「その他」に分類して返す。
// useTeacherGroups の戻り値と同形式 (key/label/teachers)。
export function groupTeacherNames(names, { slots, partTimeStaff, subjects }) {
  const staffNameSet = new Set((partTimeStaff || []).map((s) => s.name));
  const primary = buildTeacherPrimarySubjectMap(slots || [], subjects || []);

  const staffGroup = [];
  const bySubject = new Map();
  const other = [];

  const uniqueNames = Array.from(new Set(names || []));
  for (const t of uniqueNames) {
    if (!t) continue;
    if (staffNameSet.has(t)) {
      staffGroup.push(t);
      continue;
    }
    const p = primary.get(t);
    if (p) {
      if (!bySubject.has(p)) bySubject.set(p, []);
      bySubject.get(p).push(t);
    } else {
      other.push(t);
    }
  }

  staffGroup.sort(compareJa);
  for (const arr of bySubject.values()) arr.sort(compareJa);
  other.sort(compareJa);

  const groups = [];
  if (staffGroup.length) {
    groups.push({ key: STAFF_GROUP_KEY, label: STAFF_GROUP_LABEL, teachers: staffGroup });
  }
  for (const name of SUBJECT_ORDER) {
    const arr = bySubject.get(name);
    if (arr && arr.length) groups.push({ key: name, label: name, teachers: arr });
  }
  for (const [name, arr] of bySubject) {
    if (!SUBJECT_ORDER.includes(name) && arr.length) {
      groups.push({ key: name, label: name, teachers: arr });
    }
  }
  if (other.length) {
    groups.push({ key: OTHER_GROUP_KEY, label: OTHER_GROUP_LABEL, teachers: other });
  }
  return groups;
}
