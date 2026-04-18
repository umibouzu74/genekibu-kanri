// 並列スロット (同一時間・同一コホートで担任だけ異なる複数スロット) を
// 「1 コマ複数担任」として扱うための集約ヘルパ。
//
// 例: 中3 火 21:35-21:50 SS〜C 確認テスト に id=97 (藤田) と id=98 (大屋敷)
//     の 2 スロットが定義されており、本関数で {rep:97, teachers:"藤田・大屋敷"}
//     に圧縮する。表示・回数カウントの二重計上を防ぐ。

// グルーピングキー。担任・教室・note は除外し、コホート (cls) と教科で括る。
// note を含めるとわずかな表記揺れで分離してしまうので意図的に除外。
export function slotGroupKey(slot) {
  return `${slot.day}|${slot.time}|${slot.grade}|${slot.cls}|${slot.subj}`;
}

/**
 * 並列スロットを集約した結果を返す。
 * @param {Array<{id:number,day:string,time:string,grade:string,cls:string,subj:string,teacher:string}>} slots
 * @returns {{
 *   representativeSlots: typeof slots,
 *   groupTeacherMap: Map<number, string>,
 *   suppressedIds: Set<number>,
 * }}
 */
export function groupParallelSlots(slots) {
  const buckets = new Map(); // key -> Array<slot>
  for (const s of slots || []) {
    const k = slotGroupKey(s);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }

  const representativeSlots = [];
  const groupTeacherMap = new Map();
  const suppressedIds = new Set();

  // 元の順序を保ったまま返したいので、slots をもう一度回して先頭のみ採用。
  const seenKeys = new Set();
  for (const s of slots || []) {
    const k = slotGroupKey(s);
    const bucket = buckets.get(k) || [s];
    if (seenKeys.has(k)) {
      suppressedIds.add(s.id);
      continue;
    }
    seenKeys.add(k);
    representativeSlots.push(s);
    if (bucket.length > 1) {
      const teachers = bucket
        .map((b) => b.teacher)
        .filter(Boolean);
      // 重複教師は除去しつつ出現順を保持
      const uniq = [];
      for (const t of teachers) if (!uniq.includes(t)) uniq.push(t);
      groupTeacherMap.set(s.id, uniq.join("・"));
    }
  }

  return { representativeSlots, groupTeacherMap, suppressedIds };
}
