// ─── 選択セルの一括変更 (通常時間割作成) ────────────────────────────
// 複数選択の一括操作はクリアとロックしか無く、「この曜日のこの講師を別の
// 人に」「この列の教室をまとめて変える」といった期切替で頻出の編集が
// セル単位でしかできなかった。講師マスタのリネーム
// (renameTeacherInProject) は「マスタ上の同一人物の改名」であって担当の
// 差し替えではないので、そちらでは代用できない。
//
// 規約:
// - 対象は「中身のあるセル」だけ (空マスに講師だけ置く事故を防ぐ。
//   一括クリア・一括ロックと同じ基準)
// - ロック中のセルは触らない (件数だけ返す)
// - patch にあるフィールドだけ書き換える。値 "" はそのフィールドのクリア
// - 講師は splitTeacherField で正規化してから保存する (CLAUDE.md の
//   複数講師区切り規約 — IME の "・" を "·" に寄せる)
// - 全フィールドが空になったセルは削除する (onCellChange と同じ)

import { splitTeacherField } from "../utils/biweekly";
import { parseCellRef } from "./model";

export const BULK_FIELDS = [
  ["subj", "教科"],
  ["teacher", "講師"],
  ["room", "教室"],
  ["note", "備考"],
];

const CONTENT_FIELDS = BULK_FIELDS.map(([f]) => f);

function applyPatch(cell, patch) {
  const next = { ...cell };
  for (const [field, raw] of Object.entries(patch)) {
    const value =
      field === "teacher"
        ? splitTeacherField(raw).join("·")
        : String(raw ?? "").trim();
    if (value) next[field] = value;
    else delete next[field];
  }
  return next;
}

const isEmpty = (cell) => !CONTENT_FIELDS.some((f) => (cell[f] || "").trim());
const sameContent = (a, b) => CONTENT_FIELDS.every((f) => (a[f] || "") === (b[f] || ""));

/**
 * refs で指したセルの指定フィールドをまとめて書き換えた tabs を返す (純関数)。
 * @param {object[]} tabs project.tabs
 * @param {string[]} refs セル参照 (`tabId:cellKey`)
 * @param {Partial<Record<"subj"|"teacher"|"room"|"note", string>>} patch
 *   含まれるフィールドだけ適用する。"" はクリア
 * @returns {{
 *   tabs: object[],
 *   changed: number,        // 実際に内容が変わったセル数
 *   cleared: number,        // うち中身が無くなって削除されたセル数
 *   skippedLocked: number,  // ロック中で見送ったセル数
 *   skippedEmpty: number,   // 空マスで対象外だったセル数
 * }}
 */
export function bulkEditCells(tabs, refs, patch) {
  const result = {
    tabs,
    changed: 0,
    cleared: 0,
    skippedLocked: 0,
    skippedEmpty: 0,
  };
  if (!patch || Object.keys(patch).length === 0) return result;

  const keysByTab = new Map();
  for (const ref of refs || []) {
    const { tabId, key } = parseCellRef(ref);
    if (!keysByTab.has(tabId)) keysByTab.set(tabId, []);
    keysByTab.get(tabId).push(key);
  }

  const next = tabs.map((t) => {
    const keys = keysByTab.get(t.id);
    if (!keys) return t;
    const schedule = { ...(t.schedule || {}) };
    let touched = false;
    for (const key of keys) {
      const cell = schedule[key];
      if (!cell) {
        result.skippedEmpty++;
        continue;
      }
      if (cell.locked) {
        result.skippedLocked++;
        continue;
      }
      const patched = applyPatch(cell, patch);
      if (sameContent(cell, patched)) continue;
      if (isEmpty(patched)) {
        delete schedule[key];
        result.cleared++;
      } else {
        schedule[key] = patched;
      }
      result.changed++;
      touched = true;
    }
    return touched ? { ...t, schedule } : t;
  });

  result.tabs = next.some((t, i) => t !== tabs[i]) ? next : tabs;
  return result;
}

/** 一括変更の結果を 1 行にまとめる (toast 用の純関数) */
export function describeBulkEdit(res, patch) {
  const labels = BULK_FIELDS.filter(([f]) => f in patch).map(([f, label]) => {
    const v = (patch[f] || "").trim();
    return `${label}: ${v || "（クリア）"}`;
  });
  if (res.changed === 0) {
    if (res.skippedLocked > 0 && res.skippedEmpty === 0) {
      return "変更できるコマがありません（選択セルはすべてロック中です）";
    }
    if (res.skippedEmpty > 0 && res.skippedLocked === 0) {
      return "変更できるコマがありません（選択セルはすべて空です）";
    }
    if (res.skippedLocked > 0 || res.skippedEmpty > 0) {
      return "変更できるコマがありません（選択セルは空またはロック中です）";
    }
    return "内容は既に同じです";
  }
  const parts = [`${res.changed} コマを変更しました（${labels.join("、")}）`];
  if (res.cleared > 0) parts.push(`うち ${res.cleared} コマは空になったので削除`);
  if (res.skippedLocked > 0) parts.push(`ロック中の ${res.skippedLocked} コマは対象外`);
  if (res.skippedEmpty > 0) parts.push(`空マス ${res.skippedEmpty} 件は対象外`);
  return parts.join("。");
}
