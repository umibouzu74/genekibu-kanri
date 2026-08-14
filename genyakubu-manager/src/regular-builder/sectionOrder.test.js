import { describe, expect, it } from "vitest";
import { compareStackKey, makeStackOrderKey } from "./sectionOrder";

const tab = (id, name, over = {}) => ({ id, name, grade: name, ...over });

// makeStackOrderKey が見るのは tabs / auto / campus だけ
const section = (tabs, over = {}) => ({ tabs, auto: true, ...over });

describe("makeStackOrderKey", () => {
  const project = {
    tabs: [tab(1, "中3"), tab(2, "高1"), tab(3, "高3"), tab(4, "中1")],
  };
  const sorted = (sections) => {
    const key = makeStackOrderKey(project);
    return [...sections]
      .sort((a, b) => compareStackKey(key(a), key(b)))
      .map((s) => s.tabs.map((t) => t.name).join("・"));
  };

  it("中学部 → 混在 → 高校部の順に並べる", () => {
    expect(
      sorted([
        section([tab(3, "高3")]),
        section([tab(1, "中3"), tab(2, "高1")]),
        section([tab(4, "中1")]),
      ])
    ).toEqual(["中1", "中3・高1", "高3"]);
  });

  it("同じ部の中はタブ定義順 (曜日での検出順ではない)", () => {
    expect(sorted([section([tab(3, "高3")]), section([tab(2, "高1")])])).toEqual([
      "高1",
      "高3",
    ]);
  });

  it("同順位のタイブレークは本校 → 亀井町", () => {
    const main = section([tab(2, "高1", { campus: "main" })], { campus: "main" });
    const annex = section([tab(2, "高1", { campus: "annex" })], { campus: "annex" });
    expect(sorted([annex, main])).toEqual(["高1", "高1"]);
    const key = makeStackOrderKey(project);
    expect(compareStackKey(key(main), key(annex))).toBeLessThan(0);
  });

  it("手動グループはその曜日に居ないタブも含めた定義順で測る", () => {
    // 「その曜日での検出順」だと曜日ごとに順序が変わってしまうため、
    // グループの順位はプロジェクト全体の定義順 (= 高1 の 1) で決まる
    const p = {
      tabs: [
        tab(1, "中3"),
        tab(2, "高1", { group: "高校部" }),
        tab(3, "高3", { group: "高校部" }),
      ],
    };
    const key = makeStackOrderKey(p);
    // 高3 だけが居る曜日でも、グループ全体の定義順 (高1 = index 1) を使う
    const only高3 = { tabs: [tab(3, "高3", { group: "高校部" })], auto: false };
    const both = {
      tabs: [tab(2, "高1", { group: "高校部" }), tab(3, "高3", { group: "高校部" })],
      auto: false,
    };
    expect(key(only高3)[1]).toBe(key(both)[1]);
  });

  it("マスタから消えたタブがあっても壊れない (定義順は末尾扱い)", () => {
    const key = makeStackOrderKey(project);
    expect(Number.isNaN(key(section([tab(99, "中2")]))[1])).toBe(false);
  });
});
