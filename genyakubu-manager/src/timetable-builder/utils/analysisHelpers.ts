// useAnalysis の中身を純粋関数として切り出したもの。React 非依存で
// ユニットテスト可能にし、useAnalysis 側は useMemo の deps を最小化する
// orchestrator に専念させる (D4e + D2a)。

import { makeKey, makeExternalKey, makeNgKey, parseKey, effectiveConfigForTab } from './scheduleKey';
import { computeAutoNgByTeacher } from './autoNg';
import { forEachCountedAssignment } from './tabUsage';
import { resolveTeacherDailyLimit } from '../logic/constraints/teacherConstraints';
import type { AutoNgEntries } from './autoNg';
import type {
  CombinedGroup,
  EffectiveConfig,
  Entity,
  ExternalSession,
  Schedule,
  Tab,
  Teacher,
} from '../types';

/** 日付×講師ごとのコマ数 (current=自タブ, external=外部, total=合計) */
export interface TeacherDailyCount {
  current: number;
  external: number;
  total: number;
}

/** globalUsage の 1 使用箇所 (タブ + 合同グループ) */
export interface UsageRef {
  tabId: number;
  combinedGroupId: number | null;
}

/** `${date}-${period}-${teacher}` → 使用箇所リスト */
export type GlobalUsage = Record<string, UsageRef[]>;

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
export function computeGlobalUsage(
  tabs: Tab[],
  combinedGroups: CombinedGroup[] | null | undefined,
  externalCounts: Record<string, number> | null | undefined,
  externalSessions: ExternalSession[] = [],
  dates: Entity[] = [],
  periods: Entity[] = [],
): { teacherDailyCounts: Record<string, TeacherDailyCount>; globalUsage: GlobalUsage } {
  const teacherDailyCounts: Record<string, TeacherDailyCount> = {};
  const globalUsage: GlobalUsage = {};
  const groups = combinedGroups || [];

  // 詳細セッションが登録されていれば件数として優先採用、
  // 無ければ legacy externalCounts (数値) にフォールバック。
  const sessionCounts: Record<string, number> = {};
  (externalSessions || []).forEach(s => {
    if (!s?.date || !s?.teacherName) return;
    const k = makeExternalKey(s.date, s.teacherName);
    sessionCounts[k] = (sessionCounts[k] || 0) + 1;
  });

  tabs.forEach(tab => {
    // どのセルを 1 コマと数えるか (stale 除外・合同 dedupe) は
    // forEachCountedAssignment (utils/tabUsage.js, F2j) に一元化。
    // ソルバの collectOtherTabsUsage と同じ規則で走査する。
    forEachCountedAssignment({ dates, periods }, tab, groups, '未定',
      ({ entry, dateEnt, periodEnt, group, isCombinedDuplicate }) => {
        const date = dateEnt.label;
        const period = periodEnt.label;

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

  // K2a: その日に builder のセルがまだ 1 つも無い講師の外部コマも entry を
  // 立てる。無いと講師ドロップダウンの (計N) が (計0) になり、solver は
  // 外部負荷で弾くのに UI は選べそうに見える非対称が生じる (最初の 1 コマを
  // 置く瞬間こそ外部負荷の表示が要る)。current=0 で seed し、
  // teacherOverDaily 違反判定は current>0 のみ対象なので違反の挙動は不変。
  const seedExternalOnly = (dayKey: string, ext: number) => {
    if (ext > 0 && !teacherDailyCounts[dayKey]) {
      teacherDailyCounts[dayKey] = { current: 0, external: ext, total: ext };
    }
  };
  Object.entries(sessionCounts).forEach(([k, n]) => seedExternalOnly(k, n));
  Object.entries(externalCounts || {}).forEach(([k, n]) => {
    // externalSessions がある dayKey は詳細セッション優先 (上と同じ規則)
    if (sessionCounts[k] === undefined) seedExternalOnly(k, Number(n) || 0);
  });

  return { teacherDailyCounts, globalUsage };
}

// globalUsage 内の (tabId, combinedGroupId) ペアを 1 回扱いにして、
// 実効的な使用回数を返す。合同グループ内の複数クラスは 1 コマとして
// カウントするため、conflict 判定に使う。
function getEffectiveUsageCount(usages: UsageRef[]): number {
  const seen = new Set<string>();
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
export function computeActiveAnalysis(
  currentConfig: EffectiveConfig,
  currentSchedule: Schedule,
  globalUsage: GlobalUsage,
  teachers: Teacher[] = [],
  autoNgByTeacher: Map<string, AutoNgEntries> | null = null,
) {
  const conflictMap: Record<string, boolean> = {};
  const errorKeys: string[] = [];
  const dailySubjectMap: Record<string, number> = {};
  const subjectOrders: Record<string, number> = {};
  const ngViolationKeys: string[] = [];
  const teachersByName = new Map<string, Teacher>();
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
    const counts: Record<string, number> = {};
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
//   filled: subject が割り当たっている可視セルの個数
//   progress: filled / total を百分率 (整数)。total=0 のとき 0。
// F5x: 「使う日・使う時限」から外れて温存されている非表示セルは filled に
// 数えない (violation 集計・生成・Excel と同じ E-3 絞り込み)。数えると
// 埋めた日をタブの使う日から外しても進捗 % が下がらない。
export function computeDashboard(currentSchedule: Schedule, currentConfig: EffectiveConfig) {
  const total = Object.values(currentConfig.subjectCounts).reduce((a, b) => a + b, 0) * currentConfig.classes.length;
  const dateIds = new Set(currentConfig.dates.map(d => d.id));
  const periodIds = new Set(currentConfig.periods.map(p => p.id));
  const classIds = new Set(currentConfig.classes.map(c => c.id));
  let filled = 0;
  Object.keys(currentSchedule).forEach(k => {
    if (!currentSchedule[k]?.subject) return;
    const parsed = parseKey(k);
    if (!parsed) return;
    if (dateIds.has(parsed.dateId) && periodIds.has(parsed.periodId) && classIds.has(parsed.classId)) {
      filled++;
    }
  });
  return { progress: total > 0 ? Math.round((filled / total) * 100) : 0, filled, total };
}

// 各タブの違反件数 (現タブ内 3 種別合計) を計算する。TabBar の各タブ badge 表示用。
// teacherConflict だけだと popover との整合性が取れないので、subjectDup /
// subjectOver も含めた合計を返す (M3)。
// teacherOverDaily は date × teacher の全タブ集計なので、各タブの badge
// には算入しない (重複表示防止)。
//
// 返り値: { [tabId: number]: count }
export function computeTabViolationCounts({
  tabs,
  globalUsage,
  teachers = [],
  externalSessions = [],
  dates = [],
  periods = [],
}: {
  tabs: Tab[];
  globalUsage: GlobalUsage;
  teachers?: Teacher[];
  externalSessions?: ExternalSession[];
  dates?: Entity[];
  periods?: Entity[];
}): Record<number, number> {
  const result: Record<number, number> = {};
  // v4: dates / periods は project 共通。自動NG は project の periods で計算し、
  // 各タブの実効 config (classes / subjectCounts + 共通 dates / periods) で分析する。
  const autoNgByTeacher = computeAutoNgByTeacher(teachers, externalSessions, periods);
  tabs.forEach(tab => {
    // v4(Y)+E-3: このタブが使う日・使う時限だけで分析する (dates と対称)。
    // periods をプール全体にすると inactive 時限の stale セルまで数え、
    // Toolbar popover (絞った currentConfig で計算) と件数が食い違う。
    const effective = effectiveConfigForTab({ dates, periods }, tab);
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
}: {
  currentConfig: EffectiveConfig;
  currentSchedule: Schedule;
  errorKeys: string[];
  dailySubjectMap: Record<string, number>;
  subjectOrders: Record<string, number>;
  teacherDailyCounts: Record<string, TeacherDailyCount>;
  maxDailyHours: number;
  teachers?: Teacher[];
  ngViolationKeys?: string[];
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
  let subjectDupFirstKey: string | null = null;
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
  let subjectOverFirstKey: string | null = null;
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

  // teacherOverDaily: 1 日上限を超過した (date, teacher) を列挙。
  // makeExternalKey = `${date}-${teacher}`。date label に "-" を含む場合
  // でも teachers のうち末尾一致する name で復元する (M1)。
  // L3a: 上限は講師個別値 (teacher.maxDailyHours) を全体値より優先する。
  const teacherOverItems: Array<{ date: string; teacher: string; total: number; max: number; firstKey: string | null }> = [];
  const teacherNamesByLength = (teachers || []).map(t => t.name).sort((a, b) => b.length - a.length);
  const teacherByName = new Map((teachers || []).map(t => [t.name, t]));
  // 現タブ内で teacher に一致する最初のセルを探す (date 指定は任意)。
  // 他タブの違反でも items に出るが、その場合は null (現タブから飛び先が無い)。
  const findFirstCellOfTeacher = (teacher: string, date: string | null): string | null => {
    for (const d of currentConfig.dates) {
      if (date !== null && d.label !== date) continue;
      for (const p of currentConfig.periods) {
        for (const c of currentConfig.classes) {
          const key = makeKey(d.id, p.id, c.id);
          if (currentSchedule[key]?.teacher === teacher) return key;
        }
      }
    }
    return null;
  };
  // L3b 用: dayKey を講師へ復元しつつ通算 (total / current) を講師別に合算
  const totalsByTeacher: Record<string, { total: number; current: number }> = {};
  Object.entries(teacherDailyCounts).forEach(([dayKey, daily]) => {
    let date = '?';
    let teacher: string | null = null;
    // teachers が渡されたら suffix match (最長 name 優先) で復元
    const match = teacherNamesByLength.find(name => dayKey.endsWith(`-${name}`));
    if (match) {
      teacher = match;
      date = dayKey.slice(0, dayKey.length - match.length - 1);
      const acc = totalsByTeacher[match] || (totalsByTeacher[match] = { total: 0, current: 0 });
      acc.total += daily.total || 0;
      acc.current += daily.current || 0;
    }
    const effMax = resolveTeacherDailyLimit(teacher ? teacherByName.get(teacher) : undefined, maxDailyHours);
    if (daily.total <= effMax) return;
    // 外部コマのみ (builder 割当ゼロ) の日は違反にしない。K2a の seed で
    // entry は立つが、builder 側で解消できない負荷を違反として数えると
    // ノイズになる (従来も entry が無く違反対象外だった挙動を維持)
    if (daily.current === 0) return;
    const firstKey = teacher ? findFirstCellOfTeacher(teacher, date) : null;
    teacherOverItems.push({ date, teacher: teacher ?? dayKey, total: daily.total, max: effMax, firstKey });
  });

  // teacherOverTotal (L3b): 通算 (全タブ + 外部コマ) 上限の超過。builder の
  // 割当が 1 つも無い講師は違反にしない (teacherOverDaily の K2a と同じ規則)。
  const teacherOverTotalItems: Array<{ teacher: string; total: number; max: number; firstKey: string | null }> = [];
  (teachers || []).forEach(t => {
    const limit = t.maxTotalHours;
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return;
    if (t.name === '未定') return;
    const acc = totalsByTeacher[t.name];
    if (!acc || acc.current === 0 || acc.total <= limit) return;
    teacherOverTotalItems.push({
      teacher: t.name,
      total: acc.total,
      max: limit,
      firstKey: findFirstCellOfTeacher(t.name, null),
    });
  });

  return {
    teacherConflict,
    teacherNgAssigned,
    subjectDup: { count: subjectDupCount, firstKey: subjectDupFirstKey },
    subjectOver: { count: subjectOverCount, firstKey: subjectOverFirstKey },
    teacherOverDaily: { count: teacherOverItems.length, items: teacherOverItems },
    teacherOverTotal: { count: teacherOverTotalItems.length, items: teacherOverTotalItems },
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
//       時限 − 空ロックセル」の生成対象セル数と不一致。solver は対象セルの
//       全充填を要求するため、合計がセル数未満だと完全解が構造的に存在しない
//       (逆に超過ならクォータを消化しきれない)。F5w: 空 + ロック済みセルは
//       「空けておく」の意思表示で生成対象外のため除外して数える
//   - subjectQuotaOverDays: 科目コマ数 > 使う日数。同日・同クラスの同一科目
//       は 1 コマまでなので達成不能
//
// 返り値: 各種別 { count, items: [...] }。count = 0 の種別も含めて返す。
export function computeInfeasibilities({
  teachers,
  commonSubjects,
  currentConfig,
  maxDailyHours,
  autoNgByTeacher = null,
  combinedGroups = [],
  currentSchedule = {},
}: {
  teachers: Teacher[] | null | undefined;
  commonSubjects: string[] | null | undefined;
  currentConfig: EffectiveConfig;
  maxDailyHours: number;
  autoNgByTeacher?: Map<string, AutoNgEntries> | null;
  combinedGroups?: CombinedGroup[];
  currentSchedule?: Schedule;
}) {
  const reals = (teachers || []).filter(t => t && t.name && t.name !== '未定');
  const subjects = commonSubjects || [];

  // C1: noTeacherForSlot — 手動NG + 自動NG 両方で candidate を絞る。
  // 自動NG (他学年セッションとの時間重複) も含めないと、全候補講師が
  // 予備校に取られているスロットを『不可能』として警告できない。
  //
  // F2g: クォータを考慮して false positive を抑える。
  //  - クォータ 0 の科目は対象外 (置く必要が無いので「致命」ではない。
  //    担当者ゼロ × クォータ 0 の科目 1 つで dates×periods 件のノイズが
  //    出ていた)
  //  - 担当講師が 1 人も居ない科目は C2 (capacity: 需要 > 0) が科目単位の
  //    1 行で検出するため、C1 では全スロットを列挙しない (重複ノイズ)
  //  - 同日・同クラスの同一科目は 1 コマまでなので、科目が必要とするのは
  //    「置ける日」がクォータ日数分あること。個別スロットがふさがっていても
  //    置ける日数が足りていれば solver は回避できる → 報告しない。
  //    置ける日数 < クォータのときだけ、完全にふさがった日のスロットを列挙
  //    する (そこの NG を解消しない限り構造的に解けない)
  const noTeacherItems: Array<{ date: string; period: string; subject: string }> = [];
  subjects.forEach(subject => {
    const quota = currentConfig.subjectCounts?.[subject] || 0;
    if (quota === 0) return;
    const teaches = reals.filter(t => t.subjects?.includes(subject));
    if (teaches.length === 0) return; // C2 が科目単位で検出済み
    const blockedDays: Array<{ d: Entity; blockedPeriods: Entity[] }> = [];
    let availableDays = 0;
    currentConfig.dates.forEach(d => {
      const blockedPeriods = currentConfig.periods.filter(p => {
        const ngKey = makeNgKey(d.label, p.label);
        return !teaches.some(t =>
          !t.ngSlots?.includes(ngKey) && !autoNgByTeacher?.get(t.name)?.has(ngKey)
        );
      });
      if (currentConfig.periods.length > 0 && blockedPeriods.length === currentConfig.periods.length) {
        blockedDays.push({ d, blockedPeriods });
      } else {
        availableDays++;
      }
    });
    if (availableDays < quota) {
      blockedDays.forEach(({ d, blockedPeriods }) => {
        blockedPeriods.forEach(p => {
          noTeacherItems.push({ date: d.label, period: p.label, subject });
        });
      });
    }
  });

  // C2: subjectCapacityShortage
  // 1 日に教えられる実上限は「時限数」を超えない (同時限に複数クラスを
  // 持てるのは合同のみ)。maxDailyHours だけを使うと capacity を過大評価し、
  // 実際は不足なのに警告が出ない false negative になる。
  const capacityItems: Array<{ subject: string; demand: number; capacity: number; teacherCount: number }> = [];
  // K2d: 実講師 0 名でも「未定」が担当する科目は、solver が未定で埋められる
  // ため致命 (capacity) ではなく情報 (placeholderOnly) として分離する。
  // 「実講師がまだ居ない」事実自体は実運用までに解消すべき有益な情報なので
  // 握りつぶさず、⚠ バッジに数えない informational 種別で出す
  const placeholderOnlyItems: Array<{ subject: string; demand: number }> = [];
  // §M (L3a/L3b): capacity は講師ごとに個別上限を反映して合算する。
  //   - 1 日あたり = min(講師の実効 1 日上限, 時限数)
  //   - 通算 = maxTotalHours があればさらにキャップ (科目横断の配分は
  //     保守的に「この科目単独で使い切れる」前提 = 供給を過大評価しない
  //     方向には倒れないが、過小評価で誤警告もしない)
  // 全体値一律だと個別上限で静的に解けない設定でも警告が沈黙する。
  const teacherCapacity = (t: Teacher): number => {
    const perDay = currentConfig.periods.length > 0
      ? Math.min(resolveTeacherDailyLimit(t, maxDailyHours), currentConfig.periods.length)
      : resolveTeacherDailyLimit(t, maxDailyHours);
    let cap = perDay * currentConfig.dates.length;
    const total = t.maxTotalHours;
    if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
      cap = Math.min(cap, total);
    }
    return cap;
  };
  const classLabels = new Set(currentConfig.classes.map(c => c.label));
  subjects.forEach(subject => {
    // 合同グループ (全日: dates === null) は 1 講師スロットで複数クラスの
    // demand を同時に消化できるため、常時合同のクラス群は 1 クラス相当に
    // 割り引いて数える。これをしないと「常時 2 クラス合同 + 講師 1 名」の
    // 正常な構成が『致命』と誤警告される。日付限定の合同 (dates 指定あり)
    // は保守的に割引しない (警告が出るのは供給不足側に倒れる)。
    let discount = 0;
    (combinedGroups || []).forEach(g => {
      if (g.subject !== subject || g.dates !== null) return;
      const overlap = (g.classes || []).filter(label => classLabels.has(label));
      if (overlap.length >= 2) discount += overlap.length - 1;
    });
    const effectiveClasses = Math.max(1, currentConfig.classes.length - discount);
    const demand = (currentConfig.subjectCounts?.[subject] || 0) * effectiveClasses;
    if (demand === 0) return;
    const eligible = reals.filter(t => t.subjects?.includes(subject));
    const capacity = eligible.reduce((sum, t) => sum + teacherCapacity(t), 0);
    if (demand > capacity) {
      const placeholderTeaches = (teachers || []).some(
        t => t?.name === '未定' && t.subjects?.includes(subject)
      );
      if (eligible.length === 0 && placeholderTeaches) {
        placeholderOnlyItems.push({ subject, demand });
      } else {
        capacityItems.push({ subject, demand, capacity, teacherCount: eligible.length });
      }
    }
  });

  // C3: quotaCellMismatch — クォータ合計 ≠ 生成対象セル数 (クラスあたり)。
  // F5w: 空 + ロック済みセルは生成対象外なので除外。ロック数はクラスごとに
  // 違い得るためクラス単位で判定し、全クラス同値なら従来どおり 1 item に
  // 集約する (ロック無しの共通ケースで item がクラス数分並ぶのを防ぐ)。
  const quotaMismatchItems: Array<{ totalQuota: number; cells: number; className?: string; lockedEmpty?: number }> = [];
  const cellsPerClass = currentConfig.dates.length * currentConfig.periods.length;
  const totalQuota = subjects.reduce((sum, s) => sum + (currentConfig.subjectCounts?.[s] || 0), 0);
  if (cellsPerClass > 0) {
    const perClass = currentConfig.classes.map(c => {
      let lockedEmpty = 0;
      currentConfig.dates.forEach(d => currentConfig.periods.forEach(p => {
        const e = currentSchedule?.[makeKey(d.id, p.id, c.id)];
        if (e?.locked && !e.subject) lockedEmpty++;
      }));
      return { className: c.label, cells: cellsPerClass - lockedEmpty, lockedEmpty };
    });
    const mismatched = perClass.filter(pc => totalQuota !== pc.cells);
    if (mismatched.length > 0) {
      const allSame = perClass.every(pc => pc.cells === perClass[0].cells);
      if (allSame) {
        const { cells, lockedEmpty } = perClass[0];
        quotaMismatchItems.push({ totalQuota, cells, ...(lockedEmpty > 0 ? { lockedEmpty } : {}) });
      } else {
        mismatched.forEach(pc => {
          quotaMismatchItems.push({
            totalQuota,
            cells: pc.cells,
            className: pc.className,
            ...(pc.lockedEmpty > 0 ? { lockedEmpty: pc.lockedEmpty } : {}),
          });
        });
      }
    }
  }

  // C4: subjectQuotaOverDays — コマ数 > 日数 (同日重複禁止で達成不能)
  const quotaOverDaysItems: Array<{ subject: string; quota: number; days: number }> = [];
  subjects.forEach(subject => {
    const quota = currentConfig.subjectCounts?.[subject] || 0;
    if (quota > currentConfig.dates.length) {
      quotaOverDaysItems.push({ subject, quota, days: currentConfig.dates.length });
    }
  });

  return {
    noTeacherForSlot: { count: noTeacherItems.length, items: noTeacherItems },
    subjectCapacityShortage: { count: capacityItems.length, items: capacityItems },
    subjectPlaceholderOnly: { count: placeholderOnlyItems.length, items: placeholderOnlyItems },
    quotaCellMismatch: { count: quotaMismatchItems.length, items: quotaMismatchItems },
    subjectQuotaOverDays: { count: quotaOverDaysItems.length, items: quotaOverDaysItems },
  };
}
