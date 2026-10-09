// ─── シートのセルを読むための小さな道具 ─────────────────────────────
// readXls / readXlsx が返すシート ({ rows, merges }) を「結合セルは左上の
// セルで代表する」読み方で引けるようにする。予定表の判定 (休校の行・
// 見出しの学年) は結合範囲ごとに読むので、ここで一度だけ索引を作る。

const WEEKDAYS = "日月火水木金土";

/** "#rrggbb" → [r, g, b] (読めなければ null) */
function rgb(fill) {
  if (typeof fill !== "string" || !/^#[0-9a-f]{6}$/i.test(fill)) return null;
  return [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
}

/**
 * 休講の灰色 (予定表の教員用で休講のコマを塗る色)。白・黒・薄い灰色は含めない。
 * 学校の予定表では 969696 (25% 灰色) と c0c0c0 が使われている。
 */
export function isGrayFill(fill) {
  const c = rgb(fill);
  if (!c) return false;
  const [r, g, b] = c;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 16 && r >= 0x80 && r <= 0xd0;
}

/** 変更・振替の印に使われる黄色 (ffff00 / ffcc00 など、薄い黄色は含めない) */
export function isYellowFill(fill) {
  const c = rgb(fill);
  if (!c) return false;
  const [r, g, b] = c;
  return r >= 0xf0 && g >= 0xc0 && b <= 0x40;
}

/** 休校・祝日の行に使われる赤系 (ff8080 など) */
export function isRedFill(fill) {
  const c = rgb(fill);
  if (!c) return false;
  const [r, g, b] = c;
  return r >= 0xe0 && g <= 0xa0 && b <= 0xa0;
}

export function cellText(cell) {
  if (!cell || cell.v == null) return "";
  if (cell.t === "n") return Number.isInteger(cell.v) ? String(cell.v) : String(cell.v);
  return String(cell.v).trim();
}

/**
 * @param {{ rows: Array<Array<object>>, merges: Array<{r0:number,c0:number,r1:number,c1:number}> }} sheet
 */
export function makeGrid(sheet) {
  const rows = sheet?.rows || [];
  const merges = sheet?.merges || [];
  const mergeAt = new Map();
  for (const m of merges) {
    for (let r = m.r0; r <= m.r1; r++) {
      for (let c = m.c0; c <= m.c1; c++) mergeAt.set(`${r},${c}`, m);
    }
  }
  let maxRow = rows.length - 1;
  let maxCol = -1;
  rows.forEach((row) => {
    if (row && row.length - 1 > maxCol) maxCol = row.length - 1;
  });
  for (const m of merges) {
    if (m.r1 > maxRow) maxRow = m.r1;
    if (m.c1 > maxCol) maxCol = m.c1;
  }
  const raw = (r, c) => rows[r]?.[c];
  const merge = (r, c) => mergeAt.get(`${r},${c}`) || null;
  const master = (r, c) => {
    const m = merge(r, c);
    return m ? raw(m.r0, m.c0) : raw(r, c);
  };
  return {
    maxRow,
    maxCol,
    raw,
    merge,
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
