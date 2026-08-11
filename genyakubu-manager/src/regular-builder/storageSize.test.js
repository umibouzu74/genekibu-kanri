import { describe, expect, it } from "vitest";
import { formatBytes, jsonByteSize, projectStorageSize } from "./storageSize";
import { addSnapshot } from "./model";
import { makeProject } from "./testUtils";

describe("jsonByteSize", () => {
  it("UTF-8 バイト数を返す (日本語は 1 文字 3 バイト)", () => {
    expect(jsonByteSize("a")).toBe(3); // '"a"'
    expect(jsonByteSize("あ")).toBe(5); // '"' + 3 + '"'
    expect(jsonByteSize({})).toBe(2);
  });

  it("循環参照は 0 (落とさない)", () => {
    const a = {};
    a.self = a;
    expect(jsonByteSize(a)).toBe(0);
  });
});

describe("formatBytes", () => {
  it("単位を切り替える", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });

  it("不正値は 0 B", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });
});

describe("projectStorageSize", () => {
  it("本体とスナップショットの内訳を出す", () => {
    const p = makeProject();
    const bare = projectStorageSize(p);
    expect(bare.snapshots).toBe(0);
    expect(bare.body).toBe(bare.total);

    const withSnap = addSnapshot(p, "案 1", 1000);
    const size = projectStorageSize(withSnap);
    expect(size.total).toBeGreaterThan(bare.total);
    expect(size.snapshots).toBeGreaterThan(0);
    expect(size.body + size.snapshots).toBe(size.total);
    expect(size.snapshotSizes).toHaveLength(1);
    expect(size.snapshotSizes[0]).toMatchObject({ id: 1, name: "案 1" });
    expect(size.snapshotSizes[0].bytes).toBeGreaterThan(0);
  });

  it("スナップショットが増えるほど大きくなる", () => {
    const one = projectStorageSize(addSnapshot(makeProject(), "a", 1));
    const two = projectStorageSize(
      addSnapshot(addSnapshot(makeProject(), "a", 1), "b", 2)
    );
    expect(two.snapshots).toBeGreaterThan(one.snapshots);
    expect(two.snapshotSizes).toHaveLength(2);
  });

  it("空・未定義でも落ちない", () => {
    expect(projectStorageSize(null).total).toBe(0);
    expect(projectStorageSize({}).snapshotSizes).toEqual([]);
  });
});
