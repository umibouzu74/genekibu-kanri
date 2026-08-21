// 欠勤組み換えワークフロー用のヘルパ群。
// AbsenceWorkflowView から使われるが、ロジックだけ切り出してテスト可能に。

import {
  biweeklyActiveTeacher,
  getSlotTeachers,
  isSlotForTeacher,
  splitTeacherField,
} from "./biweekly";
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

// 指定日 (YYYY-MM-DD) の曜日に、指定先生群が担当するスロット id 集合を返す。
// 隔週パートナーも `getSlotTeachers` が抽出する。
// date が null の場合は空集合。
export function getAbsentSlotIds(slots, dayOfDate, absentTeachers) {
  const out = new Set();
  if (!dayOfDate || !Array.isArray(absentTeachers) || absentTeachers.length === 0) {
    return out;
  }
  const teacherSet = new Set(absentTeachers);
  for (const s of slots) {
    if (s.day !== dayOfDate) continue;
    const ts = getSlotTeachers(s);
    if (ts.some((t) => teacherSet.has(t))) out.add(s.id);
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
// @param {object} args
// @param {Array} args.slots          対象日のコマ群 (getAbsenceDaySlots 済み)
// @param {string} args.date          "YYYY-MM-DD"
// @param {string[]} args.teachers    欠勤する先生
// @param {object} [args.ctx]         { biweeklyAnchors, holidays, examPeriods, isOffForGrade }
// @param {object} [args.draft]       useAbsenceDraft の draft (下書きの重複回避)
// @param {Array} [args.existingSubs] 保存済み代行レコード (全日付可)
// @param {Set<number>} [args.removedSubIds] 解除マーク済みの代行 id
// @returns {{targets: {slotId: number, teacher: string}[],
//            skipped: {slot: object, reason: string}[]}}
export function collectAbsenceTargets({
  slots,
  date,
  teachers,
  ctx = {},
  draft = {},
  existingSubs = [],
  removedSubIds = null,
}) {
  const targets = [];
  const skipped = [];
  if (!date || !Array.isArray(teachers) || teachers.length === 0) {
    return { targets, skipped };
  }
  const absent = new Set(teachers);
  const { biweeklyAnchors = [], holidays = [], examPeriods = [], isOffForGrade } = ctx;

  for (const slot of slots || []) {
    // その先生に関わりのないコマは静かに飛ばす (理由も出さない)。
    // 隔週のパートナーは note にしか出ないので isSlotForTeacher で見る。
    if (![...absent].some((t) => isSlotForTeacher(slot, t))) continue;

    // 隔週コマは担当週 (A/B) を解決してから。今週の担当でなければ対象外。
    const active = splitTeacherField(
      biweeklyActiveTeacher(slot, date, biweeklyAnchors, holidays, examPeriods)
    );
    const teacher = active.find((t) => absent.has(t));
    if (!teacher) {
      skipped.push({ slot, reason: "この週は担当しない (隔週)" });
      continue;
    }

    if (isOffForGrade && isOffForGrade(date, slot.grade, slot.subj)) {
      skipped.push({ slot, reason: "休講・テスト期間" });
      continue;
    }

    const row = draft[slot.id];
    if (row?.absorbedBy != null || row?.combine?.absorbedSlotIds?.length) {
      skipped.push({ slot, reason: "合同で対応済み" });
      continue;
    }
    if (row?.reschedule?.targetDate) {
      skipped.push({ slot, reason: "振替で対応済み" });
      continue;
    }
    if (row?.sub) {
      skipped.push({ slot, reason: "すでに下書きあり" });
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
      skipped.push({ slot, reason: "登録済み" });
      continue;
    }

    targets.push({ slotId: slot.id, teacher });
  }
  return { targets, skipped };
}
