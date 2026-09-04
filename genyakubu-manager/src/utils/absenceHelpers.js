// 欠勤組み換えワークフロー用のヘルパ群。
// AbsenceWorkflowView から使われるが、ロジックだけ切り出してテスト可能に。

import {
  biweeklyActiveTeacher,
  isBiweekly,
  isSlotForTeacher,
  splitTeacherField,
} from "./biweekly";
import { dateToDay } from "./dateHelpers";
import { pickSubjectId } from "./subjectMatch";
import { filterSlotsForDate, isSlotBeyondCutoff } from "./timetable";

// 対象日に欠勤画面へ出すコマを絞る。曜日だけで絞ると、期切替で残してある
// 旧期の時間割 (終了日入り) のコマまで並び、同じクラスが 2 重・3 重に出る
// (2026-08-20 の「わけのわからない画面」)。日付ベースのビュー
// (ダッシュボード / タイムテーブル / 日まるごと振替) と同じ 2 つの窓
//   ① 時間割の適用期間 (startDate/endDate) → filterSlotsForDate
//   ② 表示期間設定・コース別終講日        → isSlotBeyondCutoff
// を必ず併せて見ること。休講 / テスト期間はここでは落とさない —
// 欠勤画面はその日の状態を確かめる場なので、灰色の「休講」カードとして
// 出したままにする (AbsenceSlotCard の cancelLabel)。
export function getAbsenceDaySlots(slots, dateStr, dayName, opts = {}) {
  if (!dateStr || !dayName) return [];
  const { timetables, displayCutoff } = opts;
  return filterSlotsForDate(slots || [], dateStr, timetables).filter(
    (s) => s.day === dayName && !isSlotBeyondCutoff(dateStr, s, displayCutoff)
  );
}

// 対象日にそのコマを実際に担当する先生名 (隔週の A/B を解決した後)。
//   - 非隔週 → 講師欄をそのまま ("香川·福江" は 2 名)
//   - A 週   → 講師欄 / B 週 → note「隔週(◯◯)」のパートナー
// **隔週のパートナーは note にしか出ない**ので、`getSlotTeachers`
// (講師欄しか見ない) で欠勤対象を探すとパートナーを取りこぼし、逆に
// 担当しない週のコマまで拾ってしまう。赤枠 (getAbsentSlotIds) と一括登録
// (collectAbsenceTargets) だけでなく、**代行レコードの originalTeacher を
// 決めるすべての経路** (タイムテーブル代行モード・授業管理の代行登録
// フォーム) がこの 1 つの判定を使うこと (2026-10 の B 週に A 週の主担当で
// 代行が登録された不具合の再発防止)。ctx は { biweeklyAnchors, holidays,
// examPeriods } (holidays / examPeriods は隔週ローテーションの週送り用)。
export function activeTeachersOnDate(slot, dateStr, ctx = {}) {
  return splitTeacherField(
    biweeklyActiveTeacher(
      slot,
      dateStr,
      ctx.biweeklyAnchors || [],
      ctx.holidays,
      ctx.examPeriods
    )
  );
}

// 対象日に指定先生群が担当するスロット id 集合を返す (赤枠表示用)。
// date が空の場合は空集合。ctx は { biweeklyAnchors, holidays, examPeriods }。
export function getAbsentSlotIds(slots, dateStr, absentTeachers, ctx = {}) {
  const out = new Set();
  if (!dateStr || !Array.isArray(absentTeachers) || absentTeachers.length === 0) {
    return out;
  }
  const absent = new Set(absentTeachers);
  const day = dateToDay(dateStr);
  for (const s of slots) {
    if (day && s.day !== day) continue;
    if (activeTeachersOnDate(s, dateStr, ctx).some((t) => absent.has(t))) {
      out.add(s.id);
    }
  }
  return out;
}

// 2 つのコマが「右クリック合同候補」として有効かを判定する。
// 同日・同学年・同教科 (科目IDまたは文字列同一) であれば OK。
// cls の差異は許容 (S/A/B、文系/理系 の合同を許すため)。
// 同一スロット / day 違い / grade 違い はすべて false。
export function canCombineSlots(a, b, subjects = []) {
  if (!a || !b) return false;
  if (a.id === b.id) return false;
  if (a.day !== b.day) return false;
  if (a.grade !== b.grade) return false;

  // 教科の照合: 科目マスタ経由での subjectId マッチを優先。
  // 双方が未マッチなら文字列完全一致で fallback。
  const aId = pickSubjectId(a.subj, subjects);
  const bId = pickSubjectId(b.subj, subjects);
  if (aId != null && bId != null) return aId === bId;
  if (aId == null && bId == null) return (a.subj || "") === (b.subj || "");
  return false;
}

// 同日のコマ群から、与えられたスロットに対する合同候補を返す。
// 候補は canCombineSlots に通ったコマ全て。既に別の combine adjustment で
// 吸収されているコマは除外する (`absorbedSlotIds`)。
export function findCombineCandidates(slot, daySlots, subjects = [], absorbedSlotIds = new Set()) {
  return daySlots.filter(
    (o) =>
      o.id !== slot.id &&
      !absorbedSlotIds.has(o.id) &&
      canCombineSlots(slot, o, subjects)
  );
}

// ─── 「代行未定のまま欠勤にする」対象を集める ──────────────────────
// 欠勤は独立したモデルではなく、**代行者が空の代行レコード**
// (substitute: "" / status: "requested") で表す。代行が決まったら同じ
// レコードに名前が入るだけなので、玉突き代行 (ChainSubstitutionPanel) や
// 一覧・スケジュール表示はそのまま乗る。**新しいモデルを足さないこと。**
//
// 対象は「その日にその先生が実際に担当するコマ」だけ。外したコマは理由を
// 返して画面に出す (黙って減らさない = 日まるごと振替と同じ方針)。
//
// 返すのは **(コマ, 講師) の組**。プレップのように 1 コマを 3 人で担当する
// コマでは、休む人のぶんだけ組が並ぶ (香川と福江は休むが川井は出る)。
//
// @param {object} args
// @param {Array} args.slots          対象日のコマ群 (getAbsenceDaySlots 済み)
// @param {string} args.date          "YYYY-MM-DD"
// @param {string[]} args.teachers    欠勤する先生
// @param {object} [args.ctx]         { biweeklyAnchors, holidays, examPeriods, isOffForGrade }
// @param {object} [args.draft]       useAbsenceDraft の draft (下書きの重複回避)
// @param {Array} [args.existingSubs] 保存済み代行レコード (全日付可)
// @param {Set<number>} [args.removedSubIds] 解除マーク済みの代行 id
// @param {Array} [args.existingAdjustments] 保存済み調整 (振替・合同の除外用)
// @param {Set<number>} [args.removedAdjustmentIds] 解除マーク済みの調整 id
// @returns {{targets: {slotId: number, slot: object, teacher: string}[],
//            skipped: {slot: object, teacher?: string, teachers?: string[],
//                      reason: string}[]}}
export function collectAbsenceTargets({
  slots,
  date,
  teachers,
  ctx = {},
  draft = {},
  existingSubs = [],
  removedSubIds = null,
  existingAdjustments = [],
  removedAdjustmentIds = null,
}) {
  const targets = [];
  const skipped = [];
  if (!date || !Array.isArray(teachers) || teachers.length === 0) {
    return { targets, skipped };
  }
  const absent = new Set(teachers);
  const { isOffForGrade } = ctx;

  // 保存済みの振替・合同 (解除マーク済みは無かったことにする)。下書きだけを
  // 見ていると、前に振替・合同で片付けたコマにもう一度欠勤を作ってしまう。
  const adjustedSlots = new Map(); // slotId -> "振替" | "合同"
  for (const adj of existingAdjustments || []) {
    if (adj.date !== date) continue;
    if (removedAdjustmentIds?.has(adj.id)) continue;
    if (adj.type === "reschedule" && adj.targetDate) {
      adjustedSlots.set(adj.slotId, "振替");
    } else if (adj.type === "combine") {
      adjustedSlots.set(adj.slotId, "合同");
      for (const id of adj.combineSlotIds || []) adjustedSlots.set(id, "合同");
    }
  }

  for (const slot of slots || []) {
    const active = activeTeachersOnDate(slot, date, ctx);
    const absentHere = active.filter((t) => absent.has(t));
    if (absentHere.length === 0) {
      // 隔週で「今週は担当しない側」のときだけ理由を出す。講師欄にも
      // note にも出てこないコマは関わりが無いので静かに飛ばす。
      if (isBiweekly(slot.note) && [...absent].some((t) => isSlotForTeacher(slot, t))) {
        skipped.push({ slot, reason: "この週は担当しない (隔週)" });
      }
      continue;
    }

    // コマ単位で外れる理由 (その日そのコマが走らない / 別の手で片付いている)。
    const row = draft[slot.id];
    const slotReason =
      isOffForGrade && isOffForGrade(date, slot.grade, slot.subj)
        ? "休講・テスト期間"
        : row?.absorbedBy != null || row?.combine?.absorbedSlotIds?.length
          ? "合同で対応済み"
          : row?.reschedule?.targetDate
            ? "振替で対応済み"
            : adjustedSlots.get(slot.id)
              ? `${adjustedSlots.get(slot.id)}で対応済み`
              : null;
    if (slotReason) {
      skipped.push({ slot, teachers: absentHere, reason: slotReason });
      continue;
    }

    // ここからは講師ごと。すでに下書き / 登録のある人だけ外す。
    for (const teacher of absentHere) {
      if (row?.subs?.[teacher]) {
        skipped.push({ slot, teacher, reason: "すでに下書きあり" });
        continue;
      }
      const saved = (existingSubs || []).find(
        (x) =>
          x.date === date &&
          x.slotId === slot.id &&
          x.originalTeacher === teacher &&
          !removedSubIds?.has(x.id)
      );
      if (saved) {
        skipped.push({ slot, teacher, reason: "登録済み" });
        continue;
      }
      targets.push({ slotId: slot.id, slot, teacher });
    }
  }
  return { targets, skipped };
}
