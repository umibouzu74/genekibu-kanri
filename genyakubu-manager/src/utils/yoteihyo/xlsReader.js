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
// 壊れた・細工されたファイルで固まらないよう、セクタ数・連鎖・結合・
// レコード長はここで確かめる (利用者に見せるエラーは WorkbookError)。

import { WorkbookError, PASSWORD_MESSAGE } from "./errors";
import { DEFAULT_PALETTE, paletteColor, themeColor } from "./colors";

export { DEFAULT_PALETTE };

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
  FILEPASS: 0x002f, // パスワード (暗号化) のブック
  XFEXT: 0x087d, // XF の本当の色 (Excel 2007 以降。XF の色番号は近い色の目安)
  SHRFMLA: 0x04bc, // 数式と STRING の間に入りうる
  ARRAY: 0x0221,
  TABLE: 0x0236,
};

// セルのレコードの最小の長さ (足りないレコードは読まない)
const MIN_LEN = {
  [R.LABELSST]: 10,
  [R.LABEL]: 9,
  [R.NUMBER]: 14,
  [R.RK]: 10,
  [R.MULRK]: 12,
  [R.BLANK]: 6,
  [R.MULBLANK]: 8,
  [R.BOOLERR]: 8,
  [R.FORMULA]: 20,
  [R.MERGEDCELLS]: 2,
};

const WEEKDAYS = "日月火水木金土";

// 組み込みの日付書式の番号 (日本語版 Excel の和暦・年月日を含む。
// 時刻だけの 18〜21・32・33・45〜47 は入れない)
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

// 予定表の日付として信じる最も古い年。日の列を書式「d」で作った表の 1〜31 が
// 1900 年 1 月の日付として読まれないように
const MIN_DATE_YEAR = 1950;

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
  if (!isCompoundFile(bytes)) throw new WorkbookError("Excel 97-2003 形式 (.xls) のファイルではありません。");
  const broken = (what) => new WorkbookError(`ファイルが壊れています (${what})。`);
  const sectorShift = u16(bytes, 0x1e);
  const miniShift = u16(bytes, 0x20);
  // セクタは 512 バイト (v3) か 4096 バイト (v4)、ミニセクタは 64 バイトだけ
  if ((sectorShift !== 9 && sectorShift !== 12) || miniShift !== 6) throw broken("セクタサイズ");
  const sectorSize = 1 << sectorShift;
  const miniSize = 1 << miniShift;
  const nSectors = Math.max(0, Math.ceil((bytes.length - sectorSize) / sectorSize));
  const sectorOffset = (sid) => (sid + 1) * sectorSize;
  const readSector = (sid) => {
    if (sid > MAX_REGSECT) throw broken("セクタ番号");
    // ファイルの終わりより先のセクタ = 途中で切れたファイル
    const off = sectorOffset(sid);
    if (sid >= nSectors || off >= bytes.length) throw broken("途中で切れています");
    return bytes.subarray(off, Math.min(off + sectorSize, bytes.length));
  };

  // FAT のセクタ番号: ヘッダの 109 個 + DIFAT の連鎖。数はヘッダの FAT セクタ数と
  // ファイルのセクタ数で頭打ちにし、DIFAT は 1 度通ったセクタで止める
  const fatCount = Math.min(u32(bytes, 0x2c) || nSectors, nSectors);
  const fatSids = [];
  for (let i = 0; i < 109 && fatSids.length < fatCount; i++) {
    const sid = u32(bytes, 0x4c + i * 4);
    if (sid <= MAX_REGSECT) fatSids.push(sid);
  }
  let difat = u32(bytes, 0x44);
  const perDifat = sectorSize / 4 - 1;
  const seenDifat = new Set();
  while (difat <= MAX_REGSECT && fatSids.length < fatCount && !seenDifat.has(difat)) {
    seenDifat.add(difat);
    const sec = readSector(difat);
    for (let i = 0; i < perDifat && fatSids.length < fatCount; i++) {
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
      if (out.length > table.length) throw broken("連鎖が循環");
      out.push(sid);
      sid = table[sid];
      if (sid === undefined) break;
    }
    return out;
  };
  // 宣言されたサイズに足りなければ、途中で切れたファイル (黙って短く読まない)
  const readChain = (start, size) => {
    const sids = chain(start, fat);
    if (size != null && sids.length * sectorSize < size) throw broken("途中で切れています");
    const out = new Uint8Array(sids.length * sectorSize);
    let filled = 0;
    sids.forEach((sid, i) => {
      const sec = readSector(sid);
      out.set(sec, i * sectorSize);
      filled = i * sectorSize + sec.length;
    });
    if (size != null && filled < size) throw broken("途中で切れています");
    return size == null ? out.subarray(0, filled) : out.subarray(0, size);
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

  // ストリームの名前は大文字・小文字を区別しない ([MS-CFB])
  const find = (name) => entries.find((x) => x.type === 2 && x.name.toLowerCase() === name.toLowerCase());
  return {
    names: entries.filter((e) => e.type === 2).map((e) => e.name),
    has: (name) => !!find(name),
    get(name) {
      const e = find(name);
      if (!e) return null;
      if (e.size >= cutoff) return readChain(e.start, e.size);
      ensureMini();
      const sids = chain(e.start, miniFat);
      if (sids.length * miniSize < e.size) throw broken("途中で切れています");
      const out = new Uint8Array(sids.length * miniSize);
      sids.forEach((sid, i) => {
        if ((sid + 1) * miniSize > miniStream.length) throw broken("途中で切れています");
        out.set(miniStream.subarray(sid * miniSize, sid * miniSize + miniSize), i * miniSize);
      });
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
// レコードが切れたときは、続きのレコードの先頭に「2 バイト文字か」を示す
// 1 バイトのフラグが入り直す (文字以外の部分 = 書式の連なり・ふりがなは入らない)。
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
  if (off + 8 > b.length) return NaN;
  return new DataView(b.buffer, b.byteOffset + off, 8).getFloat64(0, true);
}

function s16(b, o) {
  const v = u16(b, o);
  return v & 0x8000 ? v - 0x10000 : v;
}

// 書式の文字列から、引用符の中・エスケープ・[色]・[$-411] などを除く
function stripFormat(fmt) {
  return String(fmt)
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/General/gi, "")
    .split(";")[0];
}

/** 曜日だけを出す書式 (「aaa」= 月、「dddd」= Monday など) */
export function isWeekdayFormatString(fmt) {
  if (!fmt) return false;
  return /^\s*(a{3,4}|d{3,4})\s*$/i.test(stripFormat(fmt));
}

// 書式文字列が日付か。引用符の中・[色]・エスケープ・「General」を除いた
// 1 区画目に y / d (年・日) があれば日付とみなす (時刻だけの書式は日付にしない)
export function isDateFormatString(fmt) {
  if (!fmt) return false;
  const s = stripFormat(fmt);
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
 *   Cell = { t: "s"|"n"|"b"|"e"|"z", v: string|number|boolean|null, fill: string|null,
 *            date?: string, wd?: string }
 *     t "z" は値の無いセル (色だけ付いている空欄)。fill は "#rrggbb" か null。
 *     date は日付書式の数値セルだけ ("YYYY-MM-DD"、1950 年より前は付けない)。
 *     wd は曜日だけを出す書式 (「aaa」) の数値セルの曜日 ("月" など)。
 *   Merge = { r0, c0, r1, c1 } (0 起点・両端を含む)
 */
export function readXls(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const cfb = openCompoundFile(bytes);
  // パスワード付きの .xlsx は、中身を暗号化した OLE2 コンテナになっている
  if (cfb.has("EncryptedPackage") || cfb.has("EncryptionInfo")) throw new WorkbookError(PASSWORD_MESSAGE);
  const stream = cfb.get("Workbook");
  const excel95 = () =>
    new WorkbookError(
      "Excel 5.0/95 形式のファイルは読めません。Excel で開き、「名前を付けて保存」で" +
        "「Excel ブック (*.xlsx)」を選んで保存し直してから、読み込んでください。"
    );
  if (!stream || !stream.length) {
    if (cfb.has("Book")) throw excel95();
    throw new WorkbookError("Excel のブックが見つかりません。");
  }

  // ── ブック全体 (globals) ──
  const palette = DEFAULT_PALETTE.slice();
  const formats = new Map();
  const xfs = [];
  const xfColors = new Map(); // ixfe -> 本当の塗りの色 (XFEXT)
  const boundSheets = [];
  let sst = [];
  let date1904 = false;
  let sstSegments = null;
  let started = false;
  for (const rec of records(stream)) {
    if (rec.type === R.BOF) {
      if (started) break;
      // BIFF8 (Excel 97 以降) は 0x0600。それより古い中身は文字が化けるので読まない
      if (rec.data.length >= 2 && u16(rec.data, 0) !== 0x0600) throw excel95();
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
      case R.FILEPASS:
        throw new WorkbookError(PASSWORD_MESSAGE);
      case R.XFEXT: {
        const fill = readXfExtFill(rec.data);
        if (fill) xfColors.set(fill.ixfe, fill);
        break;
      }
      case R.DATEMODE:
        date1904 = u16(rec.data, 0) === 1;
        break;
      case R.FORMAT:
        if (rec.data.length >= 5) formats.set(u16(rec.data, 0), readUnicodeString(rec.data, 2));
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
        if (rec.data.length < 8) break;
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

  // 塗りの色: XFEXT (Excel 2007 以降が書く本当の色) があればそれ、無ければ
  // XF の色番号 (パレット)。64/65 = システム色は予定表の判定に使わない
  const extColor = (ext) => {
    if (!ext) return null;
    if (ext.type === 2) return ext.rgb;
    if (ext.type === 3) return themeColor(ext.value, ext.tint);
    if (ext.type === 1) return paletteColor(ext.value, palette);
    return null;
  };
  const xfInfo = xfs.map((x, i) => {
    const hex = x.fls ? extColor(xfColors.get(i)) || paletteColor(x.fore, palette) : null;
    return {
      fill: hex ? `#${hex}` : null,
      isDate: BUILTIN_DATE_FORMATS.has(x.fmt) || isDateFormatString(formats.get(x.fmt)),
      isWeekday: isWeekdayFormatString(formats.get(x.fmt)),
    };
  });
  const xfAt = (i) => xfInfo[i] || { fill: null, isDate: false, isWeekday: false };

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
      if (xf.isDate || xf.isWeekday) {
        const iso = excelSerialToIso(v, date1904);
        if (iso && Number(iso.slice(0, 4)) >= MIN_DATE_YEAR) {
          if (xf.isWeekday) cell.wd = WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
          else cell.date = iso;
        }
      }
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
      if (pendingFormula) {
        if (rec.type === R.STRING) {
          const { r, c, ixfe } = pendingFormula;
          put(r, c, { t: "s", v: readUnicodeString(d, 0), fill: xfAt(ixfe).fill });
          pendingFormula = null;
          continue;
        }
        // 数式の結果の文字列は FORMULA [SHRFMLA | ARRAY | TABLE] STRING の順で来る
        if (rec.type === R.SHRFMLA || rec.type === R.ARRAY || rec.type === R.TABLE) continue;
        pendingFormula = null;
      }
      if (MIN_LEN[rec.type] && d.length < MIN_LEN[rec.type]) continue; // 長さの足りないレコード
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
            if (kind === 0) {
              // 結果の文字列は続く STRING レコード。来なくてもセルは残す
              pendingFormula = { r, c, ixfe };
              put(r, c, { t: "s", v: "", fill: xfAt(ixfe).fill });
            } else if (kind === 1) put(r, c, { t: "b", v: d[8] === 1, fill: xfAt(ixfe).fill });
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
            const m = { r0: u16(d, o), r1: u16(d, o + 2), c0: u16(d, o + 4), c1: u16(d, o + 6) };
            // 逆向き・列の上限 (256 列) を超える結合は壊れているので捨てる
            if (m.r1 >= m.r0 && m.c1 >= m.c0 && m.c1 <= 0xff) merges.push(m);
          }
          break;
        }
        default:
          break;
      }
    }
    sheets.push({ name: bs.name, rows, merges });
  }
  if (!sheets.length) throw new WorkbookError("ブックにワークシートがありません。");
  return { sheets };
}

// XFEXT (MS-XLS 2.4.355) から塗りの前景色 (extType 4) を読む。
// FrtHeader (12) + reserved (2) + ixfe (2) + reserved (2) + cexts (2) + ExtProp[]。
// ExtProp = extType (2) + cb (2) + FullColorExt (xclrType 2, nTintShade 2, xclrValue 4, 8)
function readXfExtFill(d) {
  if (d.length < 20) return null;
  const ixfe = u16(d, 14);
  const cexts = u16(d, 18);
  let o = 20;
  for (let i = 0; i < cexts && o + 4 <= d.length; i++) {
    const extType = u16(d, o);
    const cb = u16(d, o + 2);
    if (cb < 4 || o + cb > d.length) break;
    if (extType === 4 && cb >= 4 + 8) {
      // xclrType: 1 = 色番号 / 2 = RGB / 3 = テーマ色 (+ tint)。0 (自動)・4 (なし) は XF の色に任せる
      const type = u16(d, o + 4);
      if (type < 1 || type > 3) return null;
      return {
        ixfe,
        type,
        tint: s16(d, o + 6) / 32767,
        value: u32(d, o + 8),
        // LongRGBA (r, g, b, a の順のバイト)
        rgb: [d[o + 8], d[o + 9], d[o + 10]].map((x) => x.toString(16).padStart(2, "0")).join(""),
      };
    }
    o += cb;
  }
  return null;
}
