import { describe, expect, it } from "vitest";
import {
  computeSections,
  createDefaultWorkspace,
  effectiveRoom,
  makeCellKey,
  makeCellRef,
  parseCellKey,
  parseCellRef,
  resolveAllEntries,
  resolveTabEntries,
  sanitizeProject,
  sanitizeWorkspace,
  swapCellsAcrossTabs,
  swapScheduleCells,
  tabPeriods,
} from "./model";
import { makeProject } from "./testUtils";

describe("makeCellKey / parseCellKey", () => {
  it("round-trip する", () => {
    const key = makeCellKey("月", 3, 12);
    expect(key).toBe("月|3|12");
    expect(parseCellKey(key)).toEqual({ day: "月", periodId: 3, classId: 12 });
  });
});

describe("swapScheduleCells", () => {
  const a = { subj: "数学", teacher: "半田" };
  const b = { subj: "英語", teacher: "堀上", room: "501" };

  it("2 セルの中身を入れ替える (元のマップは不変)", () => {
    const schedule = { "月|1|1": a, "火|2|1": b };
    const next = swapScheduleCells(schedule, "月|1|1", "火|2|1");
    expect(next).toEqual({ "月|1|1": b, "火|2|1": a });
    expect(schedule).toEqual({ "月|1|1": a, "火|2|1": b });
  });

  it("空セルへの入替は移動になり、空いた側のキーは残らない", () => {
    const next = swapScheduleCells({ "月|1|1": a }, "月|1|1", "水|3|2");
    expect(next).toEqual({ "水|3|2": a });
    expect("月|1|1" in next).toBe(false);
  });

  it("同一キーは no-op で同じ参照を返す", () => {
    const schedule = { "月|1|1": a };
    expect(swapScheduleCells(schedule, "月|1|1", "月|1|1")).toBe(schedule);
  });
});

describe("sanitizeProject", () => {
  it("正常なプロジェクトはそのまま通る", () => {
    const p = sanitizeProject(makeProject());
    expect(p.name).toBe("2026 後期");
    expect(p.periods).toHaveLength(3);
    expect(p.tabs[0].classes).toHaveLength(2);
    expect(p.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
  });

  it("オブジェクトでない入力は null", () => {
    expect(sanitizeProject(null)).toBe(null);
    expect(sanitizeProject("x")).toBe(null);
    expect(sanitizeProject(42)).toBe(null);
  });

  it("欠けた配列・不正な要素は既定値に整える", () => {
    const p = sanitizeProject({ name: "x", tabs: [{ name: 5, days: ["月", "?"], schedule: { a: { subj: 1 } } }] });
    expect(p.periods).toEqual([]);
    expect(p.subjects.length).toBeGreaterThan(0);
    expect(p.tabs[0].name).toBe("タブ1");
    expect(p.tabs[0].days).toEqual(["月"]); // 不正曜日は除外
    expect(p.tabs[0].schedule).toEqual({}); // 空セルは落とす
  });
});

describe("tabPeriods", () => {
  it("プール順で、タブが使う時限のみ返す", () => {
    const p = makeProject();
    p.tabs[0].periodIds = [2, 1]; // 順序はプール順が正
    expect(tabPeriods(p, p.tabs[0]).map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("resolveTabEntries / resolveAllEntries", () => {
  it("セルを day/period/cls に解決する", () => {
    const p = makeProject();
    const entries = resolveTabEntries(p, p.tabs[0]);
    expect(entries).toHaveLength(2);
    const e = entries.find((x) => x.cls.label === "S");
    expect(e.day).toBe("月");
    expect(e.period.time).toBe("18:00-18:45");
    expect(e.cell.subj).toBe("数学");
  });

  it("設定変更で無効になったセル (曜日外・時限外・クラス消滅) は落とす", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("水", 1, 1)] = { subj: "国語" }; // 水は days 外
    p.tabs[0].schedule[makeCellKey("月", 3, 1)] = { subj: "国語" }; // 時限 3 は periodIds 外
    p.tabs[0].schedule[makeCellKey("月", 1, 99)] = { subj: "国語" }; // クラス 99 は無い
    expect(resolveTabEntries(p, p.tabs[0])).toHaveLength(2);
    expect(resolveAllEntries(p)).toHaveLength(2);
  });
});

describe("effectiveRoom", () => {
  it("セルの教室があれば優先、無ければクラス既定", () => {
    const p = makeProject();
    const entries = resolveTabEntries(p, p.tabs[0]);
    const s = entries.find((x) => x.cls.label === "S");
    const a = entries.find((x) => x.cls.label === "A");
    expect(effectiveRoom(s)).toBe("501"); // クラス既定
    expect(effectiveRoom(a)).toBe("601"); // セル上書き
  });
});

describe("createDefaultWorkspace / sanitizeWorkspace", () => {
  it("既定ワークスペースは空プロジェクト 1 つ", () => {
    const ws = createDefaultWorkspace();
    expect(ws.version).toBe(2);
    expect(ws.projects).toHaveLength(1);
    expect(ws.activeProjectId).toBe(ws.projects[0].id);
  });

  it("v2 形状はそのまま通る", () => {
    const ws = sanitizeWorkspace({
      version: 2,
      activeProjectId: 5,
      projects: [
        { id: 5, ...makeProject() },
        { id: 6, ...makeProject({ name: "2026 2学期" }) },
      ],
    });
    expect(ws.projects.map((p) => p.id)).toEqual([5, 6]);
    expect(ws.activeProjectId).toBe(5);
    expect(ws.projects[1].name).toBe("2026 2学期");
  });

  it("旧 (単一プロジェクト) 形状は 1 プロジェクトの workspace に包む", () => {
    const ws = sanitizeWorkspace(makeProject());
    expect(ws.version).toBe(2);
    expect(ws.projects).toHaveLength(1);
    expect(ws.projects[0].name).toBe("2026 後期");
    expect(ws.activeProjectId).toBe(1);
  });

  it("activeProjectId が存在しなければ先頭へフォールバック", () => {
    const ws = sanitizeWorkspace({
      version: 2,
      activeProjectId: 99,
      projects: [{ id: 3, ...makeProject() }],
    });
    expect(ws.activeProjectId).toBe(3);
  });

  it("解釈不能な入力は null", () => {
    expect(sanitizeWorkspace(null)).toBe(null);
    expect(sanitizeWorkspace({ projects: "x" })).toBe(null);
    expect(sanitizeWorkspace({ version: 2, projects: [] })).toBe(null);
  });
});

describe("makeCellRef / parseCellRef / swapCellsAcrossTabs", () => {
  const a = { subj: "数学", teacher: "半田" };
  const b = { subj: "英語", teacher: "堀上" };
  const tabs = () => [
    { id: 1, schedule: { "月|1|1": a } },
    { id: 2, schedule: { "月|11|1": b } },
  ];

  it("makeCellRef / parseCellRef が round-trip する (cellKey 内の '|' も保持)", () => {
    const ref = makeCellRef(2, makeCellKey("月", 11, 1));
    expect(ref).toBe("2:月|11|1");
    expect(parseCellRef(ref)).toEqual({ tabId: 2, key: "月|11|1" });
  });

  it("同一タブ内の入替は swapScheduleCells と同じ結果", () => {
    const ts = [{ id: 1, schedule: { "月|1|1": a, "火|2|1": b } }];
    const next = swapCellsAcrossTabs(ts, "1:月|1|1", "1:火|2|1");
    expect(next[0].schedule).toEqual({ "月|1|1": b, "火|2|1": a });
    expect(ts[0].schedule["月|1|1"]).toBe(a); // 元は不変
  });

  it("タブをまたいで入れ替えられる", () => {
    const next = swapCellsAcrossTabs(tabs(), "1:月|1|1", "2:月|11|1");
    expect(next[0].schedule["月|1|1"]).toBe(b);
    expect(next[1].schedule["月|11|1"]).toBe(a);
  });

  it("タブをまたいで空セルへ動かすと移動になる", () => {
    const next = swapCellsAcrossTabs(tabs(), "1:月|1|1", "2:月|11|2");
    expect("月|1|1" in next[0].schedule).toBe(false);
    expect(next[1].schedule["月|11|2"]).toBe(a);
    expect(next[1].schedule["月|11|1"]).toBe(b); // 既存セルは無関係
  });

  it("存在しないタブ参照は no-op", () => {
    const ts = tabs();
    expect(swapCellsAcrossTabs(ts, "1:月|1|1", "9:月|1|1")).toBe(ts);
  });
});

describe("computeSections", () => {
  const tab = (id, name, over = {}) => ({
    id,
    name,
    grade: name,
    group: "",
    classes: [{ id: 1, label: "S", room: "" }],
    days: ["月"],
    periodIds: [1, 2],
    schedule: {},
    ...over,
  });
  const proj = (tabs) => ({ periods: [], tabs });

  it("時限を共有する学年は自動で同じセクションにまとまる", () => {
    const p = proj([tab(1, "中1"), tab(2, "中2"), tab(3, "高1", { periodIds: [11, 12] })]);
    const sections = computeSections(p, "月");
    expect(sections.map((s) => s.name)).toEqual(["中1・中2", "高1"]);
    expect(sections[0].tabs.map((t) => t.id)).toEqual([1, 2]);
  });

  it("推移的にまとまる (A∩B, B∩C 共有なら A,B,C 同居)", () => {
    const p = proj([
      tab(1, "A", { periodIds: [1, 2] }),
      tab(2, "C", { periodIds: [3, 4] }),
      tab(3, "B", { periodIds: [2, 3] }), // A とも C とも共有
    ]);
    const sections = computeSections(p, "月");
    expect(sections).toHaveLength(1);
    expect(sections[0].tabs.map((t) => t.name)).toEqual(["A", "C", "B"]);
  });

  it("group (手動グループ名) が最優先で、名前ごとにまとまる", () => {
    const p = proj([
      tab(1, "高1", { group: "本校" }),
      tab(2, "高2 (亀)", { group: "亀井町", periodIds: [21] }),
      tab(3, "高2", { group: "本校" }),
    ]);
    const sections = computeSections(p, "月");
    expect(sections.map((s) => s.name)).toEqual(["本校", "亀井町"]);
    expect(sections[0].tabs.map((t) => t.id)).toEqual([1, 3]);
    expect(sections[0].auto).toBe(false);
  });

  it("その曜日を使わない学年・未設定タブは出ない", () => {
    const p = proj([
      tab(1, "中1"),
      tab(2, "中3 (土)", { days: ["土"] }),
      tab(3, "空タブ", { classes: [] }),
    ]);
    const sections = computeSections(p, "月");
    expect(sections).toHaveLength(1);
    expect(sections[0].tabs.map((t) => t.name)).toEqual(["中1"]);
  });

  it("セクションの並びはタブ定義順 (先頭タブの位置)", () => {
    const p = proj([
      tab(1, "高1", { periodIds: [11] }),
      tab(2, "中1", { periodIds: [1] }),
      tab(3, "高2", { periodIds: [11] }),
    ]);
    const sections = computeSections(p, "月");
    expect(sections.map((s) => s.name)).toEqual(["高1・高2", "中1"]);
  });
});
