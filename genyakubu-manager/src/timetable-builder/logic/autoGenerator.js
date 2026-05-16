// 自動生成ロジック（MRV法 + バックトラッキング）
// 純粋関数として抽出。UI依存なし。
import { makeKey, makeNgKey, makeExternalKey, findCombinedGroup } from '../utils/scheduleKey';

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

const MAX_ITERATIONS = 500000;

/**
 * 単一パターンを生成する（シード指定可能）
 * @returns {{ solution: object|null, bestPartial: object, filledCount: number, totalSlots: number }}
 */
export function generateSinglePattern({ project, activeTabId, seed = 0 }) {
  const rng = mulberry32(seed);
  const activeTab = project.tabs.find(t => t.id === activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  const currentConfig = activeTab.config;
  const commonSubjects = Object.keys(currentConfig.subjectCounts);
  const combinedGroups = project.combinedGroups || [];

  let solution = null;
  const slots = [];
  const currentCounts = {};
  currentConfig.classes.forEach((c, cIdx) => {
    currentCounts[cIdx] = {};
    commonSubjects.forEach(s => currentCounts[cIdx][s] = 0);
  });

  // 既存の科目カウントを集計
  currentConfig.dates.forEach((d, dIdx) => {
    currentConfig.periods.forEach((p, pIdx) => {
      currentConfig.classes.forEach((c, cIdx) => {
        const k = makeKey(dIdx, pIdx, cIdx);
        const e = currentSchedule[k];
        if (e?.subject) {
          if (currentCounts[cIdx]) currentCounts[cIdx][e.subject] = (currentCounts[cIdx][e.subject] || 0) + 1;
        }
      });
    });
  });

  // 未充填スロットを構築
  currentConfig.dates.forEach((d, dIdx) => currentConfig.periods.forEach((p, pIdx) => currentConfig.classes.forEach((c, cIdx) => {
    const k = makeKey(dIdx, pIdx, cIdx);
    const entry = currentSchedule[k];
    if (!entry || !entry.subject || !entry.teacher) {
      slots.push({ dIdx, pIdx, cIdx, d, p, c, k, fixedSubject: entry?.subject });
    }
  })));

  const totalSlots = slots.length;

  // MRV: 候補者が少ないコマから優先（シード付きランダムでタイブレーク）
  slots.forEach(slot => {
    let validCandidates = 0;
    const subjectsToCheck = slot.fixedSubject ? [slot.fixedSubject] : commonSubjects;
    subjectsToCheck.forEach(subj => {
      project.teachers.forEach(t => {
        if (t.subjects.includes(subj) &&
          !t.ngSlots?.includes(makeNgKey(slot.d, slot.p)) &&
          !t.ngClasses?.includes(slot.c)) {
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
    if (iter.c++ > MAX_ITERATIONS || solution !== null) return;

    // 部分解の更新（現在の充填度が最高なら保存）
    if (idx > bestFilledCount) {
      bestFilledCount = idx;
      bestPartial = JSON.parse(JSON.stringify(tempSch));
    }

    if (idx >= slots.length) {
      solution = JSON.parse(JSON.stringify(tempSch));
      return;
    }

    const { dIdx, pIdx, cIdx, d, p, c, k, fixedSubject } = slots[idx];

    // 合同グループの伝播により既に充填されている場合はスキップ
    if (tempSch[k]?.subject && tempSch[k]?.teacher) {
      solve(idx + 1, tempSch, tempCnt, tempDaily, iter);
      return;
    }

    const subjectsToTry = fixedSubject ? [fixedSubject] : seededShuffle(commonSubjects, rng);

    for (const s of subjectsToTry) {
      if (!fixedSubject && (tempCnt[cIdx][s] || 0) >= currentConfig.subjectCounts[s]) continue;
      // 同日・同クラスに同じ科目があるかチェック
      if (!fixedSubject && currentConfig.periods.some((per, pi) => tempSch[makeKey(dIdx, pi, cIdx)]?.subject === s)) continue;

      // 合同グループチェック
      const group = findCombinedGroup(combinedGroups, s, c, d);
      let secondarySlots = [];
      let canUseCombined = true;

      if (group) {
        for (const otherClass of group.classes) {
          if (otherClass === c) continue;
          const otherCIdx = currentConfig.classes.indexOf(otherClass);
          if (otherCIdx < 0) continue;
          const otherKey = makeKey(dIdx, pIdx, otherCIdx);
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
          if (!otherEntry?.subject && (tempCnt[otherCIdx]?.[s] || 0) >= currentConfig.subjectCounts[s]) {
            canUseCombined = false;
            break;
          }
          // 同日・同クラスに同じ科目が既にある場合は不可
          if (!otherEntry?.subject && currentConfig.periods.some((per, pi) => pi !== pIdx && tempSch[makeKey(dIdx, pi, otherCIdx)]?.subject === s)) {
            canUseCombined = false;
            break;
          }

          // 未充填のセカンダリスロットを収集（元の状態を保存）
          if (!otherEntry?.subject || !otherEntry?.teacher) {
            const hadSubject = !!otherEntry?.subject;
            secondarySlots.push({
              cIdx: otherCIdx,
              key: otherKey,
              className: otherClass,
              hadSubject,
              original: otherEntry ? { ...otherEntry } : null,
            });
          }
        }

        if (!canUseCombined) continue;
      }

      // 有効な講師を検索
      const validT = project.teachers.filter(t => {
        if (!t.subjects.includes(s)) return false;
        if (t.ngSlots?.includes(makeNgKey(d, p))) return false;
        if (t.ngClasses?.includes(c)) return false;
        // 合同グループの場合、セカンダリクラスのNGもチェック
        if (group) {
          for (const ss of secondarySlots) {
            if (t.ngClasses?.includes(ss.className)) return false;
          }
        }
        return true;
      });

      const priorityGroup = [];
      const neutralGroup = [];
      validT.forEach(t => {
        if (t.priorityClasses?.includes(c)) priorityGroup.push(t);
        else neutralGroup.push(t);
      });

      const shuffledT = [
        ...seededShuffle(priorityGroup, rng),
        ...seededShuffle(neutralGroup, rng)
      ];

      // 合同グループのクラスインデックスリスト
      const combinedClassIndices = group
        ? group.classes.map(gc => currentConfig.classes.indexOf(gc)).filter(i => i >= 0)
        : [];

      for (const tObj of shuffledT) {
        const tName = tObj.name;
        const dayKey = makeExternalKey(d, tName);

        // 同じ日付・時限で他クラスに同じ講師がいるかチェック（合同グループ内は除外）
        if (currentConfig.classes.some((oc, oci) =>
          oci !== cIdx &&
          !combinedClassIndices.includes(oci) &&
          tempSch[makeKey(dIdx, pIdx, oci)]?.teacher === tName
        )) continue;

        // プライマリスロットを割り当て
        tempSch[k] = { subject: s, teacher: tName };
        if (!fixedSubject) tempCnt[cIdx][s]++;
        if (!tempDaily[dayKey]) tempDaily[dayKey] = 0;
        tempDaily[dayKey]++; // 合同でも1コマとしてカウント

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

        // バックトラック: プライマリスロット
        if (fixedSubject) tempSch[k] = { subject: fixedSubject, teacher: "" };
        else { delete tempSch[k]; tempCnt[cIdx][s]--; }
        tempDaily[dayKey]--;

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

  const initialDaily = {};
  solve(0, JSON.parse(JSON.stringify(currentSchedule)), JSON.parse(JSON.stringify(currentCounts)), initialDaily);

  return {
    solution,
    bestPartial,
    filledCount: bestFilledCount,
    totalSlots,
  };
}

/**
 * 複数パターンを生成する（後方互換のためのラッパー）
 * onProgress コールバックで進捗を通知可能
 */
export function generateSchedule({ project, activeTabId, numPatterns = 3 }) {
  const results = [];
  const baseSeed = Date.now();

  for (let i = 0; i < numPatterns; i++) {
    const seed = baseSeed + i * 7919; // 素数でオフセットして多様性を確保
    const result = generateSinglePattern({ project, activeTabId, seed });
    results.push(result);
  }

  return results;
}
