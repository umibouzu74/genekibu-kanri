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
// subjectOrder 未指定時のフォールバック (builder の project.subjects が
// 渡されていれば groupTeacherNames はそちらの順を尊重する)
const DEFAULT_SUBJECT_ORDER = ["英語", "数学", "国語", "理科", "社会"];

// 教員名 → primary 教科 (name | null) の Map を構築する純粋関数。
// 「バイト」判定は別途 partTimeStaff 名簿で行う (この関数は subject のみ)。
export function buildTeacherPrimarySubjectMap(slots, subjects) {
  // substring matching は『長い名前優先』にしておくと、短い subject 名
  // ('A' など) が長い subject 名 ('A英語特訓' の中の '英語') を hijack する
  // のを防げる (code-review P4)。aliases も同じく長い順に並べ替えてから
  // 評価する。
  const byNameLongFirst = [...(subjects || [])].sort(
    (a, b) => (b?.name?.length || 0) - (a?.name?.length || 0),
  );
  const matchSubject = (subjStr) => {
    if (!subjStr) return null;
    const exact = subjects.find((s) => s.name === subjStr);
    if (exact) return exact;
    const byName = byNameLongFirst.find((s) => s?.name && subjStr.includes(s.name));
    if (byName) return byName;
    // alias も長い順に評価
    let bestAliasSubject = null;
    let bestAliasLen = 0;
    for (const s of subjects || []) {
      if (!Array.isArray(s.aliases)) continue;
      for (const a of s.aliases) {
        if (!a) continue;
        if (subjStr.includes(a) && a.length > bestAliasLen) {
          bestAliasSubject = s;
          bestAliasLen = a.length;
        }
      }
    }
    return bestAliasSubject;
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
// subjectOrder: 任意の string[]。指定があればその順で教科グループを並べ、
//   無指定なら DEFAULT_SUBJECT_ORDER (英→数→国→理→社) を使う。
//   builder で project.subjects を渡せば、ユーザのリオーダ操作が
//   本体側 (CompareView 等) の表示順にも反映される (code-review P3)。
export function groupTeacherNames(names, { slots, partTimeStaff, subjects, subjectOrder }) {
  const staffNameSet = new Set((partTimeStaff || []).map((s) => s.name));
  const primary = buildTeacherPrimarySubjectMap(slots || [], subjects || []);
  // subject 並び順の決定: 引数 subjectOrder > subjects[].name 配列 >
  // ハードコード DEFAULT_SUBJECT_ORDER。
  // 本体側の subjects は { id, name, ... } の object 配列なので name を抽出。
  const order = (Array.isArray(subjectOrder) && subjectOrder.length > 0)
    ? subjectOrder
    : (Array.isArray(subjects) && subjects.length > 0
        ? subjects.map(s => s?.name).filter(Boolean)
        : DEFAULT_SUBJECT_ORDER);

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
  for (const name of order) {
    const arr = bySubject.get(name);
    if (arr && arr.length) groups.push({ key: `subj:${name}`, label: name, teachers: arr });
  }
  for (const [name, arr] of bySubject) {
    if (!order.includes(name) && arr.length) {
      groups.push({ key: `subj:${name}`, label: name, teachers: arr });
    }
  }
  if (other.length) {
    groups.push({ key: OTHER_GROUP_KEY, label: OTHER_GROUP_LABEL, teachers: other });
  }
  return groups;
}
