import { parseKey, findCombinedGroup, effectiveConfigForTab } from './scheduleKey';
import type { ParsedKey } from './scheduleKey';
import type { CombinedGroup, Entity, ScheduleEntry, Tab } from '../types';

export interface CountedAssignment {
  key: string;
  entry: ScheduleEntry;
  parsed: ParsedKey;
  dateEnt: Entity;
  periodEnt: Entity;
  classEnt: Entity;
  group: CombinedGroup | null;
  isCombinedDuplicate: boolean;
}

// F2j: 「タブの schedule のどのセルを講師 1 コマと数えるか」の規則を
// 単一実装に統合する走査ヘルパー。ソルバの collectOtherTabsUsage
// (logic/autoGenerator.js、他タブ考慮 H2) と分析の computeGlobalUsage
// (utils/analysisHelpers.js) が同じ規則を別実装で持っており、過去に合同
// dedupe キーの規則が食い違って他タブ考慮のカウントが分析と乖離した。
// 数える / 数えないの判断はすべてここで行い、消費側は visit コールバックで
// 集計 (busy 判定・日次カウント・globalUsage 構築) だけを行う。
//
// 規則:
//   - teacher 無し / exemptTeacher (通常 '未定') のセルは数えない
//   - パース不能キー / このタブが使わない日・時限 (E-3 絞り) /
//     削除済みクラスに残る stale セルは数えない
//   - 合同グループは (dateId, periodId, groupId, teacher) につき 1 コマ。
//     2 枚目以降のセルも visit はされるが isCombinedDuplicate=true が付く
//     (「その時限にセルがある」事実 = busy 判定には使えるが、日次コマ数には
//     数えない)。dedupe キーに講師名を含めるのは solver の seenCombinedDay /
//     countTeacherHoursWithCombined と同じ規則 — 含めないと、合同の各クラスに
//     別々の講師が入っている (壊れた) 状態で 2 人目以降の日次カウントが
//     丸ごと欠落し、teacherOverDaily を見逃す。
//
// visit({ key, entry, parsed, dateEnt, periodEnt, classEnt, group, isCombinedDuplicate })
export function forEachCountedAssignment(
  { dates, periods }: { dates: Entity[]; periods: Entity[] },
  tab: Tab,
  combinedGroups: CombinedGroup[] | null | undefined,
  exemptTeacher: string,
  visit: (assignment: CountedAssignment) => void,
) {
  const eff = effectiveConfigForTab({ dates, periods }, tab);
  const dateById = new Map(eff.dates.map(d => [d.id, d]));
  const periodById = new Map(eff.periods.map(p => [p.id, p]));
  const classById = new Map((tab.config?.classes || []).map(c => [c.id, c]));
  const seenCombined = new Set<string>();

  Object.entries(tab.schedule || {}).forEach(([key, entry]) => {
    if (!entry?.teacher || entry.teacher === exemptTeacher) return;
    const parsed = parseKey(key);
    if (!parsed) return;
    const dateEnt = dateById.get(parsed.dateId);
    const periodEnt = periodById.get(parsed.periodId);
    const classEnt = classById.get(parsed.classId);
    if (!dateEnt || !periodEnt || !classEnt) return;

    const group = findCombinedGroup(combinedGroups || [], entry.subject, classEnt.label, dateEnt.label);
    let isCombinedDuplicate = false;
    if (group) {
      const trackKey = `${parsed.dateId}-${parsed.periodId}-${group.id}-${entry.teacher}`;
      if (seenCombined.has(trackKey)) {
        isCombinedDuplicate = true;
      } else {
        seenCombined.add(trackKey);
      }
    }

    visit({ key, entry, parsed, dateEnt, periodEnt, classEnt, group, isCombinedDuplicate });
  });
}
