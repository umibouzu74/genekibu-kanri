// 教科ごとに講師をグループ化する純粋関数。
// builder の全コンポーネント (NgSettings / ExternalCounts / TeacherManager /
// ScheduleCell / SummaryPanel) で共有して使う。
//
// 入力:
//   teachers: Array<{ name, subjects: string[], ... }>
//   subjectOrder: string[]  表示順序の基準 (通常 project.subjects)
//
// 戻り値: Array<{ label, teachers }>
//   - 単一教科担当: 当該教科グループに分類
//   - 複数教科担当: 「複数教科」グループに分類 (重複表示しない)
//   - 担当無し: 「その他」グループに分類
//   - subjectOrder で指定した順 → それ以外の教科 → 複数教科 → その他 の順
//   - 空のグループは省く
//   - teachers の順序は入力配列の元の順 (= 安定ソート)
export const MULTI_SUBJECT_GROUP_LABEL = '複数教科';
export const OTHER_GROUP_LABEL = 'その他';

export function groupTeachersBySubject(teachers, subjectOrder) {
  const order = Array.isArray(subjectOrder) ? subjectOrder : [];
  const bySubject = new Map();
  const multi = [];
  const none = [];

  for (const t of teachers || []) {
    const subjects = (t?.subjects || []).filter(Boolean);
    if (subjects.length === 0) {
      none.push(t);
    } else if (subjects.length === 1) {
      const s = subjects[0];
      if (!bySubject.has(s)) bySubject.set(s, []);
      bySubject.get(s).push(t);
    } else {
      multi.push(t);
    }
  }

  const groups = [];
  // 順序: subjectOrder の指定順 → それ以外の教科 → 複数教科 → その他
  for (const s of order) {
    const arr = bySubject.get(s);
    if (arr && arr.length) groups.push({ label: s, teachers: arr });
  }
  for (const [s, arr] of bySubject) {
    if (!order.includes(s) && arr.length) groups.push({ label: s, teachers: arr });
  }
  if (multi.length) groups.push({ label: MULTI_SUBJECT_GROUP_LABEL, teachers: multi });
  if (none.length) groups.push({ label: OTHER_GROUP_LABEL, teachers: none });
  return groups;
}
