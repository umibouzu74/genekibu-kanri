// ─── コホート (学校・曜日コホート) 導出ユーティリティ ──────────────
// 「終講日 (表示の終了日)」は学年グループ (中1・2 / 中3 / 高1・2 / 高3)
// より細かい単位でズレる:
//   - 高校: 学校ごとに授業が分かれる。学校はテスト日程・終業が違うため、
//           同じ回数でも終講日が学校ごとにズレる。
//           学校は slot.subj の先頭トークンに入っている
//           (例: "高松西 数学" → 学校 = "高松西")。
//   - 中学: 同じ学年でも 火木 コホートと 水金 コホートは曜日が違うので、
//           同じ回数に達する日 (= 終講日) がズレる。
//
// そこで slot を「コホート」に束ねる。コホート ID は安定キーで、導出と
// マッチングの双方で同じ関数を使うことで取りこぼしを防ぐ。
//   - 高校:  `H|<学年>|<学校>`      (学校 = subj 先頭トークン)
//   - 中学:  `M|<学年>|<曜日ペア>`  (火木 / 水金 / それ以外は曜日そのもの)
//
// 純粋関数のみ。UI (CohortCutoffEditor) と終講日フィルタ (isSlotBeyondCutoff)
// から参照する単一情報源。

import { gradeToDept } from "./scheduleHelpers";
import { DAYS } from "../constants/schools";

// subj の先頭トークン (= 学校 / コース名)。半角・全角スペース両対応。
// 例: "高松西 数学" → "高松西", "東大京大医進 英語" → "東大京大医進",
//     "古文漢文" → "古文漢文" (スペースなしは全体が 1 トークン)。
// JS の \s は全角スペース (U+3000) も含むため半角・全角の両方を分割できる。
export function firstSubjToken(subj) {
  if (!subj) return "";
  return subj.trim().split(/\s+/)[0] || "";
}

// 曜日 → コホートの曜日ペアラベル。
// 火・木 は同一コホート (火木)、水・金 は同一コホート (水金)。
// それ以外 (月・土・日) はその曜日単独をラベルとする。
export function dayPairLabel(day) {
  if (day === "火" || day === "木") return "火木";
  if (day === "水" || day === "金") return "水金";
  return day || "";
}

// 曜日ペアラベル → 含まれる曜日の配列。
export function daysForPairLabel(label) {
  if (label === "火木") return ["火", "木"];
  if (label === "水金") return ["水", "金"];
  return label ? [label] : [];
}

// slot が属するコホートの安定 ID を返す。
// 導出 (deriveCohortsFromSlots) と照合 (findCohortCutoff) の両方で使う。
export function slotCohortId(slot) {
  if (!slot || !slot.grade) return "";
  const dept = gradeToDept(slot.grade);
  if (dept === "高校部") {
    return `H|${slot.grade}|${firstSubjToken(slot.subj)}`;
  }
  // 中学部 (および dept 不明) は曜日ペアで束ねる。
  return `M|${slot.grade}|${dayPairLabel(slot.day)}`;
}

// slot からコホート記述子を生成する (UI 表示・保存用のメタ)。
function describeCohort(slot) {
  const dept = gradeToDept(slot.grade);
  const id = slotCohortId(slot);
  if (dept === "高校部") {
    const school = firstSubjToken(slot.subj);
    return {
      id,
      dept,
      grade: slot.grade,
      school,
      days: null,
      // 学校が空 (subj 未入力等) の場合は学年のみ表示。
      label: school ? `${slot.grade} ${school}` : slot.grade,
    };
  }
  const pair = dayPairLabel(slot.day);
  return {
    id,
    dept: dept || "中学部",
    grade: slot.grade,
    school: null,
    days: daysForPairLabel(pair),
    label: pair ? `${slot.grade} ${pair}` : slot.grade,
  };
}

// slots 一覧から重複を除いたコホート記述子の配列を返す。
// 各コホートには紐づく slotIds と件数を付与し、UI で「○コマ」表示や
// 学年ごとのグルーピングに使う。
// 並び順: 中学部 → 高校部、学年順、最後にラベル順 (安定表示)。
export function deriveCohortsFromSlots(slots) {
  if (!Array.isArray(slots)) return [];
  const byId = new Map();
  // 中学部コホート ID → 実際に授業がある曜日の集合 (高校部は曜日を持たない)。
  const daysById = new Map();
  for (const s of slots) {
    if (!s || !s.grade) continue;
    const id = slotCohortId(s);
    if (!id) continue;
    let c = byId.get(id);
    if (!c) {
      c = { ...describeCohort(s), slotIds: [], slotCount: 0 };
      byId.set(id, c);
    }
    c.slotIds.push(s.id);
    c.slotCount += 1;
    if (c.dept !== "高校部" && s.day) {
      let set = daysById.get(id);
      if (!set) daysById.set(id, (set = new Set()));
      set.add(s.day);
    }
  }
  const arr = [...byId.values()];
  // 中学部のラベル/days は「実際に授業がある曜日」だけから作り直す。
  // dayPairLabel は 火→火木・水→水金 とペアへ寄せて ID を安定させるが、
  // 片曜日しか授業がない学年 (中1=火/金, 中2=月/木, 附中=水 など) で
  // そのままラベルにすると授業の無い曜日 (中1 の木/水 等) が出てしまう。
  // 例: 中1 が火のみ → "中1 火木" ではなく "中1 火"。両曜日あれば従来どおり。
  for (const c of arr) {
    const set = daysById.get(c.id);
    if (!set) continue;
    const days = DAYS.filter((d) => set.has(d));
    if (days.length === 0) continue;
    c.days = days;
    c.label = `${c.grade} ${days.join("")}`;
  }
  arr.sort((a, b) => {
    const deptRank = (d) => (d === "中学部" ? 0 : 1);
    const dr = deptRank(a.dept) - deptRank(b.dept);
    if (dr !== 0) return dr;
    if (a.grade !== b.grade) return a.grade < b.grade ? -1 : 1;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
  return arr;
}

// displayCutoff.cohorts から、slot に一致するコホート終講日エントリを返す。
// 一致なしは null。照合は slotCohortId による完全一致 (曖昧さなし)。
export function findCohortCutoff(slot, cohortCutoffs) {
  if (!Array.isArray(cohortCutoffs) || cohortCutoffs.length === 0) return null;
  const id = slotCohortId(slot);
  if (!id) return null;
  for (const c of cohortCutoffs) {
    if (c && c.id === id) return c;
  }
  return null;
}
