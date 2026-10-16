// ─── 中学部の予定表 (中1・中2 / 中3) を読む ─────────────────────────
// 「【中1・中2ゼミ】」「【中3ゼミ】」の予定表 (Excel) から「コースごとに、どの日に
// 授業があるか・その日が第何回か」を取り出す。紙面の決まりは 2026 年度の
// 予定表 (シート T1T2 / T3) に合わせてある:
//
//   - 月ごとのブロックが横に並ぶ (高校部と同じ)。ブロックの左 2 列が「日」と
//     「曜日」、その右がコースの欄。欄は見出しの結合で 2 つに分かれる:
//       T1T2 = 「中1」「中2」(5 列ずつ) / T3 = 「本科コース」「附中コース」(6 列ずつ)
//   - 授業のある日は「記号 + 回数 + 単元」(「■21  英⑤」= 本科の第21回・英語の
//     第5単元)。記号の意味は表の題の凡例 (「中1…■：本科，◇：附中 中2…□：本科，
//     ◆：附中 ☆：プレップ（個別指導）」)。1 つの欄に「☆12  ★10」のように
//     2 つ並ぶこともある。2 つの欄をまたぐ記号 (☆ プレップ・★ 内申対策) は
//     学年をまたぐコース
//   - コースの欄の「※」= その日はそのコースの授業なし (休講・休校。理由は備考)
//   - 曜日の欄が黒 (3 学期は灰色) = 休日
//   - 黄色の塗り = 振替・変更 (授業はある)
//   - 凡例の色 (緑 = 公立中学校の定期テスト、橙 = 学習の診断 など) = その日の注記
//   - 表の下の「備考」は日付の入った注記 (「12/7(月) 休校」「中2本科：12/7(月)の
//     授業を12/4(金)に振替」「＜ゼミ終講日＞ 本科 火木：12/17(木)…」)。その日付の
//     注記として持つ (振替元は compare.parseSourceDate が読む)。「休校」の注記が
//     あって授業の記号の無い日は休みの日とする
//
// 出力の形は高校部 (parseHighSchoolSheet) と同じ ParsedSheet で、比べる側
// (compare / courseMapping / cutoffProposals) は高校部と同じ経路を通る。違うのは
// コース (Course) に dept: "中学部" と、学年をまたぐかどうか (shared) があること。
//
// コースのキー (講座の対応・確認済みの鍵。予定表を読み直しても変わらない):
//   - 欄 1 つのコース: `${学年}|sym:${記号}` (「中1|sym:■」「附中1|sym:◇」)。
//     凡例の名前に「附中」があれば学年を「附中N」にする (システムの学年と同じ書き方)
//   - 欄をまたぐコース: `中学|sym:${記号}` (T1T2 と T3 の ☆ プレップは同じ 1 コース)
//
// 予定表そのものの点検 (warnings) は高校部と同じ関数 (表の外の印・凡例に無い色)。
// 読み取れない形のシートは null を返すだけで、例外にしない。

import { isGrayFill, isYellowFill, makeGrid } from "./sheetGrid";
import {
  MARK_CLASS,
  assignDates,
  checkFills,
  checkOutside,
  courseWeekdays,
  findDayBlocks,
  findTitle,
  fiscalYearOf,
  isoOf,
  monthLabelAbove,
  weekdayOf,
} from "./highSchoolSheet";

/** 学年をまたぐコース (☆ プレップ・★ 内申対策) の学年の表記 */
export const SHARED_GRADE = "中学";

const MARK_NUM_RE = new RegExp(`([${MARK_CLASS}])\\s*(\\d{1,3})?`, "g");
const LEGEND_ENTRY_RE = new RegExp(`([${MARK_CLASS}])\\s*[：:]?\\s*([^${MARK_CLASS}，,、\\s]+)`, "g");

/** 「【中1・中2ゼミ】」「中3」「中1・2」 → ["中1", "中2"] など (中学の学年だけ。附中は含めない) */
export function middleGradesIn(text) {
  const out = new Set();
  const s = String(text || "").normalize("NFKC");
  const re = /(?<!附)中\s*([123])/g;
  let m;
  while ((m = re.exec(s))) out.add(`中${m[1]}`);
  const abbr = /中\s*([123])\s*[・,、]\s*([123])(?![0-9])/.exec(s);
  if (abbr) out.add(`中${abbr[2]}`);
  return [...out].sort();
}

/**
 * 題の凡例 (「中1…■：本科，◇：附中   中2…□：本科，◆：附中   ☆：プレップ」)。
 * 「中N…」のあとの記号はその学年のもの、2 つ以上続く空白で学年の区切りが終わる。
 * @returns {{ byGrade: Map<string, Map<string, string>>, global: Map<string, string> }}
 */
export function parseMiddleLegend(texts) {
  const byGrade = new Map();
  const global = new Map();
  for (const text of texts) {
    const s = String(text || "").normalize("NFKC");
    // 学年の区切り: 「中N…」「中N...」「中N:」で始まり、2 つ以上の空白で終わる
    for (const part of s.split(/\s{2,}/u)) {
      const gm = /(?<!附)中\s*([123])\s*(?:…|\.{2,}|‥|[:：])/.exec(part);
      const target = gm ? `中${gm[1]}` : null;
      LEGEND_ENTRY_RE.lastIndex = 0;
      let m;
      while ((m = LEGEND_ENTRY_RE.exec(part))) {
        const name = m[2].trim();
        if (!name) continue;
        if (target) {
          if (!byGrade.has(target)) byGrade.set(target, new Map());
          if (!byGrade.get(target).has(m[1])) byGrade.get(target).set(m[1], name);
        } else if (!global.has(m[1])) {
          global.set(m[1], name);
        }
      }
    }
  }
  return { byGrade, global };
}

// 曜日の欄の黒 (休日)。3 学期のブロックは灰色で塗ってある
function isHolidayFill(fill) {
  if (typeof fill !== "string" || !/^#[0-9a-f]{6}$/i.test(fill)) return false;
  const v = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
  if (Math.max(...v) <= 0x40) return true;
  return isGrayFill(fill);
}

// 「12/7(月)」「10/17(土)・24(土)」の日付 (年は年度から)。範囲「11/17(火)～11/26(木)」は両端
function datesInText(text, fiscalYear) {
  const s = String(text || "").normalize("NFKC");
  const out = [];
  const re = /(\d{1,2})\s*\/\s*(\d{1,2})|[・,、]\s*(\d{1,2})\s*(?=\()/g;
  let month = null;
  let m;
  while ((m = re.exec(s))) {
    let day;
    if (m[1] != null) {
      month = Number(m[1]);
      day = Number(m[2]);
    } else {
      if (month == null) continue;
      day = Number(m[3]);
    }
    if (fiscalYear == null || month < 1 || month > 12) continue;
    const iso = isoOf(month >= 4 ? fiscalYear : fiscalYear + 1, month, day);
    if (iso && !out.includes(iso)) out.push(iso);
  }
  return out;
}

/**
 * 中学部の予定表 1 枚を読む。
 * @returns {null | ParsedSheet}  形は highSchoolSheet.parseHighSchoolSheet と同じ。
 *   Course には dept: "中学部"・shared (欄をまたぐコース)・group (欄の名前) が付き、
 *   sessions の number は予定表の第N回 (「■21」の 21)
 */
export function parseMiddleSchoolSheet(sheet) {
  const g = makeGrid(sheet);
  const title = findTitle(g);
  const blocks = findDayBlocks(g);
  if (!blocks.length) return null;
  const sheetGrades = middleGradesIn(title).length ? middleGradesIn(title) : middleGradesIn(sheet?.name);
  if (!sheetGrades.length) return null;

  const fiscalYear = fiscalYearOf(title, sheet?.name) ?? new Date().getFullYear();
  const allRows = assignDates(g, blocks, fiscalYear);
  if (!allRows.length) return null;

  // 曜日が暦と合わない月のブロック (2026 年度の表の「1月～3月」が 2026 年の曜日の
  // まま = 前の年の表の書き残し)。行の半分以上が合わないブロックは、日付が 1 日
  // ずれて読めてしまうので比べない (印を読まない)。どちらも予定表の点検に出す
  const warnings = [];
  const unreliable = new Set();
  for (const block of blocks) {
    const rows = allRows.filter((x) => x.block === block && x.labelWd);
    const bad = rows.filter((x) => weekdayOf(x.date) !== x.labelWd);
    if (!bad.length) continue;
    const ex = bad[0];
    const md = `${Number(ex.date.slice(5, 7))}/${Number(ex.date.slice(8))}`;
    const month = `${Number(ex.date.slice(5, 7))}月`;
    if (bad.length * 2 >= rows.length) unreliable.add(block);
    warnings.push({
      kind: "weekday",
      message:
        `${month}の欄の曜日が ${ex.date.slice(0, 4)} 年の暦と合いません (${bad.length} 日。例: ${md} が「${ex.labelWd}」、` +
        `暦では「${weekdayOf(ex.date)}」)。前の年の表の曜日が残っているかもしれません。学校に確認してください。` +
        (unreliable.has(block) ? "この月の授業は比べていません。" : ""),
    });
  }
  const datedRows = allRows.filter((x) => !unreliable.has(x.block));
  if (!datedRows.length) return null;
  const maxDayRow = Math.max(...allRows.map((x) => x.r));
  const minDayRow = Math.min(...allRows.map((x) => x.r));

  // 題 (ブロックごとにある) の凡例
  const titles = [];
  for (const [r, c] of g.cells(0, minDayRow - 1)) {
    const t = g.text(r, c);
    if (t && /予定表|ゼミ/.test(t) && !titles.includes(t)) titles.push(t);
  }
  const legend = parseMiddleLegend(titles);

  // ── ブロックごとのコースの欄 (見出しの結合 1 つ = 欄 1 つ) ──
  const blockGroups = blocks.map((block, bi) => {
    const next = blocks[bi + 1]?.dayCol ?? g.maxCol + 1;
    const label = monthLabelAbove(g, block);
    const headTop = label ? label.row + 1 : 0;
    const groups = [];
    for (let c = block.dayCol + 2; c < next; c++) {
      let found = null;
      for (let r = headTop; r < block.rows[0]; r++) {
        const t = g.text(r, c).replace(/\s+/g, "");
        if (!t) continue;
        const m = g.merge(r, c);
        found = { text: t, c0: m ? m.c0 : c, c1: m ? m.c1 : c };
        break;
      }
      if (!found) break;
      const grades = middleGradesIn(found.text);
      groups.push({
        name: found.text,
        c0: found.c0,
        c1: found.c1,
        grade: grades.length === 1 ? grades[0] : sheetGrades.length === 1 ? sheetGrades[0] : null,
        fuzoku: /附中/.test(found.text),
      });
      c = found.c1;
    }
    return groups;
  });
  if (!blockGroups.some((gs) => gs.length)) return null;

  const legendName = (grade, mark) =>
    (grade && legend.byGrade.get(grade)?.get(mark)) || legend.global.get(mark) || "";

  const courses = new Map();
  const ensureCourse = (key, init) => {
    if (!courses.has(key)) {
      courses.set(key, { key, headers: [], column: null, sessions: new Map(), campus: "", ...init });
    }
    return courses.get(key);
  };
  // 記号 → コース。欄をまたぐ記号は学年をまたぐコース
  const courseFor = (mark, groupsHit) => {
    if (groupsHit.length > 1) {
      return ensureCourse(`${SHARED_GRADE}|sym:${mark}`, {
        mode: "symbol",
        dept: "中学部",
        shared: true,
        grades: [SHARED_GRADE],
        sheetGrades: [...sheetGrades],
        name: legendName(null, mark),
        symbol: mark,
        group: null,
      });
    }
    const grp = groupsHit[0];
    const base = grp.grade;
    const name = legendName(base, mark);
    const fuzoku = /附中/.test(name) || (!name && grp.fuzoku);
    const grade = base ? (fuzoku ? `附${base}` : base) : sheetGrades.join("・");
    const course = ensureCourse(`${grade}|sym:${mark}`, {
      mode: "symbol",
      dept: "中学部",
      shared: false,
      grades: [grade],
      sheetGrades: base ? [base] : [...sheetGrades],
      name: name || grp.name,
      symbol: mark,
      group: grp.name,
    });
    if (!course.headers.includes(grp.name)) course.headers.push(grp.name);
    return course;
  };

  // 凡例の色 (色見本の右の文字が名前)。日付の行の外だけを見る
  const datedRowSet = new Set(datedRows.map((x) => x.r));
  const fillLabels = new Map();
  for (const [r, c] of g.cells(maxDayRow + 1)) {
    if (datedRowSet.has(r)) continue;
    const f = g.fill(r, c);
    if (!f || g.text(r, c)) continue;
    for (let k = 1; k <= 4; k++) {
      const t = g.text(r, c + k);
      if (t) {
        const key = f.toLowerCase();
        if (!fillLabels.has(key)) fillLabels.set(key, t.replace(/\s+/g, " "));
        break;
      }
    }
  }

  const days = new Map();
  const cancelMarks = []; // 「※」の欄 (コースは後で決める)
  for (const x of datedRows) {
    const groups = blockGroups[blocks.indexOf(x.block)];
    const day = days.get(x.date) || {
      date: x.date,
      labelWd: x.labelWd,
      realWd: weekdayOf(x.date),
      closed: null,
      notes: [],
    };
    days.set(x.date, day);
    if (!groups.length) continue;
    const wdFill = g.fill(x.r, x.block.dayCol + 1);
    const rowYellow = isYellowFill(wdFill) || isYellowFill(g.fill(x.r, x.block.dayCol));
    const addNote = (n) => {
      if (n && !day.notes.includes(n)) day.notes.push(n);
    };
    let anyMark = false;
    const from = groups[0].c0;
    const to = groups[groups.length - 1].c1;
    for (let c = from; c <= to; c++) {
      if (!g.isAnchor(x.r, c)) continue;
      const m = g.merge(x.r, c);
      const c1 = m ? m.c1 : c;
      const hit = groups.filter((grp) => grp.c0 <= c1 && c <= grp.c1);
      const t = g.text(x.r, c);
      const fill = g.fill(x.r, c);
      const label = fill ? fillLabels.get(fill.toLowerCase()) : null;
      if (label) addNote(label);
      if (!t || !hit.length) continue;
      const compact = t.replace(/\s+/g, "");
      if (/^※.{0,5}$/.test(compact)) {
        cancelMarks.push({ date: x.date, groups: hit });
        continue;
      }
      MARK_NUM_RE.lastIndex = 0;
      const marks = [];
      let mm;
      while ((mm = MARK_NUM_RE.exec(t))) marks.push({ mark: mm[1], number: mm[2] != null ? Number(mm[2]) : null });
      if (!marks.length) {
        addNote(t.replace(/\s+/g, " "));
        continue;
      }
      anyMark = true;
      for (const { mark, number } of marks) {
        const course = courseFor(mark, hit);
        if (course.column == null) course.column = c;
        course.sessions.set(x.date, {
          status: "held",
          changed: rowYellow || isYellowFill(fill),
          number,
        });
      }
    }
    if (!anyMark && isHolidayFill(wdFill)) day.closed = { label: "休日" };
  }

  // 「※」= その欄の、その曜日がいつもの曜日のコースの授業なし (振替で 1 回だけ
  // その曜日に入ったコースは含めない。4/29 (水) の振替で中2 本科が水曜に入って
  // いても、7/1 (水) の中2 の「※」は附中の休講)
  for (const cm of cancelMarks) {
    const wd = weekdayOf(cm.date);
    const names = new Set(cm.groups.map((grp) => grp.name));
    for (const course of courses.values()) {
      if (course.sessions.has(cm.date)) continue;
      const inGroup = course.shared ? cm.groups.length > 1 : names.has(course.group);
      if (!inGroup || !courseWeekdays(course).regular.includes(wd)) continue;
      course.sessions.set(cm.date, { status: "cancelled", changed: false, number: null });
    }
  }

  // ── 備考 (表の下の注記)。日付の入った行はその日の注記にする ──
  const notes = [];
  const remarkCells = [];
  for (const [r, c] of g.cells(maxDayRow + 1)) {
    if (!g.isAnchor(r, c)) continue;
    const t = g.text(r, c).replace(/\s+/g, " ").trim();
    if (!t || /^備\s*考$/.test(t.replace(/\s+/g, ""))) continue;
    remarkCells.push({ r, c, t });
  }
  // 同じブロックの中で上から読み、直前の「＜…＞」を見出しとして添える
  const blockOfCol = (c) => {
    let best = null;
    for (const b of blocks) if (b.dayCol <= c && (!best || b.dayCol > best.dayCol)) best = b;
    return best;
  };
  const byBlock = new Map();
  for (const rc of remarkCells) {
    const b = blockOfCol(rc.c);
    if (!byBlock.has(b)) byBlock.set(b, []);
    byBlock.get(b).push(rc);
  }
  for (const list of byBlock.values()) {
    list.sort((a, b) => a.r - b.r || a.c - b.c);
    let heading = "";
    for (const { t } of list) {
      if (/^[＜<].*[＞>]$/.test(t)) {
        heading = t;
        continue;
      }
      if (/^※/.test(t)) {
        // 「※」だけのセルは右のセルの注記の飾り (「※ | 中2附中：7/1(水) 休講」)
        if (t.replace(/\s+/g, "").length > 1 && !notes.includes(t)) notes.push(t);
        continue;
      }
      const dates = datesInText(t, fiscalYear);
      if (!dates.length) {
        // 「(本校自習室のみ）」のような続きの行は前の見出しのまま
        continue;
      }
      const note = heading ? `${heading} ${t}` : t;
      for (const d of dates) {
        const day = days.get(d);
        if (!day) continue;
        if (!day.notes.includes(note)) day.notes.push(note);
        const marked = [...courses.values()].some((c) => c.sessions.get(d)?.status === "held");
        if (!day.closed && /休校/.test(t) && !marked) day.closed = { label: t };
      }
    }
  }

  const dates = [...days.keys()].sort();
  const range = { start: dates[0], end: dates[dates.length - 1] };

  // ── 予定表そのものの点検 (高校部と同じ関数) ──
  const blockCols = blockGroups.map((groups) => {
    const cols = [];
    for (const grp of groups) for (let c = grp.c0; c <= grp.c1; c++) cols.push({ c, headers: [grp.name] });
    return cols;
  });
  warnings.push(
    ...checkOutside(g, {
      datedRows: allRows,
      blocks,
      blockCols,
      maxDayRow: Math.max(...allRows.map((x) => x.r)),
      title,
      usedOutside: new Set(),
    }),
    ...checkFills(g, { datedRows, blocks, blockCols, days })
  );

  return {
    title,
    fiscalYear,
    mode: "symbol",
    dept: "中学部",
    grades: sheetGrades,
    range,
    namedRange: null,
    days,
    courses,
    legend: new Map(),
    notes,
    warnings,
    planned: [],
  };
}
