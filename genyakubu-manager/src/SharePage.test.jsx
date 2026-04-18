// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("./utils/shareCodec", () => ({
  decodeShareData: vi.fn(),
}));
vi.mock("./components/views/SharedSubsView", () => ({
  SharedSubsView: ({ data }) => (
    <div data-testid="shared-view">{data.substitutions.length}</div>
  ),
}));

import { SharePage } from "./SharePage";
import { decodeShareData } from "./utils/shareCodec";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SharePage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("decodeShareData が reject したらエラーメッセージを表示", async () => {
    decodeShareData.mockRejectedValueOnce(new Error("bad encoding"));
    render(<SharePage encoded="xxx" />);
    await waitFor(() => {
      expect(
        screen.getByText(/共有リンクのデータを読み込めませんでした/)
      ).toBeInTheDocument();
    });
  });

  it("substitutions が非配列なら形式エラーを表示", async () => {
    decodeShareData.mockResolvedValueOnce({ substitutions: "nope", slots: [] });
    render(<SharePage encoded="xxx" />);
    await waitFor(() => {
      expect(screen.getByText(/データ形式が不正です/)).toBeInTheDocument();
    });
  });

  it("slots が非配列なら専用エラーを表示", async () => {
    decodeShareData.mockResolvedValueOnce({ substitutions: [], slots: "nope" });
    render(<SharePage encoded="xxx" />);
    await waitFor(() => {
      expect(screen.getByText(/slots が含まれていません/)).toBeInTheDocument();
    });
  });

  it("slots が上限を超えたらエラーを表示", async () => {
    const slots = Array.from({ length: 10001 }, (_, i) => ({ id: i }));
    decodeShareData.mockResolvedValueOnce({ slots, substitutions: [] });
    render(<SharePage encoded="xxx" />);
    await waitFor(() => {
      expect(screen.getByText(/上限/)).toBeInTheDocument();
    });
  });

  it("substitutions が上限を超えたらエラーを表示", async () => {
    const substitutions = Array.from({ length: 10001 }, (_, i) => ({ id: i }));
    decodeShareData.mockResolvedValueOnce({ slots: [], substitutions });
    render(<SharePage encoded="xxx" />);
    await waitFor(() => {
      expect(screen.getByText(/上限/)).toBeInTheDocument();
    });
  });

  it("data が null でも形式エラーとして処理", async () => {
    decodeShareData.mockResolvedValueOnce(null);
    render(<SharePage encoded="xxx" />);
    await waitFor(() => {
      expect(screen.getByText(/データ形式が不正です/)).toBeInTheDocument();
    });
  });

  it("正常系: SharedSubsView が描画される", async () => {
    decodeShareData.mockResolvedValueOnce({
      slots: [{ id: 1 }],
      substitutions: [
        {
          id: 10,
          slotId: 1,
          date: "2026-04-13",
          originalTeacher: "山田",
          substitute: "鈴木",
          status: "confirmed",
          memo: "",
        },
      ],
    });
    render(<SharePage encoded="xxx" />);
    await waitFor(() => {
      expect(screen.getByTestId("shared-view")).toBeInTheDocument();
    });
    expect(screen.getByTestId("shared-view")).toHaveTextContent("1");
  });

  it("unmount 後に resolve しても state 更新しない (cancelled フラグ)", async () => {
    let resolveFn;
    decodeShareData.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFn = resolve;
      })
    );
    const { unmount } = render(<SharePage encoded="xxx" />);
    unmount();
    resolveFn({ slots: [], substitutions: [] });
    await new Promise((r) => setTimeout(r, 10));
    expect(console.error).not.toHaveBeenCalled();
  });
});
