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
    const nos = day.assignments?.[staffName];
    if (!Array.isArray(nos) || nos.length === 0) continue;
    const set = new Set(nos);
    for (const p of day.periods || []) {
      if (set.has(p.no)) {
        out.push({ no: p.no, start: p.start, end: p.end, examPeriodId: ep.id });
      }
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
          return { ...d, assignments: rest };
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
    };
    next = upsertDay(next, examPeriodId, cloned);
  }
  return next;
}
