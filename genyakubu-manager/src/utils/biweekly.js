// ─── Biweekly helpers ──────────────────────────────────────────────
import { WEEKDAYS } from "../constants/schools";
import { fmtDate, parseLocalDate } from "./dateHelpers";
import { isSlotCancelledForBiweeklyShift } from "./scheduleHelpers";

// "月"〜"土" → Date#getDay() の index (日=0)。
const JP_DAY_TO_IDX = Object.fromEntries(WEEKDAYS.map((w, i) => [w, i]));

// note の「隔週(◯◯)」のパートナー部分。日本語 IME で普通に入力すると全角の
// 「（）」になるので、半角・全角どちらの括弧も受ける (講師の区切り "·"/"・" と
// 同じ再発防止。2026-10-03: 「隔週（河野）」がどの画面でもパートナー無しの
// 隔週になり、B 週も主担当の時間として数えられていた)。
// **パートナーの読み取りは biweeklyPartner を通すこと** (正規表現を各所に
// 書き起こさない)。
const BIWEEKLY_PARTNER_RE = /隔週[(（]([^)）]+)[)）]/;

// Format a teacher name with a biweekly partner extracted from the
// free-form note field. e.g. teacher="堀上", note="隔週(河野)"
// → "堀上 / 河野".
export function formatBiweeklyTeacher(teacher, note) {
  const partner = biweeklyPartner(note);
  return partner ? `${teacher} / ${partner}` : teacher;
}

// Determine whether a given date falls in an "A" week or "B" week.
//
// Accepts either:
//   - a base date string (legacy): getWeekType("2026-04-13", "2026-04-06")
//   - an array of BiweeklyAnchor objects: getWeekType("2026-04-13", [{date:"2026-04-06", weekType:"A"}])
//
// When multiple anchors are provided the most recent anchor on or before
// the target date is used as the reference point. This prevents drift
// caused by holidays or schedule disruptions — just add a new anchor
// after the disruption to re-sync.
//
// Returns "A" | "B" | null.
export function getWeekType(dateStr, anchorsOrBaseStr) {
  if (!dateStr) return null;

  // Legacy: single base-date string
  if (typeof anchorsOrBaseStr === "string") {
    return anchorsOrBaseStr ? getWeekTypeFromBase(dateStr, anchorsOrBaseStr) : null;
  }

  // New: array of anchor objects
  const anchors = anchorsOrBaseStr;
  if (!Array.isArray(anchors) || anchors.length === 0) return null;

  // Find the most recent anchor whose date is <= dateStr
  let best = null;
  for (const a of anchors) {
    if (a.date && a.date <= dateStr) {
      if (!best || a.date > best.date) best = a;
    }
  }

  if (best) return getWeekTypeFromBase(dateStr, best.date);

  // dateStr is before all anchors — use the earliest anchor and calculate backwards
  let earliest = anchors[0];
  for (const a of anchors) {
    if (a.date && a.date < earliest.date) earliest = a;
  }
  return getWeekTypeFromBase(dateStr, earliest.date);
}

// Core week-type calculation from a single base date.
function getWeekTypeFromBase(dateStr, baseStr) {
  const base = new Date(baseStr + "T12:00:00");
  const target = new Date(dateStr + "T12:00:00");
  if (isNaN(base.getTime()) || isNaN(target.getTime())) return null;
  const diffDays = Math.round((target - base) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7);
  return Math.abs(weeks) % 2 === 0 ? "A" : "B";
}

// Format the note field for display, expanding the biweekly marker to
// show both teachers. e.g. teacher="堀上", note="隔週(河野)"
// → "隔週 : 堀上 / 河野".
// Non-biweekly notes are returned as-is.
export function formatBiweeklyNote(teacher, note) {
  if (!note) return note;
  return note.replace(
    BIWEEKLY_PARTNER_RE,
    (_, partner) => `隔週 : ${teacher} / ${partner.trim()}`
  );
}

// Convenience: check if a note includes the "隔週" marker.
export function isBiweekly(note) {
  return !!note && note.includes("隔週");
}

// note の「隔週(パートナー)」マーカーからパートナー講師名を取り出す
// (括弧は半角・全角どちらでもよい。前後の空白は落とす)。マーカーが無い・
// 「隔週」だけで名前が読めないときは null。
export function biweeklyPartner(note) {
  const m = typeof note === "string" ? note.match(BIWEEKLY_PARTNER_RE) : null;
  const name = m ? m[1].trim() : "";
  return name || null;
}

// anchor 以降・target 未満の範囲で、slot.day に当たる日付のうち
// 休講 (holidays) または stopsClasses≠false のテスト期間 (examPeriods) で
// 実施されなかった回数を数える。
// 隔週ローテーションのシフト補正用 (消化されなかった A/B 側が次回に
// 持ち越される)。
function countCancelledSlotDaysBefore(
  targetDateStr, anchorDateStr, slot, holidays, examPeriods
) {
  const noHolidays = !holidays || holidays.length === 0;
  const noExams = !examPeriods || examPeriods.length === 0;
  if (noHolidays && noExams) return 0;
  if (!slot || !slot.day) return 0;
  const slotDayIdx = JP_DAY_TO_IDX[slot.day];
  if (slotDayIdx == null) return 0;

  const anchorD = parseLocalDate(anchorDateStr);
  const targetD = parseLocalDate(targetDateStr);
  if (!anchorD || !targetD || targetD <= anchorD) return 0;

  // anchor 以降で最初の slot.day を起点に 7 日ずつ進む。
  // anchor 当日に slot.day が当たる場合は anchor 自身を起点とせず、
  // 次の slot.day (7 日後) から数える (anchor の A=確定 を尊重)。
  const anchorDayIdx = anchorD.getDay();
  const daysToFirstSlotDay = (slotDayIdx - anchorDayIdx + 7) % 7;
  const cursor = new Date(anchorD);
  cursor.setDate(cursor.getDate() + (daysToFirstSlotDay === 0 ? 7 : daysToFirstSlotDay));

  let count = 0;
  while (cursor < targetD) {
    const cursorStr = fmtDate(cursor);
    if (isSlotCancelledForBiweeklyShift(slot, cursorStr, holidays, examPeriods)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return count;
}

// Determine the week type for a specific slot on a given date.
// Uses per-slot anchors when present, otherwise falls back to global anchors.
//
// holidays / examPeriods を渡すと、anchor 以降に slot が「実施されなかった」
// 回数のパリティ分だけ A/B を反転させる (=実施されなかった週は隔週
// ローテーションを進めない)。例: 5/1=B → 5/8 休講/特訓 → 5/15 は B の
// ままではなく A になる。
// 「実施されなかった」= 休講 (Holiday) または stopsClasses≠false の
// テスト期間 (ExamPeriod) で当該 slot が休止になる場合。stopsClasses=false の
// 高校テスト等は対象外 (授業継続扱い)。
export function getSlotWeekType(dateStr, slot, globalAnchors, holidays, examPeriods) {
  const anchors =
    slot.biweeklyAnchors && slot.biweeklyAnchors.length > 0
      ? slot.biweeklyAnchors
      : globalAnchors;
  const base = getWeekType(dateStr, anchors);
  if (base == null) return null;
  const noHolidays = !holidays || holidays.length === 0;
  const noExams = !examPeriods || examPeriods.length === 0;
  if (noHolidays && noExams) return base;
  if (!Array.isArray(anchors) || anchors.length === 0) return base;

  // anchor 以降のみ補正 (anchor より前は素直なカレンダー parity に従う)
  let best = null;
  for (const a of anchors) {
    if (a.date && a.date <= dateStr) {
      if (!best || a.date > best.date) best = a;
    }
  }
  if (!best) return base;

  const cancelled = countCancelledSlotDaysBefore(
    dateStr, best.date, slot, holidays, examPeriods
  );
  if (cancelled % 2 === 0) return base;
  return base === "A" ? "B" : "A";
}

// Returns the weight of a slot for コマ数 calculation.
// Biweekly slots count as 0.5, regular slots as 1.
export function slotWeight(note) {
  return isBiweekly(note) ? 0.5 : 1;
}

// Compute weighted slot count for an array of slots.
export function weightedSlotCount(slots) {
  let total = 0;
  for (const s of slots) total += slotWeight(s.note);
  return total;
}

// 複数講師の区切り文字。正史 (既存データ・表示) は "·" (U+00B7) だが、
// 日本語 IME で普通に入力すると "・" (U+30FB 全角中点) や "･" (U+FF65
// 半角中点) になる。手入力フィールド (追加授業の担当など) で別種の中点が
// 入ると、その講師のスケジュールに一切表示されない silent 欠落になるため、
// マッチングは 3 種すべてを区切りとして扱う。
const TEACHER_SEPARATOR = /[·・･]/;

// teacher フィールドを講師名の配列に分解する ("·"/"・"/"･" 区切り +
// 各名前の前後空白を除去)。空フィールド・undefined は []。
export function splitTeacherField(field) {
  return String(field ?? "")
    .split(TEACHER_SEPARATOR)
    .map((t) => t.trim())
    .filter(Boolean);
}

// Check whether a slot belongs to the given teacher.
// Matches on: direct teacher field, biweekly partner in note, or
// multi-teacher field (区切りの扱いは splitTeacherField を参照)。
export function isSlotForTeacher(slot, teacher) {
  if (slot.teacher === teacher) return true;
  if (slot.note?.includes(teacher)) return true;
  if (splitTeacherField(slot.teacher).includes(teacher)) return true;
  // 担当の切り替え (teacherChanges) の前後の担当も「関わる講師」に入れる。
  // 日付のある画面はこの後で日ごとに isTeacherActiveOnDate で絞る
  return hasTeacherChanges(slot) && slotTeacherNamesEver(slot).includes(teacher);
}

// ─── 担当の切り替え (slot.teacherChanges、A5 2026-10-31) ────────────────
// 学期の途中から担当が変わるコマ。`[{from: "YYYY-MM-DD", teacher, partner?, memo?}]`
// (from の昇順)。その日の担当 = from がその日以前で一番新しい切り替えの teacher、
// 無ければ slot.teacher。期間限定の変更は戻す行 (from = 戻る日, teacher = 元の
// 担当) で表す。
//   - teacher は slot.teacher と同じ書き方 (複数担当は "·" 区切り)
//   - partner は隔週の B 週の相手 (note の「隔週(◯◯)」)。無ければ note のまま。
//     読み取りは biweeklyPartner の 1 か所のまま (その日の note を作って渡す)
//   - 第N回・隔週の週送り (biweeklyAnchors) は担当を見ないので変わらない
//     (担当が変わっても同じ授業として数える)
// **日付のある処理は slotOnDate (その日のコマ) を通す**。slot.teacher を直に
// 読むと、切り替え前の担当のまま表示・集計される。

/** 担当の切り替えを持つか */
export function hasTeacherChanges(slot) {
  return Array.isArray(slot?.teacherChanges) && slot.teacherChanges.length > 0;
}

/** その日の担当が日によって変わりうるか (隔週 or 担当の切り替え)。
 *  日付ごとの絞り込み (isTeacherActiveOnDate) が要るかの前段 */
export function teacherVariesByDate(slot) {
  return isBiweekly(slot?.note) || hasTeacherChanges(slot);
}

/** dateStr に効いている切り替え (無ければ null) */
export function teacherChangeOn(slot, dateStr) {
  if (!hasTeacherChanges(slot) || !dateStr) return null;
  let best = null;
  for (const c of slot.teacherChanges) {
    if (!c || !c.from || c.from > dateStr) continue;
    if (!best || c.from >= best.from) best = c;
  }
  return best;
}

/** note の「隔週(◯◯)」の相手を差し替える (隔週の印が無ければそのまま) */
export function withBiweeklyPartner(note, partner) {
  if (!note || !partner || !BIWEEKLY_PARTNER_RE.test(note)) return note;
  return note.replace(BIWEEKLY_PARTNER_RE, `隔週(${partner})`);
}

/**
 * その日のコマ (担当の切り替えを当てたもの)。切り替えの無い日 / コマは
 * 同じオブジェクトを返す。切り替えた日は teacher (と隔週の相手) を差し替え、
 * teacherChanges を外したコピー (もう一度別の日で解かれないように)。
 */
export function slotOnDate(slot, dateStr) {
  const c = teacherChangeOn(slot, dateStr);
  if (!c) return slot;
  const { teacherChanges: _drop, ...rest } = slot;
  return {
    ...rest,
    teacher: c.teacher ?? slot.teacher,
    note: c.partner ? withBiweeklyPartner(slot.note, c.partner) : slot.note,
  };
}

/**
 * コマの一覧をその日のコマにする (担当の切り替えを当てる)。切り替えの当たる
 * コマが無ければ同じ配列を返す (memo を壊さない)。日付のある画面 (日別の
 * ダッシュボード・タイムテーブル・欠勤組み換え・代行登録) の入口で通す。
 * **保存には使わない** (切り替えが外れ、元の担当が書き換わる。編集は
 * id で保存済みのコマを引き直す)
 */
export function slotsOnDate(slots, dateStr) {
  if (!Array.isArray(slots) || !dateStr) return slots;
  let changed = false;
  const out = slots.map((s) => {
    const d = s && hasTeacherChanges(s) ? slotOnDate(s, dateStr) : s;
    if (d !== s) changed = true;
    return d;
  });
  return changed ? out : slots;
}

/** 切り替えの前後を通して関わる講師の全員 (主担当・隔週の相手。重複なし) */
export function slotTeacherNamesEver(slot) {
  const out = [];
  const add = (n) => {
    if (n && !out.includes(n)) out.push(n);
  };
  for (const n of splitTeacherField(slot?.teacher)) add(n);
  add(biweeklyPartner(slot?.note));
  for (const c of hasTeacherChanges(slot) ? slot.teacherChanges : []) {
    for (const n of splitTeacherField(c?.teacher)) add(n);
    add(c?.partner ? c.partner.trim() : null);
  }
  return out;
}

/**
 * fromDate〜toDate (どちらも含む。null は端なし) に担当する講師 (主担当・隔週の
 * 相手。重複なし)。担当の目安・年度の講師一覧のように期間で見る用途
 */
export function slotTeacherNamesBetween(slot, fromDate, toDate) {
  if (!hasTeacherChanges(slot)) {
    return slotTeacherNamesEver(slot);
  }
  const out = [];
  const addSlot = (s) => {
    for (const n of splitTeacherField(s.teacher)) if (!out.includes(n)) out.push(n);
    const p = biweeklyPartner(s.note);
    if (p && !out.includes(p)) out.push(p);
  };
  // 期間の初日の担当 + 期間の中で切り替わった後の担当
  addSlot(fromDate ? slotOnDate(slot, fromDate) : slot);
  for (const c of slot.teacherChanges) {
    if (!c?.from) continue;
    if (fromDate && c.from <= fromDate) continue;
    if (toDate && c.from > toDate) continue;
    addSlot(slotOnDate(slot, c.from));
  }
  return out;
}

/**
 * 保存用に切り替えの並びを整える: from の昇順・同じ from は後の方・teacher は
 * "·" 区切りに正規化・空の memo / partner はキーごと持たない (RTDB は undefined を
 * 書けない)。from か teacher の無い行は落とす。空になったら空配列。
 */
export function normalizeTeacherChanges(list) {
  if (!Array.isArray(list)) return [];
  const byFrom = new Map();
  for (const c of list) {
    if (!c || typeof c.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.from)) continue;
    const teacher = splitTeacherField(c.teacher).join("·");
    if (!teacher) continue;
    const out = { from: c.from, teacher };
    const partner = typeof c.partner === "string" ? splitTeacherField(c.partner).join("·") : "";
    if (partner) out.partner = partner;
    const memo = typeof c.memo === "string" ? c.memo.trim() : "";
    if (memo) out.memo = memo;
    byFrom.set(c.from, out);
  }
  return [...byFrom.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** コマの teacherChanges を正規化して書き戻す (空ならキーごと消す) */
export function withTeacherChanges(slot, list) {
  const norm = normalizeTeacherChanges(list);
  const { teacherChanges: _drop, ...rest } = slot;
  return norm.length > 0 ? { ...rest, teacherChanges: norm } : rest;
}

// Extract individual teacher names from a slot's teacher field.
// "香川·福江·川井" → ["香川", "福江", "川井"]
// "堀上" → ["堀上"]
export function getSlotTeachers(slot) {
  return splitTeacherField(slot.teacher);
}

// Format a weighted count for display.
// Integer → "7", fractional → "7.5".
export function formatCount(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Determine whether the given teacher actually teaches this slot on
// `dateStr`. Non-biweekly slots always return true. For biweekly slots:
//   - A 週: slot.teacher (handles "·" separated multi-teacher) が実施
//   - B 週: note "隔週(partner)" の partner が実施
// アンカー未設定 (weekType null) の場合は安全側で true を返す
// (表示側で隠さない = 従来挙動)。
export function isTeacherActiveOnDate(slot, teacher, dateStr, anchors, holidays, examPeriods) {
  // 担当の切り替えがあれば、その日の担当で見る (隔週でないコマも日で変わる)
  if (hasTeacherChanges(slot)) {
    const day = slotOnDate(slot, dateStr);
    if (!isBiweekly(day.note)) return splitTeacherField(day.teacher).includes(teacher);
    slot = day;
  }
  if (!isBiweekly(slot.note)) return true;
  const wt = getSlotWeekType(dateStr, slot, anchors, holidays, examPeriods);
  if (wt == null) return true;
  const mainTeachers = getSlotTeachers(slot);
  const partner = biweeklyPartner(slot.note);
  if (wt === "A") return mainTeachers.includes(teacher);
  // wt === "B"
  return partner != null && teacher === partner;
}

// 指定日にこのスロットを実際に担当する講師名を返す。
//   - 非隔週         → slot.teacher をそのまま (複数担当 "·" 区切りも含む)
//   - A 週           → slot.teacher
//   - B 週           → note "隔週(partner)" の partner
//   - アンカー未設定 → slot.teacher (従来挙動 / 安全側)
// 代行登録時の originalTeacher を曜日 (A/B) に合わせて解決するために使う。
export function biweeklyActiveTeacher(slot, dateStr, anchors, holidays, examPeriods) {
  // 担当の切り替え (A5) を先に当てる。ここを通る代行の元講師・講師の重なり・
  // 授業時間の集計・欠勤登録はこれで切り替え後の担当になる
  slot = slotOnDate(slot, dateStr);
  if (!isBiweekly(slot.note)) return slot.teacher;
  const wt = getSlotWeekType(dateStr, slot, anchors, holidays, examPeriods);
  if (wt == null || wt === "A") return slot.teacher;
  return biweeklyPartner(slot.note) || slot.teacher;
}

// 表示用の「実施される教科」を返す。
// 複合教科 ("英/数") の隔週スロットでは A 週 → 先頭、B 週 → 2 つ目。
// 単独教科 / アンカー未設定 の場合は slot.subj をそのまま返す。
export function biweeklyDisplaySubject(slot, dateStr, anchors, holidays, examPeriods) {
  const raw = slot.subj || "";
  if (!isBiweekly(slot.note)) return raw;
  const parts = raw.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return raw;
  const wt = getSlotWeekType(dateStr, slot, anchors, holidays, examPeriods);
  if (wt == null) return parts[0];
  const idx = wt === "A" ? 0 : 1;
  return parts[idx] || parts[parts.length - 1];
}
