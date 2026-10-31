// ─── 時間割の複製 (学年を選んで次の期へ続ける、A2 2026-10-31) ──────────
// 「2学期の時間割から、中1・中2・高1・高2 だけを 3学期として続ける」を 1 手で
// 作る。以前は通常時間割作成で取込 → 学年で絞って反映 → 置き換えで学年を追加 →
// 対象学年を手で直す → 終講日を外す → 隙間に休講、の 6 手かかった。
// (終講日はコース別終講日が時間割に結び付くので外さなくてよい。A1)
//
//   - 学年を選ぶ: 選んだ学年のコマだけを写し、新しい時間割の対象学年もそれにする
//     (共通学年「中1-3」「高1高2」「附中」もそのまま。対象学年の照合は「高1高2」を
//     展開しないので、そのまま対象学年に入れる)。全部選べば複製元の対象学年のまま
//   - 第N回: 既定は 1 から数え直す (期ごとにリセットの仕様)。「前の期の続き」を
//     選ぶと、複製元の期の最後の授業の第N回 + 1 を各コマの sessionStartNumber に
//     入れる。**複製した時点の見込み** (前の期に後から休講を足しても追従しない)
//   - 数え直すときは複製元の sessionStartNumber を写さない (2学期を⑨から数えて
//     いたコマを複製すると、3学期も⑨から始まっていた)
//   - 担当の切り替え (teacherChanges) のあるコマは、複製先の担当を「切り替え後
//     (複製先の開始日時点)」か「元の担当」に確定する。複製先の開始日より後に始まる
//     切り替えは「切り替え後」のとき持ち越す
//   - 旧形式 (slotIds) の授業セットは新しいコマ id に読み替えて写す (従来どおり)

import { biweeklyPartner, hasTeacherChanges, slotOnDate, withTeacherChanges } from "./biweekly";
import { isLegacySet } from "./classSets";
import { buildSessionCountMap, isSlotHeldOnDate } from "./sessionCount";
import { shiftDate } from "../components/views/dashboardHelpers";

const nextId = (list) => (list || []).reduce((m, x) => Math.max(m, Number(x?.id) || 0), 0) + 1;

/** 複製元の時間割にある学年 (コマ数の多い順ではなく、名前順) */
export function gradesOfTimetable(slots, timetableId) {
  const set = new Set();
  for (const s of slots || []) if ((s.timetableId ?? 1) === timetableId && s.grade) set.add(s.grade);
  return [...set].sort();
}

/**
 * 複製元の期の最後の授業日と第N回 (コマごと)。見つからなければ null。
 * endDate 以前を 1 週ずつさかのぼる (最大 maxWeeks 週)
 */
export function lastSessionOfSlot(slot, endDate, ctx, { maxWeeks = 16 } = {}) {
  if (!slot || !endDate || !ctx) return null;
  const [y, m, d] = endDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const target = ["日", "月", "火", "水", "木", "金", "土"].indexOf(slot.day);
  if (target < 0) return null;
  while (dt.getDay() !== target) dt.setDate(dt.getDate() - 1);
  for (let i = 0; i < maxWeeks; i++) {
    const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    if (isSlotHeldOnDate(slot, ds, ctx)) {
      const n = buildSessionCountMap([slot], ds, ctx).get(slot.id) || 0;
      return { date: ds, sessionNo: n };
    }
    dt.setDate(dt.getDate() - 7);
  }
  return null;
}

/**
 * @param {{
 *   timetables: object[], slots: object[], classSets?: object[],
 *   sourceId: number, name: string, startDate: string|null, endDate: string|null,
 *   grades?: string[]|null,           // 写す学年 (null / 空 = 全部)
 *   numbering?: "reset"|"continue",
 *   teacherMode?: "after"|"before",   // 担当の切り替えのあるコマの確定のしかた
 *   sessionCtx?: object,              // numbering "continue" のとき (useSessionCtx)
 * }} args
 * @returns {{error?: string, timetable?: object, slots?: object[], classSets?: object[]|null,
 *            newSlots?: object[], continuation?: object[], changedTeacherCount?: number}}
 */
export function planTimetableDuplicate(args) {
  const {
    timetables = [],
    slots = [],
    classSets = null,
    sourceId,
    name,
    startDate = null,
    endDate = null,
    grades = null,
    numbering = "reset",
    teacherMode = "after",
    sessionCtx = null,
  } = args;
  const source = timetables.find((t) => t.id === sourceId);
  if (!source) return { error: "複製元の時間割が見つかりません" };
  const all = gradesOfTimetable(slots, sourceId);
  const picked = Array.isArray(grades) && grades.length > 0 ? grades.filter((g) => all.includes(g)) : all;
  if (picked.length === 0 && all.length > 0) return { error: "写す学年を選んでください" };
  const pickedSet = new Set(picked);
  const narrowed = picked.length < all.length;

  const newTtId = nextId(timetables);
  const timetable = {
    ...source,
    id: newTtId,
    name,
    startDate,
    endDate,
    grades: narrowed ? picked : source.grades || [],
  };

  // 続き番号の基準日: 複製元の終了日、無ければ複製先の開始日の前日
  const lastDay = source.endDate || (startDate ? shiftDate(startDate, -1) : null);
  const canContinue = numbering === "continue" && !!lastDay && !!sessionCtx;

  const sourceSlots = slots.filter((s) => (s.timetableId ?? 1) === sourceId && pickedSet.has(s.grade));
  let nextSlotId = nextId(slots);
  const idMap = new Map();
  const continuation = [];
  let changedTeacherCount = 0;
  const newSlots = sourceSlots.map((s) => {
    const id = nextSlotId++;
    idMap.set(s.id, id);
    let out = { ...s, id, timetableId: newTtId };
    delete out.sessionStartNumber;
    if (hasTeacherChanges(s)) {
      changedTeacherCount++;
      if (teacherMode === "after" && startDate) {
        const day = slotOnDate(s, startDate);
        out.teacher = day.teacher;
        out.note = day.note;
        out = withTeacherChanges(out, (s.teacherChanges || []).filter((c) => c.from > startDate));
      } else {
        out = withTeacherChanges(out, []);
      }
    }
    if (canContinue) {
      const last = lastSessionOfSlot(s, lastDay, sessionCtx);
      if (last && last.sessionNo >= 1) {
        out.sessionStartNumber = last.sessionNo + 1;
        continuation.push({ slot: s, last, start: last.sessionNo + 1 });
      } else {
        continuation.push({ slot: s, last: null, start: 1 });
      }
    }
    return out;
  });

  let nextSets = null;
  if (Array.isArray(classSets)) {
    const added = [];
    let nextSetId = nextId(classSets);
    for (const cs of classSets) {
      if (!isLegacySet(cs)) continue;
      const mapped = (cs.slotIds || []).map((x) => idMap.get(x)).filter((x) => x != null);
      if (mapped.length < 2) continue;
      added.push({ id: nextSetId++, label: cs.label, slotIds: mapped });
    }
    if (added.length) nextSets = [...classSets, ...added];
  }

  return {
    timetable,
    slots: [...slots, ...newSlots],
    newSlots,
    classSets: nextSets,
    continuation,
    changedTeacherCount,
    grades: picked,
  };
}

/** 担当の切り替えのあるコマを「切り替え後 / 元の担当」で並べた見出し (ダイアログ用) */
export function describeChangedTeacherSlot(slot, startDate) {
  const after = startDate ? slotOnDate(slot, startDate) : slot;
  const partner = biweeklyPartner(after.note);
  return {
    before: slot.teacher,
    after: partner ? `${after.teacher} / ${partner}` : after.teacher,
  };
}
