import { describe, expect, it } from "vitest";
import {
  compareTeacherNames,
  kanaEntriesFromRegularBuilder,
  mergeTeacherKana,
  missingKanaNames,
  normalizeKana,
  sanitizeKanaMap,
  setTeacherKana,
  sortByTeacherKana,
  sortTeacherNames,
} from "./teacherKana";

describe("normalizeKana", () => {
  it("カタカナをひらがなに揃える", () => {
    expect(normalizeKana("ホリカミ")).toBe("ほりかみ");
  });

  it("半角カナを全角経由でひらがなにする", () => {
    expect(normalizeKana("ﾎﾘｶﾐ")).toBe("ほりかみ");
  });

  it("空白 (全角含む) を落とす", () => {
    expect(normalizeKana("ほり かみ")).toBe("ほりかみ");
    expect(normalizeKana("ほり　かみ")).toBe("ほりかみ");
  });

  it("未設定は空文字", () => {
    expect(normalizeKana("")).toBe("");
    expect(normalizeKana(undefined)).toBe("");
    expect(normalizeKana(null)).toBe("");
  });

  it("濁点付きの半角カナも 1 文字に合成される", () => {
    expect(normalizeKana("ｶﾞﾜ")).toBe(normalizeKana("ガワ"));
  });
});

describe("sanitizeKanaMap", () => {
  it("map でない値は空 map", () => {
    expect(sanitizeKanaMap(null)).toEqual({});
    expect(sanitizeKanaMap([])).toEqual({});
    expect(sanitizeKanaMap("x")).toEqual({});
  });

  it("空のよみは未設定として落とす", () => {
    expect(sanitizeKanaMap({ 堀上: "", 河野: "  ", 香川: "かがわ" })).toEqual({
      香川: "かがわ",
    });
  });

  it("文字列でない値と空の名前を落とす", () => {
    expect(sanitizeKanaMap({ 堀上: 3, "": "から", 河野: "こうの" })).toEqual({
      河野: "こうの",
    });
  });

  it("前後の空白を落とす", () => {
    expect(sanitizeKanaMap({ " 河野 ": " こうの " })).toEqual({ 河野: "こうの" });
  });
});

describe("compareTeacherNames / sortTeacherNames", () => {
  const kana = { 堀上: "ほりかみ", 河野: "こうの", 香川: "かがわ" };

  it("よみのある名前をあいうえお順に並べる (漢字順ではない)", () => {
    expect(sortTeacherNames(["堀上", "河野", "香川"], kana)).toEqual([
      "香川", // かがわ
      "河野", // こうの
      "堀上", // ほりかみ
    ]);
  });

  it("よみが無い名前は後ろに置き、従来どおりの文字列順にする", () => {
    const sorted = sortTeacherNames(["福江", "堀上", "川井", "香川"], kana);
    expect(sorted.slice(0, 2)).toEqual(["香川", "堀上"]);
    // よみ未設定の 2 人は localeCompare("ja") 順のまま後ろ
    expect(sorted.slice(2)).toEqual(["川井", "福江"].sort((a, b) => a.localeCompare(b, "ja")));
  });

  it("よみが無い map でも従来どおりの並びになる (機能を使わない人の見た目を変えない)", () => {
    const names = ["福江", "堀上", "川井"];
    expect(sortTeacherNames(names, {})).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, "ja"))
    );
    expect(sortTeacherNames(names, undefined)).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, "ja"))
    );
  });

  it("カタカナ・半角カナで登録しても同じ順になる", () => {
    const mixed = { 堀上: "ﾎﾘｶﾐ", 河野: "コウノ", 香川: "かがわ" };
    expect(sortTeacherNames(["堀上", "河野", "香川"], mixed)).toEqual([
      "香川",
      "河野",
      "堀上",
    ]);
  });

  it("濁点だけ違うよみは名前で安定する", () => {
    const cmp = compareTeacherNames({ 佐藤: "さとう", 佐渡: "さとう" });
    expect(cmp("佐藤", "佐渡")).toBe("佐藤".localeCompare("佐渡", "ja"));
  });

  it("元の配列を変更しない", () => {
    const names = ["堀上", "香川"];
    sortTeacherNames(names, kana);
    expect(names).toEqual(["堀上", "香川"]);
  });
});

describe("sortByTeacherKana", () => {
  it("name を持つオブジェクトをよみ順に並べる", () => {
    const staff = [{ name: "堀上" }, { name: "香川" }, { name: "河野" }];
    const kana = { 堀上: "ほりかみ", 河野: "こうの", 香川: "かがわ" };
    expect(sortByTeacherKana(staff, kana).map((s) => s.name)).toEqual([
      "香川",
      "河野",
      "堀上",
    ]);
  });

  it("名前の取り出し方を差し替えられる", () => {
    const rows = [{ teacher: "堀上" }, { teacher: "香川" }];
    const sorted = sortByTeacherKana(rows, { 香川: "かがわ", 堀上: "ほりかみ" }, (r) => r.teacher);
    expect(sorted.map((r) => r.teacher)).toEqual(["香川", "堀上"]);
  });

  it("元の配列を変更しない", () => {
    const staff = [{ name: "堀上" }, { name: "香川" }];
    sortByTeacherKana(staff, { 香川: "かがわ", 堀上: "ほりかみ" });
    expect(staff.map((s) => s.name)).toEqual(["堀上", "香川"]);
  });
});

describe("missingKanaNames", () => {
  it("よみが引けない名前だけを入力順で返す", () => {
    expect(missingKanaNames(["堀上", "川井", "香川"], { 堀上: "ほりかみ" })).toEqual([
      "川井",
      "香川",
    ]);
  });

  it("重複を除く", () => {
    expect(missingKanaNames(["川井", "川井"], {})).toEqual(["川井"]);
  });

  it("空のよみは未設定として扱う", () => {
    expect(missingKanaNames(["堀上"], { 堀上: "   " })).toEqual(["堀上"]);
  });
});

describe("setTeacherKana", () => {
  it("よみを設定する", () => {
    expect(setTeacherKana({}, "堀上", "ほりかみ")).toEqual({ 堀上: "ほりかみ" });
  });

  it("空文字はキーごと削除して未設定に戻す", () => {
    expect(setTeacherKana({ 堀上: "ほりかみ" }, "堀上", "")).toEqual({});
    expect(setTeacherKana({ 堀上: "ほりかみ" }, "堀上", "   ")).toEqual({});
  });

  it("元の map を変更しない", () => {
    const map = { 堀上: "ほりかみ" };
    setTeacherKana(map, "香川", "かがわ");
    expect(map).toEqual({ 堀上: "ほりかみ" });
  });

  it("名前が空なら何もしない", () => {
    expect(setTeacherKana({ 堀上: "ほりかみ" }, "  ", "かな")).toEqual({
      堀上: "ほりかみ",
    });
  });
});

describe("mergeTeacherKana", () => {
  it("未設定の講師にだけよみを入れる", () => {
    const { map, added, skipped } = mergeTeacherKana({ 堀上: "ほりかみ" }, [
      { name: "堀上", kana: "ちがうよみ" },
      { name: "香川", kana: "かがわ" },
    ]);
    expect(map).toEqual({ 堀上: "ほりかみ", 香川: "かがわ" });
    expect(added).toBe(1);
    expect(skipped).toBe(1);
  });

  it("同じよみが既に入っている場合は skipped に数えない", () => {
    const { added, skipped } = mergeTeacherKana({ 堀上: "ほりかみ" }, [
      { name: "堀上", kana: "ほりかみ" },
    ]);
    expect(added).toBe(0);
    expect(skipped).toBe(0);
  });

  it("名前・よみが欠けた項目は無視する", () => {
    const { map, added } = mergeTeacherKana({}, [
      { name: "香川" },
      { kana: "かがわ" },
      null,
      { name: "河野", kana: "こうの" },
    ]);
    expect(map).toEqual({ 河野: "こうの" });
    expect(added).toBe(1);
  });

  it("元の map を変更しない", () => {
    const map = { 堀上: "ほりかみ" };
    mergeTeacherKana(map, [{ name: "香川", kana: "かがわ" }]);
    expect(map).toEqual({ 堀上: "ほりかみ" });
  });
});

describe("kanaEntriesFromRegularBuilder", () => {
  it("ワークスペース内の全プロジェクトからよみを集める", () => {
    const ws = {
      projects: [
        { id: 1, teachers: [{ name: "堀上", kana: "ほりかみ" }] },
        { id: 2, teachers: [{ name: "河野", kana: "こうの" }] },
      ],
    };
    expect(kanaEntriesFromRegularBuilder(ws)).toEqual([
      { name: "堀上", kana: "ほりかみ" },
      { name: "河野", kana: "こうの" },
    ]);
  });

  it("同じ名前が複数プロジェクトにあれば先に見つかった方を採る", () => {
    const ws = {
      projects: [
        { id: 1, teachers: [{ name: "堀上", kana: "ほりかみ" }] },
        { id: 2, teachers: [{ name: "堀上", kana: "べつのよみ" }] },
      ],
    };
    expect(kanaEntriesFromRegularBuilder(ws)).toEqual([
      { name: "堀上", kana: "ほりかみ" },
    ]);
  });

  it("よみの無い講師は含めない", () => {
    const ws = { projects: [{ teachers: [{ name: "堀上" }, { name: "河野", kana: "こうの" }] }] };
    expect(kanaEntriesFromRegularBuilder(ws)).toEqual([{ name: "河野", kana: "こうの" }]);
  });

  it("ワークスペース化する前の単体プロジェクト形式も読める", () => {
    const legacy = { tabs: [], teachers: [{ name: "香川", kana: "かがわ" }] };
    expect(kanaEntriesFromRegularBuilder(legacy)).toEqual([
      { name: "香川", kana: "かがわ" },
    ]);
  });

  it("下書きが無い / 壊れていても空配列", () => {
    expect(kanaEntriesFromRegularBuilder(null)).toEqual([]);
    expect(kanaEntriesFromRegularBuilder("x")).toEqual([]);
    expect(kanaEntriesFromRegularBuilder({})).toEqual([]);
    expect(kanaEntriesFromRegularBuilder({ projects: [{}] })).toEqual([]);
  });
});
