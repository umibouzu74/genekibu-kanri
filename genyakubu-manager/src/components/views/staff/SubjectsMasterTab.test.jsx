// @vitest-environment jsdom
// 教科マスターのインライン編集は blur / Enter で 1 回だけ保存する。
// onChange ごとに保存すると useSyncedStorage が打鍵ぶん RTDB へ書き込む
// (色のドラッグでは数十回)。空の名前は元に戻し、同じ一覧内の重複は行内に
// エラーを出して保存しない。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubjectsMasterTab } from "./SubjectsMasterTab";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CATS = [
  { id: 1, name: "文系", color: "#4488aa" },
  { id: 2, name: "理系", color: "#aa4488" },
];
const SUBJECTS = [
  { id: 1, name: "英語", categoryId: 1, aliases: ["英"] },
  { id: 2, name: "国語", categoryId: 1, aliases: [] },
  { id: 3, name: "数学", categoryId: 2, aliases: [] },
];

function renderTab(props = {}) {
  const onSaveCategory = vi.fn();
  const onSaveSubject = vi.fn();
  const byCat = new Map();
  for (const s of SUBJECTS) {
    if (!byCat.has(s.categoryId)) byCat.set(s.categoryId, []);
    byCat.get(s.categoryId).push(s);
  }
  render(
    <SubjectsMasterTab
      subjectCategories={CATS}
      subjectsByCat={byCat}
      newCatName=""
      setNewCatName={vi.fn()}
      newCatColor="#888888"
      setNewCatColor={vi.fn()}
      handleAddCategory={vi.fn()}
      newSubjByCat={{}}
      setNewSubjByCat={vi.fn()}
      handleAddSubject={vi.fn()}
      onSaveCategory={onSaveCategory}
      onDelCategory={vi.fn()}
      onSaveSubject={onSaveSubject}
      onDelSubject={vi.fn()}
      {...props}
    />
  );
  return { onSaveCategory, onSaveSubject };
}

describe("SubjectsMasterTab — カテゴリ名", () => {
  it("打鍵ごとには保存せず、blur で 1 回だけ保存する", () => {
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("カテゴリ名 文系");
    fireEvent.change(input, { target: { value: "文" } });
    fireEvent.change(input, { target: { value: "文系科目" } });
    expect(onSaveCategory).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onSaveCategory).toHaveBeenCalledTimes(1);
    expect(onSaveCategory).toHaveBeenCalledWith({ id: 1, name: "文系科目", color: "#4488aa" });
  });

  it("Enter で確定できる", () => {
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("カテゴリ名 文系");
    input.focus();
    fireEvent.change(input, { target: { value: "文系A" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Enter は blur() を呼ぶ (focus 中なら jsdom も blur イベントを発火する)
    expect(onSaveCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "文系A" }));
  });

  it("値が変わっていなければ保存しない", () => {
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("カテゴリ名 文系");
    fireEvent.change(input, { target: { value: "文系 " } });
    fireEvent.blur(input);
    expect(onSaveCategory).not.toHaveBeenCalled();
  });

  it("Escape で編集を捨てて元の値に戻す", () => {
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("カテゴリ名 文系");
    fireEvent.change(input, { target: { value: "捨てる" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("文系");
    fireEvent.blur(input);
    expect(onSaveCategory).not.toHaveBeenCalled();
  });

  it("空にして blur すると保存せず元の名前に戻る", () => {
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("カテゴリ名 文系");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onSaveCategory).not.toHaveBeenCalled();
    expect(input.value).toBe("文系");
  });

  it("他のカテゴリと同じ名前は行内エラーを出して保存しない", () => {
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("カテゴリ名 文系");
    fireEvent.change(input, { target: { value: "理系" } });
    fireEvent.blur(input);
    expect(onSaveCategory).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/「理系」は既に登録されています/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    // 直せば保存できる
    fireEvent.change(input, { target: { value: "理系以外" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.blur(input);
    expect(onSaveCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "理系以外" }));
  });
});

describe("SubjectsMasterTab — 教科名・別名", () => {
  it("同じカテゴリ内の重複は保存しない", () => {
    const { onSaveSubject } = renderTab();
    const input = screen.getByLabelText("教科名 国語");
    fireEvent.change(input, { target: { value: "英語" } });
    fireEvent.blur(input);
    expect(onSaveSubject).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/既に登録されています/);
  });

  it("別のカテゴリにある名前は重複にしない (一覧が違う)", () => {
    const { onSaveSubject } = renderTab();
    const input = screen.getByLabelText("教科名 国語");
    fireEvent.change(input, { target: { value: "数学" } });
    fireEvent.blur(input);
    expect(onSaveSubject).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: "数学" }));
  });

  it("空の教科名は保存せず元に戻る", () => {
    const { onSaveSubject } = renderTab();
    const input = screen.getByLabelText("教科名 国語");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onSaveSubject).not.toHaveBeenCalled();
    expect(input.value).toBe("国語");
  });

  it("別名は blur で配列に分解して保存する (打鍵ごとには保存しない)", () => {
    const { onSaveSubject } = renderTab();
    const input = screen.getByLabelText("英語 の別名");
    fireEvent.change(input, { target: { value: "英, " } });
    fireEvent.change(input, { target: { value: "英, Eng, " } });
    expect(onSaveSubject).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onSaveSubject).toHaveBeenCalledTimes(1);
    expect(onSaveSubject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, aliases: ["英", "Eng"] })
    );
  });
});

describe("SubjectsMasterTab — カテゴリ色", () => {
  it("ドラッグ中の連続 onChange は 300ms 後に最後の色だけ保存する", () => {
    vi.useFakeTimers();
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("文系 の色");
    fireEvent.change(input, { target: { value: "#111111" } });
    fireEvent.change(input, { target: { value: "#222222" } });
    fireEvent.change(input, { target: { value: "#333333" } });
    expect(onSaveCategory).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(onSaveCategory).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSaveCategory).toHaveBeenCalledTimes(1);
    expect(onSaveCategory).toHaveBeenCalledWith({ id: 1, name: "文系", color: "#333333" });
  });

  it("blur すればデバウンスを待たずに確定する", () => {
    vi.useFakeTimers();
    const { onSaveCategory } = renderTab();
    const input = screen.getByLabelText("文系 の色");
    fireEvent.change(input, { target: { value: "#123456" } });
    fireEvent.blur(input);
    expect(onSaveCategory).toHaveBeenCalledTimes(1);
    expect(onSaveCategory).toHaveBeenCalledWith(expect.objectContaining({ color: "#123456" }));
    // タイマーが後から二重に保存しない
    vi.advanceTimersByTime(500);
    expect(onSaveCategory).toHaveBeenCalledTimes(1);
  });
});
