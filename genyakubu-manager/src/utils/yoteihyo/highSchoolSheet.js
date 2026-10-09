// ─── 高校部の予定表 (高1・高2 / 高3) を読む ─────────────────────────
// 学校から届く四半期ごとの予定表 (Excel) から「講座ごとに、どの日に授業が
// あるか」を取り出す。紙面の決まりは 2026 年度の予定表に合わせてある:
//
//   - 月ごとのブロックが横に並ぶ。ブロックの左 2 列が「日」と「曜日」、
//     その右が講座の列。日付の列に日付型のセルがあればその日付を正とする
//   - 見出し (日付の行より上) に学年 (「高1」「高2」「高1・高2」。結合で
//     複数列にまたがる) と講座名 (「高松西高校」など)。高3 は「本校」
//     「亀井町教室」
//   - 授業のある日は記号 (〇○◯□■●◇◆◉◎★☆◒✸△▲▽▼ など。図形・記号の文字なら
//     何でも記号とみなす)。マークテストは丸数字 (①〜⑯)
//   - **灰色**の塗り = 休講 (教員用の表で、記号を残したまま / 空欄のまま)
//   - **黄色**の塗り = 変更・振替 (授業はある)
//   - 講座の列の 8 割以上をまたぐ結合セル、または講座の列が全部赤で記号の無い行
//     = 休校・祝日の行 (文字が理由)
//   - 講座の列にある記号以外の文字 (「←12/7(月)の振替→」など) = その日の注記
//
// 講座の単位は 2 通り:
//   - 列ごと (高1・高2): 1 列 = 1 講座。記号は飾り
//   - 記号ごと (高3): 1 つのセルに「◎★」のように複数の講座が並ぶ。
//     どれかのセルに記号が 2 つ以上ある、または凡例 (「◒：関関同立…」) が
//     あるシートはこちら。講座の名前は凡例から
//   - マークテスト (丸数字) は曜日ごとに 1 講座 (本校 = 月 / 亀井町 = 土)
//
// 読み取れない形のシートは null を返すだけで、例外にしない。

import { WEEKDAYS, isGrayFill, isRedFill, isWeekdayChar, isYellowFill, makeGrid } from "./sheetGrid";

// 授業の印になる記号: 図形 (U+25A0〜25FF ■□●○◎◇◆△▲▽▼◒◯ …)・その他の記号と
// 装飾記号 (U+2600〜27BF ★☆✸ …)・漢数字のゼロの「〇」。学校によって使う記号が
// 違う (「★■」のように並べる) ので、文字の一覧ではなく範囲で見る。
// ※ (U+203B)・矢印 (U+2190〜) は含まない
const MARK_CLASS = "\\u25A0-\\u27BF\\u3007";
const MARK_RE = new RegExp(`[${MARK_CLASS}]`);
const LEGEND_RE = new RegExp(`([${MARK_CLASS}])\\s*[：:]\\s*([^${MARK_CLASS}]*)`, "g");

/** 授業の印の記号か (1 文字) */
export function isMarkChar(ch) {
  return MARK_RE.test(ch);
}

// 丸数字 (①〜⑳ / ❶〜❿ / ➀〜➉ / ➊〜➓ / ⓫〜⓴) → 数
export function circledNumber(s) {
  if (typeof s !== "string" || [...s].length !== 1) return null;
  const c = s.codePointAt(0);
  if (c >= 0x2460 && c <= 0x2473) return c - 0x2460 + 1;
  if (c >= 0x2776 && c <= 0x277f) return c - 0x2776 + 1;
  if (c >= 0x2780 && c <= 0x2789) return c - 0x2780 + 1;
  if (c >= 0x278a && c <= 0x2793) return c - 0x278a + 1;
  if (c >= 0x24eb && c <= 0x24f4) return c - 0x24eb + 11;
  return null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoOf(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** "YYYY-MM-DD" → "日"〜"土" */
export function weekdayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** 「高1・高2」「高3」「高1高2」「高1・2」 → ["高1", "高2"] など (高校の学年だけ) */
export function gradesIn(text) {
  const out = new Set();
  const s = String(text || "").normalize("NFKC");
  const re = /高\s*([123])/g;
  let m;
  while ((m = re.exec(s))) out.add(`高${m[1]}`);
  const abbr = /高\s*([123])\s*[・,、]\s*([123])(?![0-9])/.exec(s);
  if (abbr) out.add(`高${abbr[2]}`);
  return [...out].sort();
}

function findTitle(g) {
  for (const [r, c] of g.cells(0, 6)) {
    const t = g.text(r, c);
    if (t && /予定表|ゼミ|カレンダー/.test(t)) return t;
  }
  return "";
}

/**
 * シート名・題の「【9-12月】」「10月～12月」から、その月の期間 (年度で年を決める。
 * 1〜3 月は翌年)。読めなければ null。予定回数の点検だけに使う
 */
export function namedMonthRange(sheetName, title, fiscalYear) {
  if (fiscalYear == null) return null;
  for (const text of [sheetName, title]) {
    const t = String(text || "").normalize("NFKC");
    // 「9-12月」「10月~11月」、または 1 か月だけの「【10月】」
    const m = /(\d{1,2})\s*月?\s*[-~〜]\s*(\d{1,2})\s*月/.exec(t) || /【\s*(\d{1,2})\s*月\s*】/.exec(t);
    if (!m) continue;
    const m1 = Number(m[1]);
    const m2 = Number(m[2] ?? m[1]);
    if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12) continue;
    const yearOf = (mo) => (mo <= 3 ? fiscalYear + 1 : fiscalYear);
    const pad = (n) => String(n).padStart(2, "0");
    const y2 = yearOf(m2);
    const last = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
    const start = `${yearOf(m1)}-${pad(m1)}-01`;
    const end = `${y2}-${pad(m2)}-${pad(last)}`;
    if (start <= end) return { start, end };
  }
  return null;
}

function fiscalYearOf(title, sheetName) {
  const t = String(title || "").normalize("NFKC");
  const n = String(sheetName || "").normalize("NFKC");
  const m = /(\d{4})\s*年度/.exec(t) || /(\d{4})\s*年度/.exec(n) || /^\s*(\d{4})(?!\d)/.exec(n);
  return m ? Number(m[1]) : null;
}

/**
 * シートの種類を見分ける。読めるのは高校部の予定表だけで、中学部・
 * 年間カレンダーは「この版では未対応」として名前だけ返す。
 * @returns {{ kind: "high"|"middle"|"calendar"|"unknown", title: string }}
 */
export function classifySheet(sheet) {
  const g = makeGrid(sheet);
  const title = findTitle(g);
  const s = `${title} ${sheet?.name || ""}`.normalize("NFKC");
  if (/カレンダー/.test(s)) return { kind: "calendar", title };
  if (/高\s*[123]|H\s*[123]/i.test(s)) return { kind: "high", title };
  if (/中\s*[123]|中学|附中/.test(s)) return { kind: "middle", title };
  return { kind: "unknown", title };
}

// 日付の列 (1〜31 の数 or 日付型) の右隣が曜日の 1 文字、という行が 20 行以上
// ある列を「月のブロック」の日付列とみなす。
function findDayBlocks(g) {
  const byCol = new Map();
  for (const [r, c, cell] of g.cells()) {
    if (cell.t !== "n" || cell.wd) continue;
    const isDay = !!cell.date || (Number.isInteger(cell.v) && cell.v >= 1 && cell.v <= 31);
    if (!isDay || !isWeekdayChar(g.text(r, c + 1))) continue;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c).push(r);
  }
  return [...byCol.entries()]
    .filter(([, rows]) => rows.length >= 20)
    .map(([dayCol, rows]) => ({ dayCol, rows }))
    .sort((a, b) => a.dayCol - b.dayCol);
}

function monthLabelAbove(g, block) {
  for (let r = block.rows[0] - 1; r >= 0; r--) {
    for (let c = block.dayCol; c <= Math.min(block.dayCol + 4, g.maxCol); c++) {
      const t = g.text(r, c).normalize("NFKC").replace(/\s+/g, "");
      const m = /^(\d{1,2})月$/.exec(t);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { month: Number(m[1]), row: r };
    }
  }
  return null;
}

// ブロックの各行に日付を付ける。月は見出しの「N月」から始め、日が戻ったら
// 次の月へ。日付型のセルがあればそれを正とする。
function assignDates(g, blocks, fiscalYear) {
  const out = [];
  for (const block of blocks) {
    const label = monthLabelAbove(g, block);
    let month = label?.month ?? null;
    let year = month != null && fiscalYear != null ? (month >= 4 ? fiscalYear : fiscalYear + 1) : null;
    let prevDay = 0;
    for (const r of block.rows) {
      const cell = g.raw(r, block.dayCol);
      let day;
      if (cell.date) {
        [year, month, day] = cell.date.split("-").map(Number);
      } else {
        day = cell.v;
        if (month != null && day < prevDay) {
          month += 1;
          if (month > 12) {
            month = 1;
            if (year != null) year += 1;
          }
        }
      }
      prevDay = day;
      const date = year != null && month != null ? isoOf(year, month, day) : null;
      if (date) out.push({ r, block, date, labelWd: g.text(r, block.dayCol + 1) });
    }
  }
  return out;
}

// 凡例 (「◒：関関同立【英語・現代文・古文】 〇：…」)。日付の行より下を見る。
// 行の左端に「【本 校】」「【亀井町】」があれば、その下の凡例はその校舎のもの。
// 凡例どうしは 2 つ以上の空白 (全角を含む) で区切られている (後ろの「⑨～⑯：マークテスト」も切る)。
// JS の \s は全角の空白 (U+3000) も含む。
function parseLegend(g, belowRow) {
  const out = new Map();
  let campus = "";
  for (const [r, c] of g.cells(belowRow + 1)) {
    if (!g.isAnchor(r, c)) continue;
    const t = g.text(r, c);
    if (!t) continue;
    const cm = /【\s*(本\s*校|亀井町[^】]*)\s*】/.exec(t);
    if (cm) campus = cm[1].replace(/\s+/g, "").replace("教室", "");
    LEGEND_RE.lastIndex = 0;
    let m;
    while ((m = LEGEND_RE.exec(t))) {
      const name = m[2].split(/\s{2,}/u)[0].trim();
      if (name && !out.has(m[1])) out.set(m[1], { name, campus });
    }
  }
  return out;
}

/**
 * 高校部の予定表 1 枚を読む。
 * @returns {null | ParsedSheet}
 *
 * ParsedSheet = {
 *   title, fiscalYear, mode: "column"|"symbol", grades: string[],
 *   range: { start, end },
 *   days: Map<date, { date, labelWd, realWd, closed: null|{label}, notes: string[] }>,
 *   courses: Map<key, Course>,
 *   legend: Map<symbol, { name, campus }>,
 *   notes: string[],                       // シート下の「※…」
 *   namedRange: null | { start, end },     // シート名の「【9-12月】」の期間
 *   warnings: { kind, message }[],         // 曜日が暦と合わない など
 *   planned: { courseKey, weekdays: string|null, count }[],  // 予定回数 (教員用・集計表)
 * }
 * Course = { key, mode: "column"|"symbol"|"mark", grades, campus, name, symbol,
 *            headers: string[], column: number|null,
 *            sessions: Map<date, { status: "held"|"cancelled", changed: boolean, number: number|null }> }
 */
export function parseHighSchoolSheet(sheet) {
  const g = makeGrid(sheet);
  const title = findTitle(g);
  const blocks = findDayBlocks(g);
  if (!blocks.length) return null;
  const titleGrades = gradesIn(title).length ? gradesIn(title) : gradesIn(sheet?.name);
  if (!titleGrades.length) return null;
  const warnings = [];

  // 年度が書かれていなければ、曜日がいちばん合う年を選ぶ
  let fiscalYear = fiscalYearOf(title, sheet?.name);
  if (fiscalYear == null) {
    const now = new Date().getFullYear();
    let best = null;
    for (const fy of [now - 2, now - 1, now, now + 1]) {
      const hits = assignDates(g, blocks, fy).filter((x) => weekdayOf(x.date) === x.labelWd).length;
      if (!best || hits > best.hits) best = { fy, hits };
    }
    fiscalYear = best.fy;
  }
  const datedRows = assignDates(g, blocks, fiscalYear);
  if (!datedRows.length) return null;

  const mismatched = datedRows.filter((x) => x.labelWd && weekdayOf(x.date) !== x.labelWd);
  if (mismatched.length) {
    const ex = mismatched[0];
    warnings.push({
      kind: "weekday",
      message:
        `曜日が暦と合わない日が ${mismatched.length} 日あります` +
        ` (例: ${Number(ex.date.slice(5, 7))}/${Number(ex.date.slice(8))} が「${ex.labelWd}」、` +
        `暦では「${weekdayOf(ex.date)}」)。前の年の表の曜日が残っているかもしれません。学校に確認してください。`,
    });
  }

  const maxDayRow = Math.max(...datedRows.map((x) => x.r));
  const legend = parseLegend(g, maxDayRow);

  // ── 講座の列 (日付・曜日の右から、見出しも中身も無い列の手前まで) ──
  const blockCols = blocks.map((block, bi) => {
    const next = blocks[bi + 1]?.dayCol ?? g.maxCol + 1;
    const label = monthLabelAbove(g, block);
    const headTop = label ? label.row + 1 : 0;
    const cols = [];
    for (let c = block.dayCol + 2; c < next; c++) {
      const headers = [];
      for (let r = headTop; r < block.rows[0]; r++) {
        const t = g.text(r, c).replace(/\s+/g, " ").trim();
        if (t && !headers.includes(t)) headers.push(t);
      }
      const hasContent = block.rows.some((r) => g.text(r, c) || isGrayFill(g.fill(r, c)));
      if (!headers.length && !hasContent) break;
      cols.push({ c, headers });
    }
    return cols;
  });

  // 記号ごとの講座か (どこかのセルに記号が 2 つ以上 / 凡例がある)
  const multiMark = blocks.some((block, bi) =>
    block.rows.some((r) =>
      blockCols[bi].some(({ c }) => [...g.text(r, c)].filter((ch) => MARK_RE.test(ch)).length >= 2)
    )
  );
  const mode = multiMark || legend.size > 0 ? "symbol" : "column";

  const colInfo = (headers) => {
    const grades = gradesIn(headers.join(" "));
    const campusHeader = headers.find((h) => /本\s*校|亀井町/.test(h)) || "";
    const nameHeaders = headers.filter(
      (h) => h !== campusHeader && !/^高\s*[123]([・、]\s*高?\s*[123])?$/.test(h.normalize("NFKC"))
    );
    return {
      grades: grades.length ? grades : titleGrades,
      campus: campusHeader.replace(/\s+/g, "").replace("教室", ""),
      name: nameHeaders[nameHeaders.length - 1] || "",
    };
  };

  const courses = new Map();
  const ensureCourse = (key, init) => {
    if (!courses.has(key)) {
      courses.set(key, { key, headers: [], column: null, sessions: new Map(), ...init });
    }
    return courses.get(key);
  };
  const columnCourse = (c, headers) => {
    const info = colInfo(headers);
    const key = `${info.grades.join("・")}|${info.name || `列${c + 1}`}`;
    const course = ensureCourse(key, {
      mode: "column",
      grades: info.grades,
      campus: info.campus,
      name: info.name,
      symbol: null,
      column: c,
    });
    for (const h of headers) if (!course.headers.includes(h)) course.headers.push(h);
    return course;
  };

  // 列ごとの表では、見出しのある列は授業が 1 回も無くても講座として持つ
  // (対応表に「この予定表の期間には授業がありません」と出す。比べはしない)
  if (mode === "column") {
    blockCols.forEach((cols) => {
      for (const { c, headers } of cols) {
        if (colInfo(headers).name) columnCourse(c, headers);
      }
    });
  } else {
    for (const [sym, lg] of legend) {
      ensureCourse(`${titleGrades.join("・")}|sym:${sym}`, {
        mode: "symbol",
        grades: titleGrades,
        campus: lg.campus,
        name: lg.name,
        symbol: sym,
      });
    }
  }

  const days = new Map();
  const grayEmpty = []; // 記号ごとの表の、記号の無い灰色セル (講座は後で決める)
  for (const x of datedRows) {
    const cols = blockCols[blocks.indexOf(x.block)];
    const day = days.get(x.date) || {
      date: x.date,
      labelWd: x.labelWd,
      realWd: weekdayOf(x.date),
      closed: null,
      notes: [],
    };
    days.set(x.date, day);
    if (!cols.length) continue;

    // 休校・祝日の行: 講座の列の 8 割以上をまたぐ結合、または全列が赤で記号なし
    const m = g.merge(x.r, cols[0].c);
    const spansAll = !!m && m.c1 - m.c0 + 1 >= Math.max(2, Math.ceil(cols.length * 0.8));
    const allRed =
      cols.every(({ c }) => isRedFill(g.fill(x.r, c))) &&
      !cols.some(({ c }) => MARK_RE.test(g.text(x.r, c)) || circledNumber(g.text(x.r, c)) != null);
    if (spansAll || allRed) {
      day.closed = { label: g.text(x.r, cols[0].c) };
      continue;
    }

    for (const { c, headers } of cols) {
      if (!g.isAnchor(x.r, c)) continue;
      const t = g.text(x.r, c);
      const fill = g.fill(x.r, c);
      const status = isGrayFill(fill) ? "cancelled" : "held";
      const changed = isYellowFill(fill);
      const num = circledNumber(t);
      if (num != null) {
        const info = colInfo(headers);
        const wd = weekdayOf(x.date);
        const course = ensureCourse(`${info.grades.join("・")}|mark:${wd}`, {
          mode: "mark",
          grades: info.grades,
          campus: info.campus,
          name: `マークテスト（${wd}）`,
          symbol: null,
          column: c,
        });
        if (!course.campus && info.campus) course.campus = info.campus;
        course.sessions.set(x.date, { status, changed, number: num });
        continue;
      }
      const compact = t.replace(/\s+/g, "");
      const marks = [...compact].filter((ch) => MARK_RE.test(ch));
      if (marks.length && marks.length === [...compact].length) {
        if (mode === "column") {
          columnCourse(c, headers).sessions.set(x.date, { status, changed, number: null });
        } else {
          const info = colInfo(headers);
          for (const sym of marks) {
            const course = ensureCourse(`${info.grades.join("・")}|sym:${sym}`, {
              mode: "symbol",
              grades: info.grades,
              campus: info.campus,
              name: legend.get(sym)?.name || "",
              symbol: sym,
            });
            if (course.column == null) course.column = c;
            if (!course.campus && info.campus) course.campus = info.campus;
            course.sessions.set(x.date, { status, changed, number: null });
          }
        }
        continue;
      }
      if (!t && status === "cancelled") {
        if (mode === "column") {
          columnCourse(c, headers).sessions.set(x.date, { status, changed: false, number: null });
        } else {
          grayEmpty.push({ date: x.date, c });
        }
        continue;
      }
      if (t) {
        // 記号以外の文字 = その日の注記 (「←12/7(月)の振替→」「休講 →」)
        const note = t.replace(/\s+/g, " ");
        if (!day.notes.includes(note)) day.notes.push(note);
      }
    }
  }

  // 記号ごとの表の灰色の空欄 = その列でその曜日に授業のある講座の休講
  for (const ge of grayEmpty) {
    const wd = weekdayOf(ge.date);
    for (const course of courses.values()) {
      if (course.mode !== "symbol" || course.column !== ge.c || course.sessions.has(ge.date)) continue;
      if ([...course.sessions.keys()].some((d) => weekdayOf(d) === wd)) {
        course.sessions.set(ge.date, { status: "cancelled", changed: false, number: null });
      }
    }
  }

  // ── 予定回数 ──
  const planned = [];
  if (mode === "column") {
    // 教員用: 最後の日の行の直下に、講座の列ごとの回数が並ぶ
    blocks.forEach((block, bi) => {
      const last = Math.max(...block.rows);
      for (let r = last + 1; r <= Math.min(last + 3, g.maxRow); r++) {
        const nums = blockCols[bi].filter(({ c }) => {
          const cell = g.raw(r, c);
          return cell?.t === "n" && Number.isInteger(cell.v);
        });
        if (nums.length < Math.max(2, Math.ceil(blockCols[bi].length / 2))) continue;
        for (const { c, headers } of nums) {
          const info = colInfo(headers);
          const courseKey = `${info.grades.join("・")}|${info.name || `列${c + 1}`}`;
          if (!planned.some((p) => p.courseKey === courseKey)) {
            planned.push({ courseKey, weekdays: null, count: g.raw(r, c).v });
          }
        }
        break;
      }
    });
  } else {
    // 「火 | ◎★ | 15」のような集計表 (曜日・記号・回数が横に並ぶ)
    for (const [r, c] of g.cells()) {
      const w = g.text(r, c);
      if (!/^[月火水木金土日]{1,3}$/.test(w)) continue;
      const marks = g.text(r, c + 1);
      const n = g.raw(r, c + 2);
      if (!marks || ![...marks].every((ch) => MARK_RE.test(ch))) continue;
      if (!(n?.t === "n" && Number.isInteger(n.v))) continue;
      for (const sym of marks) {
        planned.push({ courseKey: `${titleGrades.join("・")}|sym:${sym}`, weekdays: w, count: n.v });
      }
    }
  }

  // ── シートの注記 (「※4/29（水）は授業実施」など) ──
  const notes = [];
  for (const [r, c] of g.cells()) {
    if (!g.isAnchor(r, c)) continue;
    const t = g.text(r, c);
    if (!/^※.{3,}/.test(t)) continue;
    const s = t.replace(/\s+/g, " ");
    if (!notes.includes(s)) notes.push(s);
  }

  const dates = [...days.keys()].sort();
  return {
    title,
    fiscalYear,
    mode,
    grades: titleGrades,
    range: { start: dates[0], end: dates[dates.length - 1] },
    namedRange: namedMonthRange(sheet?.name, title, fiscalYear),
    days,
    courses,
    legend,
    notes,
    warnings,
    planned,
  };
}

/** 講座の主な曜日 (3 回以上かつ最多の 4 分の 1 以上) */
export function courseWeekdays(course) {
  const counts = {};
  for (const date of course.sessions.keys()) {
    const wd = weekdayOf(date);
    counts[wd] = (counts[wd] || 0) + 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  const regular = WEEKDAYS.split("").filter((w) => (counts[w] || 0) >= 3 && counts[w] >= max / 4);
  return { regular, counts };
}

/** 日付の集まりを gapDays を超える空きで区切った期間 (学期) */
export function splitTerms(dates, gapDays = 21) {
  const sorted = [...dates].sort();
  const terms = [];
  for (const d of sorted) {
    const last = terms[terms.length - 1];
    if (last && daysBetween(last.end, d) <= gapDays) last.end = d;
    else terms.push({ start: d, end: d });
  }
  return terms;
}

// ─── 複数シートをまとめる ─────────────────────────────────────────

const familyKey = (grades) => grades.join("・");

/**
 * 選んだシート (高校部) を 1 つにまとめる。同じ日が 2 枚にあれば、
 * 先に渡したシートを使う (並びは呼び出し側が決める。画面は
 * sheetSelection.selectedInMergeOrder = 教員用 → 改訂・訂正・変更 → ブックの左)。
 *
 * 講座は key で突き合わせる (列ごとの講座 = 「学年|講座名」、記号の講座 =
 * 「学年|sym:記号」)。名前・校舎は最初に見つかったものを使う (高3 の
 * 8〜9 月のシートには凡例が無いので、9〜12 月のシートの凡例で補われる)。
 *
 * @param {{ name: string, parsed: ParsedSheet }[]} sheets
 */
export function mergeHighSchoolSheets(sheets) {
  const courses = new Map();
  const days = new Map();
  const families = new Map(); // 学年の組 (高1・高2 / 高3) → { key, grades, ranges, sessionDates, terms }
  const notes = [];
  const warnings = [];
  const planned = [];
  for (const { name, parsed } of sheets) {
    const fam = familyKey(parsed.grades);
    if (!families.has(fam)) families.set(fam, { key: fam, grades: parsed.grades, ranges: [], sessionDates: new Set() });
    const family = families.get(fam);
    family.ranges.push({ ...parsed.range, sheet: name });
    for (const [date, day] of parsed.days) {
      if (!days.has(`${fam}|${date}`)) days.set(`${fam}|${date}`, { ...day, family: fam, sheet: name });
    }
    for (const course of parsed.courses.values()) {
      if (!courses.has(course.key)) {
        courses.set(course.key, {
          key: course.key,
          family: fam,
          mode: course.mode,
          grades: course.grades,
          campus: course.campus,
          name: course.name,
          symbol: course.symbol,
          headers: [...course.headers],
          sessions: new Map(),
          ranges: [],
        });
      }
      const merged = courses.get(course.key);
      if (!merged.name && course.name) merged.name = course.name;
      if (!merged.campus && course.campus) merged.campus = course.campus;
      merged.ranges.push({ ...parsed.range, sheet: name });
      for (const [date, s] of course.sessions) {
        // 同じ日を 2 枚が持つときは先のシートを使う。範囲が重なるシートを
        // 両方選んだ場合は、呼び出し側が overlaps で警告する
        if (merged.sessions.has(date)) continue;
        const coveredEarlier = merged.ranges
          .slice(0, -1)
          .some((r) => r.start <= date && date <= r.end);
        if (coveredEarlier) continue;
        merged.sessions.set(date, { ...s, sheet: name });
        family.sessionDates.add(date);
      }
    }
    for (const n of parsed.notes) if (!notes.includes(n)) notes.push(n);
    for (const w of parsed.warnings) warnings.push({ ...w, sheet: name });
    for (const p of parsed.planned) {
      planned.push({ ...p, sheet: name, range: parsed.range, namedRange: parsed.namedRange || null });
    }
  }
  for (const family of families.values()) {
    family.terms = splitTerms(family.sessionDates);
  }
  return { courses, days, families, notes, warnings, planned };
}

/**
 * 予定回数と、表から数えた回数の食い違い (予定表の作り間違いの点検)。
 * 予定回数の数え方はシートによって違う (教員用の 20 回は 10〜12 月の分、
 * 高3 の集計表の 15 回は 2 学期全体の分、「【9-12月】」のシートは 9〜12 月の分)
 * ので、シートの期間内・シート名の月の期間内・学期 (授業の連なり) 全体で
 * 数えた数のどれかが合えば一致とみなす。
 *
 * 学期の頭が選んだシートより前にありそうなとき (学期の始まりの前に空きが
 * 見えない) は、少ない方の食い違いは出さない。前の期間のシートを選んで
 * いないだけで、予定表の誤りではないことが多いため。多い方は必ず出す。
 */
export function checkPlannedCounts(merged) {
  const out = [];
  for (const p of merged.planned) {
    const course = merged.courses.get(p.courseKey);
    if (!course) continue;
    const family = merged.families.get(course.family);
    const wdOk = (d) => !p.weekdays || p.weekdays.includes(weekdayOf(d));
    const held = [...course.sessions.entries()].filter(([d, s]) => s.status === "held" && wdOk(d));
    const inSheet = held.filter(([d]) => p.range.start <= d && d <= p.range.end).length;
    const term = family?.terms.find((t) => t.start <= p.range.end && p.range.start <= t.end);
    const inTerm = term ? held.filter(([d]) => term.start <= d && d <= term.end).length : inSheet;
    const nr = p.namedRange;
    const inNamed = nr ? held.filter(([d]) => nr.start <= d && d <= nr.end).length : null;
    if (inSheet === p.count || inTerm === p.count || inNamed === p.count) continue;
    const coverageStart = family ? family.ranges.map((r) => r.start).sort()[0] : p.range.start;
    const seesTermStart = term ? daysBetween(coverageStart, term.start) >= 14 : false;
    if (Math.max(inSheet, inTerm) < p.count && !seesTermStart) continue;
    out.push({
      courseKey: p.courseKey,
      sheet: p.sheet,
      weekdays: p.weekdays,
      planned: p.count,
      counted: inTerm,
      countedInSheet: inSheet,
    });
  }
  return out;
}
