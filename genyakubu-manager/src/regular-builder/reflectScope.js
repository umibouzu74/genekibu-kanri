// ─── 反映の対象範囲 (学年・曜日を選んだ部分反映) ─────────────────────
//
// 「土曜だけ組み直した」「中3 だけ差し替えたい」ときに、プロジェクト全体を
// 反映せずに済ませるための絞り込み。範囲は **学年 (タブの grade) × 曜日**
// の AND で、どちらも空 = 絞らない (従来どおりプロジェクト全体)。
//
// **置き換えモードでは、下書きを絞るだけでは足りない。** 反映は
// 「下書きに無い既存コマは削除」という突き合わせ (matchReflection) なので、
// 下書きだけ絞ると**範囲外の既存コマが丸ごと削除に分類されて消える**。
// 既存コマ側も同じ範囲で絞り、範囲外は突き合わせに掛けずそのまま残す
// (applyReflection / diffReflection がこのモジュールの述語を共有する)。
//
// 範囲の判定は **slot / draft の {day, grade} だけ**を見る。下書きのセル
// 参照 (tabId 等) に依存させないのは、既存コマ側にも同じ述語を適用する
// 必要があるため — 本体のコマは下書きのタブを知らない。

import { REGULAR_DAYS } from "./model";

/**
 * @typedef {{days?: string[], grades?: string[]}} ReflectScope
 *   空配列 / 未指定 = その軸では絞らない
 */

/** 空でない配列にして返す (undefined / 非配列 / 空文字を落とす) */
function cleanList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list) {
    const s = String(x ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * 絞り込みが実際に効いているか (どちらの軸も空なら従来どおり全体反映)。
 * @param {ReflectScope} [scope]
 * @returns {boolean}
 */
export function isScopeLimited(scope) {
  if (!scope) return false;
  return cleanList(scope.days).length > 0 || cleanList(scope.grades).length > 0;
}

/**
 * 範囲をプロジェクトの語彙に正規化する。プロジェクトに存在しない曜日 /
 * 学年は落とす — タブを消した後に古い選択が残っていると、**何も反映されない
 * のに理由が分からない**という状態になるため。
 *
 * 「全部選んだ」状態は「絞らない」と同じなので空にたたむ (表示・確認文が
 * 「土曜だけ」のように嘘をつかないように)。
 * @param {ReflectScope} [scope]
 * @param {object} project
 * @returns {{days: string[], grades: string[]}}
 */
export function normalizeScope(scope, project) {
  const avail = availableScope(project);
  const days = cleanList(scope?.days).filter((d) => avail.days.includes(d));
  const grades = cleanList(scope?.grades).filter((g) => avail.grades.includes(g));
  return {
    days: days.length === avail.days.length ? [] : days,
    grades: grades.length === avail.grades.length ? [] : grades,
  };
}

/**
 * プロジェクトで選べる曜日・学年。曜日は REGULAR_DAYS 順 (タブごとの
 * 検出順に並べると画面で月火水…にならない)、学年はタブ定義順。
 * @param {object} project
 * @returns {{days: string[], grades: string[]}}
 */
export function availableScope(project) {
  const daySet = new Set();
  const grades = [];
  for (const tab of project?.tabs || []) {
    for (const d of tab?.days || []) if (REGULAR_DAYS.includes(d)) daySet.add(d);
    const g = String(tab?.grade || "").trim();
    if (g && !grades.includes(g)) grades.push(g);
  }
  return { days: REGULAR_DAYS.filter((d) => daySet.has(d)), grades };
}

/**
 * 範囲に入るかの述語を作る。下書き (draft) と本体のコマ (slot) の両方に
 * 使えるよう、{day, grade} だけを見る。
 * @param {ReflectScope} [scope]
 * @returns {(x: {day?: string, grade?: string}) => boolean}
 */
export function scopeMatcher(scope) {
  const days = cleanList(scope?.days);
  const grades = cleanList(scope?.grades);
  if (days.length === 0 && grades.length === 0) return () => true;
  return (x) => {
    if (days.length > 0 && !days.includes(x?.day)) return false;
    if (grades.length > 0 && !grades.includes(String(x?.grade || "").trim()))
      return false;
    return true;
  };
}

/**
 * 範囲の説明文 (確認ダイアログ・トースト用)。
 * @param {ReflectScope} [scope]
 * @returns {string} 絞っていなければ "全体"
 */
export function describeScope(scope) {
  const days = cleanList(scope?.days);
  const grades = cleanList(scope?.grades);
  if (days.length === 0 && grades.length === 0) return "全体";
  const parts = [];
  if (grades.length > 0) parts.push(grades.join("・"));
  if (days.length > 0)
    parts.push(REGULAR_DAYS.filter((d) => days.includes(d)).join("・") + "曜");
  return parts.join(" の ");
}

/**
 * 置き換え先の時間割で「範囲外のため触らないコマ」を数える。
 * 確認ダイアログで**何が守られるのか**を見せるために使う
 * (削除件数だけ出すと、範囲外まで消えるように読めてしまう)。
 * @param {import("../types").Slot[]} slots 本体の全コマ
 * @param {number} timetableId 置き換え先
 * @param {ReflectScope} [scope]
 * @returns {number}
 */
export function countUntouchedSlots(slots, timetableId, scope) {
  if (!isScopeLimited(scope)) return 0;
  const inScope = scopeMatcher(scope);
  return (slots || []).filter(
    (s) => (s.timetableId ?? 1) === timetableId && !inScope(s)
  ).length;
}

/**
 * 未承認の重なりを範囲で絞る。**範囲外だけで起きている重なりは、この反映
 * では本体に持ち込まれない**ので警告しない (絞ったのに全体の警告が出ると、
 * 何を直せば反映できるのか分からなくなる)。
 *
 * 重なりは同じ曜日の中でしか起きない (travel を含む) ので曜日は
 * `conflict.day` を見る。学年は refs (`${tabId}:${cellKey}`) の tabId から
 * 引く。**片方でも範囲に入っていれば残す** — 範囲内のコマが関わる重なりは
 * 実際に持ち込まれるため。
 * @param {{type: string, day: string, refs: string[]}[]} conflicts
 * @param {object} project
 * @param {ReflectScope} [scope]
 * @returns {object[]}
 */
export function filterConflictsByScope(conflicts, project, scope) {
  if (!isScopeLimited(scope)) return conflicts || [];
  const days = cleanList(scope?.days);
  const grades = cleanList(scope?.grades);
  const gradeByTabId = new Map(
    (project?.tabs || []).map((t) => [String(t.id), String(t.grade || "").trim()])
  );
  return (conflicts || []).filter((c) => {
    if (days.length > 0 && !days.includes(c.day)) return false;
    if (grades.length === 0) return true;
    return (c.refs || []).some((ref) =>
      grades.includes(gradeByTabId.get(String(ref).split(":")[0]))
    );
  });
}
