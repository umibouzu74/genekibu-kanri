// useAnalysis の中身を純粋関数として切り出したもの。React 非依存で
// ユニットテスト可能にし、useAnalysis 側は useMemo の deps を最小化する
// orchestrator に専念させる (D4e + D2a)。

import { makeKey, makeExternalKey, makeNgKey, parseKey, findCombinedGroup, findEntityById, activeDatesForTab } from './scheduleKey';
import { computeAutoNgByTeacher } from './autoNg';

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
// v4: dates / periods は project 共通になったため引数で受け取る (各タブの
// config からは消えた)。classes は従来どおり tab.config 由来。
export function computeGlobalUsage(tabs, combinedGroups, externalCounts, externalSessions = [], dates = [], periods = []) {
  const teacherDailyCounts = {};
  const globalUsage = {};
  const groups = combinedGroups || [];

  // 詳細セッションが登録されていれば件数として優先採用、
  // 無ければ legacy externalCounts (数値) にフォールバック。
  const sessionCounts = {};
  (externalSessions || []).forEach(s => {
    if (!s?.date || !s?.teacherName) return;
    const k = makeExternalKey(s.date, s.teacherName);
    sessionCounts[k] = (sessionCounts[k] || 0) + 1;
  });

  tabs.forEach(tab => {
    // 合同グループで既にカウント済みの (date, period, groupId) を追跡。
    // 同一タブ内の合同グループは 1 コマとしてカウントする。
    const tabCombinedCounted = new Set();
    // v4(Y): このタブが使う日だけを対象にする (inactive な日の stale cell は除外)。
    const tabDates = activeDatesForTab(dates, tab);

    Object.keys(tab.schedule).forEach(key => {
      const entry = tab.schedule[key];
      if (!entry || !entry.teacher || entry.teacher === '未定') return;
      const parsed = parseKey(key);
      if (!parsed) return;
      const { dateId, periodId, classId } = parsed;
      const dateEnt = findEntityById(tabDates, dateId);
      const periodEnt = findEntityById(periods, periodId);
      const classEnt = findEntityById(tab.config.classes, classId);
      if (!dateEnt || !periodEnt || !classEnt) return;
      const date = dateEnt.label;
      const period = periodEnt.label;
      const className = classEnt.label;

      const group = findCombinedGroup(groups, entry.subject, className, date);
      let isCombinedDuplicate = false;
      if (group) {
        // dedupe キーに講師名を含める (solver の seenCombinedDay /
        // countTeacherHoursWithCombined と同じ規則)。含めないと、合同の
        // 各クラスに別々の講師が入っている (壊れた) 状態で 2 人目以降の
        // 日次カウントが丸ごと欠落し、teacherOverDaily を見逃す。
        const combinedTrackKey = `${date}-${period}-${group.id}-${entry.teacher}`;
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
          const ext = sessionCounts[dayKey] !== undefined
            ? sessionCounts[dayKey]
            : (externalCounts?.[dayKey] || 0);
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

// 現タブの分析結果を計算する (conflict / dailySubject / subjectOrder / ngViolation)。
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
//   - ngViolationKeys: schedule key 配列。割当済み講師がその日時の
//       ngSlots に該当するセル (後から NG 設定された場合に検出)。
export function computeActiveAnalysis(currentConfig, currentSchedule, globalUsage, teachers = [], autoNgByTeacher = null) {
  const conflictMap = {};
  const errorKeys = [];
  const dailySubjectMap = {};
  const subjectOrders = {};
  const ngViolationKeys = [];
  const teachersByName = new Map();
  (teachers || []).forEach(t => { if (t?.name) teachersByName.set(t.name, t); });

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
          const teacherEnt = teachersByName.get(entry.teacher);
          const ngKey = makeNgKey(d.label, p.label);
          const isManualNg = !!teacherEnt?.ngSlots?.includes(ngKey);
          const isAutoNg = !!autoNgByTeacher?.get(entry.teacher)?.has(ngKey);
          if (isManualNg || isAutoNg) {
            ngViolationKeys.push(key);
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

  return { conflictMap, errorKeys, dailySubjectMap, subjectOrders, ngViolationKeys };
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
export function computeTabViolationCounts({ tabs, globalUsage, teachers = [], externalSessions = [], dates = [], periods = [] }) {
  const result = {};
  // v4: dates / periods は project 共通。自動NG は project の periods で計算し、
  // 各タブの実効 config (classes / subjectCounts + 共通 dates / periods) で分析する。
  const autoNgByTeacher = computeAutoNgByTeacher(teachers, externalSessions, periods);
  tabs.forEach(tab => {
    // v4(Y): このタブが使う日だけで分析する。
    const effective = { ...tab.config, dates: activeDatesForTab(dates, tab), periods };
    const tabAnalysis = computeActiveAnalysis(effective, tab.schedule, globalUsage, teachers, autoNgByTeacher);
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
    result[tab.id] = tabAnalysis.errorKeys.length + subjectDupCount + subjectOverCount + tabAnalysis.ngViolationKeys.length;
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
  ngViolationKeys = [],
}) {
  // teacherConflict: errorKeys と同じ。最初のキーをスクロール対象に。
  const teacherConflict = {
    count: errorKeys.length,
    firstKey: errorKeys[0] || null,
  };

  // teacherNgAssigned: 割当済み講師がその日時の NG 設定に該当するセル。
  // 後から NG 設定を入れた際に既存割当が違反になるケースを検出。
  const teacherNgAssigned = {
    count: ngViolationKeys.length,
    firstKey: ngViolationKeys[0] || null,
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
    teacherNgAssigned,
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
//       「未定」を除いた担当講師数 × dates.length ×
//       min(maxDailyHours, periods.length) と (subjectCounts[s] ×
//       classes.length) を比較 (1 日に教えられる上限は時限数を超えない)
//   - quotaCellMismatch: 1 クラスあたりの科目コマ数の合計が「使う日 × 使う
//       時限」のセル数と不一致。solver は全セル充填を要求するため、合計が
//       セル数未満だと完全解が構造的に存在しない (逆に超過ならクォータを
//       消化しきれない)
//   - subjectQuotaOverDays: 科目コマ数 > 使う日数。同日・同クラスの同一科目
//       は 1 コマまでなので達成不能
//
// 返り値: 各種別 { count, items: [...] }。count = 0 の種別も含めて返す。
export function computeInfeasibilities({ teachers, commonSubjects, currentConfig, maxDailyHours, autoNgByTeacher = null }) {
  const reals = (teachers || []).filter(t => t && t.name && t.name !== '未定');
  const subjects = commonSubjects || [];

  // C1: noTeacherForSlot — 手動NG + 自動NG 両方で candidate を絞る。
  // 自動NG (他学年セッションとの時間重複) も含めないと、全候補講師が
  // 予備校に取られているスロットを『不可能』として警告できない。
  const noTeacherItems = [];
  currentConfig.dates.forEach(d => {
    currentConfig.periods.forEach(p => {
      subjects.forEach(subject => {
        const ngKey = makeNgKey(d.label, p.label);
        const eligible = reals.filter(t => {
          if (!t.subjects?.includes(subject)) return false;
          if (t.ngSlots?.includes(ngKey)) return false;
          if (autoNgByTeacher?.get(t.name)?.has(ngKey)) return false;
          return true;
        });
        if (eligible.length === 0) {
          noTeacherItems.push({ date: d.label, period: p.label, subject });
        }
      });
    });
  });

  // C2: subjectCapacityShortage
  // 1 日に教えられる実上限は「時限数」を超えない (同時限に複数クラスを
  // 持てるのは合同のみ)。maxDailyHours だけを使うと capacity を過大評価し、
  // 実際は不足なのに警告が出ない false negative になる。
  const capacityItems = [];
  const perDayCap = currentConfig.periods.length > 0
    ? Math.min(maxDailyHours, currentConfig.periods.length)
    : maxDailyHours;
  subjects.forEach(subject => {
    const demand = (currentConfig.subjectCounts?.[subject] || 0) * currentConfig.classes.length;
    if (demand === 0) return;
    const eligible = reals.filter(t => t.subjects?.includes(subject));
    const capacity = eligible.length * currentConfig.dates.length * perDayCap;
    if (demand > capacity) {
      capacityItems.push({ subject, demand, capacity, teacherCount: eligible.length });
    }
  });

  // C3: quotaCellMismatch — クォータ合計 ≠ セル数 (クラスあたり)
  const quotaMismatchItems = [];
  const cellsPerClass = currentConfig.dates.length * currentConfig.periods.length;
  const totalQuota = subjects.reduce((sum, s) => sum + (currentConfig.subjectCounts?.[s] || 0), 0);
  if (cellsPerClass > 0 && totalQuota !== cellsPerClass) {
    quotaMismatchItems.push({ totalQuota, cells: cellsPerClass });
  }

  // C4: subjectQuotaOverDays — コマ数 > 日数 (同日重複禁止で達成不能)
  const quotaOverDaysItems = [];
  subjects.forEach(subject => {
    const quota = currentConfig.subjectCounts?.[subject] || 0;
    if (quota > currentConfig.dates.length) {
      quotaOverDaysItems.push({ subject, quota, days: currentConfig.dates.length });
    }
  });

  return {
    noTeacherForSlot: { count: noTeacherItems.length, items: noTeacherItems },
    subjectCapacityShortage: { count: capacityItems.length, items: capacityItems },
    quotaCellMismatch: { count: quotaMismatchItems.length, items: quotaMismatchItems },
    subjectQuotaOverDays: { count: quotaOverDaysItems.length, items: quotaOverDaysItems },
  };
}
