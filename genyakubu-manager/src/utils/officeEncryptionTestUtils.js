// テスト専用: utils/officeEncryption で暗号化したファイルを、Node の crypto
// (OpenSSL) で仕様 ([MS-OFFCRYPTO] 2.3.4.10〜2.3.4.15) どおりに復号する。
// 暗号化側の同期 SHA-512・WebCrypto とは別の実装で確かめるため、ここでは
// officeEncryption の関数を使わない。アプリからは import しない。
import { Buffer } from "node:buffer";
import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { openCompoundFile } from "./yoteihyo/xlsReader";

const BLK = {
  verifierInput: [0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79],
  verifierValue: [0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e],
  keyValue: [0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6],
  integrityKey: [0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6],
  integrityValue: [0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33],
};

const sha512 = (...parts) => {
  const h = createHash("sha512");
  for (const p of parts) h.update(Buffer.from(p));
  return h.digest();
};

function aesDecrypt(key, iv, data) {
  const d = createDecipheriv(`aes-${key.length * 8}-cbc`, key, iv);
  d.setAutoPadding(false);
  return Buffer.concat([d.update(Buffer.from(data)), d.final()]);
}

function attrs(xml, tag) {
  const m = new RegExp(`<${tag}\\s([^>]*)/?>`).exec(xml);
  if (!m) throw new Error(`${tag} がありません`);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/([\w:]+)="([^"]*)"/g)) out[k] = v;
  return out;
}

/**
 * 暗号化した中身の情報 (EncryptionInfo の XML の属性) を読む。
 * @param {Uint8Array} bytes
 */
export function readEncryptionInfo(bytes) {
  const cfb = openCompoundFile(bytes);
  const info = cfb.get("EncryptionInfo");
  const dv = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const header = { major: dv.getUint16(0, true), minor: dv.getUint16(2, true), flags: dv.getUint32(4, true) };
  const xml = new TextDecoder().decode(info.subarray(8));
  return {
    cfb,
    header,
    xml,
    keyData: attrs(xml, "keyData"),
    dataIntegrity: attrs(xml, "dataIntegrity"),
    encryptedKey: attrs(xml, "p:encryptedKey"),
  };
}

/**
 * パスワードで復号する。パスワードが違えば null。改ざん (HMAC の不一致) は例外。
 * @param {Uint8Array} bytes
 * @param {string} password
 * @returns {Uint8Array | null}
 */
export function decryptOfficeFileForTest(bytes, password) {
  const { cfb, keyData, dataIntegrity, encryptedKey: ek } = readEncryptionInfo(bytes);
  const b64 = (s) => Buffer.from(s, "base64");
  const keyBytes = Number(ek.keyBits) / 8;

  // パスワード → H (spinCount 回)
  const pwSalt = b64(ek.saltValue);
  let h = sha512(pwSalt, Buffer.from(password, "utf16le"));
  const iter = Buffer.alloc(4);
  for (let i = 0; i < Number(ek.spinCount); i++) {
    iter.writeUInt32LE(i, 0);
    h = sha512(iter, h);
  }
  const keyFor = (blk) => sha512(h, blk).subarray(0, keyBytes);

  // パスワードの検証
  const verifierInput = aesDecrypt(keyFor(BLK.verifierInput), pwSalt, b64(ek.encryptedVerifierHashInput));
  const verifierHash = aesDecrypt(keyFor(BLK.verifierValue), pwSalt, b64(ek.encryptedVerifierHashValue));
  if (!sha512(verifierInput.subarray(0, Number(ek.saltSize))).equals(verifierHash.subarray(0, 64))) return null;
  const secretKey = aesDecrypt(keyFor(BLK.keyValue), pwSalt, b64(ek.encryptedKeyValue)).subarray(0, keyBytes);

  // 改ざん検出
  const pkg = Buffer.from(cfb.get("EncryptedPackage"));
  const keySalt = b64(keyData.saltValue);
  const ivFor = (blk) => sha512(keySalt, blk).subarray(0, 16);
  const hmacKey = aesDecrypt(secretKey, ivFor(BLK.integrityKey), b64(dataIntegrity.encryptedHmacKey));
  const hmacValue = aesDecrypt(secretKey, ivFor(BLK.integrityValue), b64(dataIntegrity.encryptedHmacValue));
  const actual = createHmac("sha512", hmacKey.subarray(0, 64)).update(pkg).digest();
  if (!actual.equals(hmacValue.subarray(0, 64))) throw new Error("HMAC が一致しません");

  // 中身 (4096 バイトごと)
  const size = Number(pkg.readBigUInt64LE(0));
  const parts = [];
  for (let off = 8, i = 0; off < pkg.length; off += 4096, i++) {
    const seg = Buffer.alloc(4);
    seg.writeUInt32LE(i, 0);
    parts.push(aesDecrypt(secretKey, sha512(keySalt, seg).subarray(0, 16), pkg.subarray(off, off + 4096)));
  }
  return new Uint8Array(Buffer.concat(parts).subarray(0, size));
}
