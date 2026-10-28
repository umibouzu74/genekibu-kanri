// 季節の中の「枠」(2026-10-27)。冬期講習 (12/25〜1/7) と直前ポイント演習 (火木・水金、
// 1/12〜3/4)・弱点補強演習 (土曜、1/9〜3/6) は別の講習だが、季節の project は 1 つなので
// タブを足して入れるしかなかった (時限プールに 14 個が並び「1限」が 4 種類、本体の月間の
// 「講」には project の名前が出る)。
//
// - 枠は名前・時限 (プールの部分集合)・本体の月間の予定への反映 (作成中 / 仮確定 / 確定) を
//   持つ。タブは枠に入る (TabConfig.frameId)。枠に入ったタブは枠の時限から使う時限を選ぶ
// - 日付プール・講師・NG・他学年セッションは季節で共通のまま (枠をまたいで同じ講師が
//   同じ日に入るのを見逃さないため)
// - 時限のラベルは季節で共通の名前 (NG のキーがラベルなので)。同じ名前の時限は枠を
//   またいで同じ時限として扱う
// - 本体の月間の「講」と講師別 Excel には枠の名前を出す。講師別 Excel は枠ごとに出せる
// - 枠を使わない project は従来どおり (frames が無い)
//
// 形の確認は無依存の utils/frameShape (migrateProject から使う)。

import { activeDatesForTab, activePeriodsForTab } from './scheduleKey';
import { sortPoolDatesByCalendar } from './dateGenerate';
import { isExternalOnlyDate } from './externalSessionShape';
import { framePublishState, mostPublished, projectPublishState } from './publishState';
import type { Entity, Frame, Project, PublishState, Tab } from '../types';

type FrameProject = Pick<Project, 'frames' | 'tabs' | 'dates' | 'periods' | 'publishState'>;

export function projectFrames(project: Pick<Project, 'frames'> | null | undefined): Frame[] {
  return Array.isArray(project?.frames) ? project!.frames! : [];
}

export function frameById(project: Pick<Project, 'frames'> | null | undefined, id: number | null | undefined): Frame | null {
  if (id == null) return null;
  return projectFrames(project).find(f => f.id === id) || null;
}

export function frameOfTab(project: Pick<Project, 'frames'> | null | undefined, tab: Pick<Tab, 'config'> | null | undefined): Frame | null {
  return frameById(project, tab?.config?.frameId);
}

/** 枠のタブ (frameId = null は枠に入っていないタブ) */
export function tabsOfFrame(project: Pick<Project, 'frames' | 'tabs'>, frameId: number | null): Tab[] {
  return (project.tabs || []).filter(t => (frameOfTab(project, t)?.id ?? null) === frameId);
}

/** 枠の時限 (枠の並び = プールの並び) */
export function framePeriods(project: Pick<Project, 'periods'>, frame: Pick<Frame, 'periodIds'>): Entity[] {
  const ids = new Set(frame.periodIds);
  return (project.periods || []).filter(p => ids.has(p.id));
}

// タブが授業に使う日 (使う時限が 1 つ以上)。courseDates.usedDateLabels と同じ考え方
function tabLessonDates(project: Pick<Project, 'dates' | 'periods'>, tab: Tab): Entity[] {
  if (activePeriodsForTab(project.periods, tab).length === 0) return [];
  return activeDatesForTab(project.dates, tab);
}

/** 枠のタブが授業に使う日 (カレンダー順) */
export function frameLessonDates(project: FrameProject, frameId: number | null): Entity[] {
  const ids = new Set<number>();
  tabsOfFrame(project, frameId).forEach(t => tabLessonDates(project, t).forEach(d => ids.add(d.id)));
  return sortPoolDatesByCalendar((project.dates || []).filter(d => ids.has(d.id)));
}

/** 枠の期間の表示 (「12/25(金)〜1/7(木)」)。日付が無ければ '' */
export function frameRangeLabel(project: FrameProject, frameId: number | null): string {
  const dates = frameLessonDates(project, frameId);
  if (dates.length === 0) return '';
  return dates.length === 1 ? dates[0].label : `${dates[0].label}〜${dates[dates.length - 1].label}`;
}

/** その日を授業に使う枠の id (枠の並び順。枠に入っていないタブが使うなら null も入る) */
export function frameIdsUsingDate(project: FrameProject, dateLabel: string): Array<number | null> {
  const out: Array<number | null> = [];
  const frameOrder = [...projectFrames(project).map(f => f.id), null];
  for (const id of frameOrder) {
    if (frameLessonDates(project, id).some(d => d.label === dateLabel)) out.push(id);
  }
  return out;
}

/**
 * 日付の属する枠 (他学年セッションの表示・講師別 Excel を枠ごとに分けるとき)。
 * 1. その日を授業に使う枠。いくつもあれば、いちばん本体に出している枠 (月間に出すかの
 *    判定 publishStateForSessionDate と同じ枠の名前を出す)。同じなら先の枠
 * 2. 外部授業だけの日などタブが使わない日は、期間 (最初〜最後の授業の日) がその日を
 *    含む枠、無ければカレンダーの上でいちばん近い枠 (12/24 → 12/25 から始まる冬期講習)。
 *    枠に入っていないタブもひとまとまりとして比べる (null)
 * 枠が無い project・枠に入っていないタブの日は null
 */
export function frameIdForDate(project: FrameProject, dateLabel: string): number | null {
  const frames = projectFrames(project);
  if (frames.length === 0) return null;
  const stateOf = (id: number | null) => (id == null ? projectPublishState(project) : framePublishState(project, frameById(project, id)));
  const using = frameIdsUsingDate(project, dateLabel);
  if (using.length > 0) {
    const best = mostPublished(using.map(stateOf));
    return using.find(id => stateOf(id) === best) ?? using[0];
  }
  const order = new Map(sortPoolDatesByCalendar(project.dates || []).map((d, i) => [d.label, i] as const));
  const at = order.get(dateLabel);
  if (at == null) return null;
  let best: { id: number | null; dist: number } | null = null;
  for (const id of [...frames.map(f => f.id), null]) {
    const idx = frameLessonDates(project, id).map(d => order.get(d.label)).filter((i): i is number => i != null);
    if (idx.length === 0) continue;
    const lo = Math.min(...idx);
    const hi = Math.max(...idx);
    const dist = at < lo ? lo - at : at > hi ? at - hi : 0;
    if (!best || dist < best.dist) best = { id, dist };
  }
  return best ? best.id : null;
}

/**
 * 他学年セッション (その日付) を本体の月間に出すかの状態。その日を使う枠のうち
 * いちばん出している状態 (どれかが確定なら確定)。タブが使わない日は frameIdForDate の枠、
 * 枠が無ければ project の状態
 */
export function publishStateForSessionDate(project: FrameProject, dateLabel: string): PublishState {
  if (projectFrames(project).length === 0) return projectPublishState(project);
  const using = frameIdsUsingDate(project, dateLabel);
  const ids = using.length > 0 ? using : [frameIdForDate(project, dateLabel)];
  const states = ids.map(id => (id == null ? projectPublishState(project) : framePublishState(project, frameById(project, id))));
  return mostPublished(states) ?? projectPublishState(project);
}

/** タブの並びの見出しに出す名前: 全部が同じ枠なら枠の名前、それ以外は project の名前 */
export function displayNameForTabs(project: Pick<Project, 'frames' | 'name'>, tabs: Array<Pick<Tab, 'config'>>): string {
  const frames = tabs.map(t => frameOfTab(project, t));
  if (frames.length > 0 && frames[0] && frames.every(f => f?.id === frames[0]!.id)) return frames[0].name;
  return project.name || '';
}

/** 季節の状態のまとめ (切替バー): 枠ごとの状態がそろっていればその状態、違えば null */
export function summarizePublishState(project: FrameProject): PublishState | null {
  const frames = projectFrames(project);
  if (frames.length === 0) return projectPublishState(project);
  const states = new Set<PublishState>(frames.map(f => framePublishState(project, f)));
  if (tabsOfFrame(project, null).length > 0) states.add(projectPublishState(project));
  return states.size === 1 ? [...states][0] : null;
}

/**
 * 1 つの枠だけの project (講師別 Excel を枠ごとに出す)。名前は枠の名前、タブは枠のタブ、
 * 日付プールの外部授業だけの日はその枠の日 (frameIdForDate) だけ
 */
export function projectForFrame<P extends FrameProject & Pick<Project, 'name'>>(project: P, frameId: number): P {
  const frame = frameById(project, frameId);
  if (!frame) return project;
  const tabs = tabsOfFrame(project, frameId);
  const dates = (project.dates || []).filter(d => !isExternalOnlyDate(d) || frameIdForDate(project, d.label) === frameId);
  return {
    ...project,
    name: frame.name,
    tabs,
    dates,
    activeTabId: tabs[0]?.id ?? (project as unknown as Project).activeTabId,
  };
}
