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
import { resolveAllEntries, effectiveRoom } from "./model";

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
