// ─── .xls (Excel 97-2003 = BIFF8) の読み取り ─────────────────────────
// 予定表チェック (utils/yoteihyo) が学校から届く予定表をそのまま読むための
// 最小限のリーダー。本体の依存 (exceljs) は .xlsx しか読めず、.xls を読む
// 定番ライブラリ (SheetJS) は npm 版が古く既知の脆弱性を抱えたままなので、
// 予定表に要る分だけをここで読む:
//   - セルの値 (文字列 / 数値 / 日付 / 数式の結果)
//   - セルの塗りつぶしの色 (灰色 = 休講、黄色 = 変更 のように意味を持つ)
//   - 結合セルの範囲
// 書式の大半 (罫線・フォント・列幅) や図形 (テキストボックス) は読まない。
//
// 構造は 2 層:
//   1. Compound File Binary (OLE2) のコンテナから "Workbook" ストリームを取り出す
//   2. BIFF8 のレコード列を読み、ブック全体 (共有文字列・書式・色) と
//      シートごとのセルを組み立てる
// 仕様は [MS-CFB] と [MS-XLS]。読めないレコードは黙って飛ばす。

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const MAX_REGSECT = 0xfffffffa;

// BIFF8 のレコード種別 (使うものだけ)
const R = {
  BOF: 0x0809,
  EOF: 0x000a,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  NUMBER: 0x0203,
  RK: 0x027e,
  MULRK: 0x00bd,
  BLANK: 0x0201,
  MULBLANK: 0x00be,
  FORMULA: 0x0006,
  STRING: 0x0207,
  BOOLERR: 0x0205,
  MERGEDCELLS: 0x00e5,
  XF: 0x00e0,
  FORMAT: 0x041e,
  PALETTE: 0x0092,
  DATEMODE: 0x0022,
};

// 色番号 0〜7 は固定色、8〜63 は既定パレット (PALETTE レコードで上書きされる)。
// DEFAULT_PALETTE[i] が色番号 i + 8
const FIXED_COLORS = ["000000", "ffffff", "ff0000", "00ff00", "0000ff", "ffff00", "ff00ff", "00ffff"];
// prettier-ignore
export const DEFAULT_PALETTE = [
  "000000", "ffffff", "ff0000", "00ff00", "0000ff", "ffff00", "ff00ff", "00ffff",
  "800000", "008000", "000080", "808000", "800080", "008080", "c0c0c0", "808080",
  "9999ff", "993366", "ffffcc", "ccffff", "660066", "ff8080", "0066cc", "ccccff",
  "000080", "ff00ff", "ffff00", "00ffff", "800080", "800000", "008080", "0000ff",
  "00ccff", "ccffff", "ccffcc", "ffff99", "99ccff", "ff99cc", "cc99ff", "ffcc99",
  "3366ff", "33cccc", "99cc00", "ffcc00", "ff9900", "ff6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
];

// 組み込みの日付書式の番号 (日本語版 Excel の和暦・年月日を含む)
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54,
  55, 56, 57, 58,
]);

/** 先頭 8 バイトで OLE2 (= .xls) かどうかを見る。 */
export function isCompoundFile(bytes) {
  if (!bytes || bytes.length < 512) return false;
  return CFB_SIGNATURE.every((b, i) => bytes[i] === b);
}

// ─── 1. Compound File Binary ──────────────────────────────────────

function u16(b, o) {
  return b[o] | (b[o + 1] << 8);
}
function u32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/**
 * OLE2 コンテナを開き、名前でストリームを取り出せるようにする。
 * @param {Uint8Array} bytes
 * @returns {{ get(name: string): Uint8Array | null, names: string[] }}
 */
export function openCompoundFile(bytes) {
  if (!isCompoundFile(bytes)) throw new Error("Excel 97-2003 形式 (.xls) のファイルではありません");
  const sectorShift = u16(bytes, 0x1e);
  const miniShift = u16(bytes, 0x20);
  if (sectorShift < 7 || sectorShift > 16 || miniShift > sectorShift) {
    throw new Error("ファイルが壊れています (セクタサイズ)");
  }
  const sectorSize = 1 << sectorShift;
  const miniSize = 1 << miniShift;
  const nSectors = Math.floor((bytes.length - sectorSize) / sectorSize) + 1;
  const sectorOffset = (sid) => (sid + 1) * sectorSize;
  const readSector = (sid) => {
    const off = sectorOffset(sid);
    if (sid > MAX_REGSECT || off + sectorSize > bytes.length + sectorSize) {
      throw new Error("ファイルが壊れています (セクタ番号)");
    }
    return bytes.subarray(off, Math.min(off + sectorSize, bytes.length));
  };

  // FAT のセクタ番号: ヘッダの 109 個 + DIFAT の連鎖
  const fatSids = [];
  for (let i = 0; i < 109; i++) {
    const sid = u32(bytes, 0x4c + i * 4);
    if (sid <= MAX_REGSECT) fatSids.push(sid);
  }
  let difat = u32(bytes, 0x44);
  const perDifat = sectorSize / 4 - 1;
  for (let guard = 0; difat <= MAX_REGSECT && guard < nSectors; guard++) {
    const sec = readSector(difat);
    for (let i = 0; i < perDifat; i++) {
      const sid = u32(sec, i * 4);
      if (sid <= MAX_REGSECT) fatSids.push(sid);
    }
    difat = u32(sec, perDifat * 4);
  }
  const fat = [];
  for (const sid of fatSids) {
    const sec = readSector(sid);
    for (let i = 0; i + 4 <= sec.length; i += 4) fat.push(u32(sec, i));
  }

  const chain = (start, table) => {
    const out = [];
    let sid = start;
    // 循環した連鎖で止まらないように上限を置く
    while (sid !== ENDOFCHAIN && sid !== FREESECT && sid <= MAX_REGSECT) {
      if (out.length > table.length) throw new Error("ファイルが壊れています (連鎖が循環)");
      out.push(sid);
      sid = table[sid];
      if (sid === undefined) break;
    }
    return out;
  };
  const readChain = (start, size) => {
    const sids = chain(start, fat);
    const out = new Uint8Array(sids.length * sectorSize);
    sids.forEach((sid, i) => out.set(readSector(sid), i * sectorSize));
    return size == null ? out : out.subarray(0, Math.min(size, out.length));
  };

  // ディレクトリ (128 バイト単位)
  const dirBytes = readChain(u32(bytes, 0x30));
  const entries = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLen = u16(dirBytes, off + 0x40);
    const type = dirBytes[off + 0x42];
    if (type === 0 || nameLen < 2) continue;
    let name = "";
    for (let i = 0; i < nameLen / 2 - 1; i++) name += String.fromCharCode(u16(dirBytes, off + i * 2));
    entries.push({ name, type, start: u32(dirBytes, off + 0x74), size: u32(dirBytes, off + 0x78) });
  }
  const root = entries.find((e) => e.type === 5);
  const cutoff = u32(bytes, 0x38) || 4096;

  // ミニストリーム (4096 バイト未満のストリームの置き場)
  let miniFat = null;
  let miniStream = null;
  const ensureMini = () => {
    if (miniFat) return;
    miniFat = [];
    const mf = readChain(u32(bytes, 0x3c));
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
    miniStream = root ? readChain(root.start, root.size) : new Uint8Array(0);
  };

  return {
    names: entries.filter((e) => e.type === 2).map((e) => e.name),
    get(name) {
      const e = entries.find((x) => x.type === 2 && x.name === name);
      if (!e) return null;
      if (e.size >= cutoff) return readChain(e.start, e.size);
      ensureMini();
      const sids = chain(e.start, miniFat);
      const out = new Uint8Array(sids.length * miniSize);
      sids.forEach((sid, i) =>
        out.set(miniStream.subarray(sid * miniSize, sid * miniSize + miniSize), i * miniSize)
      );
      return out.subarray(0, e.size);
    },
  };
}

// ─── 2. BIFF8 ─────────────────────────────────────────────────────

function* records(stream, start = 0) {
  let pos = start;
  while (pos + 4 <= stream.length) {
    const type = u16(stream, pos);
    const len = u16(stream, pos + 2);
    yield { type, data: stream.subarray(pos + 4, Math.min(pos + 4 + len, stream.length)), pos };
    pos += 4 + len;
  }
}

function decodeChars(b, off, n, high) {
  let s = "";
  if (high) {
    for (let i = 0; i < n; i++) s += String.fromCharCode(u16(b, off + i * 2));
  } else {
    for (let i = 0; i < n; i++) s += String.fromCharCode(b[off + i]);
  }
  return s;
}

// 1 レコードに収まる XLUnicodeString (cch:u16, flags:u8, chars)。
function readUnicodeString(b, off) {
  const cch = u16(b, off);
  const high = b[off + 2] & 1;
  return decodeChars(b, off + 3, cch, high);
}

// ShortXLUnicodeString (cch:u8, flags:u8, chars)。シート名に使われる。
function readShortUnicodeString(b, off) {
  const cch = b[off];
  const high = b[off + 1] & 1;
  return decodeChars(b, off + 2, cch, high);
}

// SST (共有文字列) は CONTINUE レコードをまたいで続く。文字の途中で
// レコードが切れたときは、続きのレコードの先頭に「1 バイト = 2 バイト文字か」
// のフラグが入り直す (文字以外の部分 = 書式の連なり・ふりがなは入らない)。
function parseSst(segments) {
  const out = [];
  let si = 0;
  let pos = 0;
  const seg = () => segments[si];
  const atEnd = () => si >= segments.length;
  // 現在のレコードを読み切っていたら次へ (文字列の頭では区切りのフラグは無い)
  const settle = () => {
    while (!atEnd() && pos >= seg().length) {
      si++;
      pos = 0;
    }
  };
  const byte = () => {
    settle();
    if (atEnd()) throw new Error("共有文字列が途中で切れています");
    return seg()[pos++];
  };
  const word = () => byte() | (byte() << 8);
  const dword = () => (word() | (word() << 16)) >>> 0;
  const skip = (n) => {
    let left = n;
    while (left > 0) {
      settle();
      if (atEnd()) return;
      const take = Math.min(left, seg().length - pos);
      pos += take;
      left -= take;
    }
  };
  if (!segments.length || segments[0].length < 8) return out;
  pos = 4; // cstTotal
  const unique = dword();
  for (let n = 0; n < unique; n++) {
    settle();
    if (atEnd()) break;
    const cch = word();
    const flags = byte();
    let high = flags & 1;
    const runs = flags & 8 ? word() : 0;
    const ext = flags & 4 ? dword() : 0;
    let s = "";
    let left = cch;
    while (left > 0) {
      if (pos >= seg().length) {
        si++;
        pos = 0;
        if (atEnd()) break;
        high = seg()[pos++] & 1;
      }
      const avail = seg().length - pos;
      const take = Math.min(left, high ? avail >> 1 : avail);
      if (take <= 0) break;
      s += decodeChars(seg(), pos, take, high);
      pos += take * (high ? 2 : 1);
      left -= take;
    }
    skip(runs * 4 + ext);
    out.push(s);
  }
  return out;
}

// RK 値 (整数か、下位ビットを落とした倍精度) を数値へ
function decodeRk(rk) {
  let v;
  if (rk & 2) {
    v = rk >> 2; // 30 ビットの符号つき整数
  } else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, 0, true);
    buf.setUint32(4, rk & 0xfffffffc, true);
    v = buf.getFloat64(0, true);
  }
  return rk & 1 ? v / 100 : v;
}

function readFloat64(b, off) {
  return new DataView(b.buffer, b.byteOffset + off, 8).getFloat64(0, true);
}

// 書式文字列が日付か。引用符の中・[色]・エスケープ・「General」を除いた
// 1 区画目に y / d (年・日) があれば日付とみなす (時刻だけの書式は日付にしない)
export function isDateFormatString(fmt) {
  if (!fmt) return false;
  const s = fmt
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/General/gi, "")
    .split(";")[0];
  if (/[#0?@]/.test(s)) return false;
  return /[yYdD年日]/.test(s);
}

/** Excel のシリアル値 → "YYYY-MM-DD" (1900 年基準 / 1904 年基準)。範囲外は null */
export function excelSerialToIso(serial, date1904 = false) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const days = Math.floor(serial);
  // 1900 年基準は 1899-12-30 起点 (1900-02-29 が存在する扱いの互換を含む)
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + days * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * .xls を読み、シートごとのセル (値と塗りつぶしの色) と結合範囲を返す。
 *
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {{ sheets: Array<{ name: string, rows: Array<Array<Cell>>, merges: Merge[] }> }}
 *   Cell = { t: "s"|"n"|"b"|"e"|"z", v: string|number|boolean|null, fill: string|null, date?: string }
 *     t "z" は値の無いセル (色だけ付いている空欄)。fill は "#rrggbb" か null。
 *     date は日付書式の数値セルだけ ("YYYY-MM-DD")。
 *   Merge = { r0, c0, r1, c1 } (0 起点・両端を含む)
 */
export function readXls(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const cfb = openCompoundFile(bytes);
  const stream = cfb.get("Workbook");
  if (!stream) {
    if (cfb.get("Book")) {
      throw new Error("Excel 5.0/95 形式のファイルは読めません。Excel で開いて保存し直してください");
    }
    throw new Error("Excel のブックが見つかりません");
  }

  // ── ブック全体 (globals) ──
  const palette = DEFAULT_PALETTE.slice();
  const formats = new Map();
  const xfs = [];
  const boundSheets = [];
  let sst = [];
  let date1904 = false;
  let sstSegments = null;
  let started = false;
  for (const rec of records(stream)) {
    if (rec.type === R.BOF) {
      if (started) break;
      started = true;
      continue;
    }
    if (sstSegments && rec.type !== R.CONTINUE) {
      sst = parseSst(sstSegments);
      sstSegments = null;
    }
    switch (rec.type) {
      case R.EOF:
        break;
      case R.DATEMODE:
        date1904 = u16(rec.data, 0) === 1;
        break;
      case R.FORMAT:
        formats.set(u16(rec.data, 0), readUnicodeString(rec.data, 2));
        break;
      case R.PALETTE: {
        const n = u16(rec.data, 0);
        for (let i = 0; i < n && i < palette.length && 2 + i * 4 + 3 <= rec.data.length; i++) {
          const o = 2 + i * 4;
          palette[i] = [rec.data[o], rec.data[o + 1], rec.data[o + 2]]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        }
        break;
      }
      case R.XF: {
        const d = rec.data;
        if (d.length < 20) {
          xfs.push({ fmt: 0, fls: 0, fore: 64 });
          break;
        }
        xfs.push({
          fmt: u16(d, 2),
          fls: (u32(d, 14) >>> 26) & 0x3f,
          fore: u16(d, 18) & 0x7f,
        });
        break;
      }
      case R.BOUNDSHEET:
        boundSheets.push({
          offset: u32(rec.data, 0),
          kind: rec.data[5],
          name: readShortUnicodeString(rec.data, 6),
        });
        break;
      case R.SST:
        sstSegments = [rec.data];
        break;
      case R.CONTINUE:
        if (sstSegments) sstSegments.push(rec.data);
        break;
      default:
        break;
    }
    if (rec.type === R.EOF) break;
  }
  if (sstSegments) sst = parseSst(sstSegments);

  const colorOf = (idx) => {
    if (idx < 8) return FIXED_COLORS[idx];
    if (idx < 64) return palette[idx - 8] ?? null;
    return null; // 64/65 = システム色 (前景/背景)。予定表の判定には使わない
  };
  const xfInfo = xfs.map((x) => ({
    fill: x.fls ? (colorOf(x.fore) ? `#${colorOf(x.fore)}` : null) : null,
    isDate: BUILTIN_DATE_FORMATS.has(x.fmt) || isDateFormatString(formats.get(x.fmt)),
  }));
  const xfAt = (i) => xfInfo[i] || { fill: null, isDate: false };

  // ── シート ──
  const sheets = [];
  for (const bs of boundSheets) {
    if (bs.kind !== 0) continue; // ワークシートだけ (グラフ・マクロは読まない)
    const rows = [];
    const merges = [];
    const put = (r, c, cell) => {
      (rows[r] || (rows[r] = []))[c] = cell;
    };
    const numberCell = (r, c, ixfe, v) => {
      const xf = xfAt(ixfe);
      const cell = { t: "n", v, fill: xf.fill };
      if (xf.isDate) cell.date = excelSerialToIso(v, date1904);
      put(r, c, cell);
    };
    let depth = 0;
    let pendingFormula = null;
    for (const rec of records(stream, bs.offset)) {
      const d = rec.data;
      if (rec.type === R.BOF) {
        depth++;
        continue;
      }
      if (rec.type === R.EOF) {
        depth--;
        if (depth <= 0) break;
        continue;
      }
      if (depth !== 1) continue; // 埋め込みグラフなどの中は読まない
      if (pendingFormula && rec.type === R.STRING) {
        const { r, c, ixfe } = pendingFormula;
        put(r, c, { t: "s", v: readUnicodeString(d, 0), fill: xfAt(ixfe).fill });
        pendingFormula = null;
        continue;
      }
      pendingFormula = null;
      switch (rec.type) {
        case R.LABELSST:
          put(u16(d, 0), u16(d, 2), { t: "s", v: sst[u32(d, 6)] ?? "", fill: xfAt(u16(d, 4)).fill });
          break;
        case R.LABEL:
          put(u16(d, 0), u16(d, 2), { t: "s", v: readUnicodeString(d, 6), fill: xfAt(u16(d, 4)).fill });
          break;
        case R.NUMBER:
          numberCell(u16(d, 0), u16(d, 2), u16(d, 4), readFloat64(d, 6));
          break;
        case R.RK:
          numberCell(u16(d, 0), u16(d, 2), u16(d, 4), decodeRk(u32(d, 6)));
          break;
        case R.MULRK: {
          const r = u16(d, 0);
          const c0 = u16(d, 2);
          const n = (d.length - 6) / 6;
          for (let i = 0; i < n; i++) {
            numberCell(r, c0 + i, u16(d, 4 + i * 6), decodeRk(u32(d, 6 + i * 6)));
          }
          break;
        }
        case R.BLANK: {
          const fill = xfAt(u16(d, 4)).fill;
          if (fill) put(u16(d, 0), u16(d, 2), { t: "z", v: null, fill });
          break;
        }
        case R.MULBLANK: {
          const r = u16(d, 0);
          const c0 = u16(d, 2);
          const n = (d.length - 6) / 2;
          for (let i = 0; i < n; i++) {
            const fill = xfAt(u16(d, 4 + i * 2)).fill;
            if (fill) put(r, c0 + i, { t: "z", v: null, fill });
          }
          break;
        }
        case R.BOOLERR: {
          const isErr = d[7] === 1;
          put(u16(d, 0), u16(d, 2), {
            t: isErr ? "e" : "b",
            v: isErr ? null : d[6] === 1,
            fill: xfAt(u16(d, 4)).fill,
          });
          break;
        }
        case R.FORMULA: {
          const r = u16(d, 0);
          const c = u16(d, 2);
          const ixfe = u16(d, 4);
          if (u16(d, 12) === 0xffff) {
            const kind = d[6];
            if (kind === 0) pendingFormula = { r, c, ixfe };
            else if (kind === 1) put(r, c, { t: "b", v: d[8] === 1, fill: xfAt(ixfe).fill });
            else if (kind === 3) put(r, c, { t: "s", v: "", fill: xfAt(ixfe).fill });
            else put(r, c, { t: "e", v: null, fill: xfAt(ixfe).fill });
          } else {
            numberCell(r, c, ixfe, readFloat64(d, 6));
          }
          break;
        }
        case R.MERGEDCELLS: {
          const n = u16(d, 0);
          for (let i = 0; i < n && 2 + i * 8 + 8 <= d.length; i++) {
            const o = 2 + i * 8;
            merges.push({ r0: u16(d, o), r1: u16(d, o + 2), c0: u16(d, o + 4), c1: u16(d, o + 6) });
          }
          break;
        }
        default:
          break;
      }
    }
    sheets.push({ name: bs.name, rows, merges });
  }
  return { sheets };
}
