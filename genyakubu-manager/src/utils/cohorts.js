// ─── コホート (コース別 終講日) 導出ユーティリティ ─────────────────
// 「終講日 (表示の終了日)」は学年グループ (中1・2 / 中3 / 高1・2 / 高3)
// より細かい「コース」単位でズレる:
//   - 高校: 学校ごとに授業が分かれる。学校はテスト日程・終業が違うため、
//           同じ回数でも終講日が学校ごとにズレる。
//           学校は slot.subj の先頭トークンに入っている
//           (例: "高松西 数学" → 学校 = "高松西")。
//   - 中学: 同じ生徒が通う授業群 = 1 コースでまとめる。コースの曜日は学年で
//           異なる (中1=火金 / 中2=月木 / 附中=水 / 中3=火木 と 水金 の 2 本)。
//           中3 のように 火木 と 水金 で生徒 (クラス編成) が分かれる学年だけ
//           別コースに分割する (終講日もズレるため)。土曜の特訓・プレップは
//           常に別コース。
//
// コホート ID は安定キーで、実際に授業がある曜日 (中学) / 学校 (高校) を
// そのまま埋め込む:
//   - 高校:  `H|<学年>|<学校>`     (学校 = subj 先頭トークン)
//   - 中学:  `M|<学年>|<曜日列>`   (例: 火金 / 月木 / 火木 / 水金 / 土)
//
// 導出 (deriveCohortsFromSlots) は全 slot を学年ごとに集めてからコース分割
// する。照合 (findCohortCutoff) は保存済みコホート ID の曜日列に slot.day が
// 含まれるか (高校は学校一致) で判定する。両者が同じ ID 形式を共有することで
// 取りこぼしを防ぐ。純粋関数のみ。UI (CohortCutoffEditor) と終講日フィルタ
// (isSlotBeyondCutoff) から参照する単一情報源。

import { gradeToDept } from "./scheduleHelpers";
import { DAYS } from "../constants/schools";

// 中学コースの「同一トラック」を表す標準ペア。両曜日とも授業がある学年
// (中3 など) は 火木 と 水金 を別コースに分割する。片方しか無い学年は
// その学年の平日をまとめて 1 コースにする (中1=火金 / 中2=月木)。
const CANONICAL_PAIRS = [
  ["火", "木"],
  ["水", "金"],
];
const WEEKDAYS = ["月", "火", "水", "木", "金"];

// subj の先頭トークン (= 学校 / コース名)。半角・全角スペース両対応。
// 例: "高松西 数学" → "高松西", "東大京大医進 英語" → "東大京大医進",
//     "古文漢文" → "古文漢文" (スペースなしは全体が 1 トークン)。
// JS の \s は全角スペース (U+3000) も含むため半角・全角の両方を分割できる。
export function firstSubjToken(subj) {
  if (!subj) return "";
  return subj.trim().split(/\s+/)[0] || "";
}

// 学年が持つ曜日集合を「コース」単位の曜日グループへ分割する。
//   - 平日 (月〜金): 火木・水金の両ペアが揃う学年だけ 2 コースに分割し、
//     それ以外はその学年の平日をまとめて 1 コースにする。
//   - 土 (および想定外の曜日) は各曜日 1 コース (土曜特訓・プレップ等)。
// 返り値の各グループは曜日 (週順) の配列。
export function partitionDaysIntoCourses(daySet) {
  const groups = [];
  const placed = new Set();
  const has = (d) => daySet.has(d);
  const push = (days) => {
    groups.push(days);
    for (const d of days) placed.add(d);
  };

  const weekdays = WEEKDAYS.filter(has);
  const bothPairs = CANONICAL_PAIRS.every((pair) => pair.every(has));
  if (bothPairs) {
    for (const pair of CANONICAL_PAIRS) push([...pair]);
    const rest = weekdays.filter((d) => !placed.has(d));
    if (rest.length) push(rest); // 月 等の余り (通常は発生しない)
  } else if (weekdays.length) {
    push(weekdays);
  }
  // 土・日や想定外の曜日は各曜日を単独コースにする (週順 → その他)。
  for (const d of [...DAYS, ...daySet]) {
    if (has(d) && !placed.has(d)) push([d]);
  }
  return groups;
}

// slots 一覧から重複を除いたコホート記述子の配列を返す。
// 各コホートには紐づく slotIds と件数を付与し、UI で「○コマ」表示や
// 学年ごとのグルーピングに使う。
// 並び順: 中学部 → 高校部、学年順、最後にラベル順 (安定表示)。
export function deriveCohortsFromSlots(slots) {
  if (!Array.isArray(slots)) return [];

  // 高校は学校別 (slot 単位で確定)。中学は学年ごとに 曜日→slotId を集めてから
  // コース分割する (片曜日しかない学年の偽ペア表示を防ぐため)。
  const highById = new Map();
  const midByGrade = new Map(); // grade → Map<day, number[]>

  for (const s of slots) {
    if (!s || !s.grade) continue;
    const dept = gradeToDept(s.grade);
    if (dept === "高校部") {
      const school = firstSubjToken(s.subj);
      const id = `H|${s.grade}|${school}`;
      let c = highById.get(id);
      if (!c) {
        c = {
          id,
          dept,
          grade: s.grade,
          school,
          days: null,
          label: school ? `${s.grade} ${school}` : s.grade,
          slotIds: [],
          slotCount: 0,
        };
        highById.set(id, c);
      }
      c.slotIds.push(s.id);
      c.slotCount += 1;
    } else {
      if (!s.day) continue; // 曜日不明はコホート化できない
      let byDay = midByGrade.get(s.grade);
      if (!byDay) midByGrade.set(s.grade, (byDay = new Map()));
      let ids = byDay.get(s.day);
      if (!ids) byDay.set(s.day, (ids = []));
      ids.push(s.id);
    }
  }

  const arr = [];
  for (const [grade, byDay] of midByGrade) {
    const groups = partitionDaysIntoCourses(new Set(byDay.keys()));
    for (const days of groups) {
      const slotIds = days.flatMap((d) => byDay.get(d) || []);
      if (slotIds.length === 0) continue;
      const key = days.join("");
      arr.push({
        id: `M|${grade}|${key}`,
        dept: "中学部",
        grade,
        school: null,
        days,
        label: `${grade} ${key}`,
        slotIds,
        slotCount: slotIds.length,
      });
    }
  }
  for (const c of highById.values()) arr.push(c);

  arr.sort((a, b) => {
    const deptRank = (d) => (d === "中学部" ? 0 : 1);
    const dr = deptRank(a.dept) - deptRank(b.dept);
    if (dr !== 0) return dr;
    if (a.grade !== b.grade) return a.grade < b.grade ? -1 : 1;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
  return arr;
}

// displayCutoff.cohorts から、slot が属するコホート終講日エントリを返す。
// 一致なしは null。ID を分解して照合する:
//   - 高校 `H|学年|学校`   : 学年一致かつ subj 先頭トークン == 学校
//   - 中学 `M|学年|曜日列` : 学年一致かつ曜日列に slot.day が含まれる
//     (曜日は 1 文字なので includes で判定できる)。
// 導出側がコースをどう束ねても (火金 / 月木 等)、保存済み ID の曜日列だけで
// 判定できるため全 slot を渡す必要がない (isSlotBeyondCutoff は slot 単位)。
export function findCohortCutoff(slot, cohortCutoffs) {
  if (!Array.isArray(cohortCutoffs) || cohortCutoffs.length === 0) return null;
  if (!slot || !slot.grade) return null;
  for (const c of cohortCutoffs) {
    if (c && c.id && cohortIdMatchesSlot(c.id, slot)) return c;
  }
  return null;
}

// コホート ID (`<種別>|<学年>|<キー>`) が slot に一致するか。
// 学校名に "|" が含まれても良いよう、キーは 2 個目の "|" 以降すべてを採る。
function cohortIdMatchesSlot(id, slot) {
  const first = id.indexOf("|");
  if (first < 0) return false;
  const second = id.indexOf("|", first + 1);
  if (second < 0) return false;
  const kind = id.slice(0, first);
  const grade = id.slice(first + 1, second);
  const key = id.slice(second + 1);
  if (grade !== slot.grade) return false;
  if (kind === "H") return firstSubjToken(slot.subj) === key;
  if (kind === "M") return !!slot.day && key.includes(slot.day);
  return false;
}
