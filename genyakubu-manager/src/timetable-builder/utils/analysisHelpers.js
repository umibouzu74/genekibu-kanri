// useAnalysis の中身を純粋関数として切り出したもの。React 非依存で
// ユニットテスト可能にし、useAnalysis 側は useMemo の deps を最小化する
// orchestrator に専念させる (D4e + D2a)。

import { makeKey, makeExternalKey, makeNgKey, parseKey, findCombinedGroup, findEntityById } from './scheduleKey';

// 全タブ横断の講師使用状況を集計する。
//
// 返り値:
//   - teacherDailyCounts: { [makeExternalKey(date, teacher)]: { current, external, total } }
//       日付×講師ごとの自タブ内コマ数 (current)、externalCounts (external)、
//       合計 (total)。
//   - globalUsage: { [`${date}-${period}-${teacher}`]: [{ tabId, combinedGroupId }, ...] }
//       同じ日時の同じ講師が複数タブで使われているかを後段の conflict 判定で
//       使う。合同グループ内の重複は同一 (tabId, combinedGroupId) ペアとして
//       1 回扱いにする。
//
// 「未定」は teacher 名として有効でも、コマ数集計の対象外。
//
// 入力 schema (v3):
//   tabs: [{ id, schedule: { [makeKey]: { subject, teacher, ... } }, config }]
//   combinedGroups: [{ id, subject, classes: string[], dates: string[]|null }]
//   externalCounts: { [makeExternalKey]: number }
export function computeGlobalUsage(tabs, combinedGroups, externalCounts) {
  const teacherDailyCounts = {};
  const globalUsage = {};
  const groups = combinedGroups || [];

  tabs.forEach(tab => {
    // 合同グループで既にカウント済みの (date, period, groupId) を追跡。
    // 同一タブ内の合同グループは 1 コマとしてカウントする。
    const tabCombinedCounted = new Set();

    Object.keys(tab.schedule).forEach(key => {
      const entry = tab.schedule[key];
      if (!entry || !entry.teacher || entry.teacher === '未定') return;
      const parsed = parseKey(key);
      if (!parsed) return;
      const { dateId, periodId, classId } = parsed;
      const dateEnt = findEntityById(tab.config.dates, dateId);
      const periodEnt = findEntityById(tab.config.periods, periodId);
      const classEnt = findEntityById(tab.config.classes, classId);
      if (!dateEnt || !periodEnt || !classEnt) return;
      const date = dateEnt.label;
      const period = periodEnt.label;
      const className = classEnt.label;

      const group = findCombinedGroup(groups, entry.subject, className, date);
      let isCombinedDuplicate = false;
      if (group) {
        const combinedTrackKey = `${date}-${period}-${group.id}`;
        if (tabCombinedCounted.has(combinedTrackKey)) {
          isCombinedDuplicate = true;
        } else {
          tabCombinedCounted.add(combinedTrackKey);
        }
      }

      const usageKey = `${date}-${period}-${entry.teacher}`;
      if (!globalUsage[usageKey]) globalUsage[usageKey] = [];
      globalUsage[usageKey].push({ tabId: tab.id, combinedGroupId: group?.id || null });

      if (!isCombinedDuplicate) {
        const dayKey = makeExternalKey(date, entry.teacher);
        if (!teacherDailyCounts[dayKey]) {
          const ext = (externalCounts?.[dayKey] || 0);
          teacherDailyCounts[dayKey] = { current: 0, external: ext, total: ext };
        }
        teacherDailyCounts[dayKey].current++;
        teacherDailyCounts[dayKey].total++;
      }
    });
  });

  return { teacherDailyCounts, globalUsage };
}

// globalUsage 内の (tabId, combinedGroupId) ペアを 1 回扱いにして、
// 実効的な使用回数を返す。合同グループ内の複数クラスは 1 コマとして
// カウントするため、conflict 判定に使う。
function getEffectiveUsageCount(usages) {
  const seen = new Set();
  let count = 0;
  usages.forEach(u => {
    if (u.combinedGroupId) {
      const key = `tab${u.tabId}-cg${u.combinedGroupId}`;
      if (seen.has(key)) return;
      seen.add(key);
    }
    count++;
  });
  return count;
}

// 現タブの分析結果を計算する (conflict / dailySubject / subjectOrder)。
//
// 返り値:
//   - conflictMap: { [`${date}-${period}-${teacher}`]: true }
//       同じ日時・同じ講師が複数箇所 (タブ横断) で使われている場合 true。
//       合同グループ内の重複はカウントしない。
//   - errorKeys: schedule key 配列。conflict があるセル。
//   - dailySubjectMap: { [`c${classId}-d${dateId}-${subject}`]: count }
//       現タブ内・同一クラス×同一日の科目重複検出用。> 1 で重複。
//   - subjectOrders: { [scheduleKey]: number }
//       現タブ内・同一クラス内での該当科目の連番 (1-based、何回目か)。
export function computeActiveAnalysis(currentConfig, currentSchedule, globalUsage) {
  const conflictMap = {};
  const errorKeys = [];
  const dailySubjectMap = {};
  const subjectOrders = {};

  currentConfig.dates.forEach(d => {
    currentConfig.periods.forEach(p => {
      currentConfig.classes.forEach(c => {
        const key = makeKey(d.id, p.id, c.id);
        const entry = currentSchedule[key];
        if (entry && entry.subject) {
          const subjKey = `c${c.id}-d${d.id}-${entry.subject}`;
          dailySubjectMap[subjKey] = (dailySubjectMap[subjKey] || 0) + 1;
        }
        if (entry && entry.teacher && entry.teacher !== '未定') {
          const usageKey = `${d.label}-${p.label}-${entry.teacher}`;
          const effectiveCount = getEffectiveUsageCount(globalUsage[usageKey] || []);
          if (effectiveCount > 1) {
            conflictMap[`${d.label}-${p.label}-${entry.teacher}`] = true;
            errorKeys.push(key);
          }
        }
      });
    });
  });

  currentConfig.classes.forEach(c => {
    const counts = {};
    currentConfig.dates.forEach(d => {
      currentConfig.periods.forEach(p => {
        const key = makeKey(d.id, p.id, c.id);
        const s = currentSchedule[key]?.subject;
        if (s) {
          counts[s] = (counts[s] || 0) + 1;
          subjectOrders[key] = counts[s];
        }
      });
    });
  });

  return { conflictMap, errorKeys, dailySubjectMap, subjectOrders };
}

// ダッシュボード集計 (進捗バー用)。
//   total: 設定された科目クォータの合計 × クラス数
//   filled: subject が割り当たっているセルの個数
//   progress: filled / total を百分率 (整数)。total=0 のとき 0。
export function computeDashboard(currentSchedule, currentConfig) {
  const total = Object.values(currentConfig.subjectCounts).reduce((a, b) => a + b, 0) * currentConfig.classes.length;
  let filled = 0;
  Object.values(currentSchedule).forEach(v => { if (v.subject) filled++; });
  return { progress: total > 0 ? Math.round((filled / total) * 100) : 0, filled, total };
}

// 各タブの違反件数 (現タブ内 3 種別合計) を計算する。TabBar の各タブ badge 表示用。
// teacherConflict だけだと popover との整合性が取れないので、subjectDup /
// subjectOver も含めた合計を返す (M3)。
// teacherOverDaily は date × teacher の全タブ集計なので、各タブの badge
// には算入しない (重複表示防止)。
//
// 返り値: { [tabId: number]: count }
export function computeTabViolationCounts({ tabs, globalUsage }) {
  const result = {};
  tabs.forEach(tab => {
    const tabAnalysis = computeActiveAnalysis(tab.config, tab.schedule, globalUsage);
    let subjectDupCount = 0;
    Object.values(tabAnalysis.dailySubjectMap).forEach(cnt => {
      if (cnt > 1) subjectDupCount += cnt - 1;
    });
    let subjectOverCount = 0;
    Object.entries(tabAnalysis.subjectOrders).forEach(([key, order]) => {
      const subject = tab.schedule[key]?.subject;
      if (!subject) return;
      const maxCnt = tab.config.subjectCounts[subject] || 0;
      if (maxCnt > 0 && order > maxCnt) subjectOverCount++;
    });
    result[tab.id] = tabAnalysis.errorKeys.length + subjectDupCount + subjectOverCount;
  });
  return result;
}

// 現タブの violation を種別ごとに集計する。Toolbar popover 用。
//
// 種別:
//   - teacherConflict: 同時刻同講師重複 (errorKeys に既出)
//   - subjectDup: 同一クラス×同日に同一科目 2 回以上
//   - subjectOver: 科目クォータを超えた割当 (order > subjectCounts[subject])
//   - teacherOverDaily: 講師の 1 日合計コマ数が maxDailyHours を超過
//
// 返り値: 各種別ごとに { count, firstKey? } または teacherOverDaily は
//   { count, items: [{ date, teacher, total, max, firstKey? }] }。
//   count = 0 の種別も含めて返す (consumer 側で >0 のものだけ表示)。
//
// teachers: teacherOverDaily の date/teacher 復元に使う (M1)。
//   makeExternalKey は `${date}-${teacher}` で teacher 名末尾 match で
//   復元する。teachers が未指定なら teacherOverDaily の date は '?'。
export function computeViolations({
  currentConfig,
  currentSchedule,
  errorKeys,
  dailySubjectMap,
  subjectOrders,
  teacherDailyCounts,
  maxDailyHours,
  teachers,
}) {
  // teacherConflict: errorKeys と同じ。最初のキーをスクロール対象に。
  const teacherConflict = {
    count: errorKeys.length,
    firstKey: errorKeys[0] || null,
  };

  // subjectDup: dailySubjectMap[`c${classId}-d${dateId}-${subject}`] > 1
  //   重複ペアあたり「超過コマ数 = count - 1」と数える。
  //   firstKey は subjectOrders から「order >= 2 && 同 subject」の最初のキー。
  let subjectDupCount = 0;
  Object.values(dailySubjectMap).forEach(cnt => {
    if (cnt > 1) subjectDupCount += cnt - 1;
  });
  let subjectDupFirstKey = null;
  if (subjectDupCount > 0) {
    // subjectOrders[key] >= 2 のセルが重複の 2 つ目。最初のものを取る。
    // config 順で先頭を取りたいので config を iterate。
    outer: for (const d of currentConfig.dates) {
      for (const p of currentConfig.periods) {
        for (const c of currentConfig.classes) {
          const key = makeKey(d.id, p.id, c.id);
          if ((subjectOrders[key] || 0) >= 2) {
            subjectDupFirstKey = key;
            break outer;
          }
        }
      }
    }
  }

  // subjectOver: 科目クォータ超過 (order > maxCnt)
  let subjectOverCount = 0;
  let subjectOverFirstKey = null;
  Object.entries(subjectOrders).forEach(([key, order]) => {
    const entry = currentSchedule[key];
    const subject = entry?.subject;
    if (!subject) return;
    const maxCnt = currentConfig.subjectCounts[subject] || 0;
    if (maxCnt > 0 && order > maxCnt) {
      subjectOverCount++;
      if (!subjectOverFirstKey) subjectOverFirstKey = key;
    }
  });

  // teacherOverDaily: 1 日 maxDailyHours 超過した (date, teacher) を列挙。
  // makeExternalKey = `${date}-${teacher}`。date label に "-" を含む場合
  // でも teachers のうち末尾一致する name で復元する (M1)。
  const teacherOverItems = [];
  const teacherNamesByLength = (teachers || []).map(t => t.name).sort((a, b) => b.length - a.length);
  Object.entries(teacherDailyCounts).forEach(([dayKey, daily]) => {
    if (daily.total <= maxDailyHours) return;
    let date = '?';
    let teacher = dayKey;
    // teachers が渡されたら suffix match (最長 name 優先) で復元
    const match = teacherNamesByLength.find(name => dayKey.endsWith(`-${name}`));
    if (match) {
      teacher = match;
      date = dayKey.slice(0, dayKey.length - match.length - 1);
    }
    // 現タブ内で {date, teacher} に一致する最初のセル (firstKey) を探す。
    // 他タブの違反でも teacherOverDaily に出るが、その場合 firstKey は null
    // (現タブから飛び先が無い)。
    let firstKey = null;
    outer: for (const d of currentConfig.dates) {
      if (d.label !== date) continue;
      for (const p of currentConfig.periods) {
        for (const c of currentConfig.classes) {
          const key = makeKey(d.id, p.id, c.id);
          if (currentSchedule[key]?.teacher === teacher) {
            firstKey = key;
            break outer;
          }
        }
      }
    }
    teacherOverItems.push({ date, teacher, total: daily.total, max: maxDailyHours, firstKey });
  });

  return {
    teacherConflict,
    subjectDup: { count: subjectDupCount, firstKey: subjectDupFirstKey },
    subjectOver: { count: subjectOverCount, firstKey: subjectOverFirstKey },
    teacherOverDaily: { count: teacherOverItems.length, items: teacherOverItems },
  };
}

// 設定値だけで判定できる infeasibility (静的検証) を集計する (D1c-C)。
// 自動生成を走らせなくても「これは絶対 / 構造的に解けない」と分かる
// ケースを事前に表示する。
//
// 種別:
//   - noTeacherForSlot: (date, period, subject) で「未定」を除く担当講師が
//       全員 NG → そのスロットは担当者が見つからず埋まらない (致命)
//   - subjectCapacityShortage: 科目別の総需要 > 担当講師の理論最大 capacity
//       「未定」を除いた担当講師数 × dates.length × maxDailyHours と
//       (subjectCounts[s] × classes.length) を比較
//
// 返り値: 各種別 { count, items: [...] }。count = 0 の種別も含めて返す。
export function computeInfeasibilities({ teachers, commonSubjects, currentConfig, maxDailyHours }) {
  const reals = (teachers || []).filter(t => t && t.name && t.name !== '未定');
  const subjects = commonSubjects || [];

  // C1: noTeacherForSlot
  const noTeacherItems = [];
  currentConfig.dates.forEach(d => {
    currentConfig.periods.forEach(p => {
      subjects.forEach(subject => {
        const ngKey = makeNgKey(d.label, p.label);
        const eligible = reals.filter(t => t.subjects?.includes(subject) && !t.ngSlots?.includes(ngKey));
        if (eligible.length === 0) {
          noTeacherItems.push({ date: d.label, period: p.label, subject });
        }
      });
    });
  });

  // C2: subjectCapacityShortage
  const capacityItems = [];
  subjects.forEach(subject => {
    const demand = (currentConfig.subjectCounts?.[subject] || 0) * currentConfig.classes.length;
    if (demand === 0) return;
    const eligible = reals.filter(t => t.subjects?.includes(subject));
    const capacity = eligible.length * currentConfig.dates.length * maxDailyHours;
    if (demand > capacity) {
      capacityItems.push({ subject, demand, capacity, teacherCount: eligible.length });
    }
  });

  return {
    noTeacherForSlot: { count: noTeacherItems.length, items: noTeacherItems },
    subjectCapacityShortage: { count: capacityItems.length, items: capacityItems },
  };
}
