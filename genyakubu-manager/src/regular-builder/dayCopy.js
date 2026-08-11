// ─── 曜日まるごとコピー (通常時間割作成) ────────────────────────────
// 通常授業は「中3 は火・木で同じ内容」のように、同じコマ割りが曜日の組で
// 繰り返す (courseSets が検出している構造そのもの)。にもかかわらず一括
// 操作はクリアとロックしか無く、火曜を組んでから木曜を作るのはセル単位の
// D&D しか手が無かった。ここはその「曜日 → 曜日」の複製を担う純関数。
//
// 規約:
// - 対象は「コピー元の曜日を使う学年」だけ。コピー先の曜日を使っていない
//   学年は既定でスキップし、名前を返す (addDay で曜日ごと足すこともできる)
// - 残骸セル (使わない時限・消えたクラスを指すセル) はコピーしない
//   (resolveTabEntries と同じ「有効なセル」の基準)
// - コピー先がロック中のセルは常に触らない (ロックは固定 — D&D と同じ)
// - locked フラグは複製しない (copyCellAcrossTabs と同じ。複製は編集
//   できる状態で置く)
// - mode "overwrite" はコピー先の既存セルを上書き、"fill" は空マスだけ埋める

import { REGULAR_DAYS, makeCellKey, parseCellKey } from "./model";

/**
 * 曜日 from のコマを曜日 to へ複製した新しい tabs 配列を返す (純関数)。
 * @param {object[]} tabs project.tabs
 * @param {string} from コピー元の曜日
 * @param {string} to コピー先の曜日
 * @param {{mode?: "overwrite"|"fill", addDay?: boolean}} [opts]
 *   addDay: コピー先の曜日を使っていない学年にもその曜日を追加する
 * @returns {{
 *   tabs: object[],
 *   copied: number,          // 書き込んだコマ数
 *   overwritten: number,     // うち既存のコマを置き換えた数
 *   skippedLocked: number,   // コピー先がロック中で見送った数
 *   skippedFilled: number,   // mode "fill" で既に埋まっていて見送った数
 *   skippedTabs: string[],   // コピー先の曜日を使っておらず対象外の学年名
 *   addedDayTabs: string[],  // addDay で曜日を追加した学年名
 * }}
 */
export function copyDay(tabs, from, to, { mode = "overwrite", addDay = false } = {}) {
  const empty = {
    tabs,
    copied: 0,
    overwritten: 0,
    skippedLocked: 0,
    skippedFilled: 0,
    skippedTabs: [],
    addedDayTabs: [],
  };
  if (!from || !to || from === to) return empty;
  if (!REGULAR_DAYS.includes(from) || !REGULAR_DAYS.includes(to)) return empty;

  let copied = 0;
  let overwritten = 0;
  let skippedLocked = 0;
  let skippedFilled = 0;
  const skippedTabs = [];
  const addedDayTabs = [];

  const next = tabs.map((t) => {
    const days = t.days || [];
    if (!days.includes(from)) return t;
    const hasTo = days.includes(to);
    if (!hasTo && !addDay) {
      skippedTabs.push(t.name);
      return t;
    }

    const periodIds = new Set(t.periodIds || []);
    const classIds = new Set((t.classes || []).map((c) => c.id));
    const schedule = { ...(t.schedule || {}) };
    let touched = false;
    for (const [key, cell] of Object.entries(t.schedule || {})) {
      const pos = parseCellKey(key);
      if (pos.day !== from) continue;
      if (!periodIds.has(pos.periodId) || !classIds.has(pos.classId)) continue;
      const destKey = makeCellKey(to, pos.periodId, pos.classId);
      const dest = schedule[destKey];
      if (dest?.locked) {
        skippedLocked++;
        continue;
      }
      if (dest && mode === "fill") {
        skippedFilled++;
        continue;
      }
      const { locked: _locked, ...content } = cell;
      schedule[destKey] = content;
      if (dest) overwritten++;
      copied++;
      touched = true;
    }

    if (!hasTo) addedDayTabs.push(t.name);
    if (!touched && hasTo) return t;
    return {
      ...t,
      // 曜日の並びは表示順を維持する (TabConfigPanel の toggleDay と同じ)
      days: hasTo ? days : REGULAR_DAYS.filter((d) => days.includes(d) || d === to),
      schedule,
    };
  });

  return {
    // 何も変わらなかった場合は元の配列をそのまま返す (無駄な保存・
    // 再レンダーを起こさない。個々のタブも変わらなければ同一参照)
    tabs: next.some((t, i) => t !== tabs[i]) ? next : tabs,
    copied,
    overwritten,
    skippedLocked,
    skippedFilled,
    skippedTabs,
    addedDayTabs,
  };
}

/**
 * copyDay の結果を 1 行の日本語にまとめる (確認文・toast 用の純関数)。
 * @param {ReturnType<typeof copyDay>} res
 */
export function describeDayCopy(res, from, to) {
  if (res.copied === 0) {
    if (res.skippedTabs.length > 0) {
      return `${to}曜を使う学年がありません（${res.skippedTabs.join("・")} は${to}曜を使わない設定です）`;
    }
    if (res.skippedFilled > 0) {
      return `${to}曜はすべて埋まっています（空きマスだけを埋める設定です）`;
    }
    if (res.skippedLocked > 0) {
      return `コピーできるコマがありません（${res.skippedLocked} コマはコピー先がロック中）`;
    }
    return `${from}曜にコピーできるコマがありません`;
  }
  const parts = [`${from}曜の ${res.copied} コマを${to}曜へコピー`];
  if (res.overwritten > 0) parts.push(`うち ${res.overwritten} コマは上書き`);
  if (res.skippedFilled > 0) parts.push(`埋まっていた ${res.skippedFilled} コマはそのまま`);
  if (res.skippedLocked > 0) parts.push(`ロック中の ${res.skippedLocked} コマはそのまま`);
  if (res.addedDayTabs.length > 0)
    parts.push(`${res.addedDayTabs.join("・")} に${to}曜を追加`);
  if (res.skippedTabs.length > 0)
    parts.push(`${res.skippedTabs.join("・")} は${to}曜を使わないため対象外`);
  return parts.join("。");
}
