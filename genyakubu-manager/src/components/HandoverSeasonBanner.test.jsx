// @vitest-environment jsdom
// ダッシュボードの「📌 去年のこの時期」: 該当が無い日は何も出さない・
// 近い順に 3 件まで・クリックでそのメモを開く。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HandoverSeasonBanner } from "./HandoverSeasonBanner";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0)); // 2026-10-01
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const note = (id, date, title, extra = {}) => ({ id, date, title, category: "事務", ...extra });

describe("HandoverSeasonBanner", () => {
  it("該当が無ければ何も出さない (今年のメモ・遠い時期・固定メモ)", () => {
    const { container } = render(
      <HandoverSeasonBanner
        notes={[
          note(1, "2026-09-30", "今年"),
          note(2, "2025-12-20", "遠い"),
          note(3, "2025-10-01", "固定", { pinned: true }),
        ]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("近い順に 3 件まで出し、残りは件数。クリックでそのメモ / 一覧 / 書くを開く", () => {
    const onOpenNote = vi.fn();
    const onOpenList = vi.fn();
    const onAdd = vi.fn();
    render(
      <HandoverSeasonBanner
        notes={[
          note(1, "2025-10-03", "ズバリ的中の提出催促", { advice: "9月中に念押し" }),
          note(2, "2025-10-20", "中間テスト対策の準備"),
          note(3, "2025-09-28", "後期の時間割確認"),
          note(4, "2024-10-25", "模試の申込締切"),
        ]}
        onOpenNote={onOpenNote}
        onOpenList={onOpenList}
        onAdd={onAdd}
      />
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/^3 日前 後期の時間割確認/);
    expect(items[1]).toMatch(/^2 日後 ズバリ的中の提出催促.*→ 9月中に念押し/);
    expect(screen.getByText("ほか 1 件")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ズバリ的中の提出催促" }));
    expect(onOpenNote).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "引継ぎメモを開く" }));
    expect(onOpenList).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "✏ メモを書く" }));
    expect(onAdd).toHaveBeenCalled();
  });
});
