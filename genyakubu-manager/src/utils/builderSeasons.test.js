// 講習の季節ごとの project の状態 (ready / legacy / missing / loading) の決め方。
import { describe, expect, it } from "vitest";
import { isLegacyMigrated, resolveLegacyProject, resolveSeasonProjects } from "./builderSeasons";

const project = (name, dates) => ({
  version: 4,
  name,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  dates: dates.map((label, i) => ({ id: i + 1, label })),
  periods: [{ id: 1, label: "1限" }],
  tabs: [{ id: 1, name: "中3", config: { classes: [{ id: 1, label: "A" }], subjectCounts: {} }, schedule: {} }],
});
const summer = project("2026 夏期", ["7/29(水)", "7/30(木)"]);
const winter = project("2026 冬期", ["12/24(木)", "1/6(水)"]);
const today = new Date(2026, 9, 23);
const received = (p) => ({ received: true, raw: p ? JSON.stringify(p) : null, project: p });

describe("resolveSeasonProjects — クラウドが使える端末", () => {
  it("クラウドにある季節は ready (cloud)、無い季節は missing", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: { winter: received(winter), summer: received(null), spring: received(null) },
      legacyCloud: received(null),
      today,
    });
    expect(out.winter).toEqual({ status: "ready", source: "cloud", project: winter });
    expect(out.summer.status).toBe("missing");
    expect(out.spring.status).toBe("missing");
  });

  it("まだ読めていない季節は loading (未作成と決めない)", () => {
    const out = resolveSeasonProjects({ configured: true, cloud: {}, legacyCloud: received(null), today });
    expect(out.spring.status).toBe("loading");
  });

  it("この端末にあれば、クラウドを読む前でも ready (local)", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: {},
      local: { summer: { exists: true, project: summer } },
      today,
    });
    expect(out.summer).toEqual({ status: "ready", source: "local", project: summer });
  });

  it("クラウドの値が読めない (新しい形式など) ときは、表示はこの端末の値", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: { summer: { received: true, raw: "{...}", project: null } },
      local: { summer: { exists: true, project: summer } },
      legacyCloud: received(null),
      today,
    });
    expect(out.summer).toEqual({ status: "ready", source: "cloud", project: summer });
  });

  it("季節に分ける前の単一 project は、日付から推定した季節で legacy になる", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: { spring: received(null), summer: received(null), winter: received(null) },
      legacyCloud: received(summer),
      today,
    });
    expect(out.summer).toEqual({ status: "legacy", source: "legacy", project: summer });
    expect(out.winter.status).toBe("missing");
    expect(out.spring.status).toBe("missing");
  });

  it("季節の project ができたら、単一 project はその季節では使わない", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: { summer: received(project("2026 夏期 (新)", ["7/29(水)"])), winter: received(null), spring: received(null) },
      legacyCloud: received(summer),
      today,
    });
    expect(out.summer.source).toBe("cloud");
    expect(out.summer.project.name).toBe("2026 夏期 (新)");
  });

  it("旧ノードを読めるまでは、空の季節を loading にする (古いキャッシュを移さない)", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: { spring: received(null), summer: received(null), winter: received(null) },
      legacyLocal: { exists: true, project: winter },
      today,
    });
    expect(out.winter.status).toBe("loading");
    expect(out.summer.status).toBe("loading");
  });

  it("旧ノードが空 / 読めないなら、この端末の旧キーを使う", () => {
    for (const legacyCloud of [received(null), { error: true }]) {
      const out = resolveSeasonProjects({
        configured: true,
        cloud: { spring: received(null), summer: received(null), winter: received(null) },
        legacyCloud,
        legacyLocal: { exists: true, project: winter },
        today,
      });
      expect(out.winter).toEqual({ status: "legacy", source: "legacy", project: winter });
    }
  });

  it("季節のノードが読めない (権限など) ときも待ち続けない", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: { spring: { error: true } },
      legacyCloud: received(null),
      today,
    });
    expect(out.spring.status).toBe("missing");
  });
});

describe("resolveSeasonProjects — Firebase 未設定の端末", () => {
  it("この端末の値だけで決める (loading にならない)", () => {
    const out = resolveSeasonProjects({
      configured: false,
      local: { winter: { exists: true, project: winter } },
      legacyLocal: { exists: true, project: summer },
      today,
    });
    expect(out.winter.status).toBe("ready");
    expect(out.summer.status).toBe("legacy");
    expect(out.spring.status).toBe("missing");
  });

  it("壊れた値でもキーがあれば ready (読み込みの失敗は講習時間割作成が知らせる)", () => {
    const out = resolveSeasonProjects({ configured: false, local: { spring: { exists: true, project: null } }, today });
    expect(out.spring).toEqual({ status: "ready", source: "local", project: null });
  });
});

describe("resolveLegacyProject", () => {
  it("クラウドが使える端末ではクラウドの旧ノードが正", () => {
    expect(
      resolveLegacyProject({ configured: true, legacyCloud: received(summer), legacyLocal: { exists: true, project: winter } })
    ).toEqual({ pending: false, project: summer });
  });

  it("Firebase 未設定ならこの端末の旧キー", () => {
    expect(resolveLegacyProject({ configured: false, legacyLocal: { exists: true, project: winter } })).toEqual({
      pending: false,
      project: winter,
    });
  });
});

// 校正レビュー (2026-10-23) で見つけた穴
describe("resolveSeasonProjects — 旧キーの扱いの念押し", () => {
  it("クラウドに季節が 1 つでもあれば、旧ノードが空でもこの端末の古い旧キーを生き返らせない", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: { winter: received(winter), summer: received(null), spring: received(null) },
      legacyCloud: received(null),
      legacyLocal: { exists: true, project: summer },
      today,
    });
    expect(out.summer.status).toBe("missing");
  });

  it("読み込み中の季節には、この端末の旧キー (その季節のもの) を localFallback に付ける", () => {
    const out = resolveSeasonProjects({
      configured: true,
      cloud: {},
      legacyLocal: { exists: true, project: winter },
      today,
    });
    expect(out.winter).toMatchObject({ status: "loading", localFallback: winter });
    expect(out.summer).toMatchObject({ status: "loading", localFallback: null });
  });
});

describe("isLegacyMigrated", () => {
  it("旧ノードの project の季節のノードに値があれば移行済み", () => {
    expect(isLegacyMigrated({ cloud: { summer: received(summer) }, legacyCloud: received(summer), today })).toBe(true);
    expect(isLegacyMigrated({ cloud: { winter: received(winter) }, legacyCloud: received(summer), today })).toBe(false);
    expect(isLegacyMigrated({ cloud: { summer: received(summer) }, legacyCloud: received(null), today })).toBe(false);
  });
});

