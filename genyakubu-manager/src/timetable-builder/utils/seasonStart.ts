// 季節の project を「設定だけ写して」作る (2026-10-23)。
//
// 使いどころは 2 つ:
// - まだ作っていない季節を、別の季節の講習から始める (冬期 → 春期)
// - 去年の同じ季節の project を、今年の講習用に作り直す (2026 冬期 → 2027 冬期)
//
// 残すのは毎年ほぼ同じもの = 講師 (担当科目・担当不可/優先クラス・コマ数の上限)・
// 科目と色・学年タブ (クラス・コマ数・使う時限)・時限・合同授業 (全日程のもの)・
// 他学年セッションのプリセット・自動生成の設定。
// 消すのはその季節の日付に対するもの = 日付・時間割・日ごとのチェック・講師不在/NG・
// 出勤可能調査の回答・他学年セッション・スナップショット。
//
// 日付の後始末は日付プールからの削除 (projectReducer.removeDatesFromPool) と同じ
// 経路を通す (NG・出勤可能調査・合同・外部コマのラベル参照を取りこぼさない)。

import { removeDatesFromPool } from '../hooks/projectReducer';
import { stripAvailability } from './availabilityShape';
import { cleanSchedule, CURRENT_PROJECT_VERSION } from './constants';
import { migrateProject } from './scheduleKey';
import type { Project } from '../types';

export function buildFreshSeasonProject(
  source: Project,
  { name, now = new Date() }: { name: string; now?: Date },
): Project {
  const base = cleanSchedule(migrateProject(JSON.parse(JSON.stringify(source))));
  const cleared = removeDatesFromPool(base, (base.dates || []).map(d => d.id));
  const stamp = now.toISOString();
  const tabs = cleared.tabs.map(tab => {
    // 使う日は「全日」(= プールに従う) に戻す。日付を作り直したとき、どのタブにも
    // そのまま入る (学年で日程が違えば ⚙ 設定でタブごとに絞る)
    const { activeDateIds: _activeDateIds, ...config } = tab.config;
    const { dayStatuses: _dayStatuses, ...rest } = tab;
    return { ...rest, config, schedule: {} };
  });
  return {
    ...cleared,
    version: CURRENT_PROJECT_VERSION,
    name,
    createdAt: stamp,
    updatedAt: stamp,
    activeTabId: tabs[0]?.id ?? cleared.activeTabId,
    dates: [],
    tabs,
    // 講師不在・NG は日付 × 時限なので全部外す (プールに無い日付の NG も残さない)。
    // 出勤可能調査の回答もその季節のもの
    teachers: stripAvailability(cleared.teachers || []).map(t => ({ ...t, ngSlots: [] })),
    externalCounts: {},
    externalSessions: [],
    // プリセットの日付の範囲も前の季節のもの (プールに無いラベルは removeDatesFromPool
    // では外れないので、ここで全部外す)
    externalSessionPresets: (cleared.externalSessionPresets || []).map(p => {
      const { startDateLabel: _start, endDateLabel: _end, ...rest } = p;
      return rest;
    }),
    snapshots: [],
  };
}
