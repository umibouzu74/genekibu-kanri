import { describe, expect, it } from "vitest";
import {
  deriveTagFiltersForTeacher,
  slotMatchesTag,
} from "./teacherTags";

const slot = (over = {}) => ({
  id: 1,
  day: "月",
  time: "19:00-20:00",
  grade: "高1",
  cls: "",
  room: "401",
  subj: "高松西 数学",
  teacher: "杉原",
  note: "",
  ...over,
});

describe("slotMatchesTag", () => {
  it("subj に含まれる学校名タグにマッチする", () => {
    expect(slotMatchesTag(slot({ subj: "高松桜井 数学" }), "桜井")).toBe(true);
    expect(slotMatchesTag(slot({ subj: "高松西 英語" }), "桜井")).toBe(false);
  });

  it("grade に含まれるタグにマッチする (附中・学年)", () => {
    expect(slotMatchesTag(slot({ grade: "附中2", subj: "英語" }), "附中")).toBe(true);
    expect(slotMatchesTag(slot({ grade: "高1高2", subj: "高予備プレップ" }), "高1")).toBe(true);
    expect(slotMatchesTag(slot({ grade: "中3", subj: "社会" }), "附中")).toBe(false);
  });

  it("部単位タグ (中学/高校) は gradeToDept で判定する", () => {
    expect(slotMatchesTag(slot({ grade: "中2", subj: "国語" }), "中学")).toBe(true);
    expect(slotMatchesTag(slot({ grade: "附中1", subj: "理科" }), "中学")).toBe(true);
    expect(slotMatchesTag(slot({ grade: "高3", subj: "共テ物理" }), "中学")).toBe(false);
    expect(slotMatchesTag(slot({ grade: "高2", subj: "高松高 化学" }), "高校")).toBe(true);
    expect(slotMatchesTag(slot({ grade: "中1", subj: "英語" }), "高校")).toBe(false);
  });

  it("表記ゆらぎ: subj '高松一' はタグ '第一' にマッチする", () => {
    expect(slotMatchesTag(slot({ subj: "高松一 英語" }), "第一")).toBe(true);
    expect(slotMatchesTag(slot({ subj: "高松西 英語" }), "第一")).toBe(false);
  });

  it("空タグ・空 slot は false", () => {
    expect(slotMatchesTag(slot(), "")).toBe(false);
    expect(slotMatchesTag(null, "桜井")).toBe(false);
  });
});

describe("deriveTagFiltersForTeacher", () => {
  const slots = [
    slot({ id: 1, subj: "高松桜井 数学", teacher: "小見山" }),
    slot({ id: 2, subj: "高松一 英語", teacher: "石原" }),
    slot({ id: 3, grade: "中2", subj: "理科", teacher: "小見山" }),
    slot({ id: 4, grade: "中3", subj: "英/数", teacher: "南條", note: "隔週(江本)" }),
  ];

  it("担当コマに関係するタグは ON (キー無し)、無関係は OFF (false)", () => {
    const filters = deriveTagFiltersForTeacher({
      teacher: "小見山",
      slots,
      tags: ["桜井", "第一", "中学"],
    });
    // 桜井 (id:1) と 中学 (id:3) は担当 → ON、第一は他講師のみ → OFF
    expect(filters).toEqual({ 第一: false });
  });

  it("エイリアス表記のタグも担当判定される (第一 ⇔ 高松一)", () => {
    const filters = deriveTagFiltersForTeacher({
      teacher: "石原",
      slots,
      tags: ["桜井", "第一", "中学"],
    });
    expect(filters).toEqual({ 桜井: false, 中学: false });
  });

  it("どのコマにもマッチしないタグ (行事名等) は触らない = ON のまま", () => {
    const filters = deriveTagFiltersForTeacher({
      teacher: "小見山",
      slots,
      tags: ["文化祭"],
    });
    expect(filters).toEqual({});
  });

  it("隔週パートナー (note の 隔週(X)) の担当も本人のコマとして扱う", () => {
    const filters = deriveTagFiltersForTeacher({
      teacher: "江本",
      slots,
      tags: ["中学", "桜井"],
    });
    // id:4 (中3, 隔週(江本)) が担当扱い → 中学 ON、桜井は無関係 → OFF
    expect(filters).toEqual({ 桜井: false });
  });

  it("担当コマゼロの講師は、判定可能なタグが全て OFF になる", () => {
    const filters = deriveTagFiltersForTeacher({
      teacher: "誰も知らない",
      slots,
      tags: ["桜井", "中学", "文化祭"],
    });
    expect(filters).toEqual({ 桜井: false, 中学: false });
  });

  it("引数が欠けていても安全に空を返す", () => {
    expect(deriveTagFiltersForTeacher({ teacher: "", slots, tags: ["桜井"] })).toEqual({});
    expect(deriveTagFiltersForTeacher({ teacher: "小見山", slots: null, tags: ["桜井"] })).toEqual({});
    expect(deriveTagFiltersForTeacher({ teacher: "小見山", slots, tags: null })).toEqual({});
  });
});
