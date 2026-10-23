// ─── Excel (.xlsx) を「開くのにパスワードが要る」ファイルにする ──────────
// バイト出勤表の「金額入り」の Excel に使う (utils/partTimeAttendanceExport)。
// exceljs には暗号化が無いので、Excel 2010 以降が「ドキュメントの暗号化」で
// 書くのと同じ ECMA-376 Agile Encryption ([MS-OFFCRYPTO] 2.3.4.10〜2.3.4.15) を組む:
//   - パスワード → SHA-512 を 100000 回 → 鍵を包む鍵 (AES-256)
//   - 中身の鍵 (乱数 32 バイト) で .xlsx を 4096 バイトごとに AES-256-CBC
//   - 改ざん検出の HMAC-SHA512
// 出来上がりは OLE2 (Compound File Binary) のコンテナ:
//   Root ─ \x06DataSpaces (「暗号化された文書」の決まりの部品。中身は固定)
//        ─ EncryptionInfo  (暗号のパラメータ: 塩・パスワードの検証値・包んだ鍵 (XML))
//        ─ EncryptedPackage (暗号化した .xlsx)
// Excel・LibreOffice はパスワードを聞いて開く。このモジュールはパスワードを
// 保存しない (渡されたもので暗号化するだけ。どのパスワードを使うかは呼び出し側)。
//
// SHA-512 の 100000 回は WebCrypto で 1 回ずつ await すると 4 秒以上かかる
// (iPad はもっと遅い) ので、ここだけ同期の SHA-512 を持つ。AES・HMAC・乱数は
// WebCrypto (crypto.subtle / getRandomValues)。

export const SPIN_COUNT = 100000;
// Excel のパスワードの上限 (文字数)
export const MAX_PASSWORD_LENGTH = 255;

const SEGMENT_LENGTH = 4096;
const KEY_BYTES = 32; // AES-256
const BLOCK_BYTES = 16;
const SALT_BYTES = 16;
const HASH_BYTES = 64; // SHA-512

// [MS-OFFCRYPTO] 2.3.4.11 (パスワードの鍵) / 2.3.4.14 (HMAC) の block key
const BLK_VERIFIER_INPUT = [0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79];
const BLK_VERIFIER_VALUE = [0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e];
const BLK_KEY_VALUE = [0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6];
const BLK_INTEGRITY_KEY = [0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6];
const BLK_INTEGRITY_VALUE = [0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33];

// ─── バイト列の小道具 ─────────────────────────────────────────────

function concatBytes(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u16le(n) {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}

function u32le(n) {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function utf16le(str) {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >>> 8;
  }
  return out;
}

// 長さを n の倍数まで 0 で埋める
function padTo(bytes, n) {
  const len = Math.ceil(bytes.length / n) * n;
  if (len === bytes.length) return bytes;
  const out = new Uint8Array(len);
  out.set(bytes);
  return out;
}

function toBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// ─── SHA-512 (同期) ───────────────────────────────────────────────
// 64 ビットの値は上位・下位の 32 ビットに分けて持つ。定数は定義どおり素数の
// 平方根 (初期値)・立方根 (ラウンド定数) の小数部から最初に使うときに作る
// (160 個の 16 進を書き写して 1 桁間違える心配をしない)。

let K_HI = null;
let K_LO = null;
let H_HI = null;
let H_LO = null;

function firstPrimes(n) {
  const out = [];
  for (let x = 2; out.length < n; x++) if (out.every((p) => x % p !== 0)) out.push(x);
  return out;
}

// floor(n の k 乗根) (BigInt、Newton 法で上から近づける)
function integerRoot(n, k) {
  const kk = BigInt(k);
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / k));
  for (;;) {
    const y = ((kk - 1n) * x + n / x ** (kk - 1n)) / kk;
    if (y >= x) return x;
    x = y;
  }
}

function initSha512() {
  if (K_HI) return;
  const mask = (1n << 64n) - 1n;
  const primes = firstPrimes(80);
  const kh = new Uint32Array(80);
  const kl = new Uint32Array(80);
  primes.forEach((p, i) => {
    // 立方根の小数部の先頭 64 ビット = floor(cbrt(p × 2^192)) mod 2^64
    const v = integerRoot(BigInt(p) << 192n, 3) & mask;
    kh[i] = Number(v >> 32n);
    kl[i] = Number(v & 0xffffffffn);
  });
  const hh = new Uint32Array(8);
  const hl = new Uint32Array(8);
  primes.slice(0, 8).forEach((p, i) => {
    const v = integerRoot(BigInt(p) << 128n, 2) & mask;
    hh[i] = Number(v >> 32n);
    hl[i] = Number(v & 0xffffffffn);
  });
  K_HI = kh;
  K_LO = kl;
  H_HI = hh;
  H_LO = hl;
}

const TWO32 = 0x100000000;

/**
 * SHA-512 (FIPS 180-4)。
 * @param {Uint8Array} data
 * @returns {Uint8Array} 64 バイト
 */
export function sha512(data) {
  initSha512();
  const len = data.length;
  const buf = new Uint8Array(Math.ceil((len + 17) / 128) * 128);
  buf.set(data);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = len * 8;
  dv.setUint32(buf.length - 8, Math.floor(bits / TWO32));
  dv.setUint32(buf.length - 4, bits >>> 0);

  const hh = Uint32Array.from(H_HI);
  const hl = Uint32Array.from(H_LO);
  const wh = new Uint32Array(80);
  const wl = new Uint32Array(80);
  for (let off = 0; off < buf.length; off += 128) {
    for (let i = 0; i < 16; i++) {
      wh[i] = dv.getUint32(off + i * 8);
      wl[i] = dv.getUint32(off + i * 8 + 4);
    }
    for (let i = 16; i < 80; i++) {
      // σ0 = rotr1 ^ rotr8 ^ shr7
      let vh = wh[i - 15];
      let vl = wl[i - 15];
      const s0h = ((vh >>> 1) | (vl << 31)) ^ ((vh >>> 8) | (vl << 24)) ^ (vh >>> 7);
      const s0l = ((vl >>> 1) | (vh << 31)) ^ ((vl >>> 8) | (vh << 24)) ^ ((vl >>> 7) | (vh << 25));
      // σ1 = rotr19 ^ rotr61 ^ shr6
      vh = wh[i - 2];
      vl = wl[i - 2];
      const s1h = ((vh >>> 19) | (vl << 13)) ^ ((vl >>> 29) | (vh << 3)) ^ (vh >>> 6);
      const s1l = ((vl >>> 19) | (vh << 13)) ^ ((vh >>> 29) | (vl << 3)) ^ ((vl >>> 6) | (vh << 26));
      const lo = (s0l >>> 0) + (s1l >>> 0) + wl[i - 7] + wl[i - 16];
      wl[i] = lo; // Uint32Array への代入で mod 2^32
      wh[i] = (s0h >>> 0) + (s1h >>> 0) + wh[i - 7] + wh[i - 16] + Math.floor(lo / TWO32);
    }

    let ah = hh[0], al = hl[0], bh = hh[1], bl = hl[1];
    let ch = hh[2], cl = hl[2], dh = hh[3], dl = hl[3];
    let eh = hh[4], el = hl[4], fh = hh[5], fl = hl[5];
    let gh = hh[6], gl = hl[6], xh = hh[7], xl = hl[7];
    for (let i = 0; i < 80; i++) {
      // Σ1(e) = rotr14 ^ rotr18 ^ rotr41
      const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
      const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
      const chh = (eh & fh) ^ (~eh & gh);
      const chl = (el & fl) ^ (~el & gl);
      const t1lo = xl + (S1l >>> 0) + (chl >>> 0) + K_LO[i] + wl[i];
      const t1h = (xh + (S1h >>> 0) + (chh >>> 0) + K_HI[i] + wh[i] + Math.floor(t1lo / TWO32)) >>> 0;
      const t1l = t1lo >>> 0;
      // Σ0(a) = rotr28 ^ rotr34 ^ rotr39
      const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
      const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
      const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
      const majl = (al & bl) ^ (al & cl) ^ (bl & cl);
      const t2lo = (S0l >>> 0) + (majl >>> 0);
      const t2h = ((S0h >>> 0) + (majh >>> 0) + Math.floor(t2lo / TWO32)) >>> 0;
      const t2l = t2lo >>> 0;

      xh = gh;
      xl = gl;
      gh = fh;
      gl = fl;
      fh = eh;
      fl = el;
      const elo = dl + t1l;
      eh = (dh + t1h + Math.floor(elo / TWO32)) >>> 0;
      el = elo >>> 0;
      dh = ch;
      dl = cl;
      ch = bh;
      cl = bl;
      bh = ah;
      bl = al;
      const alo = t1l + t2l;
      ah = (t1h + t2h + Math.floor(alo / TWO32)) >>> 0;
      al = alo >>> 0;
    }

    const add = (i, vh, vl) => {
      const lo = hl[i] + vl;
      hh[i] = hh[i] + vh + Math.floor(lo / TWO32);
      hl[i] = lo;
    };
    add(0, ah, al);
    add(1, bh, bl);
    add(2, ch, cl);
    add(3, dh, dl);
    add(4, eh, el);
    add(5, fh, fl);
    add(6, gh, gl);
    add(7, xh, xl);
  }

  const out = new Uint8Array(HASH_BYTES);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    ov.setUint32(i * 8, hh[i]);
    ov.setUint32(i * 8 + 4, hl[i]);
  }
  return out;
}

// ─── 鍵の導出 ([MS-OFFCRYPTO] 2.3.4.11) ───────────────────────────

/** H0 = SHA512(salt + password(UTF-16LE))、Hn = SHA512(iterator(LE 4 バイト) + Hn-1) */
export function derivePasswordHash(password, salt, spinCount = SPIN_COUNT) {
  let h = sha512(concatBytes(salt, utf16le(password)));
  const buf = new Uint8Array(4 + HASH_BYTES);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < spinCount; i++) {
    dv.setUint32(0, i, true);
    buf.set(h, 4);
    h = sha512(buf);
  }
  return h;
}

// SHA512(H + blockKey) の先頭 32 バイト (SHA-512 は 64 バイトなので切るだけ)
function deriveKey(passwordHash, blockKey) {
  return sha512(concatBytes(passwordHash, new Uint8Array(blockKey))).slice(0, KEY_BYTES);
}

// SHA512(salt + blockKey) の先頭 16 バイト
function deriveIv(salt, blockKey) {
  return sha512(concatBytes(salt, blockKey)).slice(0, BLOCK_BYTES);
}

// ─── WebCrypto ────────────────────────────────────────────────────

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("この端末のブラウザでは暗号化を使えません (https で開いてください)");
  return s;
}

function importAesKey(raw) {
  return subtle().importKey("raw", raw, { name: "AES-CBC" }, false, ["encrypt"]);
}

// AES-CBC (詰め物なし)。data は 16 の倍数にそろえて渡す。WebCrypto は PKCS#7 の
// 詰め物を 1 ブロック足すので、その分を落とす (前のブロックの暗号文は変わらない)
async function aesCbcNoPadding(key, iv, data) {
  const k = key instanceof Uint8Array ? await importAesKey(key) : key;
  const out = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv }, k, data));
  return out.slice(0, data.length);
}

async function hmacSha512(key, data) {
  const k = await subtle().importKey("raw", key, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, data));
}

// ─── 中身の暗号化 ([MS-OFFCRYPTO] 2.3.4.15) ──────────────────────

/**
 * EncryptedPackage ストリーム: 元の大きさ (LE 8 バイト) + 4096 バイトごとの暗号文。
 * 区切り i の IV = SHA512(keyData の塩 + i(LE 4 バイト)) の先頭 16 バイト。
 */
async function encryptPackage(plain, secretKey, keySalt) {
  const key = await importAesKey(secretKey);
  const segments = [];
  for (let off = 0, i = 0; off < plain.length; off += SEGMENT_LENGTH, i++) {
    const seg = padTo(plain.subarray(off, off + SEGMENT_LENGTH), BLOCK_BYTES);
    segments.push(await aesCbcNoPadding(key, deriveIv(keySalt, u32le(i)), seg));
  }
  const size = new Uint8Array(8);
  const dv = new DataView(size.buffer);
  dv.setUint32(0, plain.length % TWO32, true);
  dv.setUint32(4, Math.floor(plain.length / TWO32), true);
  return concatBytes(size, ...segments);
}

function encryptionInfoStream(p) {
  const params = (salt) =>
    `saltSize="${SALT_BYTES}" blockSize="${BLOCK_BYTES}" keyBits="${KEY_BYTES * 8}" hashSize="${HASH_BYTES}" ` +
    `cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${toBase64(salt)}"`;
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" ` +
    `xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password" ` +
    `xmlns:c="http://schemas.microsoft.com/office/2006/keyEncryptor/certificate">` +
    `<keyData ${params(p.keySalt)}/>` +
    `<dataIntegrity encryptedHmacKey="${toBase64(p.encryptedHmacKey)}" ` +
    `encryptedHmacValue="${toBase64(p.encryptedHmacValue)}"/>` +
    `<keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password">` +
    `<p:encryptedKey spinCount="${p.spinCount}" ${params(p.passwordSalt)} ` +
    `encryptedVerifierHashInput="${toBase64(p.encryptedVerifierHashInput)}" ` +
    `encryptedVerifierHashValue="${toBase64(p.encryptedVerifierHashValue)}" ` +
    `encryptedKeyValue="${toBase64(p.encryptedKeyValue)}"/>` +
    `</keyEncryptor></keyEncryptors></encryption>`;
  // 版 4.4、フラグ 0x40 (Agile)
  return concatBytes(u16le(4), u16le(4), u32le(0x40), new TextEncoder().encode(xml));
}

// ─── \x06DataSpaces ([MS-OFFCRYPTO] 2.1.5〜2.1.9、2.3.4.1) ─────────

// UNICODE-LP-P4: バイト数 (LE 4 バイト) + UTF-16LE + 4 バイト境界まで 0
function lpString(str) {
  return concatBytes(u32le(str.length * 2), padTo(utf16le(str), 4));
}

// 版 1.0 (reader / updater / writer)
const VERSIONS = concatBytes(u16le(1), u16le(0), u16le(1), u16le(0), u16le(1), u16le(0));

export function dataSpacesStorage() {
  const version = concatBytes(lpString("Microsoft.Container.DataSpaces"), VERSIONS);
  const entry = concatBytes(
    u32le(1), // 参照の数
    u32le(0), // 0 = ストリーム
    lpString("EncryptedPackage"),
    lpString("StrongEncryptionDataSpace")
  );
  const dataSpaceMap = concatBytes(u32le(8), u32le(1), u32le(4 + entry.length), entry);
  const dataSpace = concatBytes(u32le(8), u32le(1), lpString("StrongEncryptionTransform"));
  const transform = concatBytes(u32le(1), lpString("{FF9A3F03-56EF-4613-BDD5-5A41C1D07246}"));
  const primary = concatBytes(
    u32le(4 + transform.length),
    transform,
    lpString("Microsoft.Container.EncryptionTransform"),
    VERSIONS,
    u32le(0), // EncryptionName (空)
    u32le(0), // EncryptionBlockSize
    u32le(0), // CipherMode
    u32le(4) // Reserved
  );
  return {
    name: "\x06DataSpaces",
    children: [
      { name: "Version", content: version },
      { name: "DataSpaceMap", content: dataSpaceMap },
      { name: "DataSpaceInfo", children: [{ name: "StrongEncryptionDataSpace", content: dataSpace }] },
      {
        name: "TransformInfo",
        children: [{ name: "StrongEncryptionTransform", children: [{ name: "\x06Primary", content: primary }] }],
      },
    ],
  };
}

// ─── OLE2 (Compound File Binary, [MS-CFB]) の書き出し ──────────────

const NOSTREAM = 0xffffffff;
const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;
const SECTOR = 512;
const MINI_SECTOR = 64;
const MINI_CUTOFF = 4096;
const DIFAT_IN_HEADER = 109;

// 兄弟の並び ([MS-CFB] 2.6.4): 名前の短い順、同じ長さなら大文字にして比べる
function compareNames(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return A < B ? -1 : A > B ? 1 : 0;
}

/**
 * ストレージとストリームの木を OLE2 コンテナにする (版 3、512 バイトのセクタ)。
 * 4096 バイト未満のストリームはミニストリームに置く。兄弟は名前順の釣り合った
 * 二分木で、ノードは全部黒 ([MS-CFB] 2.6.4 が認める簡略形)。
 * @param {({name: string, content: Uint8Array} | {name: string, children: object[]})[]} children
 * @returns {Uint8Array}
 */
export function writeCompoundFile(children) {
  const recs = [];
  const addRec = (node, type) => {
    if (type !== 5) {
      if (!node.name || node.name.length > 31 || /[/\\:!]/.test(node.name)) {
        throw new Error(`OLE2 の名前に使えない: ${node.name}`);
      }
    }
    const rec = {
      id: recs.length,
      name: node.name,
      type,
      content: type === 2 ? node.content : null,
      left: NOSTREAM,
      right: NOSTREAM,
      child: NOSTREAM,
      start: ENDOFCHAIN,
      size: 0,
    };
    recs.push(rec);
    const kids = (node.children || []).map((c) => addRec(c, Array.isArray(c.children) ? 1 : 2));
    if (kids.length > 0) {
      const sorted = [...kids].sort((a, b) => compareNames(a.name, b.name));
      for (let i = 1; i < sorted.length; i++) {
        if (compareNames(sorted[i - 1].name, sorted[i].name) === 0) throw new Error(`同じ名前: ${sorted[i].name}`);
      }
      const build = (lo, hi) => {
        if (lo > hi) return NOSTREAM;
        const mid = (lo + hi) >> 1;
        const node = sorted[mid];
        node.left = build(lo, mid - 1);
        node.right = build(mid + 1, hi);
        return node.id;
      };
      rec.child = build(0, sorted.length - 1);
    }
    return rec;
  };
  const root = addRec({ name: "Root Entry", children }, 5);

  // ストリームの置き場
  let miniCount = 0;
  const small = [];
  const large = [];
  for (const rec of recs) {
    if (rec.type !== 2) continue;
    rec.size = rec.content.length;
    if (rec.size === 0) continue;
    if (rec.size < MINI_CUTOFF) {
      rec.start = miniCount;
      rec.sectors = Math.ceil(rec.size / MINI_SECTOR);
      miniCount += rec.sectors;
      small.push(rec);
    } else {
      rec.sectors = Math.ceil(rec.size / SECTOR);
      large.push(rec);
    }
  }
  const dirSectors = Math.ceil(recs.length / 4);
  const miniFatSectors = Math.ceil(miniCount / (SECTOR / 4));
  const miniStreamSectors = Math.ceil((miniCount * MINI_SECTOR) / SECTOR);
  const largeSectors = large.reduce((s, r) => s + r.sectors, 0);
  const others = dirSectors + miniFatSectors + miniStreamSectors + largeSectors;
  // FAT 1 セクタで 128 セクタ分。FAT 自身のセクタも数える
  const fatSectors = Math.max(1, Math.ceil(others / (SECTOR / 4 - 1)));
  if (fatSectors > DIFAT_IN_HEADER) throw new Error("ファイルが大きすぎます");

  const fat = new Uint32Array(fatSectors * (SECTOR / 4)).fill(FREESECT);
  const chain = (table, start, n) => {
    for (let i = 0; i < n; i++) table[start + i] = i === n - 1 ? ENDOFCHAIN : start + i + 1;
  };
  for (let i = 0; i < fatSectors; i++) fat[i] = FATSECT;
  let next = fatSectors;
  const dirStart = next;
  chain(fat, dirStart, dirSectors);
  next += dirSectors;
  const miniFatStart = miniFatSectors > 0 ? next : ENDOFCHAIN;
  if (miniFatSectors > 0) chain(fat, next, miniFatSectors);
  next += miniFatSectors;
  const miniStreamStart = miniStreamSectors > 0 ? next : ENDOFCHAIN;
  if (miniStreamSectors > 0) chain(fat, next, miniStreamSectors);
  next += miniStreamSectors;
  for (const rec of large) {
    rec.start = next;
    chain(fat, next, rec.sectors);
    next += rec.sectors;
  }
  const miniFat = new Uint32Array(miniFatSectors * (SECTOR / 4)).fill(FREESECT);
  for (const rec of small) chain(miniFat, rec.start, rec.sectors);
  root.start = miniStreamStart;
  root.size = miniCount * MINI_SECTOR;

  const out = new Uint8Array(SECTOR * (1 + next));
  const dv = new DataView(out.buffer);
  const sectorOffset = (sid) => SECTOR * (1 + sid);

  // ヘッダ
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  dv.setUint16(0x18, 0x003e, true); // minor
  dv.setUint16(0x1a, 3, true); // major (512 バイトのセクタ)
  dv.setUint16(0x1c, 0xfffe, true); // リトルエンディアン
  dv.setUint16(0x1e, 9, true); // セクタ 2^9
  dv.setUint16(0x20, 6, true); // ミニセクタ 2^6
  dv.setUint32(0x2c, fatSectors, true);
  dv.setUint32(0x30, dirStart, true);
  dv.setUint32(0x38, MINI_CUTOFF, true);
  dv.setUint32(0x3c, miniFatStart, true);
  dv.setUint32(0x40, miniFatSectors, true);
  dv.setUint32(0x44, ENDOFCHAIN, true); // DIFAT のセクタなし
  for (let i = 0; i < DIFAT_IN_HEADER; i++) dv.setUint32(0x4c + i * 4, i < fatSectors ? i : FREESECT, true);

  // FAT・ミニ FAT
  fat.forEach((v, i) => dv.setUint32(sectorOffset(0) + i * 4, v, true));
  if (miniFatSectors > 0) miniFat.forEach((v, i) => dv.setUint32(sectorOffset(miniFatStart) + i * 4, v, true));

  // ディレクトリ (128 バイト × セクタあたり 4。余りは空きの項目)
  for (let i = 0; i < dirSectors * 4; i++) {
    const off = sectorOffset(dirStart) + i * 128;
    const rec = recs[i];
    if (!rec) {
      dv.setUint32(off + 0x44, NOSTREAM, true);
      dv.setUint32(off + 0x48, NOSTREAM, true);
      dv.setUint32(off + 0x4c, NOSTREAM, true);
      continue;
    }
    out.set(utf16le(rec.name), off);
    dv.setUint16(off + 0x40, (rec.name.length + 1) * 2, true);
    out[off + 0x42] = rec.type;
    out[off + 0x43] = 1; // 黒
    dv.setUint32(off + 0x44, rec.left, true);
    dv.setUint32(off + 0x48, rec.right, true);
    dv.setUint32(off + 0x4c, rec.child, true);
    dv.setUint32(off + 0x74, rec.type === 1 ? 0 : rec.start, true);
    dv.setUint32(off + 0x78, rec.type === 1 ? 0 : rec.size, true);
  }

  // 中身
  for (const rec of small) out.set(rec.content, sectorOffset(miniStreamStart) + rec.start * MINI_SECTOR);
  for (const rec of large) out.set(rec.content, sectorOffset(rec.start));
  return out;
}

// ─── まとめ ───────────────────────────────────────────────────────

/**
 * .xlsx (などの OOXML) のバイト列を、開くのにパスワードが要るファイルにする。
 * @param {Uint8Array | ArrayBuffer} plain
 * @param {string} password
 * @param {{spinCount?: number, random?: (n: number) => Uint8Array}} [opts]
 *   spinCount はテストで小さくするためだけ (Excel の既定は 100000)。random は乱数の差し替え
 * @returns {Promise<Uint8Array>} OLE2 コンテナ
 */
export async function encryptOfficeFile(plain, password, { spinCount = SPIN_COUNT, random = randomBytes } = {}) {
  if (typeof password !== "string" || password.length === 0) throw new Error("パスワードが空です");
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`パスワードは ${MAX_PASSWORD_LENGTH} 文字までです`);
  }
  const data = plain instanceof Uint8Array ? plain : new Uint8Array(plain);

  const keySalt = random(SALT_BYTES);
  const passwordSalt = random(SALT_BYTES);
  const secretKey = random(KEY_BYTES);
  const verifierInput = random(SALT_BYTES);
  const hmacKey = random(HASH_BYTES);

  // パスワード → 中身の鍵を包む ([MS-OFFCRYPTO] 2.3.4.13)
  const pwHash = derivePasswordHash(password, passwordSalt, spinCount);
  const encryptedVerifierHashInput = await aesCbcNoPadding(
    deriveKey(pwHash, BLK_VERIFIER_INPUT),
    passwordSalt,
    verifierInput
  );
  const encryptedVerifierHashValue = await aesCbcNoPadding(
    deriveKey(pwHash, BLK_VERIFIER_VALUE),
    passwordSalt,
    sha512(verifierInput)
  );
  const encryptedKeyValue = await aesCbcNoPadding(deriveKey(pwHash, BLK_KEY_VALUE), passwordSalt, secretKey);

  // 中身と改ざん検出 ([MS-OFFCRYPTO] 2.3.4.14)
  const encryptedPackage = await encryptPackage(data, secretKey, keySalt);
  const encryptedHmacKey = await aesCbcNoPadding(secretKey, deriveIv(keySalt, BLK_INTEGRITY_KEY), hmacKey);
  const encryptedHmacValue = await aesCbcNoPadding(
    secretKey,
    deriveIv(keySalt, BLK_INTEGRITY_VALUE),
    await hmacSha512(hmacKey, encryptedPackage)
  );

  const encryptionInfo = encryptionInfoStream({
    spinCount,
    keySalt,
    passwordSalt,
    encryptedHmacKey,
    encryptedHmacValue,
    encryptedVerifierHashInput,
    encryptedVerifierHashValue,
    encryptedKeyValue,
  });
  return writeCompoundFile([
    dataSpacesStorage(),
    { name: "EncryptionInfo", content: encryptionInfo },
    { name: "EncryptedPackage", content: encryptedPackage },
  ]);
}
