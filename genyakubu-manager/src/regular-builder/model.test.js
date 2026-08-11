import { describe, expect, it } from "vitest";
import {
  addSnapshot,
  classRoomForDay,
  computeSections,
  copyCellAcrossTabs,
  countCellsForClass,
  countCellsForPeriod,
  countTeacherAssignments,
  createDefaultWorkspace,
  effectiveRoom,
  makeCellKey,
  makeCellRef,
  nextClassId,
  nextPeriodId,
  parseCellKey,
  parseCellRef,
  removeClassFromTab,
  removePeriodFromProject,
  renameTeacherInProject,
  resolveAllEntries,
  restoreSnapshot,
  resolveTabEntries,
  sanitizeProject,
  sanitizeWorkspace,
  setCellsLocked,
  setClassRoom,
  setClassRoomForDay,
  shiftPeriodTimes,
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

  it("講師の NG (不在)・上限を保持し、不正値は落とす", () => {
    const p = sanitizeProject({
      name: "x",
      teachers: [
        {
          name: "堀上",
          ngSlots: [
            { day: "月" },
            { day: "火", time: "18:00-19:00" },
            { day: "?" }, // 不正曜日
            "x", // 不正要素
          ],
          maxPerDay: 3,
          maxPerWeek: 12,
        },
        { name: "半田", maxPerDay: 0, maxPerWeek: -1, ngSlots: [] },
      ],
    });
    expect(p.teachers[0]).toEqual({
      name: "堀上",
      ngSlots: [{ day: "月" }, { day: "火", time: "18:00-19:00" }],
      maxPerDay: 3,
      maxPerWeek: 12,
    });
    // 0 / 負値の上限・空の ngSlots は「未設定」に倒す
    expect(p.teachers[1]).toEqual({ name: "半田" });
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

  it("包含関係 (⊆) で推移的にまとまる (大きいセットが橋渡しする)", () => {
    const p = proj([
      tab(1, "中1", { periodIds: [1, 2] }),
      tab(2, "中2", { periodIds: [3] }),
      tab(3, "中3", { periodIds: [1, 2, 3] }), // 中1 も 中2 も包含
    ]);
    const sections = computeSections(p, "月");
    expect(sections).toHaveLength(1);
    expect(sections[0].tabs.map((t) => t.name)).toEqual(["中1", "中2", "中3"]);
  });

  it("時限が一部重なるだけ (どちらも包含でない) の学年は併合しない", () => {
    const p = proj([
      tab(1, "高1", { periodIds: [11, 12, 13] }),
      tab(2, "高1 (亀)", { periodIds: [12, 31] }), // 19:40 だけ偶然共有
    ]);
    const sections = computeSections(p, "月");
    expect(sections.map((s) => s.name)).toEqual(["高1", "高1 (亀)"]);
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

describe("computeSections — splitCampus (本校/亀井町の表示分割)", () => {
  // 本校 (401, 402) + 亀井町 (亀21) が混在する取込タブを模す。
  // 本校のセルは時限 1・2、亀井町のセルは時限 3・4 だけを使う。
  const mixedTab = (id, name, over = {}) => ({
    id,
    name,
    grade: name,
    group: "",
    classes: [
      { id: 1, label: "", room: "401" },
      { id: 2, label: "", room: "402" },
      { id: 3, label: "", room: "亀21" },
    ],
    days: ["月"],
    periodIds: [1, 2, 3, 4],
    schedule: {
      [makeCellKey("月", 1, 1)]: { subj: "英語" },
      [makeCellKey("月", 2, 2)]: { subj: "数学" },
      [makeCellKey("月", 3, 3)]: { subj: "国語" },
      [makeCellKey("月", 4, 3)]: { subj: "理科" },
    },
    ...over,
  });
  const proj = (tabs) => ({ periods: [], tabs });

  it("混在タブは本校と亀井町の 2 セクションに分かれ、時限も建物ごとに絞られる", () => {
    const sections = computeSections(proj([mixedTab(1, "高1")]), "月", {
      splitCampus: true,
    });
    expect(sections.map((s) => s.name)).toEqual(["高1（本校）", "高1（亀井町）"]);
    expect(sections[0].tabs[0].classes.map((c) => c.room)).toEqual(["401", "402"]);
    expect(sections[0].tabs[0].periodIds).toEqual([1, 2]);
    expect(sections[1].tabs[0].classes.map((c) => c.room)).toEqual(["亀21"]);
    expect(sections[1].tabs[0].periodIds).toEqual([3, 4]);
    // 分割してもタブ id は元のまま (セル参照 `tabId:cellKey` を壊さない)
    expect(sections.flatMap((s) => s.tabs.map((t) => t.id))).toEqual([1, 1]);
    // key は建物で区別される (React key・折りたたみ状態の衝突防止)
    expect(new Set(sections.map((s) => s.key)).size).toBe(2);
  });

  it("splitCampus なしでは従来どおり 1 セクションのまま", () => {
    const sections = computeSections(proj([mixedTab(1, "高1")]), "月");
    expect(sections.map((s) => s.name)).toEqual(["高1"]);
    expect(sections[0].tabs[0].periodIds).toEqual([1, 2, 3, 4]);
  });

  it("亀井町の時限が本校を包含していても建物を跨いで併合しない", () => {
    // 亀井町セルが時限 1〜4 全部、 本校セルは 1・2 のみ → 包含関係
    const t = mixedTab(1, "高1", {
      schedule: {
        [makeCellKey("月", 1, 1)]: { subj: "英語" },
        [makeCellKey("月", 2, 2)]: { subj: "数学" },
        [makeCellKey("月", 1, 3)]: { subj: "国語" },
        [makeCellKey("月", 2, 3)]: { subj: "理科" },
        [makeCellKey("月", 3, 3)]: { subj: "社会" },
        [makeCellKey("月", 4, 3)]: { subj: "英語" },
      },
    });
    const sections = computeSections(proj([t]), "月", { splitCampus: true });
    expect(sections.map((s) => s.name)).toEqual(["高1（本校）", "高1（亀井町）"]);
  });

  it("同じ建物どうしの学年は今までどおり時限の包含関係でまとまる", () => {
    const sections = computeSections(
      proj([mixedTab(1, "高1"), mixedTab(2, "高2")]),
      "月",
      { splitCampus: true }
    );
    expect(sections.map((s) => s.name)).toEqual([
      "高1・高2（本校）",
      "高1・高2（亀井町）",
    ]);
  });

  it("列の既定教室が本校でも、セルの実効教室の多数決で亀井町側に入る", () => {
    // 列 401 のコマが実際にはすべて亀21 で行われる (セル上書き)
    const t = mixedTab(1, "高1", {
      schedule: {
        [makeCellKey("月", 3, 1)]: { subj: "数学", room: "亀21" },
        [makeCellKey("月", 4, 1)]: { subj: "英語", room: "亀21" },
        [makeCellKey("月", 1, 2)]: { subj: "国語" },
        [makeCellKey("月", 3, 3)]: { subj: "理科" },
      },
    });
    const sections = computeSections(proj([t]), "月", { splitCampus: true });
    const annex = sections.find((s) => s.name.includes("亀井町"));
    expect(annex.tabs[0].classes.map((c) => c.room)).toEqual(["401", "亀21"]);
  });

  it("片方の建物しか無いプロジェクトでは名前も構成も変わらない", () => {
    const t = mixedTab(1, "中1", {
      classes: [
        { id: 1, label: "S", room: "501" },
        { id: 2, label: "A", room: "502" },
      ],
      schedule: { [makeCellKey("月", 1, 1)]: { subj: "英語" } },
    });
    const sections = computeSections(proj([t]), "月", { splitCampus: true });
    expect(sections.map((s) => s.name)).toEqual(["中1"]);
    expect(sections[0].tabs[0].periodIds).toEqual([1, 2, 3, 4]);
  });

  it("手動グループの混在タブは亀井町側だけ別グループ名になる", () => {
    const t = mixedTab(1, "高1", { group: "高校" });
    const sections = computeSections(proj([t]), "月", { splitCampus: true });
    expect(sections.map((s) => s.name).sort()).toEqual(["高校", "高校（亀井町）"]);
  });

  it("セルが 1 つも無い建物側は全時限のまま残る (入力の受け皿)", () => {
    // 亀井町の列はあるがセル未入力
    const t = mixedTab(1, "高1", {
      schedule: {
        [makeCellKey("月", 1, 1)]: { subj: "英語" },
        [makeCellKey("月", 2, 2)]: { subj: "数学" },
      },
    });
    const sections = computeSections(proj([t]), "月", { splitCampus: true });
    const annex = sections.find((s) => s.name.includes("亀井町"));
    expect(annex.tabs[0].periodIds).toEqual([1, 2, 3, 4]);
  });
});

describe("renameTeacherInProject", () => {
  it("マスタと割当セルの両方を追従させ、他は変えない", () => {
    const p = makeProject();
    const { project: next, changedCells } = renameTeacherInProject(p, "半田", "半田B");
    expect(changedCells).toBe(1);
    expect(next.teachers).toEqual([{ name: "堀上" }, { name: "半田B" }]);
    expect(next.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田B",
    });
    // 対象外のセルは同一参照のまま
    expect(next.tabs[0].schedule[makeCellKey("月", 2, 2)]).toBe(
      p.tabs[0].schedule[makeCellKey("月", 2, 2)]
    );
    // 元プロジェクトは不変
    expect(p.teachers[1].name).toBe("半田");
  });

  it("複数講師 (·区切り) は該当名だけを置換する", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = {
      subj: "理科",
      teacher: "半田·堀上",
    };
    const { project: next, changedCells } = renameTeacherInProject(p, "堀上", "堀上A");
    expect(changedCells).toBe(2); // 月2限 + 火1限
    expect(next.tabs[0].schedule[makeCellKey("火", 1, 1)].teacher).toBe("半田·堀上A");
  });

  it("置換で同名が並ぶ場合は重複を除いて詰める", () => {
    const p = makeProject({
      tabs: [
        {
          id: 1,
          name: "中3",
          grade: "中3",
          classes: [{ id: 1, label: "S", room: "501" }],
          days: ["月"],
          periodIds: [1],
          schedule: {
            [makeCellKey("月", 1, 1)]: { subj: "理科", teacher: "半田·堀上" },
          },
        },
      ],
    });
    const { project: next } = renameTeacherInProject(p, "半田", "堀上");
    expect(next.tabs[0].schedule[makeCellKey("月", 1, 1)].teacher).toBe("堀上");
  });

  it("空名・同名・前後空白のみの変更は何もしない", () => {
    const p = makeProject();
    expect(renameTeacherInProject(p, "半田", "").project).toBe(p);
    expect(renameTeacherInProject(p, "半田", "  半田  ").project).toBe(p);
    expect(renameTeacherInProject(p, "", "誰か").project).toBe(p);
  });

  it("マスタに無い名前でもセル側は追従する (取込データの手直し用)", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 2, 1)] = { subj: "社会", teacher: "臨時" };
    const { project: next, changedCells } = renameTeacherInProject(p, "臨時", "臨時A");
    expect(changedCells).toBe(1);
    expect(next.tabs[0].schedule[makeCellKey("火", 2, 1)].teacher).toBe("臨時A");
    expect(next.teachers).toEqual(p.teachers);
  });
});

describe("copyCellAcrossTabs", () => {
  it("コピー元は残し、コピー先を上書きする (タブ横断可)", () => {
    const p = makeProject();
    const tabs = copyCellAcrossTabs(
      p.tabs,
      `1:${makeCellKey("月", 1, 1)}`,
      `1:${makeCellKey("火", 2, 2)}`
    );
    expect(tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
    expect(tabs[0].schedule[makeCellKey("火", 2, 2)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
    // コピーは新しいオブジェクト (後の編集で共有されない)
    expect(tabs[0].schedule[makeCellKey("火", 2, 2)]).not.toBe(
      tabs[0].schedule[makeCellKey("月", 1, 1)]
    );
  });

  it("コピー元が空・同一 ref・不明タブは何もしない", () => {
    const p = makeProject();
    expect(
      copyCellAcrossTabs(p.tabs, `1:${makeCellKey("火", 1, 1)}`, `1:${makeCellKey("火", 2, 1)}`)
    ).toBe(p.tabs);
    const ref = `1:${makeCellKey("月", 1, 1)}`;
    expect(copyCellAcrossTabs(p.tabs, ref, ref)).toBe(p.tabs);
    expect(copyCellAcrossTabs(p.tabs, `9:${makeCellKey("月", 1, 1)}`, ref)).toBe(p.tabs);
  });
});

describe("addSnapshot / restoreSnapshot", () => {
  it("保存 → 編集 → 復元で保存時の状態に戻る (snapshots と id は維持)", () => {
    const p = { id: 7, ...makeProject(), approvedConflicts: ["k1"] };
    const saved = addSnapshot(p, "たたき台", 1000);
    expect(saved.snapshots).toHaveLength(1);
    expect(saved.snapshots[0]).toMatchObject({ id: 1, name: "たたき台", createdAt: 1000 });
    expect(saved.snapshots[0].data.snapshots).toBeUndefined();
    expect(saved.snapshots[0].data.id).toBeUndefined();

    // 編集: セルを消して承認も消す
    const edited = {
      ...saved,
      tabs: [{ ...saved.tabs[0], schedule: {} }],
    };
    delete edited.approvedConflicts;
    const restored = restoreSnapshot(edited, 1);
    expect(restored.id).toBe(7);
    expect(restored.snapshots).toBe(edited.snapshots);
    expect(restored.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
    expect(restored.approvedConflicts).toEqual(["k1"]);
  });

  it("保存時に無かった任意フィールドは復元後も持たない / 不明 id は何もしない", () => {
    const p = makeProject(); // approvedConflicts なし
    const saved = addSnapshot(p, "案", 0);
    const edited = { ...saved, approvedConflicts: ["後から承認"] };
    const restored = restoreSnapshot(edited, 1);
    expect(restored.approvedConflicts).toBeUndefined();
    expect(restoreSnapshot(edited, 99)).toBe(edited);
  });

  it("sanitizeProject は snapshots を保持し、入れ子と不正要素を落とす", () => {
    const p = makeProject();
    const saved = addSnapshot(p, "案 1", 123);
    // 入れ子 (data.snapshots) と不正な要素を混ぜる
    saved.snapshots[0].data.snapshots = [{ data: {} }];
    saved.snapshots.push({ name: "data なし" }, "x");
    const clean = sanitizeProject(saved);
    expect(clean.snapshots).toHaveLength(1);
    expect(clean.snapshots[0]).toMatchObject({ id: 1, name: "案 1", createdAt: 123 });
    expect(clean.snapshots[0].data.snapshots).toBeUndefined();
    expect(clean.snapshots[0].data.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
  });
});

describe("countTeacherAssignments", () => {
  // makeProject: 月1限 S=数学/半田, 月2限 A=英語/堀上
  it("全タブのセルから割当数を数える (複数講師・IME の全角中点も含む)", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = {
      subj: "理科",
      teacher: "半田・堀上",
    };
    expect(countTeacherAssignments(p, "半田")).toBe(2);
    expect(countTeacherAssignments(p, "堀上")).toBe(2);
    expect(countTeacherAssignments(p, "居ない人")).toBe(0);
  });

  it("残骸セル (使わない曜日など) も生の schedule 基準で数える", () => {
    const p = makeProject();
    p.tabs[0].days = ["火"]; // 月のセルが残骸になる
    expect(countTeacherAssignments(p, "半田")).toBe(1);
  });
});

describe("セルのロック (locked)", () => {
  const lockedCell = { subj: "数学", teacher: "半田", locked: true };

  it("setCellsLocked は中身のあるセルだけにロックを付け外しする", () => {
    const p = makeProject();
    const refs = [
      `1:${makeCellKey("月", 1, 1)}`, // 数学/半田
      `1:${makeCellKey("月", 1, 2)}`, // 空セル (対象外)
    ];
    const { tabs, changed } = setCellsLocked(p.tabs, refs, true);
    expect(changed).toBe(1);
    expect(tabs[0].schedule[makeCellKey("月", 1, 1)].locked).toBe(true);
    expect(makeCellKey("月", 1, 2) in tabs[0].schedule).toBe(false);
    // 解除するとフィールドごと消える (locked: false は残さない)
    const undone = setCellsLocked(tabs, [refs[0]], false);
    expect(undone.changed).toBe(1);
    expect(undone.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
    // 既に同じ状態なら changed 0 で参照も変えない
    expect(setCellsLocked(undone.tabs, [refs[0]], false).changed).toBe(0);
  });

  it("swapCellsAcrossTabs はロック中のセルを動かさない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = lockedCell;
    const before = p.tabs;
    expect(
      swapCellsAcrossTabs(before, `1:${makeCellKey("月", 1, 1)}`, `1:${makeCellKey("月", 2, 1)}`)
    ).toBe(before);
    // ロック中への移動 (逆向き) も no-op
    expect(
      swapCellsAcrossTabs(before, `1:${makeCellKey("月", 2, 2)}`, `1:${makeCellKey("月", 1, 1)}`)
    ).toBe(before);
  });

  it("copyCellAcrossTabs はロックを引き継がず、ロック中への上書きはしない", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = lockedCell;
    const copied = copyCellAcrossTabs(
      p.tabs,
      `1:${makeCellKey("月", 1, 1)}`,
      `1:${makeCellKey("火", 1, 1)}`
    );
    expect(copied[0].schedule[makeCellKey("火", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "半田",
    });
    expect(
      copyCellAcrossTabs(p.tabs, `1:${makeCellKey("月", 2, 2)}`, `1:${makeCellKey("月", 1, 1)}`)
    ).toBe(p.tabs);
  });

  it("sanitizeProject は locked: true を保持し、空セルや不正値は落とす", () => {
    const p = makeProject();
    p.tabs[0].schedule[makeCellKey("月", 1, 1)] = lockedCell;
    p.tabs[0].schedule[makeCellKey("火", 1, 1)] = { locked: true }; // 中身なし
    p.tabs[0].schedule[makeCellKey("火", 2, 1)] = { subj: "英語", locked: "yes" };
    const clean = sanitizeProject(p);
    expect(clean.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual(lockedCell);
    expect(makeCellKey("火", 1, 1) in clean.tabs[0].schedule).toBe(false);
    expect(clean.tabs[0].schedule[makeCellKey("火", 2, 1)]).toEqual({ subj: "英語" });
  });
});

describe("setClassRoom (列の既定教室の変更と連動)", () => {
  // 高校の講座列を模したタブ: 列1 (404) に 上書きなし / 407 上書き / 301 上書き、
  // 列2 (405) に 407 上書き (他列は変更対象外の確認用)
  const tabs = () => [
    {
      id: 1,
      name: "高2",
      grade: "高2",
      classes: [
        { id: 1, label: "", room: "404" },
        { id: 2, label: "", room: "405" },
      ],
      days: ["月"],
      periodIds: [1, 2, 3],
      schedule: {
        [makeCellKey("月", 1, 1)]: { subj: "文系数学", teacher: "半田" },
        [makeCellKey("月", 2, 1)]: { subj: "英語選抜", teacher: "伊藤", room: "407" },
        [makeCellKey("月", 3, 1)]: { subj: "物理", teacher: "白川", room: "301" },
        [makeCellKey("月", 1, 2)]: { subj: "英語", teacher: "今津", room: "407" },
      },
    },
  ];

  it("既定教室を変え、新既定と同じ上書きだけを既定追従へ正規化する", () => {
    const res = setClassRoom(tabs(), 1, 1, "407");
    expect(res.changed).toBe(true);
    expect(res.oldRoom).toBe("404");
    expect(res.newRoom).toBe("407");
    expect(res.normalized).toBe(1);
    expect(res.kept).toBe(1);
    const tab = res.tabs[0];
    expect(tab.classes[0].room).toBe("407");
    // 407 上書きは外れて既定追従 (実効教室は 407 のまま)
    expect(tab.schedule[makeCellKey("月", 2, 1)]).toEqual({
      subj: "英語選抜",
      teacher: "伊藤",
    });
    // 別教室の個別指定と他列は不変
    expect(tab.schedule[makeCellKey("月", 3, 1)].room).toBe("301");
    expect(tab.schedule[makeCellKey("月", 1, 2)].room).toBe("407");
    expect(tab.classes[1].room).toBe("405");
  });

  it("同じ教室への変更 (前後空白は無視) は no-op", () => {
    const src = tabs();
    const res = setClassRoom(src, 1, 1, " 404 ");
    expect(res.changed).toBe(false);
    expect(res.tabs).toBe(src);
  });

  it("保存する教室は trim される", () => {
    const res = setClassRoom(tabs(), 1, 1, " 407 ");
    expect(res.newRoom).toBe("407");
    expect(res.tabs[0].classes[0].room).toBe("407");
  });

  it("ロック中のセルの上書きは正規化しない (触らない)", () => {
    const src = tabs();
    src[0].schedule[makeCellKey("月", 2, 1)].locked = true;
    const res = setClassRoom(src, 1, 1, "407");
    expect(res.normalized).toBe(0);
    expect(res.tabs[0].schedule[makeCellKey("月", 2, 1)].room).toBe("407");
  });

  it("教室だけのセルは正規化で中身が無くなるため削除する", () => {
    const src = tabs();
    src[0].schedule[makeCellKey("月", 2, 1)] = { room: "407" };
    const res = setClassRoom(src, 1, 1, "407");
    expect(makeCellKey("月", 2, 1) in res.tabs[0].schedule).toBe(false);
  });

  it("存在しない列・タブは no-op", () => {
    const src = tabs();
    expect(setClassRoom(src, 1, 99, "407").changed).toBe(false);
    expect(setClassRoom(src, 99, 1, "407").changed).toBe(false);
  });

  it("元の tabs は不変 (純関数)", () => {
    const src = tabs();
    const before = JSON.stringify(src);
    setClassRoom(src, 1, 1, "407");
    expect(JSON.stringify(src)).toBe(before);
  });
});

describe("classRoomForDay / roomByDay (曜日別の既定教室)", () => {
  it("roomByDay[曜日] → 基本 room の順で解決する", () => {
    const cls = { id: 1, label: "", room: "亀21", roomByDay: { 木: "亀63" } };
    expect(classRoomForDay(cls, "木")).toBe("亀63");
    expect(classRoomForDay(cls, "火")).toBe("亀21");
    expect(classRoomForDay({ id: 2, room: "501" }, "月")).toBe("501");
  });

  it("effectiveRoom はセル上書き → 曜日別既定 → 基本の順", () => {
    const p = makeProject();
    p.tabs[0].classes[0].roomByDay = { 月: "801" }; // S 列 (基本 501)
    const entries = resolveTabEntries(p, p.tabs[0]);
    const s = entries.find((x) => x.cls.label === "S" && x.day === "月");
    const a = entries.find((x) => x.cls.label === "A" && x.day === "月");
    expect(effectiveRoom(s)).toBe("801"); // 曜日別既定
    expect(effectiveRoom(a)).toBe("601"); // セル上書きは曜日別より強い
  });

  it("sanitize は既知の曜日 × 空でない値だけ残す", () => {
    const ws = sanitizeWorkspace({
      projects: [
        {
          id: 1,
          periods: [],
          tabs: [
            {
              id: 1,
              classes: [
                {
                  id: 1,
                  label: "S",
                  room: "501",
                  roomByDay: { 月: "601", 祝: "999", 火: " " },
                },
              ],
              days: ["月"],
              periodIds: [1],
              schedule: {},
            },
          ],
        },
      ],
      activeProjectId: 1,
    });
    expect(ws.projects[0].tabs[0].classes[0].roomByDay).toEqual({ 月: "601" });
  });
});

describe("setClassRoomForDay (この曜日だけの既定教室)", () => {
  // 亀井町の列: 基本 亀21。木曜の 1 限に 亀63 上書き、2 限に 亀40 上書き
  const tabs = () => [
    {
      id: 1,
      name: "高2亀",
      grade: "高2",
      classes: [{ id: 1, label: "", room: "亀21" }],
      days: ["月", "木"],
      periodIds: [1, 2],
      schedule: {
        [makeCellKey("月", 1, 1)]: { subj: "数学", teacher: "福江" },
        [makeCellKey("木", 1, 1)]: { subj: "英語", teacher: "藤本", room: "亀63" },
        [makeCellKey("木", 2, 1)]: { subj: "数学", teacher: "河野", room: "亀40" },
      },
    },
  ];

  it("その曜日だけ変わり、他の曜日と基本の既定は不変", () => {
    const res = setClassRoomForDay(tabs(), 1, 1, "木", "亀63");
    expect(res.changed).toBe(true);
    expect(res.oldRoom).toBe("亀21");
    expect(res.newRoom).toBe("亀63");
    expect(res.normalized).toBe(1); // 亀63 上書きは既定追従へ
    expect(res.kept).toBe(1); // 亀40 は個別指定のまま
    const cls = res.tabs[0].classes[0];
    expect(cls.room).toBe("亀21");
    expect(cls.roomByDay).toEqual({ 木: "亀63" });
    expect(res.tabs[0].schedule[makeCellKey("木", 1, 1)]).toEqual({
      subj: "英語",
      teacher: "藤本",
    });
    expect(res.tabs[0].schedule[makeCellKey("木", 2, 1)].room).toBe("亀40");
    // 月曜のセルには触らない
    expect(res.tabs[0].schedule[makeCellKey("月", 1, 1)]).toEqual({
      subj: "数学",
      teacher: "福江",
    });
  });

  it("基本と同じ値・空文字は曜日別指定の解除", () => {
    const withDay = setClassRoomForDay(tabs(), 1, 1, "木", "亀63").tabs;
    const cleared = setClassRoomForDay(withDay, 1, 1, "木", "亀21");
    expect(cleared.changed).toBe(true);
    expect(cleared.oldRoom).toBe("亀63");
    expect(cleared.newRoom).toBe("亀21");
    expect(cleared.tabs[0].classes[0].roomByDay).toBeUndefined();
    const empty = setClassRoomForDay(withDay, 1, 1, "木", " ");
    expect(empty.changed).toBe(true);
    expect(empty.tabs[0].classes[0].roomByDay).toBeUndefined();
  });

  it("変化が無ければ no-op", () => {
    const src = tabs();
    expect(setClassRoomForDay(src, 1, 1, "木", "亀21").changed).toBe(false);
    expect(setClassRoomForDay(src, 1, 1, "木", "").changed).toBe(false);
    expect(setClassRoomForDay(src, 99, 1, "木", "亀63").changed).toBe(false);
    expect(setClassRoomForDay(src, 1, 99, "木", "亀63").changed).toBe(false);
  });

  it("setClassRoom (全曜日) は新既定と同じになった曜日別指定を外す", () => {
    const withDay = setClassRoomForDay(tabs(), 1, 1, "木", "亀63").tabs;
    const res = setClassRoom(withDay, 1, 1, "亀63");
    expect(res.tabs[0].classes[0].room).toBe("亀63");
    expect(res.tabs[0].classes[0].roomByDay).toBeUndefined();
  });

  it("元の tabs は不変 (純関数)", () => {
    const src = tabs();
    const before = JSON.stringify(src);
    setClassRoomForDay(src, 1, 1, "木", "亀63");
    expect(JSON.stringify(src)).toBe(before);
  });
});

// ─── 時限 / クラスの削除とセルの後始末 ──────────────────────────────
// 消した時限・クラスのセルを残すと、次の追加で同じ id を受け取った瞬間に
// 「消したはずのコマ」が新しい行・列に現れる。削除でセルまで落とし、
// 採番も schedule に現れる id を含めて行うことの回帰テスト。

describe("removePeriodFromProject / countCellsForPeriod", () => {
  it("時限・periodIds・その時限のセルをまとめて落とす", () => {
    const p = makeProject();
    expect(countCellsForPeriod(p, 1)).toBe(1);
    const { project, removedCells } = removePeriodFromProject(p, 1);
    expect(removedCells).toBe(1);
    expect(project.periods.map((x) => x.id)).toEqual([2, 3]);
    expect(project.tabs[0].periodIds).toEqual([2]);
    expect(Object.keys(project.tabs[0].schedule)).toEqual([makeCellKey("月", 2, 2)]);
  });

  it("全タブを横断して数える・落とす", () => {
    const p = makeProject();
    p.tabs.push({
      ...p.tabs[0],
      id: 2,
      name: "中2",
      schedule: {
        [makeCellKey("月", 1, 1)]: { subj: "国語" },
        [makeCellKey("火", 1, 1)]: { subj: "理科" },
      },
    });
    expect(countCellsForPeriod(p, 1)).toBe(3);
    expect(removePeriodFromProject(p, 1).removedCells).toBe(3);
  });

  it("該当セルの無い時限の削除は 0 件・元のプロジェクトは不変", () => {
    const p = makeProject();
    const before = JSON.stringify(p);
    const { removedCells } = removePeriodFromProject(p, 3);
    expect(removedCells).toBe(0);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("removeClassFromTab / countCellsForClass", () => {
  it("クラス列とその列のセルをまとめて落とす", () => {
    const tab = makeProject().tabs[0];
    expect(countCellsForClass(tab, 2)).toBe(1);
    const { tab: next, removedCells } = removeClassFromTab(tab, 2);
    expect(removedCells).toBe(1);
    expect(next.classes.map((c) => c.id)).toEqual([1]);
    expect(Object.keys(next.schedule)).toEqual([makeCellKey("月", 1, 1)]);
  });

  it("元のタブは不変 (純関数)", () => {
    const tab = makeProject().tabs[0];
    const before = JSON.stringify(tab);
    removeClassFromTab(tab, 1);
    expect(JSON.stringify(tab)).toBe(before);
  });
});

describe("nextClassId / nextPeriodId", () => {
  it("定義済みの id の次を返す", () => {
    const p = makeProject();
    expect(nextClassId(p.tabs[0])).toBe(3);
    expect(nextPeriodId(p)).toBe(4);
  });

  it("孤立セルの id も避ける (消したコマが新しい列・行に復活しない)", () => {
    const p = makeProject();
    // クラス 5 / 時限 9 は定義には無いが schedule に残っている状態
    p.tabs[0].schedule[makeCellKey("月", 9, 5)] = { subj: "残骸" };
    expect(nextClassId(p.tabs[0])).toBe(6);
    expect(nextPeriodId(p)).toBe(10);
  });

  it("periodIds にだけ残った id も避ける", () => {
    const p = makeProject();
    p.tabs[0].periodIds = [1, 2, 7];
    expect(nextPeriodId(p)).toBe(8);
  });

  it("空のタブ・プロジェクトは 1 から", () => {
    expect(nextClassId({ classes: [], schedule: {} })).toBe(1);
    expect(nextPeriodId({ periods: [], tabs: [] })).toBe(1);
  });
});

describe("shiftPeriodTimes", () => {
  it("全時限の時刻を後ろへずらす (ラベルと id は不変)", () => {
    const p = makeProject();
    const { project, shifted, skipped } = shiftPeriodTimes(p, 15);
    expect(shifted).toBe(3);
    expect(skipped).toEqual([]);
    expect(project.periods.map((x) => x.time)).toEqual([
      "18:15-19:00",
      "19:10-19:55",
      "20:55-21:10",
    ]);
    expect(project.periods.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(project.periods[0].label).toBe("1限");
  });

  it("負の分数で前倒しできる", () => {
    const { project } = shiftPeriodTimes(makeProject(), -45);
    expect(project.periods[0].time).toBe("17:15-18:00");
  });

  it("セル (schedule) は動かさない — 時限 id は変わらないため", () => {
    const p = makeProject();
    const { project } = shiftPeriodTimes(p, 15);
    expect(project.tabs[0].schedule).toEqual(p.tabs[0].schedule);
  });

  it("時刻未設定・書式不正・範囲外の時限は据え置いて名前を返す", () => {
    const p = makeProject();
    p.periods = [
      { id: 1, label: "1限", time: "18:00-18:45" },
      { id: 2, label: "未定", time: "" }, // 未設定 → skipped に出さない
      { id: 3, label: "変", time: "ごご" }, // 書式不正
      { id: 4, label: "深夜", time: "23:50-23:59" }, // +15 分で 24 時超え
    ];
    const { project, shifted, skipped } = shiftPeriodTimes(p, 15);
    expect(shifted).toBe(1);
    expect(skipped).toEqual(["変", "深夜"]);
    expect(project.periods[1].time).toBe("");
    expect(project.periods[3].time).toBe("23:50-23:59");
  });

  it("periodIds で対象を絞れる", () => {
    const { project, shifted } = shiftPeriodTimes(makeProject(), 10, {
      periodIds: [2],
    });
    expect(shifted).toBe(1);
    expect(project.periods[0].time).toBe("18:00-18:45");
    expect(project.periods[1].time).toBe("19:05-19:50");
  });

  it("0 分・不正な分数は no-op (同じ参照を返す)", () => {
    const p = makeProject();
    expect(shiftPeriodTimes(p, 0).project).toBe(p);
    expect(shiftPeriodTimes(p, NaN).project).toBe(p);
  });

  it("1 件もずらせなければ元のプロジェクトをそのまま返す", () => {
    const p = makeProject();
    p.periods = [{ id: 1, label: "未定", time: "" }];
    expect(shiftPeriodTimes(p, 15).project).toBe(p);
  });
});

describe("sanitizeProject: campusTravelMinutes", () => {
  it("正の数だけ受け入れる", () => {
    expect(sanitizeProject({ name: "x", campusTravelMinutes: 15 }).campusTravelMinutes).toBe(15);
    expect(sanitizeProject({ name: "x", campusTravelMinutes: "20" }).campusTravelMinutes).toBe(20);
  });

  it("0・負値・非数は未設定に倒す (= チェックしない)", () => {
    for (const v of [0, -5, "abc", null, undefined]) {
      expect(
        "campusTravelMinutes" in sanitizeProject({ name: "x", campusTravelMinutes: v })
      ).toBe(false);
    }
  });
});
