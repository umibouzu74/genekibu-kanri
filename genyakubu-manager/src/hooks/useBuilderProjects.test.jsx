// @vitest-environment jsdom
// 講習の季節ごとの project の購読 (Firebase 未設定の端末 = テスト環境)。
// 状態の決め方そのものは utils/builderSeasons.test.js。
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBuilderProjects } from "./useBuilderProjects";
import { notifyBuilderProjectSaved, seasonStorage } from "../timetable-builder/utils/seasons";

const project = (name, dates) => ({
  version: 4,
  name,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  teachers: [],
  activeTabId: 1,
  dates: dates.map((label, i) => ({ id: i + 1, label })),
  periods: [{ id: 1, label: "1限" }],
  tabs: [{ id: 1, name: "中3", config: { classes: [{ id: 1, label: "A" }], subjectCounts: {} }, schedule: {} }],
  subjects: [],
  subjectColors: {},
  combinedGroups: [],
  externalCounts: {},
  externalSessions: [],
  externalSessionPresets: [],
  snapshots: [],
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useBuilderProjects (Firebase 未設定)", () => {
  it("季節に分ける前の project (旧キー) は、日付から推定した季節で legacy", () => {
    localStorage.setItem("builder.schedule_project", JSON.stringify(project("2026 夏期", ["7/29(水)"])));
    const { result } = renderHook(() => useBuilderProjects());
    expect(result.current.summer.status).toBe("legacy");
    expect(result.current.summer.project.name).toBe("2026 夏期");
    expect(result.current.winter.status).toBe("missing");
  });

  it("講習時間割作成が同じタブで季節を保存したら読み直す", () => {
    const { result } = renderHook(() => useBuilderProjects());
    expect(result.current.spring.status).toBe("missing");
    const key = seasonStorage("spring").storageKey;
    localStorage.setItem(key, JSON.stringify(project("2027 春期", ["3/26(金)"])));
    act(() => notifyBuilderProjectSaved(key));
    expect(result.current.spring).toMatchObject({ status: "ready", source: "local" });
    expect(result.current.spring.project.name).toBe("2027 春期");
  });

  it("別のタブが季節を保存した / 旧キーを消したら読み直す (storage イベント)", () => {
    localStorage.setItem("builder.schedule_project", JSON.stringify(project("2026 冬期", ["12/24(木)"])));
    const { result } = renderHook(() => useBuilderProjects());
    expect(result.current.winter.status).toBe("legacy");
    // 別のタブで冬期へ移した
    const key = seasonStorage("winter").storageKey;
    localStorage.setItem(key, JSON.stringify(project("2026 冬期", ["12/24(木)"])));
    localStorage.removeItem("builder.schedule_project");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
      window.dispatchEvent(new StorageEvent("storage", { key: "builder.schedule_project", storageArea: localStorage }));
    });
    expect(result.current.winter).toMatchObject({ status: "ready", source: "local" });
  });
});

