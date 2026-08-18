// @vitest-environment jsdom
// 授業セット: 曜日分割の候補 (中3 火木 / 水金) と 旧形式 → 曜日ベースの変換。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ClassSetManager } from "./ClassSetManager";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";

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

function renderManager(classSets, onSave, slots = SLOTS) {
  return render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <ClassSetManager
          classSets={classSets}
          slots={slots}
          onSave={onSave}
          isAdmin
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

describe("ClassSetManager - コース分けの候補", () => {
  it("週 4 日の学年に 火木 / 水金 の分割候補を出す", () => {
    renderManager([], vi.fn());
    expect(screen.getByText(/🔀 コース分けの候補/)).toBeTruthy();
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
    expect(screen.queryByText(/🔀 コース分けの候補/)).toBeNull();
  });
});

describe("ClassSetManager - 旧形式 (コマ id 直参照)", () => {
  const LEGACY = [{ id: 1, label: "中3 (火・木)", slotIds: [1, 3] }];

  it("旧形式のセットにバッジと移行案内を出す", () => {
    renderManager(LEGACY, vi.fn());
    expect(screen.getByText(/旧形式のセットが 1 件あります/)).toBeTruthy();
    expect(screen.getByText("旧形式 (コマ id 固定)")).toBeTruthy();
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
    expect(screen.queryByText("旧形式 (コマ id 固定)")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /曜日ベースに変換/ })
    ).toBeNull();
  });
});

describe("ClassSetManager - 旧形式の変換で対象が増えるとき", () => {
  // 火曜に S と A の 2 クラスがあり、旧セットは S の 1 コマだけを指している。
  // 曜日ベースにすると「火曜の中3ぜんぶ」= 2 コマになる。
  const WIDE = [mk(1, "火"), mk(2, "火", { cls: "A", room: "502" }), mk(3, "木")];
  const LEGACY_PARTIAL = [{ id: 1, label: "中3 S (火)", slotIds: [1] }];

  it("増える件数を一覧に出す", () => {
    renderManager(LEGACY_PARTIAL, vi.fn(), WIDE);
    expect(
      screen.getByText(/変換すると対象が\s*1\s*→\s*2\s*コマに増えます/)
    ).toBeTruthy();
  });

  it("確認ダイアログでキャンセルすると保存しない", async () => {
    const onSave = vi.fn();
    renderManager(LEGACY_PARTIAL, onSave, WIDE);
    fireEvent.click(
      screen.getByRole("button", { name: "中3 S (火) を曜日ベースに変換" })
    );
    const cancel = await screen.findByRole("button", { name: "キャンセル" });
    fireEvent.click(cancel);
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
  });

  it("確認して変換すると火曜の中3ぜんぶが 1 セットになる", async () => {
    const onSave = vi.fn();
    renderManager(LEGACY_PARTIAL, onSave, WIDE);
    fireEvent.click(
      screen.getByRole("button", { name: "中3 S (火) を曜日ベースに変換" })
    );
    fireEvent.click(await screen.findByRole("button", { name: "変換する" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0].units).toEqual([
      { grade: "中3", day: "火" },
    ]);
  });
});
