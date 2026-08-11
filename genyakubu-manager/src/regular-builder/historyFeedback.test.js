import { describe, expect, it } from "vitest";
import {
  describeHistoryChange,
  diffWorkspaces,
  formatCellShort,
} from "./historyFeedback";

const baseProject = () => ({
  id: 1,
  version: 1,
  name: "P1",
  periods: [
    { id: 1, label: "1限", time: "18:00-18:45" },
    { id: 2, label: "2限", time: "18:55-19:40" },
  ],
  subjects: ["英語", "数学"],
  teachers: [{ name: "田中" }],
  tabs: [
    {
      id: 1,
      name: "中3",
      grade: "中3",
      group: "",
      classes: [{ id: 1, label: "S", room: "501" }],
      days: ["月", "火"],
      periodIds: [1, 2],
      schedule: {},
    },
  ],
});

const ws = (project) => ({ version: 2, activeProjectId: 1, projects: [project] });

const withCell = (project, key, cell) => {
  const p = JSON.parse(JSON.stringify(project));
  if (cell) p.tabs[0].schedule[key] = cell;
  else delete p.tabs[0].schedule[key];
  return p;
};

describe("diffWorkspaces", () => {
  it("セルの追加を 1 件の cellChange として検出し、ラベルを解決する", () => {
    const before = ws(baseProject());
    const after = ws(
      withCell(baseProject(), "火|1|1", { subj: "数学", teacher: "田中" })
    );
    const diff = diffWorkspaces(before, after);
    expect(diff.otherChanges).toEqual([]);
    expect(diff.cellChanges).toHaveLength(1);
    const c = diff.cellChanges[0];
    expect(c).toMatchObject({
      projectId: 1,
      tabId: 1,
      tabName: "中3",
      ref: "1:火|1|1",
      day: "火",
      periodLabel: "1限",
      clsLabel: "S",
      before: null,
      after: { subj: "数学", teacher: "田中" },
    });
  });

  it("セルの変更・削除も before/after 付きで検出する", () => {
    const before = ws(withCell(baseProject(), "月|2|1", { subj: "英語" }));
    const mid = withCell(baseProject(), "月|2|1", { subj: "数学" });
    const after = ws(withCell(mid, "火|1|1", null));
    const diff = diffWorkspaces(before, after);
    expect(diff.cellChanges).toHaveLength(1);
    expect(diff.cellChanges[0].before).toEqual({ subj: "英語" });
    expect(diff.cellChanges[0].after).toEqual({ subj: "数学" });
  });

  it("時限・講師マスタ・学年設定の変更をフィールド名で要約する", () => {
    const before = ws(baseProject());
    const p = baseProject();
    p.periods[0].time = "17:00-17:45";
    p.teachers.push({ name: "山田" });
    p.tabs[0].days = ["月"];
    const diff = diffWorkspaces(before, ws(p));
    expect(diff.cellChanges).toEqual([]);
    expect(diff.otherChanges).toEqual(["時限設定", "講師マスタ", "学年設定"]);
  });

  it("プロジェクトの追加/削除・学年の追加/削除・並び替えを検出する", () => {
    const two = {
      version: 2,
      activeProjectId: 1,
      projects: [baseProject(), { ...baseProject(), id: 2, name: "P2" }],
    };
    expect(diffWorkspaces(ws(baseProject()), two).otherChanges).toEqual([
      "プロジェクトの追加/削除",
    ]);

    const p = baseProject();
    p.tabs.push({ ...p.tabs[0], id: 2, name: "中2", schedule: {} });
    expect(diffWorkspaces(ws(baseProject()), ws(p)).otherChanges).toEqual([
      "学年の追加/削除",
    ]);

    const reordered = JSON.parse(JSON.stringify(p));
    reordered.tabs = [reordered.tabs[1], reordered.tabs[0]];
    expect(diffWorkspaces(ws(p), ws(reordered)).otherChanges).toEqual([
      "学年の並び",
    ]);
  });

  it("時限が after 側から消えていても before 側でラベル解決する", () => {
    const before = ws(withCell(baseProject(), "月|2|1", { subj: "英語" }));
    const p = baseProject();
    p.periods = [p.periods[0]]; // 2限を削除
    const diff = diffWorkspaces(before, ws(p));
    const cell = diff.cellChanges.find((c) => c.ref === "1:月|2|1");
    expect(cell.periodLabel).toBe("2限");
    expect(diff.otherChanges).toContain("時限設定");
  });
});

describe("describeHistoryChange / formatCellShort", () => {
  it("1 セルの変更は場所と before → after を出す", () => {
    const before = ws(withCell(baseProject(), "火|1|1", { subj: "数学", teacher: "田中" }));
    const after = ws(withCell(baseProject(), "火|1|1", { subj: "英語", teacher: "山田" }));
    expect(describeHistoryChange(diffWorkspaces(before, after))).toBe(
      "火 1限 中3 S: 数学/田中 → 英語/山田"
    );
  });

  it("複数セルは件数 + 曜日 (REGULAR_DAYS 順) に要約する", () => {
    let p = withCell(baseProject(), "土|1|1", { subj: "英語" });
    p.tabs[0].days = ["月", "火", "土"];
    p = withCell(p, "月|1|1", { subj: "数学" });
    const base = baseProject();
    base.tabs[0].days = ["月", "火", "土"];
    const diff = diffWorkspaces(ws(base), ws(p));
    expect(describeHistoryChange(diff)).toBe("2 コマの変更 (月・土)");
    // 土曜のセルを先に足しても cellChanges は曜日順 (「表示」ジャンプの先頭)
    expect(diff.cellChanges.map((c) => c.day)).toEqual(["月", "土"]);
  });

  it("セル + その他の混在は読点でつなぐ / 差分なしは空文字", () => {
    const p = withCell(baseProject(), "月|1|1", { subj: "数学" });
    p.subjects.push("国語");
    expect(describeHistoryChange(diffWorkspaces(ws(baseProject()), ws(p)))).toBe(
      "月 1限 中3 S: 空 → 数学、科目マスタ"
    );
    expect(
      describeHistoryChange(diffWorkspaces(ws(baseProject()), ws(baseProject())))
    ).toBe("");
  });

  it("formatCellShort: 科目/講師 → 教室・備考 → 空 の順で表記する", () => {
    expect(formatCellShort(null)).toBe("空");
    expect(formatCellShort({ subj: "英語" })).toBe("英語");
    expect(formatCellShort({ subj: "英語", teacher: "田中" })).toBe("英語/田中");
    expect(formatCellShort({ teacher: "田中" })).toBe("田中");
    expect(formatCellShort({ room: "501", note: "自習" })).toBe("501 自習");
  });
});

describe("diffWorkspaces: 表示プロジェクトの切替", () => {
  const twoProjectWs = (activeProjectId) => ({
    version: 2,
    activeProjectId,
    projects: [
      baseProject(),
      { ...baseProject(), id: 2, name: "P2" },
    ],
  });

  it("切替を otherChanges に載せる (無言で戻らないように)", () => {
    const diff = diffWorkspaces(twoProjectWs(1), twoProjectWs(2));
    expect(diff.otherChanges).toContain("表示プロジェクトの切替");
    expect(describeHistoryChange(diff)).toContain("表示プロジェクトの切替");
  });

  it("同じプロジェクトを見ているだけなら載せない", () => {
    expect(diffWorkspaces(twoProjectWs(1), twoProjectWs(1)).otherChanges).toEqual([]);
  });

  it("プロジェクトの追加/削除に伴う切替は二重に出さない", () => {
    const diff = diffWorkspaces(ws(baseProject()), twoProjectWs(2));
    expect(diff.otherChanges).toEqual(["プロジェクトの追加/削除"]);
  });
});

describe("diffWorkspaces: 後から足したマスタ・設定", () => {
  // 差分に載せ忘れると Undo の toast が「変更なし」になり、何が戻ったか
  // 分からなくなる (プロジェクト切替と同じ失敗)
  it("教室マスタの変更を検出する", () => {
    const before = ws({ ...baseProject(), rooms: ["501"] });
    const after = ws({ ...baseProject(), rooms: ["501", "502"] });
    expect(diffWorkspaces(before, after).otherChanges).toContain("教室マスタ");
  });

  it("校舎間の移動時間の変更を検出する (設定・解除の両方)", () => {
    const none = ws(baseProject());
    const set = ws({ ...baseProject(), campusTravelMinutes: 15 });
    expect(diffWorkspaces(none, set).otherChanges).toContain("校舎間の移動時間");
    expect(diffWorkspaces(set, none).otherChanges).toContain("校舎間の移動時間");
    expect(
      diffWorkspaces(set, ws({ ...baseProject(), campusTravelMinutes: 15 }))
        .otherChanges
    ).toEqual([]);
  });
});
