// @vitest-environment jsdom
// 引継ぎメモ: 1 行で追加できる・詳細つきで編集できる・削除は Undo 付き・
// 去年の同じ時期のメモが先頭に出る・閲覧者には中身を出さない、を固定する。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HandoverView } from "./HandoverView";
import { ToastProvider } from "../../hooks/useToasts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0)); // 2026-10-01
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness({ initial = [], enabled = true, onSaveSpy }) {
  const [notes, setNotes] = useState(initial);
  return (
    <HandoverView
      notes={notes}
      enabled={enabled}
      onSave={(next) => {
        onSaveSpy?.(next);
        setNotes(next);
      }}
    />
  );
}

const renderView = (props) =>
  render(
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id}>
              {t.message}
              {t.action && <button onClick={t.action.onClick}>{t.action.label}</button>}
            </div>
          ))}
        </div>
      )}
    >
      <Harness {...props} />
    </ToastProvider>
  );

describe("HandoverView", () => {
  it("日付 (今日)・分類・1 行だけで追加でき、日付と分類は次の入力に残る", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.change(screen.getByLabelText("分類"), { target: { value: "事務" } });
    fireEvent.change(screen.getByLabelText("メモ"), {
      target: { value: "事務よりズバリ的中の提出催促" },
    });
    fireEvent.click(screen.getByRole("button", { name: "＋ 追加" }));
    expect(spy).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: 1,
        date: "2026-10-01",
        category: "事務",
        title: "事務よりズバリ的中の提出催促",
      }),
    ]);
    expect(spy.mock.calls[0][0][0]).not.toHaveProperty("body");
    expect(screen.getByText("事務よりズバリ的中の提出催促")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /2026年10月/ })).toBeInTheDocument();
    expect(screen.getByLabelText("メモ")).toHaveValue("");
    expect(screen.getByLabelText("日付")).toHaveValue("2026-10-01");
  });

  it("見出しが空なら保存しない", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.click(screen.getByRole("button", { name: "＋ 追加" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("詳しく書く: 経緯・次の担当者へ・毎年を入れられ、カードに出る", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.change(screen.getByLabelText("メモ"), {
      target: { value: "事務よりズバリ的中の提出催促" },
    });
    fireEvent.click(screen.getByRole("button", { name: /詳しく書く/ }));
    fireEvent.change(screen.getByLabelText("経緯・詳細"), {
      target: { value: "9月の会議で告知済み" },
    });
    fireEvent.change(screen.getByLabelText("次の担当者へ"), {
      target: { value: "会議の後に念押しする" },
    });
    fireEvent.click(screen.getByLabelText(/毎年この時期/));
    fireEvent.click(screen.getByRole("button", { name: "＋ 追加" }));
    expect(spy.mock.calls[0][0][0]).toMatchObject({
      body: "9月の会議で告知済み",
      advice: "会議の後に念押しする",
      annual: true,
    });
    const card = screen.getByText("事務よりズバリ的中の提出催促").closest("article");
    expect(within(card).getByText("9月の会議で告知済み")).toBeInTheDocument();
    expect(within(card).getByText(/会議の後に念押しする/)).toBeInTheDocument();
    expect(within(card).getByText("🔁 毎年")).toBeInTheDocument();
  });

  it("編集して保存すると中身が変わる", () => {
    const spy = vi.fn();
    renderView({
      onSaveSpy: spy,
      initial: [{ id: 3, date: "2026-10-01", category: "事務", title: "提出催促" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "提出催促 を編集" }));
    const card = screen.getByRole("button", { name: "保存" }).closest("article");
    fireEvent.change(within(card).getByLabelText("メモ"), {
      target: { value: "ズバリ的中の提出催促" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "保存" }));
    expect(spy.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 3, title: "ズバリ的中の提出催促" }),
    ]);
    expect(screen.getByText("ズバリ的中の提出催促")).toBeInTheDocument();
  });

  it("削除は即時で、toast の「元に戻す」で戻せる", () => {
    renderView({
      initial: [{ id: 3, date: "2026-10-01", category: "事務", title: "提出催促" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "提出催促 を削除" }));
    expect(screen.queryByText("提出催促")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(screen.getByText("提出催促")).toBeInTheDocument();
  });

  it("去年の同じ時期のメモを先頭に出す", () => {
    renderView({
      initial: [
        { id: 1, date: "2025-10-03", category: "事務", title: "ズバリ的中の提出催促", advice: "9月中に念押し" },
        { id: 2, date: "2025-12-20", category: "行事・講習", title: "冬期講習の準備" },
      ],
    });
    const panel = screen.getByRole("region", { name: "去年までのこの時期のメモ" });
    expect(within(panel).getByText(/ズバリ的中の提出催促/)).toBeInTheDocument();
    expect(within(panel).getByText("2 日後")).toBeInTheDocument();
    expect(within(panel).getByText(/9月中に念押し/)).toBeInTheDocument();
    expect(within(panel).queryByText(/冬期講習/)).toBeNull();
  });

  it("月別にすると年をまたいで同じ月がまとまる。検索で絞れる", () => {
    renderView({
      initial: [
        { id: 1, date: "2025-10-03", category: "事務", title: "去年の催促" },
        { id: 2, date: "2026-10-01", category: "事務", title: "今年の催促" },
        { id: 3, date: "2026-04-08", category: "講師", title: "新年度の講師面談" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "月別 (年度の流れ)" }));
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["4月1 件", "10月2 件"]);
    fireEvent.change(screen.getByLabelText("引継ぎメモを検索"), { target: { value: "面談" } });
    expect(screen.queryByText("今年の催促")).toBeNull();
    expect(screen.getByText("新年度の講師面談")).toBeInTheDocument();
    expect(screen.getByText("1 / 3 件")).toBeInTheDocument();
  });

  it("管理者でないときは中身を出さない", () => {
    renderView({
      enabled: false,
      initial: [{ id: 1, date: "2026-10-01", category: "事務", title: "秘密のメモ" }],
    });
    expect(screen.queryByText("秘密のメモ")).toBeNull();
    expect(screen.getByText(/管理者だけが読めます/)).toBeInTheDocument();
  });

  it("テキストで書き出せる", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderView({
      initial: [{ id: 1, date: "2026-10-01", category: "事務", title: "提出催促" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /テキストで書き出す/ }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
