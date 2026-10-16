// ─── 教員用の年間カレンダーを読む ─────────────────────────────────────
// 予定表のブックに入っている「2026年度カレンダー」(1 年分を 1 枚に並べた表)
// から、日ごとの次のことを取り出す。紙面の決まりは 2026 年度の表に合わせてある:
//
//   - 月ごとのブロックが横に 12 個並ぶ (4 月 → 3 月)。ブロックの左 2 列が
//     「日」と「曜日」、その右が行事の欄 (結合)、右端に**休みの型の列**
//     (見出し「土日 休み」「日月 休み」)。休みの型の列の「1」= その型の常勤は
//     その日が公休。日付の行の下の行に月ごとの休日数、その下に年間の合計 (105)
//   - 曜日の欄が黒 = 日曜・祝日。日曜でない黒は祝日 (行事の欄の文字が名前)
//   - 行事の欄の塗りは表の下の凡例で読む (「予備校授業なし→現役生も休み」=
//     塾の休み、「予備校授業あり→現役生も授業可能」= 祝日でも授業できる、
//     「教員半休」)。凡例に無い色 (模試の緑など) は意味を付けない
//   - 日付の行の下の、凡例でも数でもない文字 (「※共通テストは，どちらか1日出勤」)
//     は注記
//
// 休みの型は列の見出しから読む (「水日 休み」のような型が増えても列があれば読む)。
// 型の key は見出しから「休み」と空白を除いたもの (「土日」「日月」)。
//
// 年度はシート名・題の「2026年度」の候補のうち、曜日が暦と合う方にする
// (2026 年度の表の右端に「2025年度カレンダー」の書き残しがある)。
// 読み取れない形のシートは null を返すだけで、例外にしない。

import { makeGrid } from "./sheetGrid";
import { assignDates, classifySheet, findDayBlocks, findTitle, weekdayOf } from "./highSchoolSheet";

function rgb(fill) {
  if (typeof fill !== "string" || !/^#[0-9a-f]{6}$/i.test(fill)) return null;
  return [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
}

const isDarkFill = (fill) => {
  const c = rgb(fill);
  return !!c && Math.max(...c) <= 0x40;
};
const isWhiteFill = (fill) => {
  const c = rgb(fill);
  return !c || Math.min(...c) >= 0xf8;
};
const norm = (s) => String(s || "").normalize("NFKC");

/** 凡例の文字 → 意味 (半休 → 授業可能 → 塾の休み の順に見る) */
export function legendKindOf(text) {
  const t = norm(text).replace(/\s+/g, "");
  if (!t) return null;
  if (/半休/.test(t)) return "half";
  if (/授業(あり|可能|可)/.test(t)) return "open";
  if (/授業なし|休み|休校|休講/.test(t)) return "closed";
  return null;
}

/** 休みの型の列の見出し (「土日 休み」) → key (「土日」) */
export function patternKeyOf(label) {
  return norm(label).replace(/\s+/g, "").replace(/(公休|休み|休日|休)$/, "") || norm(label).trim();
}

const isPatternHeader = (text) => /休/.test(norm(text)) && !/^\d{1,2}月$/.test(norm(text).replace(/\s+/g, ""));
const isOffMark = (text) => !!text && text !== "0";

function yearCandidates(g, sheetName, title, headerLastRow) {
  const out = [];
  const add = (y, from) => {
    if (y >= 2000 && y <= 2100 && !out.some((c) => c.year === y)) out.push({ year: y, from });
  };
  const n = norm(sheetName);
  const nm = /(\d{4})\s*年度/.exec(n) || /^\s*(\d{4})(?!\d)/.exec(n);
  if (nm) add(Number(nm[1]), "name");
  const tm = /(\d{4})\s*年度/.exec(norm(title));
  if (tm) add(Number(tm[1]), "title");
  for (const [r, c] of g.cells(0, headerLastRow)) {
    const m = /(\d{4})\s*年度/.exec(norm(g.text(r, c)));
    if (m) add(Number(m[1]), "header");
  }
  return out;
}

function weekdayScore(rows) {
  return rows.filter((x) => x.labelWd === weekdayOf(x.date)).length;
}

/**
 * 年間カレンダーのシートを読む。
 * @returns {null | {
 *   title: string, fiscalYear: number, range: {start: string, end: string},
 *   patterns: {key: string, label: string, offDates: string[], total: number|null}[],
 *   days: Map<string, {date: string, labelWd: string, event: string, kind: null|"closed"|"open"|"half", holiday: boolean, off: string[]}>,
 *   legend: {kind: string, text: string, fill: string}[],
 *   notes: string[],
 *   warnings: {kind: string, message: string}[],
 * }}
 */
export function parseAnnualCalendarSheet(sheet) {
  const g = makeGrid(sheet);
  const blocks = findDayBlocks(g);
  if (blocks.length === 0) return null;
  const firstDayRow = Math.min(...blocks.map((b) => b.rows[0]));
  const lastDayRow = Math.max(...blocks.map((b) => b.rows[b.rows.length - 1]));
  const title = findTitle(g);
  const warnings = [];

  // ブロックの右端 (次のブロックの手前。最後のブロックは前のブロックと同じ幅)
  const widths = blocks.slice(1).map((b, i) => b.dayCol - blocks[i].dayCol);
  const typical = widths.length ? Math.min(...widths) : 8;
  const spans = blocks.map((b, i) => ({
    block: b,
    end: i + 1 < blocks.length ? blocks[i + 1].dayCol - 1 : b.dayCol + typical - 1,
  }));

  // 休みの型の列 (見出しに「休」がある列。行事の欄より右)
  const header = (c) => {
    for (let r = firstDayRow - 1; r >= 0; r--) {
      const t = g.text(r, c);
      if (t && isPatternHeader(t)) return t;
    }
    return "";
  };
  const patternLabels = new Map(); // key → label
  for (const s of spans) {
    s.patternCols = [];
    for (let c = s.block.dayCol + 2; c <= s.end; c++) {
      const label = header(c);
      if (!label) continue;
      const key = patternKeyOf(label);
      s.patternCols.push({ c, key });
      if (!patternLabels.has(key)) patternLabels.set(key, norm(label).replace(/\s+/g, " ").trim());
    }
    const firstPattern = s.patternCols.length ? s.patternCols[0].c : s.end + 1;
    s.eventCols = [];
    for (let c = s.block.dayCol + 2; c < firstPattern; c++) s.eventCols.push(c);
  }

  // 年度: 候補のうち曜日が暦と最もよく合う年 (同点はシート名を優先)
  const cands = yearCandidates(g, sheet?.name, title, firstDayRow - 1);
  if (cands.length === 0) return null;
  let best = null;
  for (const cand of cands) {
    const rows = assignDates(g, blocks, cand.year);
    const score = weekdayScore(rows);
    if (!best || score > best.score) best = { ...cand, rows, score };
  }
  if (!best.rows.length) return null;
  const fiscalYear = best.year;
  const others = cands.filter((c) => c.year !== fiscalYear);
  if (others.length) {
    warnings.push({
      kind: "year",
      message:
        `シート名・表の題に ${others.map((c) => `${c.year}年度`).join("・")} の書き込みがあります。` +
        `曜日が暦と合う ${fiscalYear} 年度として読みました`,
    });
  }

  // 凡例 (日付の行より下の、塗りのある文字)
  const legend = [];
  const legendByFill = new Map();
  const legendCells = new Set();
  for (const [r, c] of g.cells(lastDayRow + 1)) {
    if (!g.isAnchor(r, c)) continue;
    const text = g.text(r, c);
    const fill = g.fill(r, c);
    const kind = legendKindOf(text);
    if (!kind || !fill || isWhiteFill(fill)) continue;
    legendCells.add(`${r},${c}`);
    const key = fill.toLowerCase();
    if (legendByFill.has(key)) continue;
    legendByFill.set(key, kind);
    legend.push({ kind, text: text.trim(), fill: key });
  }
  if (!legend.some((l) => l.kind === "closed")) {
    warnings.push({
      kind: "legend",
      message: "凡例に「授業なし (休み)」の色が見つからないため、塾の休みの日は読んでいません",
    });
  }

  const spanOf = new Map(spans.map((s) => [s.block, s]));
  const days = new Map();
  const offByKey = new Map([...patternLabels.keys()].map((k) => [k, []]));
  const wrongByMonth = new Map();
  const offCountByBlock = new Map(); // block → key → count
  for (const row of best.rows) {
    const s = spanOf.get(row.block);
    const { r, date } = row;
    if (days.has(date)) continue;
    const realWd = weekdayOf(date);
    if (row.labelWd && row.labelWd !== realWd) {
      const mk = date.slice(0, 7);
      wrongByMonth.set(mk, (wrongByMonth.get(mk) || 0) + 1);
    }
    const texts = [];
    let eventFill = null;
    for (const c of s.eventCols) {
      const t = g.text(r, c).replace(/\s*\n\s*/g, " ").trim();
      if (t && !texts.includes(t)) texts.push(t);
      const f = g.fill(r, c);
      if (!eventFill && f && !isWhiteFill(f)) eventFill = f.toLowerCase();
    }
    const off = [];
    for (const { c, key } of s.patternCols) {
      if (!isOffMark(g.text(r, c))) continue;
      off.push(key);
      offByKey.get(key).push(date);
      if (!offCountByBlock.has(row.block)) offCountByBlock.set(row.block, new Map());
      const m = offCountByBlock.get(row.block);
      m.set(key, (m.get(key) || 0) + 1);
    }
    days.set(date, {
      date,
      labelWd: row.labelWd,
      event: texts.join(" / "),
      kind: eventFill ? legendByFill.get(eventFill) || null : null,
      holiday: realWd !== "日" && isDarkFill(g.fill(r, row.block.dayCol + 1)),
      off,
    });
  }
  for (const [mk, n] of wrongByMonth) {
    warnings.push({
      kind: "weekday",
      message: `${Number(mk.slice(5))}月: 曜日が暦と合わない日が ${n} 日あります`,
    });
  }

  // 月ごとの休日数 (日付の行のすぐ下) と年間の合計 (その下) を、印の数と比べる
  const countRow = lastDayRow + 1;
  const monthOf = (block) => {
    const first = best.rows.find((x) => x.block === block);
    return first ? Number(first.date.slice(5, 7)) : null;
  };
  for (const s of spans) {
    for (const { c, key } of s.patternCols) {
      const cell = g.raw(countRow, c);
      if (!cell || cell.t !== "n" || !Number.isFinite(cell.v)) continue;
      const counted = offCountByBlock.get(s.block)?.get(key) || 0;
      if (cell.v !== counted) {
        // 「共通テスト※」(注記「※…どちらか1日出勤」) のように、印を付けたまま
        // 数には入れていない日があれば添える
        const starred = best.rows
          .filter((x) => x.block === s.block && days.get(x.date)?.off.includes(key))
          .filter((x) => /※/.test(days.get(x.date).event))
          .map((x) => `${Number(x.date.slice(5, 7))}/${Number(x.date.slice(8))}`);
        warnings.push({
          kind: "count",
          message:
            `${monthOf(s.block)}月の「${patternLabels.get(key)}」: ` +
            `表の休日数は ${cell.v} 日、「1」の印は ${counted} 日` +
            (starred.length ? ` (※ の付いた日 ${starred.join("・")} を含みます。注記を確かめてください)` : ""),
        });
      }
    }
  }
  const totals = new Map();
  const first = spans[0];
  for (const { c, key } of first.patternCols) {
    for (let r = countRow + 1; r <= Math.min(countRow + 3, g.maxRow); r++) {
      const m = g.merge(r, c);
      const cell = m ? g.raw(m.r0, m.c0) : g.raw(r, c);
      if (cell && cell.t === "n" && Number.isFinite(cell.v) && !totals.has(key)) totals.set(key, cell.v);
    }
  }
  const patterns = [...patternLabels.entries()].map(([key, label]) => {
    const offDates = offByKey.get(key);
    const total = totals.has(key) ? totals.get(key) : null;
    if (total != null && total !== offDates.length) {
      warnings.push({
        kind: "total",
        message: `「${label}」: 年間の休日数は ${total} 日、「1」の印は ${offDates.length} 日`,
      });
    }
    return { key, label, offDates, total };
  });

  // 注記 (日付の行より下の、凡例・数でない文字)
  const notes = [];
  for (const [r, c] of g.cells(countRow + 1)) {
    if (!g.isAnchor(r, c) || legendCells.has(`${r},${c}`)) continue;
    const t = g.text(r, c).trim();
    if (!t || /^[\d.]+$/.test(norm(t)) || legendKindOf(t)) continue;
    if (!notes.includes(t)) notes.push(t);
  }

  const dates = [...days.keys()].sort();
  return {
    title,
    fiscalYear,
    range: { start: dates[0], end: dates[dates.length - 1] },
    patterns,
    days,
    legend,
    notes,
    warnings,
  };
}

/**
 * ブックの中の年間カレンダーを全部読む (有給・半休の画面から直接読み込むとき)。
 * @returns {{name: string, parsed: object}[]} 読めたシートだけ (ブックの順)
 */
export function findCalendarSheets(workbook) {
  const out = [];
  for (const sheet of workbook?.sheets || []) {
    try {
      if (classifySheet(sheet).kind !== "calendar") continue;
      const parsed = parseAnnualCalendarSheet(sheet);
      if (parsed) out.push({ name: sheet.name, parsed });
    } catch (err) {
      console.warn(`[yoteihyo] 年間カレンダー「${sheet?.name}」を読めませんでした`, err);
    }
  }
  return out;
}

/**
 * 有給・半休 (utils/staffLeave の calendars) に取り込む形にする。
 * 日は何か書いてある日 (塾の休み・授業可能・教員半休・祝日・行事) だけ持つ。
 * @param {object} parsed parseAnnualCalendarSheet の戻り値
 * @param {{source?: string, importedAt?: string}} meta
 */
export function calendarForLeave(parsed, { source = "", importedAt = "" } = {}) {
  const days = [];
  for (const d of parsed.days.values()) {
    if (!d.kind && !d.holiday && !d.event) continue;
    days.push({
      date: d.date,
      ...(d.kind ? { kind: d.kind } : {}),
      ...(d.holiday ? { holiday: true } : {}),
      ...(d.event ? { event: d.event } : {}),
    });
  }
  return {
    year: parsed.fiscalYear,
    ...(source ? { source } : {}),
    ...(importedAt ? { importedAt } : {}),
    patterns: parsed.patterns.map((p) => ({
      key: p.key,
      label: p.label,
      offDates: [...p.offDates],
      ...(p.total != null ? { total: p.total } : {}),
    })),
    days,
    notes: [...parsed.notes],
  };
}

/**
 * 読んだカレンダーの中身のまとめ (画面の見出し用)
 * @returns {{closed: number, open: number, half: number, holidays: number, patterns: {key, label, count}[]}}
 */
export function summarizeCalendar(parsed) {
  const out = { closed: 0, open: 0, half: 0, holidays: 0, patterns: [] };
  if (!parsed) return out;
  for (const d of parsed.days.values()) {
    if (d.kind) out[d.kind] += 1;
    if (d.holiday) out.holidays += 1;
  }
  out.patterns = parsed.patterns.map((p) => ({ key: p.key, label: p.label, count: p.offDates.length }));
  return out;
}
