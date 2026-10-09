// ─── シートのセルを読むための小さな道具 ─────────────────────────────
// readXls / readXlsx が返すシート ({ rows, merges }) を「結合セルは左上の
// セルで代表する」読み方で引けるようにする。予定表の判定 (休校の行・
// 見出しの学年) は結合範囲ごとに読むので、ここで一度だけ索引を作る。
//
// 表の大きさは実際にあるセルだけで決め、走査も実際にあるセルだけを回る
// (cells)。結合はセル単位に展開しない。壊れたファイルの遠いセル (65535 行目) や
// シート全体を覆う結合 1 つで、升目を全部なめて固まらないように。

const WEEKDAYS = "日月火水木金土";
const MAX_ROW = 1048575;
const MAX_COL = 16383;

/** "#rrggbb" → [r, g, b] (読めなければ null) */
function rgb(fill) {
  if (typeof fill !== "string" || !/^#[0-9a-f]{6}$/i.test(fill)) return null;
  return [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
}

/**
 * 休講の灰色 (予定表の教員用で休講のコマを塗る色)。白・黒・ごく薄い灰色は含めない。
 * 学校の予定表では 969696 (Excel の「灰色 40%」)・c0c0c0 (「灰色 25%」) と、
 * Excel 2007 以降の「白、背景 1、黒 + 基本色 15%」(d9d9d9) が使われている。
 * 「5%」(f2f2f2) や「背景 2」(e7e6e6) は罫線代わりの薄い塗りなので含めない
 */
export function isGrayFill(fill) {
  const c = rgb(fill);
  if (!c) return false;
  const [r, g, b] = c;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 16 && r >= 0x70 && r <= 0xda;
}

/** 変更・振替の印に使われる黄色 (ffff00 / ffcc00 など、薄い黄色は含めない) */
export function isYellowFill(fill) {
  const c = rgb(fill);
  if (!c) return false;
  const [r, g, b] = c;
  return r >= 0xf0 && g >= 0xc0 && b <= 0x40;
}

/**
 * 休校・祝日の行に使われる赤系 (ff8080・ff7c80・薄い ffcccc など)。
 * 緑と青が近い (橙 ff9900・ed7d31 は含めない)
 */
export function isRedFill(fill) {
  const c = rgb(fill);
  if (!c) return false;
  const [r, g, b] = c;
  return r >= 0xe0 && g <= 0xd0 && b <= 0xd0 && r - Math.max(g, b) >= 0x20 && Math.abs(g - b) <= 0x30;
}

export function cellText(cell) {
  if (!cell) return "";
  if (cell.wd) return cell.wd; // 曜日だけを出す書式 (「aaa」) の日付
  if (cell.v == null) return "";
  if (cell.t === "n") return String(cell.v);
  return String(cell.v).trim();
}

const isMergeOk = (m) =>
  !!m &&
  [m.r0, m.c0, m.r1, m.c1].every(Number.isInteger) &&
  m.r0 >= 0 &&
  m.c0 >= 0 &&
  m.r1 >= m.r0 &&
  m.c1 >= m.c0 &&
  m.r1 <= MAX_ROW &&
  m.c1 <= MAX_COL;

/**
 * @param {{ rows: Array<Array<object>>, merges: Array<{r0:number,c0:number,r1:number,c1:number}> }} sheet
 */
export function makeGrid(sheet) {
  const rows = sheet?.rows || [];
  // 実際にあるセル (行 → 列の順)。表の大きさもここから決める
  const cells = [];
  let maxRow = -1;
  let maxCol = -1;
  rows.forEach((row, r) => {
    if (!row || r > MAX_ROW) return;
    row.forEach((cell, c) => {
      if (!cell || c > MAX_COL) return;
      cells.push([r, c, cell]);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    });
  });
  // 結合は行ごとに持つ (実際のセルのある行の範囲だけ)。引くときは列で探す。
  // 何百行にもまたがる結合 (壊れたファイル・シート全体を覆う結合) は行ごとに
  // 持たず、別に並べて毎回見る
  const mergesByRow = new Map();
  const tallMerges = [];
  for (const m of sheet?.merges || []) {
    if (!isMergeOk(m) || m.r0 > maxRow) continue;
    if (m.r1 - m.r0 >= 256) {
      tallMerges.push(m);
      continue;
    }
    for (let r = m.r0, to = Math.min(m.r1, maxRow); r <= to; r++) {
      let list = mergesByRow.get(r);
      if (!list) mergesByRow.set(r, (list = []));
      list.push(m);
    }
  }
  const raw = (r, c) => rows[r]?.[c];
  const merge = (r, c) => {
    for (const m of mergesByRow.get(r) || []) if (c >= m.c0 && c <= m.c1) return m;
    for (const m of tallMerges) if (r >= m.r0 && r <= m.r1 && c >= m.c0 && c <= m.c1) return m;
    return null;
  };
  const master = (r, c) => {
    const m = merge(r, c);
    return m ? raw(m.r0, m.c0) : raw(r, c);
  };
  return {
    maxRow,
    maxCol,
    raw,
    merge,
    /**
     * 実際にあるセルを行 → 列の順に [r, c, cell] で返す (from〜to 行)。
     * 升目をなめる代わりにこれを回す
     */
    cells: (from = 0, to = Infinity) => cells.filter(([r]) => r >= from && r <= to),
    /** 結合なら左上のセル */
    cell: master,
    /** 結合なら左上のセルの文字 (前後の空白は除く) */
    text: (r, c) => cellText(master(r, c)),
    /** 塗りの色。結合の中は左上の色 (結合範囲は 1 枚の塗りとして見える) */
    fill: (r, c) => {
      const own = raw(r, c)?.fill || null;
      const m = merge(r, c);
      if (!m) return own;
      return raw(m.r0, m.c0)?.fill || own;
    },
    /** 結合範囲の左上か、結合していない単独のセルか */
    isAnchor: (r, c) => {
      const m = merge(r, c);
      return !m || (m.r0 === r && m.c0 === c);
    },
  };
}

export function isWeekdayChar(s) {
  return typeof s === "string" && s.length === 1 && WEEKDAYS.includes(s);
}

export { WEEKDAYS };
