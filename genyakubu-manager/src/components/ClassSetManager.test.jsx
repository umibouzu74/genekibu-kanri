// @vitest-environment jsdom
// 授業セット: 曜日分割の候補 (中3 火木 / 水金) と 旧形式 → 曜日ベースの変換。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClassSetManager } from "./ClassSetManager";
import { ToastProvider } from "../hooks/useToasts";

afterEach(cleanup);

const mk = (id, day, extras = {}) => ({
  id,
  grade: "中3",
  day,
  time: "18:00-18:45",
  cls: "S",
  room: "501",
  subj: "社会",
  teacher: "井上",
  note: "",
  ...extras,
});

// 中3 が週 4 日 (火水木金)。これが既定では「平日ぜんぶで 1 コース」になる。
const SLOTS = [mk(1, "火"), mk(2, "水"), mk(3, "木"), mk(4, "金")];

function renderManager(classSets, onSave) {
  return render(
    <ToastProvider render={() => null}>
      <ClassSetManager
        classSets={classSets}
        slots={SLOTS}
        onSave={onSave}
        isAdmin
      />
    </ToastProvider>
  );
}

describe("ClassSetManager - コース分けの候補", () => {
  it("週 4 日の学年に 火木 / 水金 の分割候補を出す", () => {
    renderManager([], vi.fn());
    expect(screen.getByText(/コース分けの候補/)).toBeTruthy();
    expect(screen.getByText("中3 を 火木 / 水金 に分ける")).toBeTruthy();
  });

  it("1 クリックで units 形式のセットが 2 件登録される", () => {
    const onSave = vi.fn();
    renderManager([], onSave);
    fireEvent.click(screen.getByRole("button", { name: "2 セットで登録" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved[0].label).toBe("中3 (火・木)");
    expect(saved[0].units).toEqual([
      { grade: "中3", day: "火" },
      { grade: "中3", day: "木" },
    ]);
    expect(saved[1].label).toBe("中3 (水・金)");
    expect(saved[1].units).toEqual([
      { grade: "中3", day: "水" },
      { grade: "中3", day: "金" },
    ]);
    // コマ id は持たない = 期切替で作り直したコマにもそのまま効く
    expect(saved[0].slotIds).toBeUndefined();
  });

  it("既に分割済みなら候補は出ない", () => {
    renderManager(
      [
        {
          id: 1,
          label: "中3 (火・木)",
          units: [
            { grade: "中3", day: "火" },
            { grade: "中3", day: "木" },
          ],
        },
        {
          id: 2,
          label: "中3 (水・金)",
          units: [
            { grade: "中3", day: "水" },
            { grade: "中3", day: "金" },
          ],
        },
      ],
      vi.fn()
    );
    expect(screen.queryByText(/コース分けの候補/)).toBeNull();
  });
});

describe("ClassSetManager - 旧形式 (コマ id 直参照)", () => {
  const LEGACY = [{ id: 1, label: "中3 (火・木)", slotIds: [1, 3] }];

  it("旧形式のセットにバッジと移行案内を出す", () => {
    renderManager(LEGACY, vi.fn());
    expect(screen.getByText(/旧形式のセットが 1 件あります/)).toBeTruthy();
    expect(screen.getByText("旧形式 (コマID固定)")).toBeTruthy();
  });

  it("「曜日ベースに変換」で units 形式になる", () => {
    const onSave = vi.fn();
    renderManager(LEGACY, onSave);
    fireEvent.click(
      screen.getByRole("button", { name: "中3 (火・木) を曜日ベースに変換" })
    );
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].units).toEqual([
      { grade: "中3", day: "火" },
      { grade: "中3", day: "木" },
    ]);
    expect(saved[0].slotIds).toBeUndefined();
  });

  it("units 形式のセットにはバッジも変換ボタンも出ない", () => {
    renderManager(
      [
        {
          id: 1,
          label: "中3 (火・木)",
          units: [
            { grade: "中3", day: "火" },
            { grade: "中3", day: "木" },
          ],
        },
      ],
      vi.fn()
    );
    expect(screen.queryByText("旧形式 (コマID固定)")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /曜日ベースに変換/ })
    ).toBeNull();
  });
});
