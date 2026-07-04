// N2f: undo/redo の内容可視化。
//
// undo/redo は状態を差し替えるだけで、変更セルが画面外 (スクロール外・
// 別タブ・設定モーダルの中) だと押しても無反応に見えた。履歴は完全な
// Project 配列なので、遷移元/先を比較して「何が戻ったか」を 1 行で説明し、
// 可能なら該当セルへスクロールできるようにする。
//
// reducer は immutable 更新 (変更箇所だけ新 object) なので、top-level
// フィールドの参照比較が「どこが変わったか」の信頼できるシグナルになる。
import { diffSchedules } from './scheduleDiff';
import { findEntityById } from './scheduleKey';
import { parseKey } from './scheduleKey';
import type { Project, Tab } from '../types';

// 参照が変わっていたら報告する project 直下フィールドとその表示名。
// updatedAt は毎 action 変わるので対象外。tabs は schedule diff と別枠で扱う。
const FIELD_LABELS: Array<[keyof Project, string]> = [
  ['teachers', '講師設定'],
  ['subjects', '科目マスタ'],
  ['subjectColors', '科目カラー'],
  ['dates', '日付プール'],
  ['periods', '時限プール'],
  ['combinedGroups', '合同グループ'],
  ['externalSessions', '他学年セッション'],
  ['externalCounts', '他学年コマ数'],
  ['externalSessionPresets', 'プリセット'],
  ['snapshots', 'スナップショット'],
  ['name', 'プロジェクト名'],
];

function keyLabelFor(project: Project, tab: Tab, key: string): string {
  const p = parseKey(key);
  if (!p) return key;
  const d = findEntityById(project.dates, p.dateId)?.label ?? `d${p.dateId}`;
  const pe = findEntityById(project.periods, p.periodId)?.label ?? `p${p.periodId}`;
  const c = findEntityById(tab.config?.classes, p.classId)?.label ?? `c${p.classId}`;
  return `${d} ${pe} ${c}`;
}

const entryText = (e: { subject?: string; teacher?: string } | null | undefined): string =>
  e && (e.subject || e.teacher) ? `${e.subject || ''}${e.teacher ? `/${e.teacher}` : ''}` : '空';

export interface HistoryStepDescription {
  /** 「◯◯を変更」の目的語 (呼び出し側が「元に戻す:」等の動詞を付ける) */
  message: string;
  /** 遷移先で可視なセルに変更があればその schedule key (スクロール用) */
  scrollKey: string | null;
}

// from (現在) → to (undo/redo 先) の遷移内容を説明する。
export function describeHistoryStep(
  from: Project | null | undefined,
  to: Project | null | undefined,
): HistoryStepDescription {
  if (!from || !to) return { message: '変更', scrollKey: null };

  // ── タブ内 schedule の diff (id で突き合わせ) ──
  const fromTabs = new Map((from.tabs || []).map(t => [t.id, t] as const));
  let totalCells = 0;
  let firstDetail: string | null = null;
  let scrollKey: string | null = null;
  const touchedTabNames: string[] = [];
  (to.tabs || []).forEach(toTab => {
    const fromTab = fromTabs.get(toTab.id);
    if (!fromTab || fromTab.schedule === toTab.schedule) return;
    const diffs = diffSchedules(fromTab.schedule || {}, toTab.schedule || {});
    if (diffs.length === 0) return;
    totalCells += diffs.length;
    touchedTabNames.push(toTab.name);
    if (firstDetail === null) {
      const d = diffs[0];
      firstDetail = `${keyLabelFor(to, toTab, d.key)}: ${entryText(d.before)} → ${entryText(d.after)}`;
    }
    // スクロールは遷移先で表示されるタブの変更のみ対象
    if (scrollKey === null && toTab.id === to.activeTabId) scrollKey = diffs[0].key;
  });

  if (totalCells === 1 && firstDetail) {
    return { message: firstDetail, scrollKey };
  }
  if (totalCells > 1) {
    const tabPart = touchedTabNames.length === 1 ? `「${touchedTabNames[0]}」の ` : '';
    return { message: `${tabPart}${totalCells} コマの割当`, scrollKey };
  }

  // ── schedule 以外: 参照が変わったフィールドを列挙 ──
  const changed = FIELD_LABELS.filter(([key]) => from[key] !== to[key]).map(([, label]) => label);
  // tabs の構成変化 (追加/削除/rename/並べ替え/config)。schedule diff が
  // 無いのに tabs 参照が変わっていればタブ構成・タブ設定の変更。
  if (changed.length === 0 && from.tabs !== to.tabs) changed.push('タブ構成・タブ設定');
  if (changed.length === 0 && from.activeTabId !== to.activeTabId) changed.push('タブ切替');
  if (changed.length > 0) {
    return { message: changed.slice(0, 3).join('・'), scrollKey: null };
  }
  return { message: '変更', scrollKey: null };
}
