// Excel を開くのにパスワードが要るファイルにする (utils/officeEncryption)。
// 復号は Node の crypto で別に書いたもの (officeEncryptionTestUtils) で確かめる。
import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  MAX_PASSWORD_LENGTH,
  SPIN_COUNT,
  dataSpacesStorage,
  derivePasswordHash,
  encryptOfficeFile,
  sha512,
  writeCompoundFile,
} from "./officeEncryption";
import { decryptOfficeFileForTest, readEncryptionInfo } from "./officeEncryptionTestUtils";
import { isCompoundFile, openCompoundFile } from "./yoteihyo/xlsReader";

const nodeSha512 = (b) => new Uint8Array(createHash("sha512").update(b).digest());
const bytesOf = (n, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7) & 0xff);

describe("sha512", () => {
  it("Node (OpenSSL) の SHA-512 と同じ (ブロックの境目の前後を含む)", () => {
    for (const n of [0, 1, 3, 55, 56, 63, 64, 68, 111, 112, 127, 128, 129, 239, 240, 1000, 5000]) {
      expect(sha512(bytesOf(n, n))).toEqual(nodeSha512(bytesOf(n, n)));
    }
  });
  it("既知の値 (FIPS 180-2 の \"abc\")", () => {
    expect(Buffer.from(sha512(new TextEncoder().encode("abc"))).toString("hex")).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
        "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
    );
  });
});

describe("derivePasswordHash", () => {
  it("H0 = SHA512(塩 + パスワード (UTF-16LE))、Hn = SHA512(n (LE 4 バイト) + Hn-1)", () => {
    const salt = bytesOf(16);
    let h = createHash("sha512").update(salt).update(Buffer.from("ishihara", "utf16le")).digest();
    for (let i = 0; i < 50; i++) {
      const iter = Buffer.alloc(4);
      iter.writeUInt32LE(i, 0);
      h = createHash("sha512").update(iter).update(h).digest();
    }
    expect(derivePasswordHash("ishihara", salt, 50)).toEqual(new Uint8Array(h));
  });
});

describe("encryptOfficeFile", () => {
  // 4096 バイトの区切りをまたぐ大きさ (最後の区切りは 16 の倍数でない)
  const plain = bytesOf(10_000, 3);

  it("正しいパスワードで元のバイト列に戻り、違うパスワードでは戻らない", async () => {
    const enc = await encryptOfficeFile(plain, "ishihara", { spinCount: 100 });
    expect(isCompoundFile(enc)).toBe(true);
    expect(decryptOfficeFileForTest(enc, "ishihara")).toEqual(plain);
    expect(decryptOfficeFileForTest(enc, "Ishihara")).toBeNull();
    expect(decryptOfficeFileForTest(enc, "")).toBeNull();
  });

  it("日本語のパスワードも UTF-16LE で扱う", async () => {
    const enc = await encryptOfficeFile(plain.subarray(0, 100), "石原・給与", { spinCount: 10 });
    expect(decryptOfficeFileForTest(enc, "石原・給与")).toEqual(plain.subarray(0, 100));
  });

  it("EncryptionInfo は Agile (版 4.4・フラグ 0x40)、AES-256 + SHA-512、既定 100000 回", async () => {
    const enc = await encryptOfficeFile(plain.subarray(0, 10), "pw", { spinCount: 7 });
    const info = readEncryptionInfo(enc);
    expect(info.header).toEqual({ major: 4, minor: 4, flags: 0x40 });
    expect(info.keyData).toMatchObject({ cipherAlgorithm: "AES", keyBits: "256", hashAlgorithm: "SHA512" });
    expect(info.encryptedKey).toMatchObject({ spinCount: "7", cipherChaining: "ChainingModeCBC" });
    expect(SPIN_COUNT).toBe(100000);
  });

  it("同じ中身・同じパスワードでも毎回違う暗号文 (塩・鍵は乱数)", async () => {
    const a = await encryptOfficeFile(plain, "pw", { spinCount: 1 });
    const b = await encryptOfficeFile(plain, "pw", { spinCount: 1 });
    expect(openCompoundFile(a).get("EncryptedPackage")).not.toEqual(openCompoundFile(b).get("EncryptedPackage"));
  });

  it("中身を書き換えると HMAC で分かる", async () => {
    const enc = await encryptOfficeFile(plain, "pw", { spinCount: 1 });
    // EncryptedPackage は 4096 バイト以上なので通常のセクタ。末尾近くの 1 バイトを変える
    const tampered = enc.slice();
    tampered[tampered.length - 600] ^= 0xff;
    expect(() => decryptOfficeFileForTest(tampered, "pw")).toThrow("HMAC");
  });

  it("空のパスワード・長すぎるパスワードは受け付けない", async () => {
    await expect(encryptOfficeFile(plain, "")).rejects.toThrow("パスワード");
    await expect(encryptOfficeFile(plain, "x".repeat(MAX_PASSWORD_LENGTH + 1), { spinCount: 1 })).rejects.toThrow(
      `${MAX_PASSWORD_LENGTH} 文字`
    );
  });
});

describe("writeCompoundFile", () => {
  // ディレクトリ (このモジュールは連続したセクタに置く) を読み、Root から木を
  // たどって見つかる名前のパスを返す。兄弟が名前順の二分探索木になっているかも見る
  function walkTree(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dirOff = 512 * (1 + dv.getUint32(0x30, true));
    const entry = (id) => {
      const off = dirOff + id * 128;
      const nameLen = dv.getUint16(off + 0x40, true);
      let name = "";
      for (let i = 0; i < nameLen / 2 - 1; i++) name += String.fromCharCode(dv.getUint16(off + i * 2, true));
      return {
        name,
        type: bytes[off + 0x42],
        left: dv.getUint32(off + 0x44, true),
        right: dv.getUint32(off + 0x48, true),
        child: dv.getUint32(off + 0x4c, true),
      };
    };
    const NONE = 0xffffffff;
    const key = (n) => [n.length, n.toUpperCase()];
    const less = (a, b) => key(a)[0] < key(b)[0] || (key(a)[0] === key(b)[0] && key(a)[1] < key(b)[1]);
    const paths = [];
    const visitSiblings = (id, prefix) => {
      const names = [];
      const inorder = (x) => {
        if (x === NONE) return;
        const e = entry(x);
        inorder(e.left);
        names.push(e.name);
        paths.push([...prefix, e.name].join("/"));
        if (e.type === 1) visitSiblings(e.child, [...prefix, e.name]);
        inorder(e.right);
      };
      inorder(id);
      for (let i = 1; i < names.length; i++) expect(less(names[i - 1], names[i])).toBe(true);
    };
    const root = entry(0);
    expect(root).toMatchObject({ name: "Root Entry", type: 5 });
    visitSiblings(root.child, []);
    return paths.sort();
  }

  it("暗号化したファイルの木: \\x06DataSpaces・EncryptionInfo・EncryptedPackage", async () => {
    const enc = await encryptOfficeFile(bytesOf(5000), "pw", { spinCount: 1 });
    expect(walkTree(enc)).toEqual(
      [
        "\x06DataSpaces",
        "\x06DataSpaces/DataSpaceInfo",
        "\x06DataSpaces/DataSpaceInfo/StrongEncryptionDataSpace",
        "\x06DataSpaces/DataSpaceMap",
        "\x06DataSpaces/TransformInfo",
        "\x06DataSpaces/TransformInfo/StrongEncryptionTransform",
        "\x06DataSpaces/TransformInfo/StrongEncryptionTransform/\x06Primary",
        "\x06DataSpaces/Version",
        "EncryptedPackage",
        "EncryptionInfo",
      ].sort()
    );
  });

  it("4096 バイト未満はミニストリーム、以上は通常のセクタに置き、どちらも読み戻せる", () => {
    const small = bytesOf(100, 1);
    const edge = bytesOf(4095, 2);
    const big = bytesOf(4096, 3);
    const huge = bytesOf(70_000, 4);
    const file = writeCompoundFile([
      { name: "Small", content: small },
      { name: "Edge", content: edge },
      { name: "Big", content: big },
      { name: "Huge", content: huge },
      { name: "Store", children: [{ name: "Inner", content: small }] },
    ]);
    const cfb = openCompoundFile(file);
    expect(cfb.get("Small")).toEqual(small);
    expect(cfb.get("Edge")).toEqual(edge);
    expect(cfb.get("Big")).toEqual(big);
    expect(cfb.get("Huge")).toEqual(huge);
    expect(cfb.get("Inner")).toEqual(small);
    expect(walkTree(file)).toEqual(["Big", "Edge", "Huge", "Small", "Store", "Store/Inner"]);
  });

  it("兄弟の名前の重複・使えない文字は止める", () => {
    expect(() =>
      writeCompoundFile([
        { name: "A", content: bytesOf(1) },
        { name: "a", content: bytesOf(1) },
      ])
    ).toThrow("同じ名前");
    expect(() => writeCompoundFile([{ name: "a/b", content: bytesOf(1) }])).toThrow("名前");
  });

  it("\\x06DataSpaces の中身は [MS-OFFCRYPTO] の決まりの形", () => {
    const ds = dataSpacesStorage();
    const flat = {};
    const walk = (n) => {
      if (n.content) flat[n.name] = Buffer.from(n.content);
      (n.children || []).forEach(walk);
    };
    walk(ds);
    const utf16 = (s) => Buffer.from(s, "utf16le");
    expect(flat.Version.readUInt32LE(0)).toBe(60);
    expect(flat.Version.subarray(4, 64)).toEqual(utf16("Microsoft.Container.DataSpaces"));
    expect(flat.DataSpaceMap.includes(utf16("EncryptedPackage"))).toBe(true);
    expect(flat.DataSpaceMap.readUInt32LE(8)).toBe(flat.DataSpaceMap.length - 8);
    expect(flat.StrongEncryptionDataSpace.includes(utf16("StrongEncryptionTransform"))).toBe(true);
    expect(flat["\x06Primary"].readUInt32LE(0)).toBe(88);
    expect(flat["\x06Primary"].includes(utf16("{FF9A3F03-56EF-4613-BDD5-5A41C1D07246}"))).toBe(true);
    expect(flat["\x06Primary"].readUInt32LE(flat["\x06Primary"].length - 4)).toBe(4);
  });
});
