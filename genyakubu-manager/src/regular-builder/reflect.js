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
import { fmtDate, parseLocalDate, timeStartToMin } from "../utils/dateHelpers";
import { gradeMatchesTimetable } from "../utils/timetable";
import { isOrientationEnabledForGrade } from "../utils/sessionCount";
import { isLegacySet } from "../utils/classSets";
import {
  describeScope,
  filterConflictsByScope,
  isScopeLimited,
  scopeMatcher,
} from "./reflectScope";

// 警告文で使う問題の種類名 (表示順も兼ねる)
const CONFLICT_TYPE_LABELS = [
  ["teacher", "講師の重複"],
  ["room", "教室の重複"],
  ["class", "クラスの重複"],
  ["ng", "講師NG"],
  ["travel", "校舎間の移動"],
];

/**
 * 下書きに現れる学年 (タブの grade)。反映で作る時間割の grades に使える。
 * timetable.grades が空 = 全学年にマッチ (utils/timetable) なので、
 * 「この時間割は中3 と中2 だけ」と絞りたいときにこの一覧を入れる。
 * @returns {string[]} タブ定義順・重複なし
 */
export function projectGrades(project) {
  const seen = [];
  for (const t of project.tabs || []) {
    const g = (t.grade || "").trim();
    if (g && !seen.includes(g)) seen.push(g);
  }
  return seen;
}

/**
 * @param {object} project RegularProject
 * @param {{mode: "new"|"replace", name?: string, startDate?: string|null,
 *          endDate?: string|null, targetTimetableId?: number,
 *          grades?: string[],
 *          scope?: {days?: string[], grades?: string[]}}} opts
 *   scope は反映する範囲 (学年 × 曜日 の AND、空 = 全体)。範囲外のセルは
 *   drafts に入らない。置き換えでは applyReflection / diffReflection が
 *   同じ範囲で既存コマ側も絞り、範囲外のコマを削除対象から外す。
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

  const inScope = scopeMatcher(opts.scope);
  const scoped = isScopeLimited(opts.scope);
  // 範囲は学年 (タブの grade) × 曜日。既存コマ側にも同じ述語を当てるため、
  // タブ参照ではなく {day, grade} で判定する
  const entries = resolveAllEntries(project).filter((e) =>
    inScope({ day: e.day, grade: (e.tab.grade || "").trim() })
  );
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
    errors.push(
      scoped
        ? `「${describeScope(opts.scope)}」に反映できるコマがありません (範囲を広げるか、教科の入ったセルを増やしてください)`
        : "反映できるコマがありません (教科の入ったセルが必要です)"
    );
  }

  // 未承認の重なり・NG。反映はブロックしない (意図した重なりもあるため) が、
  // 承認せずに出すと本体側にもそのまま重複が載る。⚠ 問題バッジを見ないまま
  // 反映できてしまう導線をここで塞ぐ
  const { active: allActive } = buildConflictView(
    computeConflicts(project).list,
    project.approvedConflicts
  );
  // 範囲外だけで起きている重なりはこの反映では持ち込まれないので挙げない
  const active = filterConflictsByScope(allActive, project, opts.scope);
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

// ─── 期切替 (1学期 → 2学期) ────────────────────────────────────────
// 新しい時間割を「切替日」から始めるとき、前の期の時間割を切替日の前日で
// 終了させないと、日付ベースの表示 (utils/timetable.filterSlotsForDate) で
// 新旧どちらのコマも有効になり、ダッシュボード等に二重に出る。切替日の
// 入力ひとつから「新: 開始日」「旧: 終了日」を対にして扱うための計画。

/** "YYYY-MM-DD" の前日。無効な日付には null */
export function previousDateStr(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() - 1);
  return fmtDate(d);
}

/** 2 つの対象学年リストが重なるか (空 = 全学年なので必ず重なる) */
function gradeListsOverlap(a, b) {
  if (!a || a.length === 0 || !b || b.length === 0) return true;
  return (
    a.some((g) => gradeMatchesTimetable(g, b)) ||
    b.some((g) => gradeMatchesTimetable(g, a))
  );
}

/**
 * 期切替の計画 (プレビュー + 検証)。
 * @param {{timetables: import("../types").Timetable[],
 *          slots: import("../types").Slot[],
 *          startDate: string, closeTimetableId: number,
 *          grades?: string[],
 *          displayCutoff?: import("../types").DisplayCutoff|null,
 *          classSets?: import("../types").ClassSet[]}} params
 *   grades は新しく作る時間割の対象学年 (空 = 全学年)。重なりの警告を
 *   学年の交わるものだけに絞るために使う。
 * @returns {{
 *   ok: boolean,
 *   endDate: string|null,      // 旧時間割に設定する終了日 (切替日の前日)
 *   target: object|null,       // 終了させる時間割
 *   changesEndDate: boolean,   // 実際に終了日を書き換えるか
 *   slotCount: number,         // 旧時間割のコマ数 (表示用)
 *   errors: string[],
 *   warnings: string[],
 * }}
 */
export function buildSwitchPlan({
  timetables,
  slots,
  startDate,
  closeTimetableId,
  grades,
  displayCutoff,
  classSets,
}) {
  const errors = [];
  const warnings = [];
  const target =
    (timetables || []).find((t) => t.id === Number(closeTimetableId)) || null;
  const endDate = previousDateStr(startDate);

  if (!startDate) errors.push("期切替には切替日 (新しい時間割の開始日) が必要です");
  else if (!endDate) errors.push("切替日の形式が正しくありません");
  if (!target) errors.push("終了させる時間割が見つかりません");

  // 既に切替日より前で終わっている時間割は触らない。夏期講習などで意図的に
  // 早い終了日を入れてある場合に、期切替が黙って期間を伸ばしてしまわないため
  // (重なりを防ぐのが目的なので、重なっていなければやることは無い)
  const changesEndDate =
    !!target && !!endDate && (!target.endDate || target.endDate > endDate);

  if (target && endDate) {
    if (target.startDate && endDate < target.startDate) {
      errors.push(
        `「${target.name}」の開始日 (${target.startDate}) より前に終了日 (${endDate}) を置くことはできません`
      );
    }
    if (changesEndDate && target.endDate) {
      warnings.push(
        `「${target.name}」の終了日 ${target.endDate} を ${endDate} に前倒しします`
      );
    }
    if (!changesEndDate) {
      warnings.push(
        `「${target.name}」は既に ${target.endDate} で終了しているため、終了日は変更しません` +
          `（切替日より前に終わっているので重なりません）`
      );
    }
  }

  // 切替日以降も有効なまま残る他の時間割 (旧 = target と、これから作る新しい
  // 時間割は除く)。残っていると日付ベースの表示で新旧のコマが重なる。
  // 対象学年が交わらない時間割 (附属コース等) は重ならないので挙げない
  if (endDate) {
    const stillActive = (timetables || []).filter(
      (t) =>
        t.id !== target?.id &&
        (!t.endDate || t.endDate > endDate) &&
        gradeListsOverlap(t.grades, grades)
    );
    if (stillActive.length > 0) {
      warnings.push(
        `切替日以降も有効な時間割が他にあります（${stillActive
          .map((t) => t.name)
          .join("・")}）。コマが重なって見える場合は時間割管理で終了日を入れてください`
      );
    }
  }

  // 表示期間設定 (displayCutoff) の終了日が切替日より前だと、時間割を
  // 切り替えても新しい期のコマがダッシュボード等に出ない。時間割の有効期間
  // とは別のフィルタなので、期切替のたびに伸ばす必要がある
  if (startDate) {
    const endedGroups = (displayCutoff?.groups || []).filter(
      (g) => g.date && g.date < startDate
    );
    if (endedGroups.length > 0) {
      warnings.push(
        `表示期間設定の終了日が切替日より前の学年グループがあります（${endedGroups
          .map((g) => `${g.label} 〜${g.date}`)
          .join("・")}）。このままだと新しい期のコマがダッシュボード等に出ません` +
          `（時間割管理 → 表示期間設定で延ばしてください）`
      );
    }
    const endedCohorts = (displayCutoff?.cohorts || []).filter(
      (c) => c.date && c.date < startDate
    );
    if (endedCohorts.length > 0) {
      warnings.push(
        `コース別終講日も ${endedCohorts.length} 件が切替日より前です` +
          `（時間割管理 → コース別 終講日設定）`
      );
    }
  }

  // 授業セット (第N回を通しで数えるコマの組) のうち、旧 slotIds 形式のものは
  // コマ id 参照。新しい期のコマは別 id なので引き継がれない。
  // units 形式 (学年 × 曜日) のセットは id に依存しないので、新しい期のコマにも
  // そのまま効く (作り直し不要)。
  if (target) {
    const targetSlotIds = new Set(
      (slots || [])
        .filter((s) => (s.timetableId ?? 1) === target.id)
        .map((s) => s.id)
    );
    const affectedSets = (classSets || []).filter(
      (cs) => isLegacySet(cs) && (cs.slotIds || []).some((id) => targetSlotIds.has(id))
    );
    if (affectedSets.length > 0) {
      warnings.push(
        `授業セット ${affectedSets.length} 件は「${target.name}」のコマに` +
          `コマ id で紐づいています（旧形式）。新しい期のコマは別のコマ扱いなので、` +
          `第N回をまとめて数えるには時間割管理の授業セットで` +
          `「曜日ベースに変換」してください（変換すると以降の期切替では作り直し不要になります）`
      );
    }
  }

  const slotCount = target
    ? (slots || []).filter((s) => (s.timetableId ?? 1) === target.id).length
    : 0;

  return {
    ok: errors.length === 0,
    endDate,
    target,
    changesEndDate,
    slotCount,
    errors,
    warnings,
  };
}

/**
 * plan を適用した新しい timetables / slots 配列を返す。
 * mode "new":     時間割を新規作成してコマを追加
 * mode "replace": 対象時間割のコマを差し替え (名前・期間は指定があれば
 *                 更新、空なら据え置き)
 *
 * replace は「全消し → 作り直し」ではなく、差分プレビュー
 * (matchReflection) で位置の一致したコマの **slot.id を引き継ぐ**。
 * 代行 (sub.slotId) / 時間割調整 (adjustment.slotId) / 回数補正
 * (override.slotId) / 旧形式の授業セット (classSet.slotIds) はすべて
 * slot.id 参照なので、id を振り直すとプレビュー上「変わらず」のコマまで
 * 紐付けが切れてしまう。参照が切れるのは実際に消えるコマ (removedCount)
 * だけ。units 形式 (学年 × 曜日) の授業セットは id を見ないので無関係。
 *
 * 新規コマの id は既存の全コマの最大値から振る — 消えた id を同じ保存
 * 操作内で別のコマに使い回すと、旧コマを指したままの代行・調整が別の
 * コマに化けるため (dangling のまま残す方が安全)。
 *
 * mode "new" で opts.closeTimetableId を渡すと期切替として扱い、その
 * 時間割の終了日を切替日 (opts.startDate) の前日に設定する。コマは触らない
 * ので旧期の記録 (代行・調整・回数補正) はそのまま残り、日付ベースの表示
 * だけが切替日で新しい時間割に入れ替わる。
 * @returns {{timetables, slots, timetableId, addedCount, removedCount,
 *            keptCount, changedCount, closed?: {id, name, endDate}}
 *          | {error: string}}
 */
/**
 * 期切替に合わせて表示期間設定 (displayCutoff) を追従させる案を作る。
 *
 * 期切替は時間割の有効期間しか動かさないので、表示期間設定が旧期で
 * 終わっていると新しい期のコマが画面に出ない (buildSwitchPlan が警告する)。
 * その手当てを反映ダイアログから 1 手でできるようにするための純粋関数。
 * **自動では適用しない** — 学年グループは期をまたいで共通なので、
 * どこまで面倒を見るかは人が選ぶ (ダイアログのチェックボックス)。
 *
 * 対象:
 *   - 学年グループの終了日が切替日より前 → 新しい期の終了日 (無ければ解除)
 *   - コース別終講日が切替日より前 → その設定を削除 (旧期のものなので、
 *     新しい期の終講日は改めて入れ直す)
 *   - clearOrientation: 全グループの「初回1限はオリエン」を外す
 *     (2 学期以降はオリエンが入らない運用のため。既定は触らない)
 *
 * followDates を false にすると日付 (終了日・コース別終講日) は触らず、
 * clearOrientation だけを適用する。ダイアログのチェックボックスが
 * 独立しているため、対象の件数 (groupLabels / cohortCount) は
 * followDates に関係なく「直せるもの」を返す。
 *
 * @param {{displayCutoff: import("../types").DisplayCutoff|null|undefined,
 *          startDate: string, endDate?: string|null,
 *          followDates?: boolean, clearOrientation?: boolean}} params
 * @returns {{next: import("../types").DisplayCutoff,
 *            groupLabels: string[], cohortCount: number,
 *            orientationLabels: string[], changed: boolean}}
 */
export function buildCutoffFollowUp({
  displayCutoff,
  startDate,
  endDate,
  followDates = true,
  clearOrientation = false,
}) {
  const groups = displayCutoff?.groups || [];
  const cohorts = displayCutoff?.cohorts || [];
  const empty = {
    next: displayCutoff || { groups: [], cohorts: [] },
    groupLabels: [],
    cohortCount: 0,
    orientationLabels: [],
    changed: false,
  };
  if (!startDate) return empty;

  const groupLabels = groups
    .filter((g) => g.date && g.date < startDate)
    .map((g) => g.label);
  const staleCohorts = cohorts.filter((c) => c.date && c.date < startDate);
  // 「オリエンを外す」の対象は、いま有効になっているグループだけ
  // (未設定 = 中学部のみ有効の既定にも追従する)。
  const orientationLabels = clearOrientation
    ? groups
        .filter((g) =>
          isOrientationEnabledForGrade((g.grades || [])[0], { groups: [g] })
        )
        .map((g) => g.label)
    : [];

  const dateChanges = followDates && (groupLabels.length > 0 || staleCohorts.length > 0);
  const changed = dateChanges || orientationLabels.length > 0;
  if (!changed) {
    return { ...empty, groupLabels, cohortCount: staleCohorts.length };
  }

  const staleIds = new Set(staleCohorts.map((c) => c.id));
  const nextGroups = groups.map((g) => {
    const patch = {};
    if (followDates && g.date && g.date < startDate) patch.date = endDate || null;
    if (orientationLabels.includes(g.label)) patch.orientationFirstDay = false;
    return Object.keys(patch).length > 0 ? { ...g, ...patch } : g;
  });

  return {
    next: {
      ...(displayCutoff || {}),
      groups: nextGroups,
      cohorts: followDates ? cohorts.filter((c) => !staleIds.has(c.id)) : cohorts,
    },
    groupLabels,
    cohortCount: staleCohorts.length,
    orientationLabels,
    changed: true,
  };
}

export function applyReflection(plan, opts, { timetables, slots }) {
  if (!plan.ok) return { error: "反映できない問題が残っています" };

  let nextId = nextNumericId(slots);

  if (opts.mode !== "replace") {
    const timetableId = nextNumericId(timetables);
    // 期切替: 旧時間割を切替日の前日で終了させる
    let closed = null;
    let baseTimetables = timetables;
    if (opts.closeTimetableId != null) {
      const switchPlan = buildSwitchPlan({
        timetables,
        slots,
        startDate: opts.startDate,
        closeTimetableId: opts.closeTimetableId,
      });
      if (!switchPlan.ok) return { error: switchPlan.errors[0] };
      // 既に切替日より前で終わっている時間割は触らない (期間を伸ばさない)
      if (switchPlan.changesEndDate) {
        closed = {
          id: switchPlan.target.id,
          name: switchPlan.target.name,
          endDate: switchPlan.endDate,
        };
        baseTimetables = timetables.map((t) =>
          t.id === closed.id ? { ...t, endDate: closed.endDate } : t
        );
      }
    }
    return {
      timetables: [
        ...baseTimetables,
        {
          id: timetableId,
          name: (opts.name || "").trim(),
          type: "regular",
          startDate: opts.startDate || null,
          endDate: opts.endDate || null,
          // 空 = 全学年にマッチ (utils/timetable.gradeMatchesTimetable)。
          // 学年を絞りたい場合だけ呼び出し側が渡す
          grades: opts.grades || [],
        },
      ],
      slots: [
        ...slots,
        ...plan.drafts.map((d) => ({ id: nextId++, ...d, timetableId })),
      ],
      timetableId,
      addedCount: plan.drafts.length,
      removedCount: 0,
      keptCount: 0,
      changedCount: 0,
      untouchedCount: 0,
      closed,
    };
  }

  const target = timetables.find((t) => t.id === opts.targetTimetableId);
  if (!target) return { error: "差し替え先の時間割が見つかりません" };
  const timetableId = target.id;
  const newTimetables = timetables.map((t) =>
    t.id === target.id
      ? {
          ...t,
          name: (opts.name || "").trim() || t.name,
          startDate:
            opts.startDate !== undefined ? opts.startDate || null : t.startDate,
          endDate: opts.endDate !== undefined ? opts.endDate || null : t.endDate,
        }
      : t
  );

  // 範囲を絞った反映では、**下書きを絞るだけでは足りない**。突き合わせは
  // 「下書きに無い既存コマは削除」なので、範囲外のコマまで削除に分類されて
  // 消えてしまう。範囲外は突き合わせに掛けず、そのまま持ち越す
  const inScope = scopeMatcher(opts.scope);
  const ofTimetable = (s) => (s.timetableId ?? 1) === timetableId;
  const baseSlots = slots.filter((s) => !ofTimetable(s));
  const untouched = slots.filter((s) => ofTimetable(s) && !inScope(s));
  const existing = slots.filter((s) => ofTimetable(s) && inScope(s));
  const match = matchReflection(plan.drafts, existing);

  // 位置の一致したコマは id を保ったまま中身だけ下書きで上書きする。
  // slot 側にある未知のフィールドは残す (下書きが知らない情報を消さない)
  const updatedById = new Map();
  for (const { slot, draft } of [...match.unchanged, ...match.changed]) {
    updatedById.set(slot.id, { ...slot, ...draft, id: slot.id, timetableId });
  }
  const keptSlots = existing
    .filter((s) => updatedById.has(s.id))
    .map((s) => updatedById.get(s.id));
  const newSlots = match.added.map((a) => ({ id: nextId++, ...a.draft, timetableId }));

  return {
    timetables: newTimetables,
    slots: [...baseSlots, ...untouched, ...keptSlots, ...newSlots],
    timetableId,
    addedCount: newSlots.length,
    removedCount: match.removed.length,
    keptCount: keptSlots.length,
    changedCount: match.changed.length,
    // 範囲外なので突き合わせに掛けなかったコマ (確認ダイアログで見せる)
    untouchedCount: untouched.length,
  };
}

// ─── 下書き ⇄ 既存コマの突き合わせ (差分プレビューと反映の共通土台) ──
// 下書き (plan.drafts) と既存時間割のコマを突き合わせ、
// 変わらず / 変更 / 追加 / 削除 に分類する。マッチングは 2 段階:
//   1. 全フィールド一致 → 変わらず (多重集合で消し込み)
//   2. 残りを (曜日 × 時刻 × 学年 × クラス) で突き合わせ → 変更、
//      余った下書き → 追加、余った既存 → 削除
// プレビュー (diffReflection) と反映 (applyReflection) が同じ関数を使う
// ことで、「プレビューで変わらずと出たコマの id が反映で振り直される」
// ようなズレが構造的に起きないようにしている。

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
 * 下書きと既存コマ (置き換え先の時間割のもの) を突き合わせる純関数。
 * 各要素は元の slot / draft と、比較用に正規化したレコードを持つ。
 * @param {object[]} drafts buildReflectionPlan の drafts
 * @param {import("../types").Slot[]} existing 置き換え先の時間割の既存コマ
 * @returns {{
 *   unchanged: {slot: object, draft: object, before: object, after: object}[],
 *   changed:   {slot: object, draft: object, before: object, after: object}[],
 *   added:     {draft: object, rec: object}[],
 *   removed:   {slot: object, rec: object}[],
 * }}
 */
export function matchReflection(drafts, existing) {
  const beforeItems = (existing || []).map((slot) => ({
    slot,
    rec: normalizeRecord(slot),
  }));
  const afterItems = (drafts || []).map((draft) => ({
    draft,
    rec: normalizeRecord(draft),
  }));

  // 1. 全フィールド一致の消し込み (同じ内容が複数あっても 1 対 1 で対応させる)
  const byFull = new Map();
  for (const b of beforeItems) {
    const k = fullKey(b.rec);
    if (!byFull.has(k)) byFull.set(k, []);
    byFull.get(k).push(b);
  }
  const unchanged = [];
  const afterRest = [];
  const matched = new Set();
  for (const a of afterItems) {
    const bucket = byFull.get(fullKey(a.rec));
    const b = bucket && bucket.length > 0 ? bucket.shift() : null;
    if (b) {
      matched.add(b);
      unchanged.push({ slot: b.slot, draft: a.draft, before: b.rec, after: a.rec });
    } else {
      afterRest.push(a);
    }
  }
  const beforeRest = beforeItems.filter((b) => !matched.has(b));

  // 2. 位置 (曜日×時刻×学年×クラス) でペアリング
  const group = (list) => {
    const m = new Map();
    for (const item of list) {
      const k = positionKey(item.rec);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(item);
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
    for (let i = 0; i < n; i++) {
      changed.push({
        slot: befores[i].slot,
        draft: afters[i].draft,
        before: befores[i].rec,
        after: afters[i].rec,
      });
    }
    for (let i = n; i < afters.length; i++) added.push(afters[i]);
    for (let i = n; i < befores.length; i++) removed.push(befores[i]);
    beforeByPos.delete(k);
  }
  for (const rest of beforeByPos.values()) removed.push(...rest);

  return { unchanged, changed, added, removed };
}

/**
 * 差分プレビュー用のビュー (表示用に正規化レコードだけを並べ替えて返す)。
 * @param {object[]} drafts buildReflectionPlan の drafts
 * @param {import("../types").Slot[]} slots 本体の全コマ
 * @param {number} timetableId 置き換え先の時間割 id
 * @param {{days?: string[], grades?: string[]}} [scope] 反映する範囲。
 *   applyReflection と**同じ範囲を渡すこと** — 範囲外のコマを既存側から
 *   外さないと、実際には触らないコマが「削除」としてプレビューに出る
 * @returns {{unchanged: number,
 *   changed: {before: object, after: object}[],
 *   added: object[], removed: object[]}}
 */
export function diffReflection(drafts, slots, timetableId, scope) {
  const inScope = scopeMatcher(scope);
  const match = matchReflection(
    drafts,
    slots.filter((s) => (s.timetableId ?? 1) === timetableId && inScope(s))
  );
  return {
    unchanged: match.unchanged.length,
    changed: sortRecords(
      match.changed.map((c) => ({ before: c.before, after: c.after })),
      (c) => c.after
    ),
    added: sortRecords(match.added.map((a) => a.rec)),
    removed: sortRecords(match.removed.map((r) => r.rec)),
  };
}
