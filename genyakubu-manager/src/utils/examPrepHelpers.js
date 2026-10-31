// テスト直前特訓シフトの純粋ヘルパ群。
//
// データ形状:
//   examPrepSchedules: [
//     {
//       examPeriodId: number,
//       days: [
//         {
//           date: "YYYY-MM-DD",
//           periods: [{ no, start: "HH:MM", end: "HH:MM" }, ...],
//           assignments: { [staffName]: number[] }, // no の配列
//           // 途中入り・途中抜け (任意。C1 2026-10-31)。空欄 = 校時どおり。
//           // チェックした校時を from〜to で切り詰める (staffShiftPeriods)
//           staffTimes?: { [staffName]: { from?: "HH:MM", to?: "HH:MM" } },
//         },
//         ...
//       ],
//     },
//     ...
//   ]

export function findScheduleByExamPeriodId(schedules, examPeriodId) {
  if (!Array.isArray(schedules)) return null;
  return schedules.find((s) => s.examPeriodId === examPeriodId) || null;
}

export function findDay(schedule, dateStr) {
  if (!schedule?.days) return null;
  return schedule.days.find((d) => d.date === dateStr) || null;
}

// ある日付・staff 名に該当する特訓校時配列を返す。該当なしなら []。
// examPeriods を使って、その日付がどのテスト期間に属するかを特定する。
export function getExamPrepShiftsForStaff(
  staffName,
  dateStr,
  examPeriods,
  schedules
) {
  if (!staffName || !dateStr) return [];
  if (!Array.isArray(examPeriods) || !Array.isArray(schedules)) return [];
  // その日付に該当する全てのテスト期間を対象にする（通常は 0〜1 件だが、
  // 複数 targetGrades がオーバーラップするケースもあり得るため全走査）。
  const out = [];
  for (const ep of examPeriods) {
    if (!(dateStr >= ep.startDate && dateStr <= ep.endDate)) continue;
    const sch = findScheduleByExamPeriodId(schedules, ep.id);
    const day = findDay(sch, dateStr);
    if (!day) continue;
    // 途中入り・途中抜け (staffTimes) で切り詰めた時刻
    for (const p of staffShiftPeriods(day, staffName)) {
      out.push({ ...p, examPeriodId: ep.id });
    }
  }
  // no 昇順
  out.sort((a, b) => a.no - b.no);
  return out;
}

// 校時を追加する際の次の番号を返す (既存 + 1)。
export function nextPeriodNo(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return 1;
  return Math.max(...periods.map((p) => p.no || 0)) + 1;
}

// 校時の並びを orderedPeriods (day.periods の並べ替え / 部分集合) に差し替えて、
// 1 始まりの連番に振り直した day を返す。assignments は旧 no → 新 no へ
// 読み替える (orderedPeriods に無い校時のチェックは落ちる)。
// 校時の追加 / 削除 / 並べ替えは全部ここを通す (連番と出勤チェックの整合を
// 画面ごとに書き起こさない)。
export function applyPeriodOrder(day, orderedPeriods) {
  const noMap = new Map();
  const periods = orderedPeriods.map((p, i) => {
    noMap.set(p.no, i + 1);
    return { ...p, no: i + 1 };
  });
  const assignments = {};
  for (const [name, nos] of Object.entries(day.assignments || {})) {
    const mapped = (nos || [])
      .map((n) => noMap.get(n))
      .filter((n) => typeof n === "number")
      .sort((a, b) => a - b);
    if (mapped.length > 0) assignments[name] = mapped;
  }
  return { ...day, periods, assignments };
}

// 校時の時刻順キー。開始時刻 → 終了時刻。開始が読めない校時は (終了を見ずに)
// 末尾へ、終了だけ読めない校時は同じ開始の中で末尾へ。
function periodSortKey(p) {
  const s = timeStrToMin(p.start);
  if (!Number.isFinite(s)) return [Infinity, Infinity];
  const e = timeStrToMin(p.end);
  return [s, Number.isFinite(e) ? e : Infinity];
}

function comparePeriodsByTime(a, b) {
  const ka = periodSortKey(a);
  const kb = periodSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

// 校時が開始時刻順に並んでいるか。時刻を読めない校時は末尾なら順序どおり扱い。
export function arePeriodsSortedByTime(periods) {
  if (!Array.isArray(periods)) return true;
  for (let i = 1; i < periods.length; i++) {
    if (comparePeriodsByTime(periods[i - 1], periods[i]) > 0) return false;
  }
  return true;
}

// 校時を開始時刻順 (同時刻なら終了時刻順) に並べ替えて連番を振り直す。
// 同じ時刻・読めない時刻の校時は相対順を保つ (Array.prototype.sort は安定)。
// 並びが変わらなければ同じ day をそのまま返す (呼び出し側で保存を省ける)。
export function sortDayPeriodsByTime(day) {
  const periods = day?.periods;
  if (!Array.isArray(periods) || arePeriodsSortedByTime(periods)) return day;
  return applyPeriodOrder(day, [...periods].sort(comparePeriodsByTime));
}

// "HH:MM" を分に変換。不正時は NaN。
export function timeStrToMin(t) {
  if (typeof t !== "string") return NaN;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return NaN;
  return h * 60 + mm;
}

export function isTimeRangeValid(start, end) {
  const s = timeStrToMin(start);
  const e = timeStrToMin(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  return s < e;
}

// schedules を upsert して返す（既存の schedules は変更しない）。
export function upsertDay(schedules, examPeriodId, day) {
  const list = Array.isArray(schedules) ? [...schedules] : [];
  const idx = list.findIndex((s) => s.examPeriodId === examPeriodId);
  if (idx < 0) {
    list.push({ examPeriodId, days: [day] });
    return list;
  }
  const sch = list[idx];
  const dayIdx = (sch.days || []).findIndex((d) => d.date === day.date);
  const days =
    dayIdx < 0
      ? [...(sch.days || []), day]
      : sch.days.map((d, i) => (i === dayIdx ? day : d));
  list[idx] = { ...sch, days };
  return list;
}

export function removeDay(schedules, examPeriodId, dateStr) {
  if (!Array.isArray(schedules)) return [];
  return schedules
    .map((s) => {
      if (s.examPeriodId !== examPeriodId) return s;
      return { ...s, days: (s.days || []).filter((d) => d.date !== dateStr) };
    })
    .filter((s) => (s.days || []).length > 0);
}

export function removeSchedulesForPeriod(schedules, examPeriodId) {
  if (!Array.isArray(schedules)) return [];
  return schedules.filter((s) => s.examPeriodId !== examPeriodId);
}

// 全スケジュール内の assignments から指定 staff を削除して返す。
// 空になった day は落とし、days が空になったスケジュール自体も落とす。
export function removeStaffFromSchedules(schedules, staffName) {
  if (!Array.isArray(schedules)) return [];
  return schedules
    .map((s) => {
      const days = (s.days || [])
        .map((d) => {
          if (!d.assignments || !(staffName in d.assignments)) return d;
          const { [staffName]: _removed, ...rest } = d.assignments;
          void _removed;
          // 出勤を外したら来る・帰る時刻も消す
          return withoutOrphanStaffTimes({ ...d, assignments: rest });
        })
        .filter((d) => (d.periods || []).length > 0);
      return { ...s, days };
    })
    .filter((s) => (s.days || []).length > 0);
}

// 同一日内の校時同士が時刻的に重複しているペアを検出する。
// 戻り値は重複している校時 no 群の Set。
export function detectOverlaps(periods) {
  const bad = new Set();
  if (!Array.isArray(periods)) return bad;
  const spans = periods
    .map((p) => ({
      no: p.no,
      s: timeStrToMin(p.start),
      e: timeStrToMin(p.end),
    }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.s < x.e);
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i];
      const b = spans[j];
      if (a.s < b.e && b.s < a.e) {
        bad.add(a.no);
        bad.add(b.no);
      }
    }
  }
  return bad;
}

// fromDate のシフト設定を toDates の各日にコピーして返す。
export function copyDay(schedules, examPeriodId, fromDate, toDates) {
  const sch = findScheduleByExamPeriodId(schedules, examPeriodId);
  const from = findDay(sch, fromDate);
  if (!from) return schedules;
  let next = schedules;
  for (const to of toDates) {
    if (to === fromDate) continue;
    const cloned = {
      date: to,
      periods: from.periods.map((p) => ({ ...p })),
      assignments: Object.fromEntries(
        Object.entries(from.assignments || {}).map(([k, v]) => [k, [...v]])
      ),
      // 途中入り・途中抜けの時刻も写す
      ...(from.staffTimes && Object.keys(from.staffTimes).length > 0
        ? {
            staffTimes: Object.fromEntries(
              Object.entries(from.staffTimes).map(([k, v]) => [k, { ...v }])
            ),
          }
        : {}),
    };
    next = upsertDay(next, examPeriodId, cloned);
  }
  return next;
}

// ─── 途中入り・途中抜け (day.staffTimes、C1 2026-10-31) ────────────────
// 紙の割当表の「18:30〜」「〜20:40」をそのまま持つ。講師ごとに来る時刻 (from) と
// 帰る時刻 (to) を 1 組 (どちらか片方だけも可)。いったん抜けて戻る人は校時の
// チェックで表す (1・2・5 校時)。実際の時間はチェックした各校時を from〜to で
// 切り詰めたもので、切り詰めて 0 分になる校時は出さない。端を切るだけなので
// 校時の間の空き (= バイト出勤表の「かたまり」) は変わらない。
// **特訓の時刻を読むところ (月間・週間・授業時間の集計) は staffShiftPeriods を
// 通す** (day.assignments と校時の時刻を直に組み合わせない)。

const pad2 = (n) => String(n).padStart(2, "0");
const minToStr = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

/**
 * 時刻の入力を "HH:MM" にそろえる ("1830" / "18：30" / "9:5" → "09:05")。
 * 読めなければ null、空なら ""。
 */
export function normalizeShiftTime(raw) {
  const t = String(raw ?? "")
    .normalize("NFKC")
    .trim();
  if (!t) return "";
  let m = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) m = t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return `${pad2(h)}:${pad2(mm)}`;
}

/** その日のその講師の来る・帰る時刻 ({from?, to?})。無ければ {} */
export function staffTimeOf(day, staffName) {
  const t = day?.staffTimes?.[staffName];
  return t && typeof t === "object" ? t : {};
}

/**
 * その日のその講師の出勤 (チェックした校時を来る・帰る時刻で切り詰めたもの)。
 * @returns {{no: number, start: string, end: string, trimmed: boolean,
 *            periodStart: string, periodEnd: string}[]} no 昇順
 */
export function staffShiftPeriods(day, staffName) {
  const nos = day?.assignments?.[staffName];
  if (!Array.isArray(nos) || nos.length === 0) return [];
  const set = new Set(nos);
  const { from, to } = staffTimeOf(day, staffName);
  const fromMin = timeStrToMin(from);
  const toMin = timeStrToMin(to);
  const out = [];
  for (const p of day.periods || []) {
    if (!set.has(p.no)) continue;
    const ps = timeStrToMin(p.start);
    const pe = timeStrToMin(p.end);
    if (Number.isNaN(ps) || Number.isNaN(pe)) {
      out.push({ no: p.no, start: p.start, end: p.end, trimmed: false, periodStart: p.start, periodEnd: p.end });
      continue;
    }
    const s0 = Number.isNaN(fromMin) ? ps : Math.max(ps, fromMin);
    const e0 = Number.isNaN(toMin) ? pe : Math.min(pe, toMin);
    if (s0 >= e0) continue;
    out.push({
      no: p.no,
      start: minToStr(s0),
      end: minToStr(e0),
      trimmed: s0 !== ps || e0 !== pe,
      periodStart: p.start,
      periodEnd: p.end,
    });
  }
  out.sort((a, b) => a.no - b.no);
  return out;
}

/**
 * 来る・帰る時刻を書いた day を返す。from / to が両方空ならその講師の分を消す。
 * staffTimes が空になったらキーごと消す (RTDB は空のオブジェクトを消す)。
 */
export function setStaffTime(day, staffName, { from = "", to = "" } = {}) {
  const entry = {};
  if (from) entry.from = from;
  if (to) entry.to = to;
  const rest = { ...(day.staffTimes || {}) };
  delete rest[staffName];
  if (entry.from || entry.to) rest[staffName] = entry;
  const { staffTimes: _drop, ...base } = day;
  void _drop;
  return Object.keys(rest).length > 0 ? { ...base, staffTimes: rest } : base;
}

/** 出勤 (assignments) の無い講師の来る・帰る時刻を消した day */
export function withoutOrphanStaffTimes(day) {
  if (!day?.staffTimes) return day;
  const assigned = day.assignments || {};
  let changed = false;
  const rest = {};
  for (const [name, t] of Object.entries(day.staffTimes)) {
    if (Array.isArray(assigned[name]) && assigned[name].length > 0) rest[name] = t;
    else changed = true;
  }
  if (!changed) return day;
  const { staffTimes: _drop, ...base } = day;
  void _drop;
  return Object.keys(rest).length > 0 ? { ...base, staffTimes: rest } : base;
}

/**
 * 来る・帰る時刻の注意 (保存は止めない)。
 *   - order:   来る ≥ 帰る
 *   - outside: チェックした校時の範囲の外 (来る時刻に最後の校時が終わっている /
 *              帰る時刻に最初の校時が始まっていない)
 *   - dropped: 切り詰めて 0 分になった校時がある (その校時は出さない)
 * @returns {{name: string, kind: "order"|"outside"|"dropped", message: string}[]}
 */
export function staffTimeWarnings(day) {
  const out = [];
  for (const [name, t] of Object.entries(day?.staffTimes || {})) {
    const nos = day.assignments?.[name];
    if (!Array.isArray(nos) || nos.length === 0) continue;
    const f = timeStrToMin(t?.from);
    const e = timeStrToMin(t?.to);
    if (!Number.isNaN(f) && !Number.isNaN(e) && f >= e) {
      out.push({ name, kind: "order", message: `${name}: 来る時刻 ${t.from} が帰る時刻 ${t.to} 以後です` });
      continue;
    }
    const checked = (day.periods || []).filter((p) => nos.includes(p.no));
    const starts = checked.map((p) => timeStrToMin(p.start)).filter((x) => !Number.isNaN(x));
    const ends = checked.map((p) => timeStrToMin(p.end)).filter((x) => !Number.isNaN(x));
    if (starts.length === 0) continue;
    const firstStart = Math.min(...starts);
    const lastEnd = Math.max(...ends);
    if ((!Number.isNaN(f) && f >= lastEnd) || (!Number.isNaN(e) && e <= firstStart)) {
      out.push({
        name,
        kind: "outside",
        message: `${name}: 来る・帰る時刻 (${t.from || ""}〜${t.to || ""}) がチェックした校時の範囲 (${minToStr(firstStart)}〜${minToStr(lastEnd)}) の外です`,
      });
      continue;
    }
    const shown = staffShiftPeriods(day, name).length;
    if (shown < checked.length) {
      out.push({
        name,
        kind: "dropped",
        message: `${name}: 来る・帰る時刻 (${t.from || ""}〜${t.to || ""}) の外になる校時が ${checked.length - shown} つあります (その校時は出勤に数えません)`,
      });
    }
  }
  return out;
}
