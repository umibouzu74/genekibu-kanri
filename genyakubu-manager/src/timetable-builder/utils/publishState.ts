// 講習の時間割を本体の月間の予定へ出すか (作成中 / 仮確定 / 確定、2026-10-27)。
//
// 講習時間割作成で作っている途中の時間割 (去年をもとに写して直している最中など)
// まで、講師の月間の予定 (バイトへ画像で送る紙面) と授業時間の集計に出ていた。
// 人が「仮確定」「確定」を押すまでは本体に出さない。
//
// - draft (作成中)     … 本体には出さない
// - tentative (仮確定) … 出す。月間のカードに「仮」の印 (変わるかもしれない)
// - final (確定)       … 出す
//
// 未設定は確定 (この項目ができる前の project は従来どおり出す。黙って月間から
// 消さない)。新しく作る季節 (始め方・作り直し・初期値・リセット) は作成中から。
// 本体側の絞り込みは utils/builderLessons.buildKoshuLessons の 1 か所。
//
// 無依存 (型だけ) なので scheduleKey.migrateProject から使える。

import type { Project, PublishState, Tab } from '../types';

export interface PublishStateDef {
  key: PublishState;
  label: string;
  icon: string;
  /** 本体に出るかの説明 (ボタンの title・読み上げ) */
  note: string;
}

export const PUBLISH_STATES: PublishStateDef[] = [
  { key: 'draft', label: '作成中', icon: '📝', note: '本体の月間の予定には出しません' },
  { key: 'tentative', label: '仮確定', icon: '🟡', note: '本体の月間の予定に「仮」の印をつけて出します' },
  { key: 'final', label: '確定', icon: '✅', note: '本体の月間の予定に出します' },
];

/** 新しく作る季節の状態 */
export const NEW_PROJECT_PUBLISH_STATE: PublishState = 'draft';

export function isPublishState(v: unknown): v is PublishState {
  return v === 'draft' || v === 'tentative' || v === 'final';
}

export function publishStateDef(state: PublishState): PublishStateDef {
  return PUBLISH_STATES.find(s => s.key === state) || PUBLISH_STATES[2];
}

/** project の状態 (未設定・知らない値は確定) */
export function projectPublishState(project: Pick<Project, 'publishState'> | null | undefined): PublishState {
  const v = project?.publishState;
  return isPublishState(v) ? v : 'final';
}

/** 本体に出すか (作成中だけ出さない) */
export function isPublished(state: PublishState): boolean {
  return state !== 'draft';
}

/** そのタブの時間割の状態 */
export function publishStateForTab(
  project: Pick<Project, 'publishState'> | null | undefined,
  _tab: Pick<Tab, 'id'> | null | undefined,
): PublishState {
  return projectPublishState(project);
}

/** 他学年セッション (日付ラベル) の状態 */
export function publishStateForSessionDate(
  project: Pick<Project, 'publishState'> | null | undefined,
  _dateLabel: string,
): PublishState {
  return projectPublishState(project);
}
