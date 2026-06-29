// 自動生成ロジック（MRV法 + バックトラッキング）
// 純粋関数として抽出。UI依存なし。
//
// v3 スキーマ: config.dates/periods/classes は { id, label } の配列。
// スケジュールキーは ID ベース。ラベルが必要な関数 (NG slot / combined group /
// externalCounts) には label を渡す。
import { makeKey, makeExternalKey, findCombinedGroup, activeDatesForTab } from '../utils/scheduleKey';
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
// externalCounts (他タブ・他学年での既存コマ数) + 当該タブの割当 + 既存セル
// の合計がこの値を超える講師は候補から外す。
// project.maxDailyHours で上書き可。
const DEFAULT_MAX_DAILY_HOURS = CONST_DEFAULT_MAX_DAILY_HOURS;

// 講師の名前のうち daily 上限の対象外とするもの (placeholder)。
const DAILY_LIMIT_EXEMPT_TEACHER = '未定';

// 進捗コールバックの間引き間隔 (solve 呼び出し回数)。頻度が高すぎると
// postMessage / setState が溢れるので、この回数ごとに 1 回だけ通知する。
const PROGRESS_INTERVAL = 20000;

/**
 * 単一パターンを生成する（シード指定可能）
 * @param {object} args
 * @param {(p: { iterations: number, filledCount: number, totalSlots: number }) => void} [args.onProgress]
 *   探索の途中経過を間引いて通知する (E2f live progress)。省略可。
 * @returns {{ solution: object|null, bestPartial: object, filledCount: number, totalSlots: number, iterations: number, hitLimit: boolean, stuckSlot: object|null }}
 */
export function generateSinglePattern({ project, activeTabId, seed = 0, onProgress }) {
  const rng = mulberry32(seed);
  const activeTab = project.tabs.find(t => t.id === activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  // v4(Y): periods は project 共通、dates は『このタブが使う日』(activeDateIds)。
  const currentConfig = {
    ...activeTab.config,
    dates: activeDatesForTab(project.dates, activeTab),
    periods: project.periods || [],
  };
  const commonSubjects = Object.keys(currentConfig.subjectCounts);
  const combinedGroups = project.combinedGroups || [];
  const maxDailyHours = project.maxDailyHours ?? DEFAULT_MAX_DAILY_HOURS;
  const maxIterations = project.maxIterations ?? MAX_ITERATIONS;
  // 連続コマ数上限 (E2c)。0 = 制限なし。
  const maxConsecutive = project.maxConsecutivePeriods ?? 0;

  // 自動NG (他学年セッションと時限の時間重複から派生) を pre-compute。
  // solver の NG 判定でも手動NGと同等に扱う。
  const autoNgByTeacher = computeAutoNgByTeacher(
    project.teachers,
    project.externalSessions || [],
    currentConfig.periods,
  );

  let solution = null;
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
  //   1. project.externalCounts (他タブ・他学年などの外部コマ) を加算
  //   2. 既存スケジュールの確定割当 (合同グループ重複は 1 カウント、未定は除外)
  // ここで作った initialDaily を solve に渡し、上限チェックの基準とする。
  const initialDaily = {};
  const externalCounts = project.externalCounts || {};
  Object.keys(externalCounts).forEach(k => {
    const v = externalCounts[k] || 0;
    if (v > 0) initialDaily[k] = v;
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
    slot.tieBreaker = rng();
  });

  slots.sort((a, b) => {
    if (a.score === b.score) return a.tieBreaker - b.tieBreaker;
    return a.score - b.score;
  });

  // 部分解の追跡
  let bestPartial = null;
  let bestFilledCount = -1;

  const solve = (idx, tempSch, tempCnt, tempDaily, iter = { c: 0 }) => {
    if (iter.c++ > maxIterations || solution !== null) return;

    // 部分解の更新（現在の充填度が最高なら保存）
    if (idx > bestFilledCount) {
      bestFilledCount = idx;
      bestPartial = JSON.parse(JSON.stringify(tempSch));
    }

    // 探索の途中経過を間引いて通知 (E2f)。bestFilledCount 更新後に出す。
    if (onProgress && iter.c % PROGRESS_INTERVAL === 0) {
      onProgress({ iterations: iter.c, filledCount: bestFilledCount, totalSlots });
    }

    if (idx >= slots.length) {
      solution = JSON.parse(JSON.stringify(tempSch));
      return;
    }

    const { cIdx, d, p, c, k, fixedSubject } = slots[idx];

    // 合同グループの伝播により既に充填されている場合はスキップ
    if (tempSch[k]?.subject && tempSch[k]?.teacher) {
      solve(idx + 1, tempSch, tempCnt, tempDaily, iter);
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

      const shuffledT = [
        ...seededShuffle(priorityGroup, rng),
        ...seededShuffle(neutralGroup, rng)
      ];

      // 合同グループのクラス ID リスト (hasTeacherInSamePeriod の除外用)
      const combinedClassIds = group
        ? group.classes
            .map(gcLabel => currentConfig.classes.find(cc => cc.label === gcLabel)?.id)
            .filter(id => id != null)
        : [];

      for (const tObj of shuffledT) {
        const tName = tObj.name;
        const dayKey = makeExternalKey(d.label, tName);
        const countsTowardDaily = tName !== DAILY_LIMIT_EXEMPT_TEACHER;

        // 同日同時限の他クラスに同じ講師がいるかチェック (合同グループ内は除外)
        if (hasTeacherInSamePeriod(tempSch, currentConfig.classes, d.id, p.id, c.id, tName, combinedClassIds)) continue;

        // 1日あたりのコマ数上限チェック (externalCounts + 既存割当 + 今回のスロット)
        // 合同グループでも 1 コマとしてカウント (下の increment と整合)
        if (wouldExceedDailyLimit({
          teacherName: tName, date: d.label, tempDaily, maxDailyHours,
          exemptName: DAILY_LIMIT_EXEMPT_TEACHER,
        })) continue;

        // 連続コマ数上限チェック (E2c)。"未定" は対象外。
        if (countsTowardDaily && wouldExceedConsecutive({
          periodsOrder: currentConfig.periods,
          periodId: p.id,
          isOccupied: (pid) => currentConfig.classes.some(
            cc => tempSch[makeKey(d.id, pid, cc.id)]?.teacher === tName,
          ),
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

        solve(idx + 1, tempSch, tempCnt, tempDaily, iter);
        if (solution !== null) return;

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

  // iter を外で確保して solve 後に探索回数 (backtrack の規模) を読めるようにする (E2f)
  const iter = { c: 0 };
  solve(0, JSON.parse(JSON.stringify(currentSchedule)), JSON.parse(JSON.stringify(currentCounts)), { ...initialDaily }, iter);

  // 完全解が出なかった場合、MRV 順で最初に埋められなかったコマ (= 詰まり位置)。
  // bestFilledCount は到達した最大 idx なので slots[bestFilledCount] が次に
  // 埋めるべきコマ。範囲外 (= 全埋まり) は null。
  const stuckSlotRaw = solution === null && bestFilledCount >= 0 && bestFilledCount < slots.length
    ? slots[bestFilledCount]
    : null;
  const stuckSlot = stuckSlotRaw
    ? { date: stuckSlotRaw.d.label, period: stuckSlotRaw.p.label, class: stuckSlotRaw.c.label }
    : null;

  return {
    solution,
    bestPartial,
    filledCount: bestFilledCount,
    totalSlots,
    // E2f: 生成の手応えを UI に出すための統計
    iterations: iter.c,
    hitLimit: iter.c > maxIterations,
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
