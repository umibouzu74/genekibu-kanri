// ─── 特訓シフトを表 (TSV) で書き出す・貼り付ける (C2 2026-10-31) ─────────
// テスト期間ごと。紙の割当表と照合する・まとめて登録するために、日付ボタンを
// 1 日ずつ押してチェックを読み取らなくて済むようにする (Claude in Chrome の操作用
// でもある)。表は 2 つのまとまりを空行で区切る (どちらか片方だけ貼ってもよい):
//
//   日付        校時  開始   終了          ← 校時の表 (その日の校時の定義)
//   11/17(火)   1     18:00  18:50
//
//   日付        講師  校時   来る   帰る   ← 出勤の表 (校時は "1-4" / "1,2,5")
//   11/19(木)   半田  1-2    18:30  19:30
//
// 貼り付けは「貼った日だけ置き換える」: 校時の表に出てきた日は校時を、出勤の表に
// 出てきた日は出勤 (と来る・帰る時刻) をまるごと置き換える。ほかの日は触らない。
// 適用は 1 回の保存 (呼び出し側が useExamPrepSchedulesCrud.replaceDays)。

import { parseFlexibleDate, parseTsvTable } from "./specialEventImport";
import {
  normalizeShiftTime,
  staffTimeWarnings,
  timeStrToMin,
  withoutOrphanStaffTimes,
} from "./examPrepHelpers";
import { fmtMDWeekday } from "./dateHelpers";

export const EXAM_PREP_PERIOD_COLUMNS = {
  date: ["日付", "日", "date"],
  no: ["校時", "校時no", "no"],
  start: ["開始", "開始時刻", "start"],
  end: ["終了", "終了時刻", "end"],
};

export const EXAM_PREP_SHIFT_COLUMNS = {
  date: ["日付", "日", "date"],
  teacher: ["講師", "名前", "先生", "staff", "teacher"],
  periods: ["校時", "出勤", "校時no", "periods"],
  from: ["来る", "来る時刻", "from"],
  to: ["帰る", "帰る時刻", "to"],
};

const PERIOD_HEADER = ["日付", "校時", "開始", "終了"];
const SHIFT_HEADER = ["日付", "講師", "校時", "来る", "帰る"];

/** 校時 no の並びを "1-4" / "1,2,5" に縮める */
export function formatPeriodNos(nos) {
  const sorted = [...new Set(nos)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(","));
    i = j + 1;
  }
  return parts.join(",");
}

/** "1-4" / "1〜4" / "1,2,5" / "1・2・5" / "1 2 5" → [1,2,...]。読めなければ null */
export function parsePeriodNos(raw) {
  const s = String(raw ?? "")
    .normalize("NFKC")
    .replace(/校時/g, "")
    .trim();
  if (!s) return null;
  const out = [];
  for (const tok of s.split(/[,、・\s]+/).filter(Boolean)) {
    const m = tok.match(/^(\d+)(?:[-~〜](\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    if (!(a >= 1) || b < a || b - a > 20) return null;
    for (let n = a; n <= b; n++) if (!out.includes(n)) out.push(n);
  }
  return out.length > 0 ? out.sort((x, y) => x - y) : null;
}

/**
 * テスト期間の特訓シフトを TSV にする (貼り戻すと同じ内容に読める)。
 * @param {{days?: object[]}|null} schedule
 * @returns {string}
 */
export function examPrepToTsv(schedule, { compareNames } = {}) {
  const days = [...(schedule?.days || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const lines = [PERIOD_HEADER.join("\t")];
  for (const d of days) {
    for (const p of d.periods || []) {
      lines.push([fmtMDWeekday(d.date), p.no, p.start, p.end].join("\t"));
    }
  }
  lines.push("");
  lines.push(SHIFT_HEADER.join("\t"));
  for (const d of days) {
    const names = Object.keys(d.assignments || {}).filter((n) => (d.assignments[n] || []).length > 0);
    if (compareNames) names.sort(compareNames);
    for (const name of names) {
      const t = d.staffTimes?.[name] || {};
      lines.push(
        [fmtMDWeekday(d.date), name, formatPeriodNos(d.assignments[name]), t.from || "", t.to || ""].join("\t")
      );
    }
  }
  return lines.join("\n") + "\n";
}

// 空行で区切った表のまとまり
function splitBlocks(text) {
  const blocks = [];
  let cur = [];
  let start = 1;
  String(text ?? "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      if (raw.trim() === "") {
        if (cur.length) blocks.push({ start, text: cur.join("\n") });
        cur = [];
        start = i + 2;
      } else {
        if (!cur.length) start = i + 1;
        cur.push(raw);
      }
    });
  if (cur.length) blocks.push({ start, text: cur.join("\n") });
  return blocks;
}

function blockKind(text) {
  const head = text.split(/\r?\n/)[0].normalize("NFKC");
  if (/講師|名前|先生|staff|teacher/i.test(head)) return "shift";
  if (/開始|終了|start|end/i.test(head)) return "period";
  return null;
}

/**
 * 貼り付けた表を読み、置き換える日の設定を作る (保存はしない)。
 * @param {string} text
 * @param {{examPeriod: {startDate: string, endDate: string},
 *          schedule?: {days?: object[]}|null,
 *          candidateNames?: Iterable<string>}} ctx
 * @returns {{
 *   rows: {line: number, kind: "period"|"shift", status: "ok"|"error", message: string}[],
 *   days: object[],           // 置き換える日 (date 昇順)
 *   summary: {date: string, change: string}[],
 *   warnings: string[],       // 来る・帰る時刻の範囲外など (適用は止めない)
 *   errorCount: number,
 * }}
 */
export function parseExamPrepTsv(text, { examPeriod, schedule, candidateNames } = {}) {
  const rows = [];
  const fy = (() => {
    const [y, m] = String(examPeriod?.startDate || "").split("-").map(Number);
    return m >= 4 ? y : y - 1;
  })();
  const inPeriod = (d) => d && d >= examPeriod.startDate && d <= examPeriod.endDate;
  const readDate = (raw) => {
    const d = parseFlexibleDate(raw, fy);
    if (!d) return { error: `日付「${raw}」が読めません` };
    if (!inPeriod(d)) return { error: `${d} はテスト期間 (${examPeriod.startDate}〜${examPeriod.endDate}) の外です` };
    return { date: d };
  };
  const names = candidateNames ? new Set(candidateNames) : null;
  const existing = new Map((schedule?.days || []).map((d) => [d.date, d]));
  const periodsByDate = new Map();
  const shiftsByDate = new Map();

  const blocks = splitBlocks(text);
  for (const b of blocks) {
    const kind = blockKind(b.text);
    if (!kind) {
      rows.push({ line: b.start, kind: "shift", status: "error", message: "見出しの行 (日付・講師・校時… / 日付・校時・開始・終了) がありません" });
      continue;
    }
    const table = parseTsvTable(b.text, kind === "period" ? EXAM_PREP_PERIOD_COLUMNS : EXAM_PREP_SHIFT_COLUMNS);
    for (const r of table.rows) {
      const line = b.start + r.line - 1;
      const c = r.cells;
      const dt = readDate(c.date);
      if (dt.error) {
        rows.push({ line, kind, status: "error", message: dt.error });
        continue;
      }
      if (kind === "period") {
        const no = Number(String(c.no).normalize("NFKC").replace(/校時/, ""));
        const start = normalizeShiftTime(c.start);
        const end = normalizeShiftTime(c.end);
        if (!Number.isInteger(no) || no < 1) {
          rows.push({ line, kind, status: "error", message: `校時「${c.no}」が読めません` });
          continue;
        }
        if (!start || !end || timeStrToMin(start) >= timeStrToMin(end)) {
          rows.push({ line, kind, status: "error", message: `時刻「${c.start}〜${c.end}」が読めません (開始 < 終了)` });
          continue;
        }
        if (!periodsByDate.has(dt.date)) periodsByDate.set(dt.date, []);
        const list = periodsByDate.get(dt.date);
        if (list.some((p) => p.no === no)) {
          rows.push({ line, kind, status: "error", message: `${dt.date} の ${no} 校時が 2 回あります` });
          continue;
        }
        list.push({ no, start, end });
        rows.push({ line, kind, status: "ok", message: `${dt.date} ${no}校時 ${start}-${end}` });
      } else {
        const name = String(c.teacher || "").trim();
        if (!name) {
          rows.push({ line, kind, status: "error", message: "講師が空です" });
          continue;
        }
        if (names && !names.has(name)) {
          rows.push({ line, kind, status: "error", message: `「${name}」は特訓シフトの候補にいません (バイト一覧・時間割の講師)` });
          continue;
        }
        const nos = parsePeriodNos(c.periods);
        if (!nos) {
          rows.push({ line, kind, status: "error", message: `校時「${c.periods}」が読めません (例: 1-4 / 1,2,5)` });
          continue;
        }
        const from = normalizeShiftTime(c.from);
        const to = normalizeShiftTime(c.to);
        if (from === null || to === null) {
          rows.push({ line, kind, status: "error", message: `来る・帰る時刻「${c.from}〜${c.to}」が読めません` });
          continue;
        }
        if (from && to && timeStrToMin(from) >= timeStrToMin(to)) {
          rows.push({ line, kind, status: "error", message: `来る時刻 ${from} が帰る時刻 ${to} 以後です` });
          continue;
        }
        if (!shiftsByDate.has(dt.date)) shiftsByDate.set(dt.date, new Map());
        const m = shiftsByDate.get(dt.date);
        if (m.has(name)) {
          rows.push({ line, kind, status: "error", message: `${dt.date} の ${name} が 2 行あります` });
          continue;
        }
        m.set(name, { nos, from, to, line });
        rows.push({
          line,
          kind,
          status: "ok",
          message: `${dt.date} ${name} ${formatPeriodNos(nos)}校時${from || to ? ` (${from}〜${to})` : ""}`,
        });
      }
    }
  }

  // 行ごとの読み取りは通ったが、日の組み立てで分かった問題 (行をエラーに書き換える)
  const fail = (line, message) => {
    const row = rows.find((x) => x.line === line && x.kind === "shift");
    if (row) Object.assign(row, { status: "error", message });
  };
  const dates = [...new Set([...periodsByDate.keys(), ...shiftsByDate.keys()])].sort();
  const days = [];
  const summary = [];
  const warnings = [];
  for (const date of dates) {
    const old = existing.get(date) || null;
    const periods = periodsByDate.has(date)
      ? [...periodsByDate.get(date)].sort((a, b) => a.no - b.no)
      : old?.periods || [];
    if (periods.length === 0) {
      for (const [, v] of shiftsByDate.get(date) || []) {
        fail(v.line, `${date} は校時が決まっていません (校時の表も貼ってください)`);
      }
      continue;
    }
    const validNos = new Set(periods.map((p) => p.no));
    let assignments = old?.assignments || {};
    let staffTimes = old?.staffTimes;
    if (shiftsByDate.has(date)) {
      assignments = {};
      staffTimes = {};
      for (const [name, v] of shiftsByDate.get(date)) {
        const bad = v.nos.filter((n) => !validNos.has(n));
        if (bad.length) {
          fail(v.line, `${date} に ${bad.join(",")} 校時はありません`);
          continue;
        }
        assignments[name] = v.nos;
        if (v.from || v.to) staffTimes[name] = { ...(v.from ? { from: v.from } : {}), ...(v.to ? { to: v.to } : {}) };
      }
    } else {
      // 校時だけ貼った日: 出勤はそのまま (無くなった校時のチェックは落とす)
      assignments = Object.fromEntries(
        Object.entries(assignments)
          .map(([n, nos]) => [n, (nos || []).filter((x) => validNos.has(x))])
          .filter(([, nos]) => nos.length > 0)
      );
    }
    const day = { date, periods, assignments };
    if (staffTimes && Object.keys(staffTimes).length > 0) day.staffTimes = staffTimes;
    const cleaned = withoutOrphanStaffTimes(day);
    for (const w of staffTimeWarnings(cleaned)) warnings.push(`${fmtMDWeekday(date)} ${w.message}`);
    days.push(cleaned);
    summary.push({ date, change: describeDayChange(old, cleaned) });
  }
  return { rows, days, summary, warnings, errorCount: rows.filter((r) => r.status === "error").length };
}

function describeDayChange(old, next) {
  if (!old) return `新しく作る (${next.periods.length} 校時・${Object.keys(next.assignments).length} 人)`;
  const parts = [];
  const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (!sameJson(old.periods, next.periods)) parts.push("校時を置き換え");
  const oldNames = new Set(Object.keys(old.assignments || {}));
  const newNames = new Set(Object.keys(next.assignments || {}));
  const added = [...newNames].filter((n) => !oldNames.has(n));
  const removed = [...oldNames].filter((n) => !newNames.has(n));
  const changed = [...newNames].filter(
    (n) =>
      oldNames.has(n) &&
      (!sameJson(old.assignments[n], next.assignments[n]) ||
        !sameJson(old.staffTimes?.[n], next.staffTimes?.[n]))
  );
  if (added.length) parts.push(`追加 ${added.join("・")}`);
  if (removed.length) parts.push(`外す ${removed.join("・")}`);
  if (changed.length) parts.push(`変更 ${changed.join("・")}`);
  return parts.length ? parts.join(" / ") : "変わりません";
}
