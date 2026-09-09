// ─── 講師の同時刻の重なり (その日の「講師 × 時間帯」) ────────────────
//
// 作成ツール (講習時間割作成 / 通常時間割作成) には講師重複の NG 判定が
// あるが、本体のタイムテーブルは代行を入れた後の重なりを誰も見ていなかった
// (2026-09-09: 福江が 19:50 に 中2C 数学の代行と 中3A 理科の代行で二重)。
//
// ここは**その日に実際に教える人**を集めてから重なりを探す 1 か所。
// タイムテーブル (閲覧 / 代行モード)・欠勤組み換えのカード・代行ピッカーが
// 同じ関数を使う (画面ごとに「誰がその時間に居るか」を書き起こさない)。
//
// 「実際に教える人」の決め方:
//   - 元講師 (隔週 A/B を解決した後) のうち、代行 / 欠勤レコードの**無い**人
//     (レコードがあればその人はコマを離れる。代行者が空の欠勤も同じ)
//   - 代行者 (保存済み + 下書き / 仮代行)。role: "sub"
//   - 時刻は移動・特別時程を反映した実効時刻 (timeBySlot)
//   - 休講・振替で他日へ出ていくコマ・合同で吸収された側は数えない
//     (excludeSlotIds。吸収された側の講師は空くのが合同の狙い)
//
// 判定は**警告であって禁止ではない** (作成ツールと同じ)。1 人で 2 教室を
// 行き来する運用が実在するので、目立たせるだけで登録は止めない。

import { activeTeachersOnDate } from "./absenceHelpers";

const HM_RE = /^\s*(\d{1,2}):(\d{2})/;

function hmToMin(text) {
  const m = HM_RE.exec(String(text || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// "19:50-20:35" → {start, end} (分)。開始が読めない (時限表記だけ等) 時刻は
// null = 重なり判定の対象外。終了が無ければ「点」。
function timeRange(time) {
  const parts = String(time || "").split("-");
  const start = hmToMin(parts[0]);
  if (start == null) return null;
  const e = hmToMin(parts[1]);
  return { start, end: e != null && e > start ? e : start };
}

// 半開区間で重なり。どちらかが点なら開始時刻の一致だけを見る。
function rangesOverlap(a, b) {
  if (!a || !b) return false;
  if (a.end === a.start || b.end === b.start) return a.start === b.start;
  return a.start < b.end && b.start < a.end;
}

/** 2 つの時刻文字列が重なるか ("19:50-20:35" 形式。終了無しは点扱い)。 */
export function timesOverlap(t1, t2) {
  return rangesOverlap(timeRange(t1), timeRange(t2));
}

function recordsOf(subsBySlot, slotId) {
  const recs = subsBySlot?.get?.(slotId);
  if (!recs) return [];
  if (recs instanceof Map) return [...recs.values()];
  return Array.isArray(recs) ? recs : [recs];
}

/**
 * その日にコマを実際に担当する (講師, コマ) の組を集める。
 *
 * @param {Array} slots その日に表示されるコマ (曜日・時間割の有効期間で絞った後)
 * @param {string} date "YYYY-MM-DD"
 * @param {object} [opts]
 * @param {Map<number, Array|Map>} [opts.subsBySlot]
 *   slotId → 代行 / 欠勤レコード ({originalTeacher, substitute})。
 *   配列でも Map<originalTeacher, rec> でもよい (欠勤組み換えは Map)
 * @param {Map<number, string>} [opts.timeBySlot] slotId → 実効時刻 (移動・特別時程)
 * @param {Set<number>} [opts.excludeSlotIds] 休講・振替で出る・合同で吸収された側
 * @param {Array} [opts.biweeklyAnchors]
 * @param {Array} [opts.holidays]
 * @param {Array} [opts.examPeriods]
 * @returns {Array<{teacher: string, slot: object, time: string, role: "own"|"sub", originalTeacher?: string}>}
 */
export function collectTeacherAssignments(slots, date, opts = {}) {
  const out = [];
  if (!date) return out;
  const exclude = opts.excludeSlotIds || new Set();
  const ctx = {
    biweeklyAnchors: opts.biweeklyAnchors || [],
    holidays: opts.holidays,
    examPeriods: opts.examPeriods,
  };
  for (const slot of slots || []) {
    if (!slot || exclude.has(slot.id)) continue;
    const time = opts.timeBySlot?.get(slot.id) || slot.time || "";
    if (!timeRange(time)) continue;
    const recs = recordsOf(opts.subsBySlot, slot.id);
    const away = new Set(recs.map((r) => r.originalTeacher).filter(Boolean));
    for (const t of activeTeachersOnDate(slot, date, ctx)) {
      if (!t || away.has(t)) continue;
      out.push({ teacher: t, slot, time, role: "own" });
    }
    for (const r of recs) {
      const name = (r.substitute || "").trim();
      if (!name) continue;
      out.push({
        teacher: name,
        slot,
        time,
        role: "sub",
        originalTeacher: r.originalTeacher || "",
      });
    }
  }
  return out;
}

// 同じコマの同じ講師 (多担任で同名が 2 回並ぶ等) や、同じ位置のコマの
// 重複登録 (曜日・時刻・学年・クラス・科目が全部同じ) は重なりに数えない。
function samePosition(a, b) {
  return (
    a.day === b.day &&
    a.time === b.time &&
    a.grade === b.grade &&
    (a.cls || "") === (b.cls || "") &&
    a.subj === b.subj
  );
}

/**
 * 講師ごとに時間帯の重なるコマの組を探し、コマ id → 重なり一覧で返す。
 *
 * @param {ReturnType<typeof collectTeacherAssignments>} assignments
 * @returns {Map<number, Array<{teacher: string, role: string, other: object, otherTime: string, otherRole: string}>>}
 */
export function findTeacherConflicts(assignments) {
  const byTeacher = new Map();
  for (const a of assignments || []) {
    if (!byTeacher.has(a.teacher)) byTeacher.set(a.teacher, []);
    byTeacher.get(a.teacher).push(a);
  }
  const out = new Map();
  const push = (slotId, entry) => {
    if (!out.has(slotId)) out.set(slotId, []);
    out.get(slotId).push(entry);
  };
  for (const [teacher, list] of byTeacher) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.slot.id === b.slot.id) continue;
        if (samePosition(a.slot, b.slot)) continue;
        if (!timesOverlap(a.time, b.time)) continue;
        push(a.slot.id, {
          teacher,
          role: a.role,
          other: b.slot,
          otherTime: b.time,
          otherRole: b.role,
        });
        push(b.slot.id, {
          teacher,
          role: b.role,
          other: a.slot,
          otherTime: a.time,
          otherRole: a.role,
        });
      }
    }
  }
  return out;
}

/**
 * ある講師が指定時刻に既に持っている仕事 (通常コマ / 代行) を返す。
 * 代行ピッカーで候補ごとに「授業中 / 代行中」を出すために使う。
 *
 * @param {ReturnType<typeof collectTeacherAssignments>} assignments
 * @param {string} teacher
 * @param {string} time "19:50-20:35"
 * @param {{excludeSlotId?: number}} [opts] 今まさに代行を入れようとしているコマ
 */
export function teacherBusyAt(assignments, teacher, time, opts = {}) {
  if (!teacher) return [];
  return (assignments || []).filter(
    (a) =>
      a.teacher === teacher &&
      a.slot.id !== opts.excludeSlotId &&
      timesOverlap(a.time, time)
  );
}

function describe(slot) {
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}

/**
 * 重なり 1 件を短い文にする。
 *   "福江: 中3A 理科 (代行) と重複" / "滝澤: 中3SS 理科 と重複"
 */
export function describeTeacherConflict(c, { withTime = false } = {}) {
  const role = c.otherRole === "sub" ? " (代行)" : "";
  const time = withTime && c.otherTime ? ` ${c.otherTime}` : "";
  return `${c.teacher}: ${describe(c.other)}${role}${time} と重複`;
}

/**
 * 「その時間に持っている仕事」1 件を候補行のラベルにする。
 *   "授業中: 中2C 数学" / "代行中: 中3A 理科"
 */
export function describeBusy(a) {
  return `${a.role === "sub" ? "代行中" : "授業中"}: ${describe(a.slot)}`;
}
