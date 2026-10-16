// @vitest-environment jsdom
// コマの「回数・実施日」: 不定期のコマ (実施日の一覧)・曜日ごとに数える・数え始め。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SlotForm } from "./SlotForm";
import { normalizeSlotCountFields } from "../utils/slotDates";

afterEach(cleanup);

const MARK = {
  id: 5, day: "月", time: "17:00-18:00", grade: "高3", cls: "", room: "601",
  subj: "マークテスト", teacher: "T", note: "",
};

describe("SlotForm の回数・実施日", () => {
  it("既定は閉じていて、保存形に余計なキーを足さない", () => {
    const onSave = vi.fn();
    render(<SlotForm slot={MARK} onSave={onSave} onCancel={() => {}} />);
    expect(screen.queryByText("決まった日だけ実施する (不定期のコマ)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave.mock.calls[0][0]).toEqual(MARK);
  });

  it("不定期のコマにして、カレンダーで実施日を選ぶ (その曜日だけ押せる)", () => {
    const onSave = vi.fn();
    render(<SlotForm slot={MARK} onSave={onSave} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /回数・実施日/ }));
    fireEvent.click(screen.getByLabelText("決まった日だけ実施する (不定期のコマ)"));
    const cal = screen.getByRole("group", { name: "実施日を選ぶカレンダー" });
    // 表示中の月の月曜を 2 つ押す
    const mondays = within(cal)
      .getAllByRole("button")
      .filter((b) => / \(月\)$/.test(b.getAttribute("aria-label") || ""));
    fireEvent.click(mondays[0]);
    fireEvent.click(mondays[1]);
    // 月曜以外は押せない
    const tuesday = within(cal)
      .getAllByRole("button")
      .find((b) => / \(火\)$/.test(b.getAttribute("aria-label") || ""));
    expect(tuesday).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/この曜日のコマだけで回数を数える/));
    fireEvent.change(screen.getByLabelText("数え始めの回"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.irregular).toBe(true);
    expect(saved.onlyDates).toHaveLength(2);
    expect(saved.separateWeekdayCount).toBe(true);
    expect(saved.sessionStartNumber).toBe(9);
  });

  it("設定済みのコマは開いた状態で出る", () => {
    render(
      <SlotForm
        slot={{ ...MARK, irregular: true, onlyDates: ["2026-10-05"] }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("実施日: 1 日")).toBeInTheDocument();
  });
});

describe("normalizeSlotCountFields", () => {
  it("曜日の違う実施日・重複を外して並べる", () => {
    const out = normalizeSlotCountFields({
      ...MARK,
      irregular: true,
      onlyDates: ["2026-10-19", "2026-10-06", "2026-10-05", "2026-10-19"],
    });
    expect(out.onlyDates).toEqual(["2026-10-05", "2026-10-19"]);
  });

  it("不定期をやめたら実施日も消す。第1回以下の数え始めは持たない", () => {
    const out = normalizeSlotCountFields({
      ...MARK,
      irregular: false,
      onlyDates: ["2026-10-05"],
      separateWeekdayCount: false,
      sessionStartNumber: 1,
    });
    expect(out).toEqual(MARK);
  });
});
