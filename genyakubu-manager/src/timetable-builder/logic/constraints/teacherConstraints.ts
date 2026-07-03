import { makeNgKey, makeExternalKey } from '../../utils/scheduleKey';
import type { AutoNgEntries } from '../../utils/autoNg';
import type { Entity, Teacher } from '../../types';

// 講師がそのコマに割り当て可能かを判定する純粋関数群。
// autoGenerator の solver から呼び出される。各関数は単独でテスト可能で、
// 将来制約を追加する場合はここに新しい純粋関数を足す。

// 講師が指定の subject を担当できるか
export function canTeachSubject(teacher: Teacher, subject: string): boolean {
  return teacher.subjects?.includes(subject) ?? false;
}

// 講師が指定の (date, period) を NG にしているか。
// autoNgEntries は当該講師の自動NG Map<ngKey, {sessions:[]}> (任意)。
// 渡せば手動NG + 自動NG の OR を返す。
export function isNgSlot(
  teacher: Teacher,
  date: string,
  period: string,
  autoNgEntries: AutoNgEntries | null = null,
): boolean {
  const k = makeNgKey(date, period);
  if (teacher.ngSlots?.includes(k)) return true;
  if (autoNgEntries?.has(k)) return true;
  return false;
}

// 講師が指定の className を NG にしているか
export function isNgClass(teacher: Teacher, className: string): boolean {
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
}: {
  teacherName: string;
  date: string;
  tempDaily: Record<string, number>;
  maxDailyHours: number;
  exemptName?: string;
}): boolean {
  if (teacherName === exemptName) return false;
  const dayKey = makeExternalKey(date, teacherName);
  return (tempDaily[dayKey] || 0) + 1 > maxDailyHours;
}

// 講師にこのコマ (date, period) を足すと「連続コマ数」が上限を超えるか (E2c)。
// periodsOrder は config.periods (表示順の配列)。isOccupied(periodId) は
// 「その日のその時限に当該講師が既に割り当て済みか」を返すコールバック。
// maxConsecutive が 0 以下 / 未設定なら制約なし (false)。
export function wouldExceedConsecutive({
  periodsOrder,
  periodId,
  isOccupied,
  maxConsecutive,
}: {
  periodsOrder: Entity[];
  periodId: number;
  isOccupied: (periodId: number) => boolean;
  maxConsecutive: number;
}): boolean {
  if (!maxConsecutive || maxConsecutive <= 0) return false;
  const order = (periodsOrder || []).map(p => p.id);
  const placeIdx = order.indexOf(periodId);
  if (placeIdx < 0) return false;
  // 今置こうとしている placeIdx は埋まる前提。それ以外は isOccupied で判定。
  const occ = (i: number) => i === placeIdx || isOccupied(order[i]);
  let run = 1;
  for (let i = placeIdx - 1; i >= 0 && occ(i); i--) run++;
  for (let i = placeIdx + 1; i < order.length && occ(i); i++) run++;
  return run > maxConsecutive;
}

// 講師が候補として有効か (subject + NG slot + NG class + 合同先 NG class)。
// validT のフィルタリングを共通化したもの。
// secondaryClassNames は合同グループ secondary のクラス名配列 (なければ [])。
// autoNgEntries は当該講師の自動NG Map (任意)。
export function isTeacherCandidateFor({
  teacher,
  subject,
  date,
  period,
  className,
  secondaryClassNames = [],
  autoNgEntries = null,
}: {
  teacher: Teacher;
  subject: string;
  date: string;
  period: string;
  className: string;
  secondaryClassNames?: string[];
  autoNgEntries?: AutoNgEntries | null;
}): boolean {
  if (!canTeachSubject(teacher, subject)) return false;
  if (isNgSlot(teacher, date, period, autoNgEntries)) return false;
  if (isNgClass(teacher, className)) return false;
  for (const sc of secondaryClassNames) {
    if (isNgClass(teacher, sc)) return false;
  }
  return true;
}
