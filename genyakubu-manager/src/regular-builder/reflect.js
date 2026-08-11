// ─── 本体への反映 (通常時間割作成 → Timetable + Slot) ───────────────
// 下書きプロジェクトを親アプリの時間割 (Timetable) とコマ (Slot) に
// 変換する。2 段階:
//   1. buildReflectionPlan: 変換内容と警告を計算する純粋関数 (プレビュー用)
//   2. applyReflection:     plan を slots / timetables 配列に適用する純粋関数
// 反映は「作成フェーズ」の道具で、運用開始後の日々の修正は本体側で行う。
// mode "replace" は対象時間割の既存コマを削除して差し替えるため、旧コマに
// 紐づく代行・調整は無効になる (確認ダイアログで警告する)。

import { nextNumericId } from "../utils/schema";
import { splitTeacherField } from "../utils/biweekly";
import { isWellFormedTimeRange } from "../utils/timeBulkEdit";
import { resolveAllEntries, effectiveRoom, REGULAR_DAYS } from "./model";
import { buildConflictView, computeConflicts } from "./conflicts";
import { timeStartToMin } from "../utils/dateHelpers";

// 警告文で使う問題の種類名 (表示順も兼ねる)
const CONFLICT_TYPE_LABELS = [
  ["teacher", "講師の重複"],
  ["room", "教室の重複"],
  ["class", "クラスの重複"],
  ["ng", "講師NG"],
];

/**
 * @param {object} project RegularProject
 * @param {{mode: "new"|"replace", name?: string, startDate?: string|null,
 *          endDate?: string|null, targetTimetableId?: number}} opts
 * @returns {{
 *   ok: boolean,
 *   errors: string[],        // 反映をブロックする問題
 *   warnings: string[],      // 反映は可能だが注意
 *   drafts: object[],        // id/timetableId 未割当のコマ (day/time/grade/…)
 *   perTab: {tabName: string, count: number}[],
 * }}
 */
export function buildReflectionPlan(project, opts) {
  const errors = [];
  const warnings = [];
  const drafts = [];
  const perTab = new Map();

  if (opts.mode === "new" && !(opts.name || "").trim()) {
    errors.push("時間割の名前を入力してください");
  }

  const entries = resolveAllEntries(project);
  const badPeriods = new Set();
  let skippedNoSubj = 0;

  for (const e of entries) {
    const subj = (e.cell.subj || "").trim();
    const teacher = splitTeacherField(e.cell.teacher).join("·");
    if (!subj) {
      // 教科なしのセルは反映しない (講師だけ置いたメモ書きは警告)
      if (teacher) skippedNoSubj++;
      continue;
    }
    if (!(e.tab.grade || "").trim()) {
      // タブ単位のエラーとして 1 回だけ報告
      const msg = `タブ「${e.tab.name}」に学年が設定されていません (反映先の学年が決まりません)`;
      if (!errors.includes(msg)) errors.push(msg);
      continue;
    }
    if (!isWellFormedTimeRange(e.period.time)) {
      badPeriods.add(e.period.label || `id:${e.period.id}`);
      continue;
    }
    drafts.push({
      day: e.day,
      time: e.period.time.trim(),
      grade: e.tab.grade.trim(),
      cls: (e.cls.label || "").trim(),
      room: effectiveRoom(e),
      subj,
      teacher,
      note: (e.cell.note || "").trim(),
    });
    perTab.set(e.tab.name, (perTab.get(e.tab.name) || 0) + 1);
  }

  for (const label of badPeriods) {
    errors.push(
      `時限「${label}」の時刻が「HH:MM-HH:MM」形式ではありません (設定で修正してください)`
    );
  }
  if (skippedNoSubj > 0) {
    warnings.push(`教科が未入力のセル ${skippedNoSubj} 件は反映されません`);
  }
  if (drafts.length === 0) {
    errors.push("反映できるコマがありません (教科の入ったセルが必要です)");
  }

  // 未承認の重なり・NG。反映はブロックしない (意図した重なりもあるため) が、
  // 承認せずに出すと本体側にもそのまま重複が載る。⚠ 問題バッジを見ないまま
  // 反映できてしまう導線をここで塞ぐ
  const { active } = buildConflictView(
    computeConflicts(project).list,
    project.approvedConflicts
  );
  if (active.length > 0) {
    const counts = new Map();
    for (const c of active) counts.set(c.type, (counts.get(c.type) || 0) + 1);
    const detail = CONFLICT_TYPE_LABELS.filter(([type]) => counts.has(type))
      .map(([type, label]) => `${label} ${counts.get(type)}`)
      .join("・");
    warnings.push(
      `未承認の問題が ${active.length} 件あります（${detail}）。` +
        `このまま反映すると本体側でも重なったままになります（意図した重なりは「⚠ 問題」から承認できます）`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    drafts,
    perTab: [...perTab.entries()].map(([tabName, count]) => ({ tabName, count })),
  };
}

/**
 * plan を適用した新しい timetables / slots 配列を返す。
 * mode "new":     時間割を新規作成してコマを追加
 * mode "replace": 対象時間割の既存コマを削除して差し替え (名前・期間は
 *                 指定があれば更新、空なら据え置き)
 * @returns {{timetables, slots, timetableId, addedCount, removedCount} | {error: string}}
 */
export function applyReflection(plan, opts, { timetables, slots }) {
  if (!plan.ok) return { error: "反映できない問題が残っています" };

  let newTimetables;
  let timetableId;
  let baseSlots;
  let removedCount = 0;

  if (opts.mode === "replace") {
    const target = timetables.find((t) => t.id === opts.targetTimetableId);
    if (!target) return { error: "差し替え先の時間割が見つかりません" };
    timetableId = target.id;
    newTimetables = timetables.map((t) => {
      if (t.id !== target.id) return t;
      return {
        ...t,
        name: (opts.name || "").trim() || t.name,
        startDate: opts.startDate !== undefined ? opts.startDate || null : t.startDate,
        endDate: opts.endDate !== undefined ? opts.endDate || null : t.endDate,
      };
    });
    baseSlots = slots.filter((s) => (s.timetableId ?? 1) !== timetableId);
    removedCount = slots.length - baseSlots.length;
  } else {
    timetableId = nextNumericId(timetables);
    newTimetables = [
      ...timetables,
      {
        id: timetableId,
        name: (opts.name || "").trim(),
        type: "regular",
        startDate: opts.startDate || null,
        endDate: opts.endDate || null,
        grades: [],
      },
    ];
    baseSlots = slots;
  }

  // id は削除前の全コマの最大値から振る。replace で消した id を同じ保存
  // 操作内で新コマに再利用すると、旧コマを指したままの代行・調整が別の
  // コマに化けてしまうため (dangling は警告済みだが、silent 再結合は防ぐ)。
  let nextId = nextNumericId(slots);
  const newSlots = plan.drafts.map((d) => ({
    id: nextId++,
    ...d,
    timetableId,
  }));

  return {
    timetables: newTimetables,
    slots: [...baseSlots, ...newSlots],
    timetableId,
    addedCount: newSlots.length,
    removedCount,
  };
}

// ─── 差分プレビュー (置き換え反映用) ────────────────────────────────
// 下書き (plan.drafts) と既存時間割のコマを突き合わせ、
// 変わらず / 変更 / 追加 / 削除 に分類する。マッチングは 2 段階:
//   1. 全フィールド一致 → 変わらず (多重集合で消し込み)
//   2. 残りを (曜日 × 時刻 × 学年 × クラス) で突き合わせ → 変更、
//      余った下書き → 追加、余った既存 → 削除

// 区切りは非可視文字 (US)。ユーザー入力に通常含まれない文字で衝突を防ぐ
const SEP = "\u001f";

function normalizeRecord(s) {
  return {
    day: s.day,
    time: (s.time || "").trim(),
    grade: (s.grade || "").trim(),
    cls: (s.cls || "").trim(),
    room: (s.room || "").trim(),
    subj: (s.subj || "").trim(),
    teacher: splitTeacherField(s.teacher).join("·"),
    note: (s.note || "").trim(),
  };
}

const fullKey = (r) =>
  [r.day, r.time, r.grade, r.cls, r.room, r.subj, r.teacher, r.note].join(SEP);
const positionKey = (r) => [r.day, r.time, r.grade, r.cls].join(SEP);

function sortRecords(list, pick = (x) => x) {
  return [...list].sort((a, b) => {
    const ra = pick(a);
    const rb = pick(b);
    return (
      REGULAR_DAYS.indexOf(ra.day) - REGULAR_DAYS.indexOf(rb.day) ||
      timeStartToMin(ra.time) - timeStartToMin(rb.time) ||
      ra.grade.localeCompare(rb.grade) ||
      ra.cls.localeCompare(rb.cls) ||
      ra.subj.localeCompare(rb.subj)
    );
  });
}

/** 差分行の表示用の位置ラベル */
export function describeDiffRecord(r) {
  return `${r.day} ${r.time} ${r.grade} ${r.cls || "-"}`;
}

/** 変更行の「何が変わったか」を短くまとめる */
export function describeDiffChange(before, after) {
  const parts = [];
  if (before.subj !== after.subj) parts.push(`${before.subj || "-"} → ${after.subj || "-"}`);
  if (before.teacher !== after.teacher)
    parts.push(`講師 ${before.teacher || "-"} → ${after.teacher || "-"}`);
  if (before.room !== after.room) parts.push(`教室 ${before.room || "-"} → ${after.room || "-"}`);
  if (before.note !== after.note) parts.push(`備考 ${before.note || "-"} → ${after.note || "-"}`);
  return parts.join("、");
}

/**
 * @param {object[]} drafts buildReflectionPlan の drafts
 * @param {import("../types").Slot[]} slots 本体の全コマ
 * @param {number} timetableId 置き換え先の時間割 id
 * @returns {{unchanged: number,
 *   changed: {before: object, after: object}[],
 *   added: object[], removed: object[]}}
 */
export function diffReflection(drafts, slots, timetableId) {
  const before = slots
    .filter((s) => (s.timetableId ?? 1) === timetableId)
    .map(normalizeRecord);
  const after = drafts.map(normalizeRecord);

  // 1. 全フィールド一致の消し込み
  const counts = new Map();
  for (const b of before) {
    const k = fullKey(b);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let unchanged = 0;
  const afterRest = [];
  for (const a of after) {
    const k = fullKey(a);
    const c = counts.get(k) || 0;
    if (c > 0) {
      counts.set(k, c - 1);
      unchanged++;
    } else {
      afterRest.push(a);
    }
  }
  const beforeRest = [];
  for (const b of before) {
    const k = fullKey(b);
    const c = counts.get(k) || 0;
    if (c > 0) {
      counts.set(k, c - 1);
      beforeRest.push(b);
    }
  }

  // 2. 位置 (曜日×時刻×学年×クラス) でペアリング
  const group = (list) => {
    const m = new Map();
    for (const r of list) {
      const k = positionKey(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const afterByPos = group(afterRest);
  const beforeByPos = group(beforeRest);

  const changed = [];
  const added = [];
  const removed = [];
  for (const [k, afters] of afterByPos) {
    const befores = beforeByPos.get(k) || [];
    const n = Math.min(afters.length, befores.length);
    for (let i = 0; i < n; i++) changed.push({ before: befores[i], after: afters[i] });
    for (let i = n; i < afters.length; i++) added.push(afters[i]);
    for (let i = n; i < befores.length; i++) removed.push(befores[i]);
    beforeByPos.delete(k);
  }
  for (const rest of beforeByPos.values()) removed.push(...rest);

  return {
    unchanged,
    changed: sortRecords(changed, (c) => c.after),
    added: sortRecords(added),
    removed: sortRecords(removed),
  };
}
