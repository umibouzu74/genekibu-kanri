// ─── 掲示用「中学生コース時間割」Excel の取込 ────────────────────────
//
// posterExport.js が書く紙面 (および例年の手組み紙面) を読んで
// RegularProject に戻す。出力の逆方向。
//
// ## 読み取りの手掛かり
//
// 紙面は決まった骨格で組まれているので、**セル結合そのものを構造として
// 読む**:
//
// - 「曜  日」と書かれたセルが表の左上。その結合の大きさが
//   「見出し列の幅」と「ヘッダ 1 段の高さ」になる
// - そこから下へ「学年 / コース / クラス / 教室」を順に読む。見出しに
//   当たらなくなった行から本体 (時限) が始まる。クラス段が無い紙面
//   (附中のように教室だけで見せる表) もそのまま読める
// - 曜日段の結合幅がその曜日の持ち列、クラス (無ければ教室) 段の結合が
//   1 クラス列。**列幅も時限の高さも決め打ちしない** (紙面ごとに違う)
// - 本体は「時刻セルの結合の高さ = 1 時限」。その半分が科目、残りが講師
// - 科目セルがクラス列より広ければ合同コマ、時限まるごとの高さなら
//   確認テストのような担任つきブロック、結合されていなければ隔週コマ
//
// ## モデルへの戻し方
//
// - タブ = (学年 × コース) の組。同じ組が複数の曜日に出れば 1 タブに
//   まとまる (中3 本科（火・木）は火と木で 1 タブ)
// - 合同コマは「S〜C」のような範囲ラベルのクラス列を作って入れる
//   (mergedColumns が結合表示に戻せる正史の持ち方)。同じ枠に担任が
//   複数並ぶ確認テストは、範囲ラベルの列を人数ぶん作って振り分ける
// - クラス名が無くて範囲ラベルを作れない紙面では、掛かっている各
//   クラス列に同じ内容を配る。出力側 (coalesceBlocks) が中身の同じ
//   隣り合うブロックを 1 枠に戻すので、紙面は往復しても変わらない
// - 隔週コマは subj「数/英」・teacher「本多」・note「隔週(堀上)」。
//   **左上が A 週 (主担当)、右下が B 週 (パートナー)** — CLAUDE.md の
//   「隔週コマの担当週」と同じ向き
//
// exceljs は **.xlsx しか読めない** (.xls は旧 BIFF 形式で非対応)。
// 例年のファイルは .xls なので、Excel で .xlsx として保存し直して
// もらう運用にする (readPosterWorkbook がその旨を案内する)。

import { splitTeacherField } from "../utils/biweekly";
import { createDefaultProject, makeCellKey, REGULAR_DAYS } from "./model";

const HEAD_KEYS = {
  曜日: "day",
  学年: "grade",
  コース: "course",
  クラス: "class",
  教室: "room",
};

/** 空白 (半角・全角) を落として見出しを引き当てる */
const norm = (s) => String(s ?? "").replace(/\s/g, "");

/** exceljs のセル値 (文字列 / 数値 / richText / 数式) を文字列にする */
export function textOf(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text ?? "").join("");
    }
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
    return "";
  }
  return String(value);
}

/**
 * 結合の一覧を「左上 → 大きさ」と「どのマスがどの左上に属するか」に
 * ほぐす。exceljs は従属マスからも master を引けるが、**大きさ**は
 * 持っていないため自前で持つ。
 */
export function buildMerges(ws) {
  const size = new Map(); // "r,c" → {rows, cols}
  const owner = new Map(); // "r,c" → "r,c" (左上)
  for (const range of ws.model?.merges || []) {
    const [a, b] = String(range).split(":");
    if (!a || !b) continue;
    const ca = ws.getCell(a);
    const cb = ws.getCell(b);
    const key = `${ca.row},${ca.col}`;
    size.set(key, { rows: cb.row - ca.row + 1, cols: cb.col - ca.col + 1 });
    for (let r = ca.row; r <= cb.row; r++) {
      for (let c = ca.col; c <= cb.col; c++) owner.set(`${r},${c}`, key);
    }
  }
  return {
    /** (r,c) の結合の大きさ。結合していなければ 1×1 */
    span(r, c) {
      const own = owner.get(`${r},${c}`);
      return own ? size.get(own) : { rows: 1, cols: 1 };
    },
    /** (r,c) がそのマスの左上か (結合していなければ真) */
    isHead(r, c) {
      const own = owner.get(`${r},${c}`);
      return !own || own === `${r},${c}`;
    },
  };
}

/** 「月曜日」「月」→「月」。曜日として読めなければ null */
export function parseDay(text) {
  const m = /^([月火水木金土日])曜?日?$/.exec(norm(text));
  return m && REGULAR_DAYS.includes(m[1]) ? m[1] : null;
}

/** 「18：00〜18：45」(改行込み) → "18:00-18:45"。読めなければ "" */
export function parseTime(text) {
  const flat = norm(text).replace(/：/g, ":").replace(/[〜～~－ー−]/g, "-");
  const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(flat);
  return m ? `${m[1]}-${m[2]}` : "";
}

/** 「社会（601教室）」→ {subj: "社会", room: "601"} */
export function splitRoomSuffix(text) {
  const s = String(text ?? "").trim();
  const m = /^(.*?)[（(]\s*([^（）()]+?)\s*(?:教室)?\s*[）)]\s*$/.exec(s);
  if (!m) return { subj: s, room: "" };
  return { subj: m[1].trim(), room: m[2].trim() };
}

/** 講師欄の表記ゆれを正史の "·" 区切りに揃える */
const normTeacher = (text) => splitTeacherField(text).join("·");

/**
 * 確認テストのブロック (4 行結合) の中身を担任ごとにほぐす。
 * 「確認テスト / 担任：藤田（501教室） / 担任：小松（503教室）」→ 2 件。
 * 「確認テスト / 担任：堀上 / （601教室）」のように教室が別行でも読む。
 */
export function parseBlockLines(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { subj: "", entries: [] };
  const subj = lines[0];
  const entries = [];
  for (const raw of lines.slice(1)) {
    const m = /^担任\s*[：:]\s*(.+)$/.exec(raw);
    if (m) {
      const { subj: teacher, room } = splitRoomSuffix(m[1]);
      entries.push({ teacher: normTeacher(teacher), room });
      continue;
    }
    // 単独の「（601教室）」行は直前の担任の教室
    const only = splitRoomSuffix(raw);
    if (!only.subj && only.room && entries.length > 0) {
      entries[entries.length - 1].room = only.room;
    }
  }
  if (entries.length === 0) entries.push({ teacher: "", room: "" });
  return { subj, entries };
}

// ─── シートの読み取り ───────────────────────────────────────────────

/**
 * 紙面 1 枚を「表 → 曜日 → クラス列 → コマ」の中間表現に読み下す。
 * @returns {{tables: object[]}}
 */
export function parsePosterSheet(ws) {
  const M = buildMerges(ws);
  const maxRow = ws.rowCount;
  const maxCol = ws.columnCount;
  const value = (r, c) => textOf(ws.getCell(r, c).value);

  const tables = [];
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      if (!M.isHead(r, c)) continue;
      if (norm(value(r, c)) !== "曜日") continue;
      const table = readTable(ws, M, r, c, maxRow, maxCol);
      if (table) tables.push(table);
    }
  }
  return { tables };
}

function readTable(ws, M, r0, c0, maxRow, maxCol) {
  const value = (r, c) => textOf(ws.getCell(r, c).value);
  const head = M.span(r0, c0);
  const labelCols = head.cols;

  // ヘッダ段 (曜日 / 学年 / コース / クラス / 教室)
  const bands = {};
  let row = r0;
  while (row <= maxRow) {
    const key = HEAD_KEYS[norm(value(row, c0))];
    if (!key) break;
    const sp = M.span(row, c0);
    bands[key] = { row, rows: sp.rows };
    row += sp.rows;
  }
  if (!bands.day || !bands.grade || !bands.room) return null;
  const bodyTop = row;

  // 曜日 (結合幅 = その曜日の持ち列)
  const days = [];
  let col = c0 + labelCols;
  while (col <= maxCol) {
    const day = parseDay(value(bands.day.row, col));
    if (!day) break;
    const sp = M.span(bands.day.row, col);
    days.push({ day, col, cols: sp.cols });
    col += sp.cols;
  }
  if (days.length === 0) return null;

  // クラス列 (クラス段が無ければ教室段の結合で数える)
  const classBand = bands.class || bands.room;
  const columns = [];
  for (const d of days) {
    const end = d.col + d.cols;
    let c = d.col;
    while (c < end) {
      const sp = M.span(classBand.row, c);
      columns.push({
        day: d.day,
        col: c,
        cols: Math.min(sp.cols, end - c),
        label: bands.class ? value(bands.class.row, c).trim() : "",
        room: value(bands.room.row, c).trim(),
        grade: value(bands.grade.row, c).trim(),
        course: bands.course ? value(bands.course.row, c).trim() : "",
      });
      c += Math.min(sp.cols, end - c);
    }
  }

  // 時限 (時刻セルの結合の高さ = 1 時限)
  const periods = [];
  let pr = bodyTop;
  while (pr <= maxRow) {
    const raw = value(pr, c0);
    const sp = M.span(pr, c0);
    if (!raw.trim() || sp.rows < 2) break;
    periods.push({ row: pr, rows: sp.rows, time: parseTime(raw), raw: raw.trim() });
    pr += sp.rows;
  }

  const cells = [];
  for (const per of periods) {
    const half = Math.floor(per.rows / 2);
    for (const d of days) {
      const inDay = columns.filter((x) => x.day === d.day);
      let i = 0;
      while (i < inDay.length) {
        const consumed = readCell(ws, M, per, half, inDay, i, value);
        if (consumed.cell) cells.push({ ...consumed.cell, day: d.day, period: per });
        i += consumed.width;
      }
    }
  }

  return { row: r0, col: c0, labelCols, days, columns, periods, cells };
}

/**
 * クラス列 i から始まるコマを 1 つ読む。
 * @returns {{cell: object|null, width: number}} width は消費したクラス列数
 */
function readCell(ws, M, per, half, inDay, i, value) {
  const start = inDay[i];
  const top = M.span(per.row, start.col);
  const text = value(per.row, start.col).trim();

  // 何列ぶんに掛かっているか (結合幅からクラス列数を数える)
  const widthOf = (cols) => {
    let n = 0;
    let used = 0;
    while (i + n < inDay.length && used < cols) {
      used += inDay[i + n].cols;
      n += 1;
    }
    return Math.max(1, n);
  };

  if (!text) {
    // 隔週の右下だけに文字がある形も拾えるよう、素のマスも見る
    const b = value(per.row + 1, start.col + start.cols - 1).trim();
    if (!b) return { cell: null, width: 1 };
  }

  // 時限まるごとの高さ = 担任つきブロック (確認テスト)
  if (top.rows >= per.rows && text) {
    const width = widthOf(top.cols);
    const { subj, entries } = parseBlockLines(text);
    return {
      cell: { kind: "block", startIdx: i, width, subj, entries },
      width,
    };
  }

  // 結合していない = 隔週 (左上 A 週 / 右下 B 週)
  if (top.rows === 1 && top.cols === 1 && start.cols > 1) {
    const subjB = value(per.row + 1, start.col + start.cols - 1).trim();
    const teacherA = value(per.row + half, start.col).trim();
    const teacherB = value(per.row + half + 1, start.col + start.cols - 1).trim();
    if (subjB || teacherB) {
      return {
        cell: {
          kind: "biweekly",
          startIdx: i,
          width: 1,
          subjA: text,
          subjB,
          teacherA: normTeacher(teacherA),
          teacherB: teacherB.trim(),
        },
        width: 1,
      };
    }
  }

  if (!text) return { cell: null, width: 1 };
  const width = widthOf(Math.max(top.cols, start.cols));
  const { subj, room } = splitRoomSuffix(text);
  const teacher = value(per.row + half, start.col).trim();
  return {
    cell: { kind: "normal", startIdx: i, width, subj, room, teacher },
    width,
  };
}

// ─── モデルへの組み立て ─────────────────────────────────────────────

/** 学年 + コース → タブの表示名 */
const tabName = (grade, course) => [grade, course].filter(Boolean).join(" ").trim();

/**
 * 読み下した紙面 → RegularProject。
 * @param {string} name プロジェクト名
 * @param {{tables: object[]}} parsed parsePosterSheet の結果
 * @returns {{project: object, stats: {cellCount, tabCount, tableCount, dayCount}}}
 */
export function buildProjectFromPoster(name, parsed) {
  const project = { ...createDefaultProject(), name };

  // 時限プール (時刻の文字列で同一視する。時刻を読めない段は表記のまま)
  const periodIdByKey = new Map();
  const periodKey = (per) => per.time || `raw:${per.raw}`;
  for (const table of parsed.tables) {
    for (const per of table.periods) {
      const key = periodKey(per);
      if (periodIdByKey.has(key)) continue;
      const id = periodIdByKey.size + 1;
      periodIdByKey.set(key, id);
      project.periods.push({ id, label: per.time ? "" : per.raw, time: per.time });
    }
  }
  project.periods.sort((a, b) => startMin(a.time) - startMin(b.time) || a.id - b.id);

  // タブ (学年 × コース)
  const tabs = new Map(); // key → tab
  const tabOf = (grade, course) => {
    const key = `${grade}|${course}`;
    if (!tabs.has(key)) {
      tabs.set(key, {
        id: tabs.size + 1,
        name: tabName(grade, course) || `タブ${tabs.size + 1}`,
        grade,
        course,
        group: "",
        classes: [],
        days: [],
        periodIds: [],
        schedule: {},
        // 取込の作業用 (最後に落とす)
        _nextId: 1, // クラス列 id の採番 (通常列と合同列で通し)
        _byIndex: new Map(), // タブ内の並び順 → class
        _ranges: [], // 合同列 {p, q, cls}
        _roomsByDay: new Map(), // classId → Map(day → room)
      });
    }
    return tabs.get(key);
  };

  const subjects = new Set();
  const teachers = new Set();
  let cellCount = 0;
  const days = new Set();

  for (const table of parsed.tables) {
    // クラス列 → タブと「タブ内の並び順」
    const slotOf = new Map(); // table の columns 添字 → {tab, index}
    const seen = new Map(); // tab → 次の index (曜日ごとに数え直す)
    let prevKey = null;
    let prevDay = null;
    for (let i = 0; i < table.columns.length; i++) {
      const col = table.columns[i];
      const tab = tabOf(col.grade, col.course);
      const key = `${col.day}|${col.grade}|${col.course}`;
      if (key !== prevKey || col.day !== prevDay) seen.set(tab, 0);
      prevKey = key;
      prevDay = col.day;
      const index = seen.get(tab) ?? 0;
      seen.set(tab, index + 1);
      slotOf.set(i, { tab, index });

      if (!tab.days.includes(col.day)) tab.days.push(col.day);
      days.add(col.day);
      let cls = tab._byIndex.get(index);
      if (!cls) {
        cls = { id: tab._nextId++, label: col.label, room: "" };
        tab._byIndex.set(index, cls);
        tab.classes.push(cls);
      }
      if (!cls.label) cls.label = col.label;
      if (col.room) {
        if (!tab._roomsByDay.has(cls.id)) tab._roomsByDay.set(cls.id, new Map());
        tab._roomsByDay.get(cls.id).set(col.day, col.room);
      }
    }

    for (const cell of table.cells) {
      const periodId = periodIdByKey.get(periodKey(cell.period));
      // 掛かっているクラス列をタブごとにまとめる。紙面の 1 枠は学年を
      // またぐことがある (附中の確認テスト) ので、その場合は学年ごとの
      // かたまりに割る
      const startCol = indexInTable(table, cell);
      const groups = [];
      for (let k = 0; k < cell.width; k++) {
        const slot = slotOf.get(startCol + k);
        if (!slot) continue;
        const last = groups[groups.length - 1];
        if (last && last.tab === slot.tab) last.indices.push(slot.index);
        else groups.push({ tab: slot.tab, indices: [slot.index] });
      }

      for (const group of groups) {
        const { tab } = group;
        if (!tab.periodIds.includes(periodId)) tab.periodIds.push(periodId);
        const p = Math.min(...group.indices);
        const q = Math.max(...group.indices);
        const put = (classId, data) => {
          tab.schedule[makeCellKey(cell.day, periodId, classId)] = data;
          cellCount += 1;
          for (const part of String(data.subj || "").split("/")) {
            if (part.trim()) subjects.add(part.trim());
          }
          for (const t of splitTeacherField(data.teacher)) teachers.add(t);
          const partner = /隔週\(([^)]+)\)/.exec(data.note || "");
          if (partner) teachers.add(partner[1]);
        };

        if (cell.kind === "block") {
          for (const entry of cell.entries) {
            placeSpanning(tab, cell.day, periodId, p, q, {
              subj: cell.subj,
              teacher: entry.teacher,
              ...(entry.room ? { room: entry.room } : {}),
            }, put);
          }
          continue;
        }
        if (cell.kind === "biweekly") {
          const cls = tab._byIndex.get(p);
          if (!cls) continue;
          put(cls.id, {
            subj: [cell.subjA, cell.subjB].filter(Boolean).join("/"),
            teacher: cell.teacherA,
            note: cell.teacherB ? `隔週(${cell.teacherB})` : "隔週",
          });
          continue;
        }
        placeSpanning(tab, cell.day, periodId, p, q, {
          subj: cell.subj,
          teacher: normTeacher(cell.teacher),
          ...(cell.room ? { room: cell.room } : {}),
        }, put);
      }
    }
  }

  project.tabs = [...tabs.values()].map((tab) => {
    // 既定の教室 = その列で最頻の教室。違う曜日だけ roomByDay に残す
    for (const cls of tab.classes) {
      const byDay = tab._roomsByDay.get(cls.id);
      if (!byDay || byDay.size === 0) continue;
      const count = new Map();
      for (const room of byDay.values()) count.set(room, (count.get(room) || 0) + 1);
      const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
      cls.room = main;
      const rest = {};
      for (const [day, room] of byDay) if (room !== main) rest[day] = room;
      if (Object.keys(rest).length) cls.roomByDay = rest;
    }
    // 合同列は元の並びの後ろへ (画面の並びは通常クラス → 合同)
    for (const r of tab._ranges) tab.classes.push(r.cls);
    tab.days = REGULAR_DAYS.filter((d) => tab.days.includes(d));
    tab.periodIds = project.periods
      .filter((p) => tab.periodIds.includes(p.id))
      .map((p) => p.id);
    delete tab._nextId;
    delete tab._byIndex;
    delete tab._ranges;
    delete tab._roomsByDay;
    return tab;
  });

  project.subjects = [...subjects].filter(Boolean);
  project.teachers = [...teachers].filter(Boolean).sort().map((n) => ({ name: n }));

  return {
    project,
    stats: {
      cellCount,
      tabCount: project.tabs.length,
      tableCount: parsed.tables.length,
      dayCount: days.size,
    },
  };
}

/**
 * 複数クラスに掛かるコマを置く。範囲ラベルの列を作れれば 1 つの合同コマ
 * として、作れなければ (クラス名の無い紙面) 各クラス列に配る。
 */
function placeSpanning(tab, day, periodId, p, q, data, put) {
  const from = tab._byIndex.get(p);
  const to = tab._byIndex.get(q);
  if (!from || !to) return;
  if (p === q) {
    put(from.id, data);
    return;
  }
  if (!from.label || !to.label) {
    for (let i = p; i <= q; i++) {
      const cls = tab._byIndex.get(i);
      if (cls) put(cls.id, data);
    }
    return;
  }
  const label = `${from.label}〜${to.label}`;
  // 同じ (曜日 × 時限) に既に埋まっている合同列は使わない (並列の担任)
  let slot = tab._ranges.find(
    (r) =>
      r.p === p &&
      r.q === q &&
      !tab.schedule[makeCellKey(day, periodId, r.cls.id)]
  );
  if (!slot) {
    const cls = { id: tab._nextId++, label, room: "" };
    slot = { p, q, cls };
    tab._ranges.push(slot);
  }
  if (data.room && !slot.cls.room) slot.cls.room = data.room;
  put(slot.cls.id, data);
}

/** cells に持たせた startIdx を table.columns の添字に戻す */
function indexInTable(table, cell) {
  let n = 0;
  for (const col of table.columns) {
    if (col.day === cell.day) break;
    n += 1;
  }
  return n + cell.startIdx;
}

const startMin = (time) => {
  const m = /^(\d{1,2}):(\d{2})/.exec((time || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

// ─── ファイルの読み込み ─────────────────────────────────────────────

/**
 * File / ArrayBuffer → 先頭シート。exceljs は .xlsx しか読めないので、
 * .xls を渡されたら保存し直しを案内する。
 */
export async function readPosterSheet(file, { sheetName } = {}) {
  const name = typeof file?.name === "string" ? file.name : "";
  if (/\.xls$/i.test(name)) {
    throw new Error(
      ".xls は読み込めません。Excel で「名前を付けて保存」→ 形式を .xlsx にしてから読み込んでください"
    );
  }
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  const ws = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!ws) throw new Error("シートが見つかりません");
  return ws;
}

/**
 * 掲示用 Excel → RegularProject。
 * @param {File|ArrayBuffer} file
 * @param {{name?: string, sheetName?: string}} [opts]
 */
export async function importPosterExcel(file, opts = {}) {
  const ws = await readPosterSheet(file, opts);
  const parsed = parsePosterSheet(ws);
  if (parsed.tables.length === 0) {
    throw new Error(
      "この形式の時間割表が見つかりません（「曜 日」「学 年」「コース」「教 室」の見出しがある表を探します）"
    );
  }
  const name =
    (opts.name || "").trim() ||
    (typeof file?.name === "string" ? file.name.replace(/\.xlsx$/i, "") : "") ||
    "掲示用から取込";
  return buildProjectFromPoster(name, parsed);
}
