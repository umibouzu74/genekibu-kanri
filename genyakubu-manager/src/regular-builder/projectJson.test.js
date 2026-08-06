import { describe, expect, it } from "vitest";
import {
  PROJECT_JSON_KIND,
  parseProjectJson,
  projectFileName,
  serializeProject,
} from "./projectJson";
import { addSnapshot, makeCellKey, sanitizeProject } from "./model";
import { makeProject } from "./testUtils";

describe("serializeProject / parseProjectJson", () => {
  it("round-trip する (id は含めない・スナップショットは保持)", () => {
    const p = addSnapshot({ id: 7, ...makeProject() }, "案 1", 123);
    const text = serializeProject(p, "2026-08-05T00:00:00.000Z");
    const envelope = JSON.parse(text);
    expect(envelope.kind).toBe(PROJECT_JSON_KIND);
    expect(envelope.project.id).toBeUndefined();

    const result = parseProjectJson(text);
    expect(result.error).toBeUndefined();
    expect(result.project.name).toBe("2026 後期");
    expect(result.project.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
    expect(result.project.snapshots).toHaveLength(1);
    // sanitizeProject を通した形と一致する (不正要素なしのため実質同一)
    const { id: _id, ...data } = p;
    expect(result.project).toEqual(sanitizeProject(data));
  });

  it("封筒なしの生プロジェクト JSON も受ける", () => {
    const result = parseProjectJson(JSON.stringify(makeProject()));
    expect(result.error).toBeUndefined();
    expect(result.project.name).toBe("2026 後期");
  });

  it("壊れた JSON・別物の JSON はエラー文字列を返す", () => {
    expect(parseProjectJson("{oops").error).toContain("JSON");
    expect(parseProjectJson("null").error).toContain("プロジェクト JSON");
    expect(parseProjectJson("[1,2]").error).toContain("プロジェクト JSON");
    // tabs の無いオブジェクト (講習ビルダーの保存など) は受けない
    expect(parseProjectJson('{"name":"x"}').error).toContain("プロジェクト JSON");
  });

  it("不正な中身は sanitize されて通る", () => {
    const text = JSON.stringify({
      kind: PROJECT_JSON_KIND,
      project: {
        name: "x",
        tabs: [{ name: 5, days: ["月", "?"], schedule: { a: { subj: 1 } } }],
      },
    });
    const { project } = parseProjectJson(text);
    expect(project.tabs[0].days).toEqual(["月"]);
    expect(project.tabs[0].schedule).toEqual({});
  });
});

describe("projectFileName", () => {
  it("プロジェクト名と日付からファイル名を作る (禁止文字は置換)", () => {
    const d = new Date(2026, 7, 5); // 2026-08-05
    expect(projectFileName("2026 2学期", d)).toBe(
      "通常時間割_2026 2学期_2026-08-05.json"
    );
    expect(projectFileName('a/b:c*d?"<>|', d)).toBe(
      "通常時間割_a_b_c_d______2026-08-05.json"
    );
    expect(projectFileName("", d)).toBe("通常時間割_無題_2026-08-05.json");
  });
});
