import { describe, expect, it } from "vitest";
import { encodeShareData, decodeShareData } from "./shareCodec";

// CompressionStream is available in Node 18+ globals
const HAS_COMPRESSION = typeof CompressionStream !== "undefined";

describe.skipIf(!HAS_COMPRESSION)("shareCodec", () => {
  it("round-trips a simple payload", async () => {
    const data = {
      slots: [
        { id: 1, day: "月", time: "18:00-19:00", grade: "中1", cls: "A", room: "301", subj: "英語", teacher: "田中" },
      ],
      substitutions: [
        { id: 10, date: "2026-04-13", slotId: 1, originalTeacher: "田中", substitute: "福武", status: "confirmed", memo: "" },
      ],
      generatedAt: "2026-04-12T10:00:00.000Z",
    };
    const encoded = await encodeShareData(data);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    // Should be URL-safe (no +, /, =)
    expect(encoded).not.toMatch(/[+/=]/);

    const decoded = await decodeShareData(encoded);
    expect(decoded).toEqual(data);
  });

  it("handles empty substitutions", async () => {
    const data = { slots: [], substitutions: [], generatedAt: "2026-04-12T10:00:00.000Z" };
    const encoded = await encodeShareData(data);
    const decoded = await decodeShareData(encoded);
    expect(decoded).toEqual(data);
  });

  it("handles larger payloads (50+ substitutions)", async () => {
    const slots = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      day: "月",
      time: `${17 + Math.floor(i / 6)}:00-${18 + Math.floor(i / 6)}:00`,
      grade: "中1",
      cls: "A",
      room: `${300 + i}`,
      subj: "英語",
      teacher: `先生${i}`,
    }));
    const substitutions = Array.from({ length: 50 }, (_, i) => ({
      id: 100 + i,
      date: `2026-04-${String(13 + Math.floor(i / 5)).padStart(2, "0")}`,
      slotId: (i % 30) + 1,
      originalTeacher: `先生${i % 30}`,
      substitute: `代行${i % 10}`,
      status: i % 2 === 0 ? "confirmed" : "requested",
      memo: i % 3 === 0 ? `メモ${i}` : "",
    }));
    const data = { slots, substitutions, generatedAt: "2026-04-12T10:00:00.000Z" };

    const encoded = await encodeShareData(data);
    // Should compress effectively
    const rawSize = JSON.stringify(data).length;
    expect(encoded.length).toBeLessThan(rawSize);

    const decoded = await decodeShareData(encoded);
    expect(decoded).toEqual(data);
  });

  it("handles Japanese text in memos", async () => {
    const data = {
      slots: [{ id: 1, day: "火", time: "19:00-20:00", grade: "高2", cls: "", room: "亀201", subj: "数学", teacher: "堀上" }],
      substitutions: [
        {
          id: 20,
          date: "2026-04-14",
          slotId: 1,
          originalTeacher: "堀上",
          substitute: "河野",
          status: "confirmed",
          memo: "出張のため代行をお願いします。教材は机の上に置いてあります。",
        },
      ],
      generatedAt: "2026-04-12T10:00:00.000Z",
    };
    const encoded = await encodeShareData(data);
    const decoded = await decodeShareData(encoded);
    expect(decoded).toEqual(data);
  });

  it("rejects corrupted data", async () => {
    await expect(decodeShareData("!!!invalid!!!")).rejects.toThrow();
  });
});
