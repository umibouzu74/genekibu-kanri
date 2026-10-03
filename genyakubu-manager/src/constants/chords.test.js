// g チョードの定義と、その短ラベル (待機中バッジ) の突き合わせ。
// 2026-10-03: g j (授業時間の集計) を足したときに VIEW_CHORD_LABEL への
// 追加を忘れ、g を押した後のバッジにだけ出てこなかった
import { describe, expect, it } from "vitest";
import { VIEW_CHORD_BY_VIEW, VIEW_CHORD_LABEL, VIEW_CHORDS } from "./chords";
import { VIEWS } from "./views";

describe("VIEW_CHORDS", () => {
  it("待機中バッジの短ラベルがすべての chord にある (余分も無い)", () => {
    expect(Object.keys(VIEW_CHORD_LABEL).sort()).toEqual(Object.keys(VIEW_CHORDS).sort());
  });

  it("どの chord も実在のビューを指し、ビューごとに 1 つ", () => {
    const views = Object.values(VIEWS);
    for (const v of Object.values(VIEW_CHORDS)) expect(views).toContain(v);
    expect(VIEW_CHORD_BY_VIEW.size).toBe(Object.keys(VIEW_CHORDS).length);
    expect(VIEW_CHORD_BY_VIEW.get(VIEWS.MINUTES)).toBe("j");
  });
});
