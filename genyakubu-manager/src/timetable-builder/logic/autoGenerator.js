// 自動生成ロジック（MRV法 + バックトラッキング）
// 純粋関数として抽出。UI依存なし。
//
// v3 スキーマ: config.dates/periods/classes は { id, label } の配列。
// スケジュールキーは ID ベース。ラベルが必要な関数 (NG slot / combined group /
// externalCounts) には label を渡す。
import { makeKey, makeExternalKey, parseKey, findCombinedGroup, activeDatesForTab, activePeriodsForTab } from '../utils/scheduleKey';
import { computeAutoNgByTeacher } from '../utils/autoNg';
import {
  canTeachSubject,
  isNgSlot,
  isNgClass,
  isTeacherCandidateFor,
  wouldExceedDailyLimit,
  wouldExceedConsecutive,
} from './constraints/teacherConstraints';
import {
  hasSubjectInSameDayClass,
  hasSubjectInSameDayClassExcept,
  hasTeacherInSamePeriod,
  hasSubjectQuotaRemaining,
} from './constraints/scheduleConstraints';
import {
  DEFAULT_MAX_DAILY_HOURS as CONST_DEFAULT_MAX_DAILY_HOURS,
  DEFAULT_MAX_ITERATIONS as CONST_DEFAULT_MAX_ITERATIONS,
  DEFAULT_NUM_PATTERNS as CONST_DEFAULT_NUM_PATTERNS,
} from '../utils/constants';

// シード付き疑似乱数生成器 (Mulberry32)
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// シード付きシャッフル（Fisher-Yates）
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// solver の探索上限のデフォルト。project.maxIterations で上書き可。
const MAX_ITERATIONS = CONST_DEFAULT_MAX_ITERATIONS;

// 講師 1 人あたりの 1 日コマ数上限のデフォルト。
// externalCounts/externalSessions (ツール外: 予備校・高校等) + 他タブの
// 確定割当 (H2 で自動集計) + 当該タブの割当 + 既存セルの合計がこの値を
// 超える講師は候補から外す。project.maxDailyHours で上書き可。
// 注意: 他タブ分は自動集計されるため externalCounts に手入力しないこと
// (二重計上になり、解ける構成でも部分解に劣化する)。
const DEFAULT_MAX_DAILY_HOURS = CONST_DEFAULT_MAX_DAILY_HOURS;

// 講師の名前のうち daily 上限の対象外とするもの (placeholder)。
const DAILY_LIMIT_EXEMPT_TEACHER = '未定';

// 進捗コールバックの間引き間隔 (solve 呼び出し回数)。頻度が高すぎると
// postMessage / setState が溢れるので、この回数ごとに 1 回だけ通知する。
const PROGRESS_INTERVAL = 20000;

// 1 回のリスタートに割り当てる探索回数の下限 (P1)。バックトラック探索の
// 実行時間は heavy-tailed で、探索順の運が悪いと上限まで粘っても解けない
// 一方、別の順序なら数万回で解けることが多い。maxIterations を 1 本の DFS で
// 使い切るより、この間隔でシードを変えて仕切り直す方が完全解率・速度とも良い
// (実測: デフォルトデータの 50 万回一本勝負は 3 案中 2 案が部分解、
//  シード次第では 5 万回程度で完全解が出ていた)。
const RESTART_INTERVAL = 60000;

// maxIterations をおよそ何本の run に分割するか。リスタート間隔を
// max(RESTART_INTERVAL, maxIterations / RESTART_FRACTION) にすることで、
// ユーザが設定 UI で「探索回数の上限」を引き上げたとき 1 本の DFS の深さも
// 比例して伸びる (固定間隔だと上限を上げてもリスタート回数が増えるだけで
// 深さが変わらず、設定の意味が変質してしまう)。
const RESTART_FRACTION = 8;

// 他タブ (他学年) の確定割当を集計する (H2)。
// - busy: 同日・同時限に他タブで授業を持つ講師 (物理的に兼務不可)
// - daily: 講師の日次コマ数 (1 日上限の基準に合算する)
// dates / periods の ID は project 共通プールなのでタブをまたいでそのまま
// 比較できる。classes はタブ固有。そのタブが使わない日・時限や削除済み
// クラスに残る stale セルは数えない。合同グループは 1 コマとして dedupe。
// なお externalCounts / externalSessions は「このツールの外」(予備校・高校
// 等) の負荷で、ここで数える他タブ分とは別枠。
function collectOtherTabsUsage(project, activeTabId, combinedGroups, exemptName) {
  const busy = new Set();   // `${dateId}|${periodId}|${teacher}`
  const daily = {};         // makeExternalKey(dateLabel, teacher) → count
  (project.tabs || []).forEach(tab => {
    if (tab.id === activeTabId) return;
    const tabDates = new Map(activeDatesForTab(project.dates, tab).map(d => [d.id, d]));
    const tabPeriodIds = new Set(activePeriodsForTab(project.periods, tab).map(p => p.id));
    const classById = new Map((tab.config?.classes || []).map(c => [c.id, c]));
    const seenCombined = new Set();
    Object.entries(tab.schedule || {}).forEach(([key, entry]) => {
      if (!entry?.teacher || entry.teacher === exemptName) return;
      const parsed = parseKey(key);
      if (!parsed) return;
      const d = tabDates.get(parsed.dateId);
      const cls = classById.get(parsed.classId);
      if (!d || !cls || !tabPeriodIds.has(parsed.periodId)) return; // stale セル
      busy.add(`${parsed.dateId}|${parsed.periodId}|${entry.teacher}`);
      const group = findCombinedGroup(combinedGroups, entry.subject, cls.label, d.label);
      if (group) {
        const tk = `${parsed.dateId}-${parsed.periodId}-${group.id}-${entry.teacher}`;
        if (seenCombined.has(tk)) return;
        seenCombined.add(tk);
      }
      const dayKey = makeExternalKey(d.label, entry.teacher);
      daily[dayKey] = (daily[dayKey] || 0) + 1;
    });
  });
  return { busy, daily };
}

/**
 * 単一パターンを生成する（シード指定可能）
 * @param {object} args
 * @param {(p: { iterations: number, filledCount: number, totalSlots: number }) => void} [args.onProgress]
 *   探索の途中経過を間引いて通知する (E2f live progress)。省略可。
 * @returns {{ solution: object|null, bestPartial: object, filledCount: number, totalSlots: number, iterations: number, hitLimit: boolean, stuckSlot: object|null }}
 */
export function generateSinglePattern({ project, activeTabId, seed = 0, onProgress, restartInterval = null }) {
  const activeTab = project.tabs.find(t => t.id === activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  // v4(Y)+E-3: dates も periods も『このタブが使う分』に絞る (useProject の
  // currentConfig と同じ)。periods をプール全体にすると、タブが使わない時限
  // まで未充填スロット化され、科目クォータは可視セル数前提なので完全解が
  // 構造的に不可能になる (上限まで探索して部分解 + 不可視セルへのゴミ書込)。
  const currentConfig = {
    ...activeTab.config,
    dates: activeDatesForTab(project.dates, activeTab),
    periods: activePeriodsForTab(project.periods, activeTab),
  };
  const commonSubjects = Object.keys(currentConfig.subjectCounts);
  const combinedGroups = project.combinedGroups || [];
  const maxDailyHours = project.maxDailyHours ?? DEFAULT_MAX_DAILY_HOURS;
  const maxIterations = project.maxIterations ?? MAX_ITERATIONS;
  // リスタート間隔: 明示指定 (テスト用) が無ければ maxIterations に比例。
  const runInterval = restartInterval ?? Math.max(RESTART_INTERVAL, Math.ceil(maxIterations / RESTART_FRACTION));
  // 連続コマ数上限 (E2c)。0 = 制限なし。
  const maxConsecutive = project.maxConsecutivePeriods ?? 0;

  // 自動NG (他学年セッションと時限の時間重複から派生) を pre-compute。
  // solver の NG 判定でも手動NGと同等に扱う。
  const autoNgByTeacher = computeAutoNgByTeacher(
    project.teachers,
    project.externalSessions || [],
    currentConfig.periods,
  );

  // H2: 他タブの確定割当 (同時限 busy + 日次コマ数)
  const otherTabs = collectOtherTabsUsage(project, activeTab.id, combinedGroups, DAILY_LIMIT_EXEMPT_TEACHER);

  // E2c 連続コマ判定用 (F5t/F5y)。判定はプール全時限の並びで行う
  // (タブの使う時限だけだと歯抜け [1限,3限] が隣接扱いになり、実際は休憩を
  // 挟むのに連続と誤判定する)。自タブの占有は使う時限のセルのみ
  // (非表示時限の温存セルは実勢ではない)、他タブの確定割当は busy から見る。
  const poolPeriods = project.periods || [];
  const activePeriodIdSet = new Set(currentConfig.periods.map(p => p.id));

  const slots = [];
  const currentCounts = {};
  currentConfig.classes.forEach((c, cIdx) => {
    currentCounts[cIdx] = {};
    commonSubjects.forEach(s => currentCounts[cIdx][s] = 0);
  });

  // 既存の科目カウントを集計
  currentConfig.dates.forEach((d) => {
    currentConfig.periods.forEach((p) => {
      currentConfig.classes.forEach((c, cIdx) => {
        const k = makeKey(d.id, p.id, c.id);
        const e = currentSchedule[k];
        if (e?.subject) {
          if (currentCounts[cIdx]) currentCounts[cIdx][e.subject] = (currentCounts[cIdx][e.subject] || 0) + 1;
        }
      });
    });
  });

  // 講師の日別コマ数を pre-seed:
  //   1. project.externalCounts / externalSessions (ツール外: 予備校・高校等)
  //   2. 他タブ (他学年) の確定割当 (otherTabs.daily、H2 で自動集計)
  //   3. 既存スケジュールの確定割当 (合同グループ重複は 1 カウント、未定は除外)
  // ここで作った initialDaily を solve に渡し、上限チェックの基準とする。
  // 1 と 2 は別枠 — 他タブ分を externalCounts に手入力すると二重計上になる。
  const initialDaily = {};
  // 詳細セッション (externalSessions) が登録されていれば件数として優先採用、
  // 無ければ legacy externalCounts。分析側 computeGlobalUsage と同じ規則に
  // 揃える (M5: 従来は externalCounts しか見ておらず、セッション詳細だけ
  // 登録する運用だと日次上限がすり抜けて生成直後に違反表示になっていた)。
  const externalCounts = project.externalCounts || {};
  const sessionCounts = {};
  (project.externalSessions || []).forEach(s => {
    if (!s?.date || !s?.teacherName) return;
    const k = makeExternalKey(s.date, s.teacherName);
    sessionCounts[k] = (sessionCounts[k] || 0) + 1;
  });
  new Set([...Object.keys(externalCounts), ...Object.keys(sessionCounts)]).forEach(k => {
    const v = sessionCounts[k] !== undefined ? sessionCounts[k] : (externalCounts[k] || 0);
    if (v > 0) initialDaily[k] = v;
  });
  // H2: 他タブ (他学年) の確定割当も日次上限の基準に合算する
  Object.keys(otherTabs.daily).forEach(k => {
    initialDaily[k] = (initialDaily[k] || 0) + otherTabs.daily[k];
  });

  const seenCombinedDay = new Set();
  currentConfig.dates.forEach((d) => {
    currentConfig.periods.forEach((p) => {
      currentConfig.classes.forEach((c) => {
        const k = makeKey(d.id, p.id, c.id);
        const entry = currentSchedule[k];
        if (!entry?.teacher || entry.teacher === DAILY_LIMIT_EXEMPT_TEACHER) return;

        const group = findCombinedGroup(combinedGroups, entry.subject, c.label, d.label);
        if (group) {
          const tk = `${d.id}-${p.id}-${group.id}-${entry.teacher}`;
          if (seenCombinedDay.has(tk)) return;
          seenCombinedDay.add(tk);
        }

        const dayKey = makeExternalKey(d.label, entry.teacher);
        initialDaily[dayKey] = (initialDaily[dayKey] || 0) + 1;
      });
    });
  });

  // 未充填スロットを構築
  // slot には d/p/c の entity ({id, label}) と cIdx (tempCnt index) を保持。
  currentConfig.dates.forEach((d) => currentConfig.periods.forEach((p) => currentConfig.classes.forEach((c, cIdx) => {
    const k = makeKey(d.id, p.id, c.id);
    const entry = currentSchedule[k];
    if (!entry || !entry.subject || !entry.teacher) {
      slots.push({ cIdx, d, p, c, k, fixedSubject: entry?.subject });
    }
  })));

  const totalSlots = slots.length;

  // MRV: 候補者が少ないコマから優先（シード付きランダムでタイブレーク）
  slots.forEach(slot => {
    let validCandidates = 0;
    const subjectsToCheck = slot.fixedSubject ? [slot.fixedSubject] : commonSubjects;
    subjectsToCheck.forEach(subj => {
      project.teachers.forEach(t => {
        const autoEntries = autoNgByTeacher.get(t.name);
        if (canTeachSubject(t, subj) && !isNgSlot(t, slot.d.label, slot.p.label, autoEntries) && !isNgClass(t, slot.c.label)) {
          validCandidates++;
        }
      });
    });
    slot.score = validCandidates;
  });

  // ここから下はリスタート 1 回分の探索 (P1)。
  // - スロット順の MRV タイブレークと科目/講師のシャッフルはリスタート
  //   ごとの rng で引き直す (= 毎回別の探索順を試す)
  // - solution / bestPartial / 詰まり位置はリスタート横断で集約する
  const seedGen = mulberry32(seed);
  let solution = null;
  let bestPartial = null;
  let bestFilledCount = -1;
  let bestStuckSlot = null; // bestFilledCount を出した run の詰まりスロット
  let totalIter = 0;

  const runOnce = (budget) => {
    const rng = mulberry32(Math.floor(seedGen() * 0x7fffffff));
    const runSlots = slots
      .map(s => ({ ...s, tieBreaker: rng() }))
      .sort((a, b) => (a.score === b.score ? a.tieBreaker - b.tieBreaker : a.score - b.score));

    let runSolution = null;
    let runBestPartial = null;
    let runBestFilled = -1;
    const iter = { c: 0 };

    const solve = (idx, tempSch, tempCnt, tempDaily) => {
      if (iter.c++ > budget || runSolution !== null) return;

      // 部分解の更新（現在の充填度が最高なら保存）
      if (idx > runBestFilled) {
        runBestFilled = idx;
        runBestPartial = JSON.parse(JSON.stringify(tempSch));
      }

      // 探索の途中経過を間引いて通知 (E2f)。リスタート横断の累計を出す。
      if (onProgress && iter.c % PROGRESS_INTERVAL === 0) {
        onProgress({
          iterations: totalIter + iter.c,
          filledCount: Math.max(bestFilledCount, runBestFilled),
          totalSlots,
        });
      }

      if (idx >= runSlots.length) {
        runSolution = JSON.parse(JSON.stringify(tempSch));
        return;
      }

      const { cIdx, d, p, c, k, fixedSubject } = runSlots[idx];

      // 合同グループの伝播により既に充填されている場合はスキップ
      if (tempSch[k]?.subject && tempSch[k]?.teacher) {
        solve(idx + 1, tempSch, tempCnt, tempDaily);
        return;
      }

      const subjectsToTry = fixedSubject ? [fixedSubject] : seededShuffle(commonSubjects, rng);

      for (const s of subjectsToTry) {
        if (!fixedSubject && !hasSubjectQuotaRemaining(tempCnt, cIdx, s, currentConfig.subjectCounts)) continue;
        // 同日・同クラスに同じ科目があるかチェック
        if (!fixedSubject && hasSubjectInSameDayClass(tempSch, currentConfig.periods, d.id, c.id, s)) continue;

        // 合同グループチェック (label ベース)
        const group = findCombinedGroup(combinedGroups, s, c.label, d.label);
        let secondarySlots = [];
        let canUseCombined = true;
        // 合同の別クラスに既に入っている講師 (居れば primary も必ず同じ講師)。
        // これを見ないと「合同授業なのに 2 講師に分裂」した案が生成される (M7)。
        let groupTeacher = null;

        if (group) {
          for (const otherClassLabel of group.classes) {
            if (otherClassLabel === c.label) continue;
            const otherCIdx = currentConfig.classes.findIndex(cc => cc.label === otherClassLabel);
            if (otherCIdx < 0) continue;
            const otherClassEntity = currentConfig.classes[otherCIdx];
            const otherKey = makeKey(d.id, p.id, otherClassEntity.id);
            const otherEntry = tempSch[otherKey];

            // ロックされていて別の科目が入っている場合は不可
            if (otherEntry?.locked && otherEntry.subject !== s) {
              canUseCombined = false;
              break;
            }
            // 別の科目が既に入っている場合は不可
            if (otherEntry?.subject && otherEntry.subject !== s) {
              canUseCombined = false;
              break;
            }
            // 同じ科目で講師が確定済みのセル: primary もその講師に固定する。
            // 既に別々の講師が入っている (壊れた既存データ) 場合は合同不可。
            if (otherEntry?.subject === s && otherEntry?.teacher && otherEntry.teacher !== DAILY_LIMIT_EXEMPT_TEACHER) {
              if (groupTeacher && groupTeacher !== otherEntry.teacher) {
                canUseCombined = false;
                break;
              }
              groupTeacher = otherEntry.teacher;
            }
            // 科目枠が残っていない場合は不可
            if (!otherEntry?.subject && !hasSubjectQuotaRemaining(tempCnt, otherCIdx, s, currentConfig.subjectCounts)) {
              canUseCombined = false;
              break;
            }
            // 同日・同クラスに同じ科目が既にある場合は不可 (今コマは除外)
            if (!otherEntry?.subject && hasSubjectInSameDayClassExcept(tempSch, currentConfig.periods, d.id, otherClassEntity.id, s, p.id)) {
              canUseCombined = false;
              break;
            }

            // 未充填のセカンダリスロットを収集（元の状態を保存）
            if (!otherEntry?.subject || !otherEntry?.teacher) {
              const hadSubject = !!otherEntry?.subject;
              secondarySlots.push({
                cIdx: otherCIdx,
                key: otherKey,
                className: otherClassLabel,
                hadSubject,
                original: otherEntry ? { ...otherEntry } : null,
              });
            }
          }

          if (!canUseCombined) continue;
        }

        // 有効な講師を検索 (subject 担当・NG slot/class・合同セカンダリ NG class)
        const secondaryClassNames = group ? secondarySlots.map(ss => ss.className) : [];
        const validT = project.teachers.filter(t =>
          isTeacherCandidateFor({
            teacher: t,
            subject: s,
            date: d.label,
            period: p.label,
            className: c.label,
            secondaryClassNames,
            autoNgEntries: autoNgByTeacher.get(t.name),
          })
        );

        const priorityGroup = [];
        const neutralGroup = [];
        validT.forEach(t => {
          if (t.priorityClasses?.includes(c.label)) priorityGroup.push(t);
          else neutralGroup.push(t);
        });

        let shuffledT = [
          ...seededShuffle(priorityGroup, rng),
          ...seededShuffle(neutralGroup, rng)
        ];
        // 合同の別クラスに講師が確定済みなら、その講師以外は候補にしない
        if (groupTeacher) {
          shuffledT = shuffledT.filter(t => t.name === groupTeacher);
        }

        // 合同グループのクラス ID リスト (hasTeacherInSamePeriod の除外用)
        const combinedClassIds = group
          ? group.classes
              .map(gcLabel => currentConfig.classes.find(cc => cc.label === gcLabel)?.id)
              .filter(id => id != null)
          : [];

        for (const tObj of shuffledT) {
          const tName = tObj.name;
          const dayKey = makeExternalKey(d.label, tName);
          const isRealTeacher = tName !== DAILY_LIMIT_EXEMPT_TEACHER;
          // この合同スロットは既存 secondary セル由来で initialDaily に
          // カウント済み (合同は 1 コマ扱い) なので、日次は二重計上しない
          const groupAlreadyCounted = groupTeacher != null && groupTeacher === tName;
          const countsTowardDaily = isRealTeacher && !groupAlreadyCounted;

          // 同日同時限の他クラスに同じ講師がいるかチェック (合同グループ内は
          // 除外)。"未定" は placeholder なので同時限に複数クラス置けてよい
          // (M6: 分析側も未定を conflict 対象外にしている)。
          if (isRealTeacher && hasTeacherInSamePeriod(tempSch, currentConfig.classes, d.id, p.id, c.id, tName, combinedClassIds)) continue;

          // H2: 他タブ (他学年) の同日同時限に既に入っている講師は物理的に
          // 兼務できないので除外 ("未定" は placeholder なので対象外)
          if (isRealTeacher && otherTabs.busy.has(`${d.id}|${p.id}|${tName}`)) continue;

          // 1日あたりのコマ数上限チェック (externalCounts + 既存割当 + 今回のスロット)
          // 合同グループでも 1 コマとしてカウント (下の increment と整合)。
          // カウント済みの合同スロット (groupAlreadyCounted) は +1 しないので
          // 上限チェックも掛けない
          if (countsTowardDaily && wouldExceedDailyLimit({
            teacherName: tName, date: d.label, tempDaily, maxDailyHours,
            exemptName: DAILY_LIMIT_EXEMPT_TEACHER,
          })) continue;

          // 連続コマ数上限チェック (E2c)。"未定" は対象外。
          // F5y: プール全時限の並びで判定 (歯抜けタブの誤隣接を防ぐ)。
          // F5t: 他タブ (他学年) の確定割当も連続ランに含める (busy /
          // 日次上限は他タブを合算するのに連続だけ見ないと学年横断で
          // 上限超えの連続が生成される)。
          if (isRealTeacher && wouldExceedConsecutive({
            periodsOrder: poolPeriods,
            periodId: p.id,
            isOccupied: (pid) =>
              (activePeriodIdSet.has(pid) && currentConfig.classes.some(
                cc => tempSch[makeKey(d.id, pid, cc.id)]?.teacher === tName,
              ))
              || otherTabs.busy.has(`${d.id}|${pid}|${tName}`),
            maxConsecutive,
          })) continue;

          // プライマリスロットを割り当て (locked フラグは既存の値を保持する。
          // 「科目だけ事前指定 + ロック」のセルを solver が埋める際に lock が
          // 落ちないようにする)
          const primaryLocked = tempSch[k]?.locked;
          tempSch[k] = { subject: s, teacher: tName, ...(primaryLocked ? { locked: true } : {}) };
          if (!fixedSubject) tempCnt[cIdx][s]++;
          if (countsTowardDaily) {
            if (!tempDaily[dayKey]) tempDaily[dayKey] = 0;
            tempDaily[dayKey]++; // 合同でも1コマとしてカウント
          }

          // セカンダリスロットを割り当て（locked 保持、既存科目は二重カウントしない）
          secondarySlots.forEach(ss => {
            const locked = tempSch[ss.key]?.locked;
            tempSch[ss.key] = { subject: s, teacher: tName, ...(locked ? { locked: true } : {}) };
            if (!ss.hadSubject && tempCnt[ss.cIdx]) {
              tempCnt[ss.cIdx][s] = (tempCnt[ss.cIdx][s] || 0) + 1;
            }
          });

          solve(idx + 1, tempSch, tempCnt, tempDaily);
          if (runSolution !== null) return;

          // バックトラック: プライマリスロット (locked 保持)
          if (fixedSubject) {
            tempSch[k] = { subject: fixedSubject, teacher: "", ...(primaryLocked ? { locked: true } : {}) };
          } else if (primaryLocked) {
            // 元が空 + locked のセル: 空に戻すが lock は保持
            tempSch[k] = { locked: true };
            tempCnt[cIdx][s]--;
          } else {
            delete tempSch[k];
            tempCnt[cIdx][s]--;
          }
          if (countsTowardDaily) tempDaily[dayKey]--;

          // バックトラック: セカンダリスロット（元の状態に復元）
          secondarySlots.forEach(ss => {
            if (ss.original) {
              tempSch[ss.key] = { ...ss.original };
            } else {
              delete tempSch[ss.key];
            }
            if (!ss.hadSubject && tempCnt[ss.cIdx]) {
              tempCnt[ss.cIdx][s]--;
            }
          });
        }
      }
    };

    solve(0, JSON.parse(JSON.stringify(currentSchedule)), JSON.parse(JSON.stringify(currentCounts)), { ...initialDaily });

    // この run で最初に埋められなかったコマ (= 詰まり位置)。runBestFilled は
    // 到達した最大 idx なので runSlots[runBestFilled] が次に埋めるべきコマ。
    // 範囲外 (= 全埋まり) は null。
    const stuck = runSolution === null && runBestFilled >= 0 && runBestFilled < runSlots.length
      ? runSlots[runBestFilled]
      : null;
    return {
      runSolution,
      runBestPartial,
      runBestFilled,
      iterUsed: iter.c,
      hitBudget: iter.c > budget,
      stuck,
    };
  };

  while (solution === null && totalIter < maxIterations) {
    const budget = Math.min(runInterval, maxIterations - totalIter);
    const r = runOnce(budget);
    totalIter += r.iterUsed;
    if (r.runBestFilled > bestFilledCount) {
      bestFilledCount = r.runBestFilled;
      bestPartial = r.runBestPartial;
      bestStuckSlot = r.stuck;
    }
    if (r.runSolution) {
      solution = r.runSolution;
      break;
    }
    // budget 内で探索空間を使い切った (= 順序を変えても結果は同じ) 場合は
    // リスタートしても無駄なので打ち切る (解なし問題での空回り防止)
    if (!r.hitBudget) break;
  }

  const stuckSlot = solution === null && bestStuckSlot
    ? { date: bestStuckSlot.d.label, period: bestStuckSlot.p.label, class: bestStuckSlot.c.label }
    : null;

  return {
    solution,
    bestPartial,
    filledCount: bestFilledCount,
    totalSlots,
    // E2f: 生成の手応えを UI に出すための統計 (リスタート横断の累計)
    iterations: totalIter,
    hitLimit: solution === null && totalIter > maxIterations,
    stuckSlot,
  };
}

/**
 * 複数パターンを生成する（後方互換のためのラッパー）
 * onProgress コールバックで進捗を通知可能
 */
export function generateSchedule({ project, activeTabId, numPatterns = CONST_DEFAULT_NUM_PATTERNS }) {
  const results = [];
  const baseSeed = Date.now();

  for (let i = 0; i < numPatterns; i++) {
    const seed = baseSeed + i * 7919; // 素数でオフセットして多様性を確保
    const result = generateSinglePattern({ project, activeTabId, seed });
    results.push(result);
  }

  return results;
}
