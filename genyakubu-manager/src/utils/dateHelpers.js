import { DAYS, WEEKDAYS } from "../constants/schools";

// "YYYY-MM-DD" 形式かつ実在する日付か。
// HolidayManager / ExamPeriodManager / SpecialEventManager の入力検証で共有。
// Date.parse は V8 で "2026-02-31" を 3/3 として通してしまう (月の日数を
// 見ない) ので、ローカル Date に組み立てて年月日が往復一致するかで確かめる
// (2026-09-04)。通してしまうと文字列一致で照合する休講日・テスト期間に
// 永久にヒットしない日付が保存される。
export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// "19:00-20:20" / "19:00" → 開始時刻の分数。パース不能・空は 0
// (ソート用途で末尾に落とさず先頭寄せ)。timeToMin と違い range 文字列を
// そのまま受け、失敗時に NaN でなく 0 を返す。sessionCount / extraLessons
// のソートで共有。
export function timeStartToMin(time) {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "YYYY-MM-DD" → "M/D" (年を落とした短い表記。列見出し・帯・警告文の区間用)。
 * 年が要る場面 (期切替の重なり警告など) は withYear で "YYYY/M/D"。
 * @param {string} dateStr
 * @param {{withYear?: boolean}} [opts]
 */
export function fmtMD(dateStr, opts = {}) {
  const [y, m, d] = String(dateStr || "").split("-");
  if (!m || !d) return String(dateStr || "");
  const md = `${Number(m)}/${Number(d)}`;
  return opts.withYear && y ? `${y}/${md}` : md;
}

export function fmtDateWeekday(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dateStr} (${WEEKDAYS[dt.getDay()]})`;
}

/** "YYYY-MM-DD" → "M/D (曜)" (年を落とした短い表記。狭いカードの中など)。 */
export function fmtMDWeekday(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${fmtMD(dateStr)} (${WEEKDAYS[dt.getDay()]})`;
}

export function dateToDay(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const w = WEEKDAYS[dt.getDay()];
  return DAYS.includes(w) ? w : null;
}

// "YYYY-MM-DD" をローカルタイムの Date (00:00) に変換。
// new Date("YYYY-MM-DD") は UTC 扱いで日付ずれを起こすので
// 日付比較には必ずこのヘルパを使う。無効な文字列には null を返す。
export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// start / end を含む範囲の "YYYY-MM-DD" 文字列配列を返す。
// 無効な入力・end < start のときは空配列。
export function eachDateStrInRange(startDate, endDate) {
  const s = parseLocalDate(startDate);
  const e = parseLocalDate(endDate);
  if (!s || !e || e < s) return [];
  const out = [];
  const cur = new Date(s);
  while (cur <= e) {
    out.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// 期間 [start, end] が範囲 [rangeStart, rangeEnd] と重なるか。
// すべて "YYYY-MM-DD" 文字列。辞書順比較で十分。
export function overlapsRange(start, end, rangeStart, rangeEnd) {
  return end >= rangeStart && start <= rangeEnd;
}

// 単日なら "YYYY-MM-DD"、複数日なら "YYYY-MM-DD 〜 YYYY-MM-DD" を返す。
// イベントの期間表示で使うフォーマッタ。{ weekday: true } で各日付に
// 曜日を添える ("2026-09-21 (月) 〜 2026-09-25 (金)")。一覧のように
// 日付を読んで予定を確かめる場所で使う。
export function formatDateRange(start, end, { weekday = false } = {}) {
  if (!start) return "";
  const f = weekday ? fmtDateWeekday : (ds) => ds;
  if (!end || start === end) return f(start);
  return `${f(start)} 〜 ${f(end)}`;
}

// ISO 8601 文字列をローカルの "YYYY-MM-DD HH:MM" にフォーマット。
// createdAt / updatedAt の表示で利用。無効値は "-"。
export function fmtIsoLocal(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/**
 * <input type="month"> の値 "YYYY-MM" と基準日 (today) の月差。
 * 月間・イベントカレンダーの monthOff (今月 = 0) に入れる値。形式外は null。
 * @param {string | null | undefined} ym
 * @param {Date} today
 * @returns {number | null}
 */
export function monthOffsetFromToday(ym, today) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return (y - today.getFullYear()) * 12 + (mo - 1 - today.getMonth());
}

// "17:00" / "1700" / "9:05" / "17.00" → 分。読めなければ null
function parseHourMin(token) {
  const t = String(token || "").replace(".", ":");
  const m = /^(\d{1,2}):(\d{2})$/.exec(t) || /^(\d{1,2})(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function fmtHourMin(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "19:00-20:20" → 80 (分)。読めなければ null。 */
export function timeRangeMinutes(time) {
  const [a, b] = String(time || "").split("-");
  const start = parseHourMin((a || "").trim());
  const end = parseHourMin((b || "").trim());
  if (start == null || end == null || end <= start) return null;
  return end - start;
}

/**
 * 入力された授業の時間を保存形 "17:00-18:00" に整える。全角数字・「〜」
 * 「ー」などの区切り・空白・"1700-1800" のような区切りなしの時刻のゆれを
 * 吸収する (IME の素の入力 "１７：００〜１８：００" をそのまま受ける)。
 * 開始だけ ("17:00") のときは durationMin (元のコマの長さ) を足して終わりを
 * 補う。durationMin が無ければ終了時刻を求める。空の入力は {ok: true, time: ""}
 * (「元の時間のまま」を表す呼び出し側がある)。
 *
 * 他校舎の授業は終了未定 ("13:30") を持てるので別の関数
 * (offsiteLessons.normalizeOffsiteTime)。授業の時間はこちらを使う。
 *
 * @param {string} input
 * @param {{durationMin?: number|null}} [opts]
 * @returns {{ok: true, time: string} | {ok: false, error: string}}
 */
export function normalizeTimeRange(input, { durationMin = null } = {}) {
  const s = String(input ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    // 〜 (U+301C) ~ (NFKC 後の ～) − – — ― ‐ ー (長音) を区切りの "-" に
    .replace(/[〜~−–—―‐ー]/g, "-");
  if (!s) return { ok: true, time: "" };
  const parts = s.split("-");
  if (parts.length === 2 && parts[1] === "") parts.pop();
  if (parts.length > 2) {
    return { ok: false, error: "時間は「17:00-18:00」の形で入力してください" };
  }
  const start = parseHourMin(parts[0]);
  if (start == null) {
    return { ok: false, error: "開始時刻が読めません (例: 17:00-18:00)" };
  }
  let end;
  if (parts.length === 1) {
    if (!(durationMin > 0)) {
      return { ok: false, error: "終了時刻も入れてください (例: 17:00-18:00)" };
    }
    end = start + durationMin;
    if (end >= 24 * 60) {
      return { ok: false, error: "終了時刻が日付をまたぎます。終了時刻も入れてください" };
    }
  } else {
    end = parseHourMin(parts[1]);
    if (end == null) {
      return { ok: false, error: "終了時刻が読めません (例: 17:00-18:00)" };
    }
  }
  if (end <= start) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください" };
  }
  return { ok: true, time: `${fmtHourMin(start)}-${fmtHourMin(end)}` };
}
