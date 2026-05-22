import { makeNgKey, makeExternalKey } from '../../utils/scheduleKey';

// 講師がそのコマに割り当て可能かを判定する純粋関数群。
// autoGenerator の solver から呼び出される。各関数は単独でテスト可能で、
// 将来制約を追加する場合はここに新しい純粋関数を足す。

// 講師が指定の subject を担当できるか
export function canTeachSubject(teacher, subject) {
  return teacher.subjects?.includes(subject) ?? false;
}

// 講師が指定の (date, period) を NG にしているか。
// autoNgEntries は当該講師の自動NG Map<ngKey, {sessions:[]}> (任意)。
// 渡せば手動NG + 自動NG の OR を返す。
export function isNgSlot(teacher, date, period, autoNgEntries = null) {
  const k = makeNgKey(date, period);
  if (teacher.ngSlots?.includes(k)) return true;
  if (autoNgEntries?.has(k)) return true;
  return false;
}

// 講師が指定の className を NG にしているか
export function isNgClass(teacher, className) {
  return teacher.ngClasses?.includes(className) ?? false;
}

// 講師にこのコマを足すと 1日あたりのコマ数上限を超えるか。
// exemptName で指定した講師 (デフォルト "未定") は対象外。
// tempDaily は { "date-teacherName": count } の形 (合同を 1 とカウント済み)。
export function wouldExceedDailyLimit({
  teacherName,
  date,
  tempDaily,
  maxDailyHours,
  exemptName = '未定',
}) {
  if (teacherName === exemptName) return false;
  const dayKey = makeExternalKey(date, teacherName);
  return (tempDaily[dayKey] || 0) + 1 > maxDailyHours;
}

// 講師が候補として有効か (subject + NG slot + NG class + 合同先 NG class)。
// validT のフィルタリングを共通化したもの。
// secondaryClassNames は合同グループ secondary のクラス名配列 (なければ [])。
// autoNgEntries は当該講師の自動NG Map (任意)。
export function isTeacherCandidateFor({ teacher, subject, date, period, className, secondaryClassNames = [], autoNgEntries = null }) {
  if (!canTeachSubject(teacher, subject)) return false;
  if (isNgSlot(teacher, date, period, autoNgEntries)) return false;
  if (isNgClass(teacher, className)) return false;
  for (const sc of secondaryClassNames) {
    if (isNgClass(teacher, sc)) return false;
  }
  return true;
}
