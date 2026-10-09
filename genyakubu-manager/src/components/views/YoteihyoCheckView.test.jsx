// @vitest-environment jsdom
// 予定表チェック: Excel を読み込むと食い違う日が並び、直す案は押したときだけ
// 休講日として足される (元に戻せる)・振替の日は日まるごと振替へ案内する・
// 講座の対応を直すと結果が変わる・閲覧者には登録のボタンを出さない、を固定する。
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { YoteihyoCheckView } from "./YoteihyoCheckView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { LS } from "../../constants/storageKeys";
import { readWorkbookFile } from "../../utils/yoteihyo/workbookFile";
import { SMALL_SLOTS, makeSheet, smallH12Sheet } from "../../utils/yoteihyo/testUtils";

vi.mock("../../utils/yoteihyo/workbookFile", () => ({ readWorkbookFile: vi.fn() }));

beforeEach(() => {
  // ファイルの読み込み (Promise) と findBy の待ちは本物のタイマーで回す
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0)); // 2026-10-09 (金)
  localStorage.clear();
  readWorkbookFile.mockReset();
  readWorkbookFile.mockResolvedValue({ sheets: [smallH12Sheet()] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const HOLIDAYS = [
  { id: 1, date: "2026-10-12", label: "スポーツの日", scope: ["全部"], targetGrades: [], subjKeywords: [] },
];

function Harness({ isAdmin = true, onState, onOpenDayReschedule }) {
  const [holidays, saveHolidays] = useState(HOLIDAYS);
  const [adjustments, saveAdjustments] = useState([]);
  useEffect(() => {
    onState?.({ holidays, adjustments });
  }, [holidays, adjustments, onState]);
  return (
    <YoteihyoCheckView
      slots={SMALL_SLOTS}
      holidays={holidays}
      saveHolidays={saveHolidays}
      adjustments={adjustments}
      saveAdjustments={saveAdjustments}
      isAdmin={isAdmin}
      onOpenDayReschedule={onOpenDayReschedule}
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
      <ConfirmProvider>
        <Harness {...props} />
      </ConfirmProvider>
    </ToastProvider>
  );

async function loadWorkbook(name = "予定表.xls") {
  fireEvent.change(screen.getByLabelText("予定表の Excel ファイル"), {
    target: { files: [new File(["x"], name)] },
  });
  await screen.findByText(`読み込んだファイル: ${name}`);
}

// シート名の全角スペースは testing-library の既定の正規化で半角 1 つになる
const USE_SHEET = "「2026 H1H2【10-11月】教員用」を照合に使う";

const dayCards = () =>
  screen.queryAllByRole("region", { name: /の食い違い$/ }).map((el) => el.getAttribute("aria-label"));
const card = (label) => screen.getByRole("region", { name: `${label} の食い違い` });

describe("YoteihyoCheckView — 読み込みと食い違い", () => {
  it("読み込むと今年度のシートが選ばれ、食い違う日が日付順に並ぶ", async () => {
    renderView();
    expect(screen.getByRole("button", { name: "予定表を選ぶ" })).toBeTruthy();
    await loadWorkbook();
    expect(readWorkbookFile).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(USE_SHEET).checked).toBe(true);
    expect(screen.getByRole("button", { name: "別の予定表を読む" })).toBeTruthy();
    // 10/12 は休講日が登録済みなので出ない
    expect(dayCards()).toEqual(["10/15(木) の食い違い", "11/6(金) の食い違い", "11/9(月) の食い違い"]);
    const c = card("10/15(木)");
    expect(within(c).getByText(/予定表: 休講 \(灰色\)/)).toBeTruthy();
    expect(within(c).getByText("高校部 高1")).toBeTruthy();
    // 11/9 は休校の行の文字を休講日の名前に使う
    expect(within(card("11/9(月)")).getByText(/休講日「休校」/)).toBeTruthy();
  });

  it("今年度に掛からないシートは畳んでおき、選ばない", async () => {
    readWorkbookFile.mockResolvedValue({
      sheets: [smallH12Sheet({ name: "2025 H1H2【10-11月】教員用", year: 2025 }), smallH12Sheet()],
    });
    renderView();
    await loadWorkbook();
    const old = screen.getByText("今年度に掛からないシート (1 枚)").closest("details");
    expect(within(old).getByLabelText("「2025 H1H2【10-11月】教員用」を照合に使う").checked).toBe(false);
    expect(screen.getByLabelText(USE_SHEET).closest("details")).toBeNull();
    expect(dayCards()).toHaveLength(3);
  });

  it("シートを外すと比べない", async () => {
    renderView();
    await loadWorkbook();
    fireEvent.click(screen.getByLabelText(USE_SHEET));
    expect(dayCards()).toEqual([]);
    expect(screen.queryByText("食い違う日")).toBeNull();
    expect(screen.getByText("照合に使うシートにチェックを入れてください。")).toBeTruthy();
  });

  it("高校部のシートが無いファイルは未対応と知らせる", async () => {
    readWorkbookFile.mockResolvedValue({ sheets: [makeSheet("T3", (s) => s.set(0, 0, "2026年度 中3 予定表"))] });
    renderView();
    await loadWorkbook();
    expect(screen.getByLabelText("「T3」を照合に使う").disabled).toBe(true);
    expect(screen.getByRole("note").textContent).toMatch(/読める高校部の予定表のシートがありません/);
  });

  it("読めないファイルは理由を出す", async () => {
    readWorkbookFile.mockRejectedValueOnce(new Error("Excel のファイル (.xls / .xlsx) ではありません"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderView();
    fireEvent.change(screen.getByLabelText("予定表の Excel ファイル"), {
      target: { files: [new File(["x"], "memo.txt")] },
    });
    expect((await screen.findByRole("alert")).textContent).toBe("Excel のファイル (.xls / .xlsx) ではありません");
    expect(screen.getByRole("button", { name: "予定表を選ぶ" })).toBeTruthy();
    warn.mockRestore();
  });
});

describe("YoteihyoCheckView — 直す案の登録", () => {
  it("押したときだけ休講日を足し、元に戻せる", async () => {
    let state = null;
    const onState = (s) => {
      state = s;
    };
    renderView({ onState });
    await loadWorkbook();
    expect(state.holidays).toEqual(HOLIDAYS);

    fireEvent.click(within(card("10/15(木)")).getByRole("button", { name: "この日の案を登録" }));
    expect(state.holidays).toEqual([
      ...HOLIDAYS,
      { id: 2, date: "2026-10-15", label: "休講", scope: ["高校部"], targetGrades: ["高1"], subjKeywords: [] },
    ]);
    expect(state.adjustments).toEqual([]);
    expect(dayCards()).toEqual(["11/6(金) の食い違い", "11/9(月) の食い違い"]);
    const toasts = screen.getByTestId("toasts");
    expect(within(toasts).getByText("休講日を 1 件登録しました")).toBeTruthy();

    fireEvent.click(within(toasts).getByRole("button", { name: "元に戻す" }));
    expect(state.holidays).toEqual(HOLIDAYS);
    expect(dayCards()).toContain("10/15(木) の食い違い");
  });

  it("まとめて登録は確認してから、直す案のある日だけ", async () => {
    let state = null;
    const onState = (s) => {
      state = s;
    };
    renderView({ onState });
    await loadWorkbook();

    fireEvent.click(screen.getByRole("button", { name: "表示中の直す案をまとめて登録 (2 日)" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/休講日 2 件 を登録します/)).toBeTruthy();
    // キャンセルなら何も変えない
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(state.holidays).toEqual(HOLIDAYS);

    fireEvent.click(screen.getByRole("button", { name: "表示中の直す案をまとめて登録 (2 日)" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "登録する" }));
    await waitFor(() => expect(state.holidays).toHaveLength(3));
    expect(state.holidays.slice(1).map((h) => [h.date, h.label, h.targetGrades])).toEqual([
      ["2026-10-15", "休講", ["高1"]],
      ["2026-11-09", "休校", []],
    ]);
    // 振替の日 (11/6) は直す案が無いので残る
    expect(dayCards()).toEqual(["11/6(金) の食い違い"]);
  });

  it("振替で入る日は、注記の振替元から日まるごと振替を開く", async () => {
    const onOpenDayReschedule = vi.fn();
    renderView({ onOpenDayReschedule });
    await loadWorkbook();
    const c = card("11/6(金)");
    expect(within(c).getByText(/注記「←11\/9\(月\)の振替→」/)).toBeTruthy();
    fireEvent.click(within(c).getByRole("button", { name: "日まるごと振替を開く (11/9(月) → 11/6(金))" }));
    expect(onOpenDayReschedule).toHaveBeenCalledWith({ sourceDate: "2026-11-09", targetDate: "2026-11-06" });
  });

  it("閲覧者には登録・振替のボタンを出さない", async () => {
    renderView({ isAdmin: false, onOpenDayReschedule: vi.fn() });
    await loadWorkbook();
    expect(dayCards()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "この日の案を登録" })).toBeNull();
    expect(screen.queryByRole("button", { name: /まとめて登録/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /日まるごと振替を開く/ })).toBeNull();
    expect(screen.getByText("直す案の登録には管理者ログインが必要です。")).toBeTruthy();
  });
});

describe("YoteihyoCheckView — 講座とコマの対応", () => {
  it("「照合しない」にした講座は比べず、選んだ結果をこの端末に残す", async () => {
    renderView();
    await loadWorkbook();
    const row = screen.getByText("高1 高松西高校", { selector: "td" }).closest("tr");
    expect(within(row).getByText("高1 高松西 数学")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "変える" }));
    fireEvent.click(screen.getByRole("button", { name: "この講座は照合しない" }));

    expect(within(row).getByText("照合しない")).toBeTruthy();
    expect(dayCards()).toEqual([]);
    expect(screen.getByText("食い違う日はありません。")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(LS.yoteihyoMapping))).toEqual({ "高1|高松西高校": { skip: true } });

    // 自動の推定に戻すと元どおり
    fireEvent.click(within(row).getByRole("button", { name: "変える" }));
    fireEvent.click(screen.getByRole("button", { name: "自動の推定に戻す" }));
    expect(dayCards()).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem(LS.yoteihyoMapping))).toEqual({});
  });
});
