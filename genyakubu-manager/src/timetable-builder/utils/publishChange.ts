// 本体の月間の予定への反映 (作成中 / 仮確定 / 確定) が変わる操作の確認 (2026-10-28)。
//
// 状態を直接切り替える (ヘッダ・枠の「月間の予定」) ほかに、タブを枠に入れる / 外す・
// 枠を消すでもタブの状態は変わる (枠に入っていないタブは project の状態になる)。
// どの経路でも、変わるタブと「今日より前の授業の日があるタブを作成中にすると、済んだ日の
// 分も本体の月間と授業時間の集計から消える」ことを同じ言い方で確かめる。

import { effectiveConfigForTab } from './scheduleKey';
import { projectBaseYmd, resolveDateLabelsYmd, usedDateLabels } from './courseDates';
import { publishStateDef, publishStateForTab } from './publishState';
import type { Project, PublishState, Tab } from '../types';

/** タブに今日より前の授業の日があるか (年は季節の日付でまとめて決める) */
export function tabHasPastLessonDays(project: Project, tab: Tab, today: string): boolean {
  const base = projectBaseYmd(project, today);
  if (!base) return false;
  const ymdByLabel = resolveDateLabelsYmd(usedDateLabels(project), base);
  const cfg = effectiveConfigForTab(project, tab);
  if (cfg.periods.length === 0) return false;
  return cfg.dates.some(d => {
    const ymd = ymdByLabel.get(d.label);
    return !!ymd && ymd < today;
  });
}

export interface PublishChange {
  tab: Tab;
  from: PublishState;
  to: PublishState;
}

/** 状態が変わるタブ (to が今の状態と同じタブは入れない) */
export function publishChangesFor(project: Project, tabs: Tab[], to: PublishState): PublishChange[] {
  return tabs
    .map(tab => ({ tab, from: publishStateForTab(project, tab), to }))
    .filter(c => c.from !== c.to);
}

/**
 * 確認の文 (確かめることが無ければ null)。
 * - askAlways: 変わるタブを並べて必ず確かめる (枠に入れる / 外す・枠を消す。状態を
 *   選んだ覚えが無いのに変わる操作)
 * - それ以外 (状態を直接選んだとき) は、済んだ日のあるタブを作成中にするときだけ
 */
export function publishChangeMessage(
  project: Project,
  changes: PublishChange[],
  today: string,
  { askAlways = false }: { askAlways?: boolean } = {},
): string | null {
  if (changes.length === 0) return null;
  const pastToDraft = changes.filter(c => c.to === 'draft' && tabHasPastLessonDays(project, c.tab, today));
  if (!askAlways && pastToDraft.length === 0) return null;
  const lines: string[] = [];
  if (askAlways) {
    lines.push('本体の月間の予定への反映が変わります。');
    changes.forEach(c => {
      lines.push(`・${c.tab.name}: ${publishStateDef(c.from).label} → ${publishStateDef(c.to).label} (${publishStateDef(c.to).note})`);
    });
  }
  if (pastToDraft.length > 0) {
    lines.push(
      `${pastToDraft.map(c => `「${c.tab.name}」`).join('')}には今日より前の授業の日があります。作成中にすると、` +
        '本体の講師の月間の予定と授業時間の集計 (済んだ日の分も) から消えます。',
    );
  }
  lines.push('よろしいですか？');
  return lines.join('\n');
}
