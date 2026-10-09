// @vitest-environment jsdom
// 予定表チェック: Excel を読み込むと食い違う日が並び、直す案は押したときだけ
// 休講日として足される (元に戻せる)・振替元の日は休講日にせず日まるごと振替へ
// 案内する・講座の対応を直すと結果が変わる・閲覧者には登録のボタンを出さない・
// 画面を離れて戻っても読み込んだ予定表が残る・印刷では操作部を出さない、を固定する。
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// App と同じく、読み込んだ予定表 (session) は画面の外で持つ
function Harness({ isAdmin = true, onState, onOpenDayReschedule, slots = SMALL_SLOTS }) {
  const [holidays, saveHolidays] = useState(HOLIDAYS);
  const [adjustments, saveAdjustments] = useState([]);
  const [session, setSession] = useState(null);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    onState?.({ holidays, adjustments });
  }, [holidays, adjustments, onState]);
  return (
    <>
      <button type="button" onClick={() => setShown((v) => !v)}>
        {shown ? "ほかの画面へ" : "予定表チェックへ戻る"}
      </button>
      {shown && (
        <YoteihyoCheckView
          slots={slots}
          holidays={holidays}
          saveHolidays={saveHolidays}
          adjustments={adjustments}
          saveAdjustments={saveAdjustments}
          isAdmin={isAdmin}
          session={session}
          onSessionChange={setSession}
          onOpenDayReschedule={onOpenDayReschedule}
        />
      )}
    </>
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

const chooseFile = (name) =>
  fireEvent.change(screen.getByLabelText("予定表の Excel ファイル"), {
    target: { files: [new File(["x"], name)] },
  });

async function loadWorkbook(name = "予定表.xls") {
  chooseFile(name);
  await screen.findByText(`読み込んだファイル: ${name}`);
}

// シート名の全角スペースは testing-library の既定の正規化で半角 1 つになる
const USE_SHEET = "「2026 H1H2【10-11月】教員用」を使う";

const dayCards = () =>
  screen.queryAllByRole("article").map((el) => within(el).getByRole("heading", { level: 3 }).textContent);
const card = (label) => screen.getByRole("article", { name: label });

describe("YoteihyoCheckView — 読み込みと食い違い", () => {
  it("読み込むと今年度のシートが選ばれ、食い違う日が日付順に並ぶ", async () => {
    renderView();
    expect(screen.getByRole("button", { name: "予定表を読み込む" })).toBeTruthy();
    await loadWorkbook();
    expect(readWorkbookFile).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(USE_SHEET).checked).toBe(true);
    expect(screen.getByRole("button", { name: "別の予定表を読み込む" })).toBeTruthy();
    // 10/12 は休講日が登録済みなので出ない
    expect(dayCards()).toEqual(["10/15 (木)", "11/6 (金)", "11/9 (月)"]);
    const c = card("10/15 (木)");
    expect(within(c).getByText(/予定表: 休講 \(灰色\)/)).toBeTruthy();
    expect(within(c).getByText(/休講日を追加: 「休講 \(予定表\)」/)).toBeTruthy();
    expect(within(c).getByText("高校部 高1")).toBeTruthy();
  });

  it("振替元の日 (11/9) は休講日にせず、日まるごと振替を案内する", async () => {
    renderView({ onOpenDayReschedule: vi.fn() });
    await loadWorkbook();
    const c = card("11/9 (月)");
    expect(within(c).getByText(/予定表では 11\/6 \(金\) に振り替えています/)).toBeTruthy();
    expect(within(c).queryByText(/休講日を追加/)).toBeNull();
    expect(within(c).queryByRole("button", { name: "この日の案を登録" })).toBeNull();
    expect(within(c).getByRole("button", { name: "11/9 (月) → 11/6 (金) の日まるごと振替を開く" })).toBeTruthy();
  });

  it("今年度以外のシートは畳んでおき、選ばない", async () => {
    readWorkbookFile.mockResolvedValue({
      sheets: [smallH12Sheet({ name: "2025 H1H2【10-11月】教員用", year: 2025 }), smallH12Sheet()],
    });
    renderView();
    await loadWorkbook();
    const old = screen.getByText("今年度以外のシート (1 枚)").closest("details");
    expect(old.open).toBe(false);
    expect(within(old).getByLabelText("「2025 H1H2【10-11月】教員用」を使う").checked).toBe(false);
    expect(screen.getByLabelText(USE_SHEET).closest("details")).toBeNull();
    expect(dayCards()).toHaveLength(3);
  });

  it("シートを外すと比べない", async () => {
    renderView();
    await loadWorkbook();
    fireEvent.click(screen.getByLabelText(USE_SHEET));
    expect(dayCards()).toEqual([]);
    expect(screen.queryByRole("heading", { name: "予定表と食い違う日" })).toBeNull();
    expect(screen.getByText("比べるシートにチェックを入れてください。")).toBeTruthy();
  });

  it("高校部のシートが無いファイルは未対応と知らせる", async () => {
    readWorkbookFile.mockResolvedValue({ sheets: [makeSheet("T3", (s) => s.set(0, 0, "2026年度 中3 予定表"))] });
    renderView();
    await loadWorkbook();
    expect(screen.getByLabelText("「T3」を使う").disabled).toBe(true);
    expect(screen.getByText("中学部 (未対応)")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/読み込める高校部の予定表のシートがありません/);
  });

  it("読めないファイルは理由を出し、前に読み込んだ結果は消さない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderView();
    readWorkbookFile.mockRejectedValueOnce(new Error("Excel のファイル (.xls / .xlsx) ではありません"));
    chooseFile("memo.txt");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "「memo.txt」を読み込めませんでした: Excel のファイル (.xls / .xlsx) ではありません"
    );
    expect(screen.getByRole("button", { name: "予定表を読み込む" })).toBeTruthy();

    await loadWorkbook();
    readWorkbookFile.mockRejectedValueOnce(new Error("壊れています"));
    chooseFile("memo2.txt");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/「memo2\.txt」を読み込めませんでした/));
    expect(screen.getByRole("alert").textContent).toMatch(/表示しているのは「予定表\.xls」の結果です/);
    expect(dayCards()).toHaveLength(3);
    warn.mockRestore();
  });

  it("先に選んだファイルが後から読み終わっても、後で選んだファイルの結果を上書きしない", async () => {
    let finishFirst;
    readWorkbookFile
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockImplementationOnce(() => Promise.resolve({ sheets: [smallH12Sheet({ withMove: false })] }));
    renderView();
    chooseFile("A.xls");
    chooseFile("B.xls");
    await screen.findByText("読み込んだファイル: B.xls");
    await act(async () => {
      finishFirst({ sheets: [smallH12Sheet()] });
    });
    expect(screen.getByText("読み込んだファイル: B.xls")).toBeTruthy();
    // B は 11/6 の振替の無い表
    expect(dayCards()).toEqual(["10/15 (木)", "11/9 (月)"]);
  });

  it("画面を離れて戻っても、読み込んだ予定表と選んだシートが残る", async () => {
    renderView();
    await loadWorkbook();
    fireEvent.click(screen.getByRole("button", { name: "ほかの画面へ" }));
    expect(screen.queryByText("読み込んだファイル: 予定表.xls")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "予定表チェックへ戻る" }));
    expect(screen.getByText("読み込んだファイル: 予定表.xls")).toBeTruthy();
    expect(screen.getByLabelText(USE_SHEET).checked).toBe(true);
    expect(dayCards()).toHaveLength(3);
  });

  it("印刷: 紙面の題は予定表チェックとファイル名、操作部は no-print", async () => {
    renderView({ onOpenDayReschedule: vi.fn() });
    await loadWorkbook();
    const heading = screen.getByRole("heading", { name: "予定表と食い違う日" });
    expect(heading.getAttribute("data-print-title")).toBe("予定表チェック 予定表.xls");
    for (const el of [
      screen.getByRole("button", { name: "別の予定表を読み込む" }),
      screen.getByLabelText(USE_SHEET),
      screen.getByLabelText("今日以降だけ"),
      screen.getByRole("button", { name: /まとめて登録/ }),
      within(card("10/15 (木)")).getByRole("button", { name: "この日の案を登録" }),
      within(card("11/6 (金)")).getByRole("button", { name: /日まるごと振替を開く/ }),
      screen.getByRole("button", { name: "高1 高松西高校 の対応を変える" }),
    ]) {
      expect(el.closest(".no-print")).not.toBeNull();
    }
    // 食い違う日の一覧そのものは紙面に出す
    expect(card("10/15 (木)").closest(".no-print")).toBeNull();
  });
});

describe("YoteihyoCheckView — 直す案の登録", () => {
  it("押したときだけ休講日を足し、元に戻せる。消えたカードの次へフォーカスを移す", async () => {
    let state = null;
    const onState = (s) => {
      state = s;
    };
    renderView({ onState });
    await loadWorkbook();
    expect(state.holidays).toEqual(HOLIDAYS);

    fireEvent.click(within(card("10/15 (木)")).getByRole("button", { name: "この日の案を登録" }));
    expect(state.holidays).toEqual([
      ...HOLIDAYS,
      { id: 2, date: "2026-10-15", label: "休講 (予定表)", scope: ["高校部"], targetGrades: ["高1"], subjKeywords: [] },
    ]);
    expect(state.adjustments).toEqual([]);
    expect(dayCards()).toEqual(["11/6 (金)", "11/9 (月)"]);
    expect(document.activeElement.textContent).toBe("11/6 (金)");
    const toasts = screen.getByTestId("toasts");
    expect(within(toasts).getByText("休講日を 1 件登録しました")).toBeTruthy();

    fireEvent.click(within(toasts).getByRole("button", { name: "元に戻す" }));
    expect(state.holidays).toEqual(HOLIDAYS);
    expect(dayCards()).toContain("10/15 (木)");
  });

  it("まとめて登録は確認してから、直す案のある日だけ (振替元の日は入れない)", async () => {
    let state = null;
    const onState = (s) => {
      state = s;
    };
    renderView({ onState });
    await loadWorkbook();

    fireEvent.click(screen.getByRole("button", { name: "表示中の直す案をまとめて登録 (1 日)" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/^1 日分の直す案 \(休講日 1 件\) を登録します。登録した後も/)).toBeTruthy();
    // キャンセルなら何も変えない
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(state.holidays).toEqual(HOLIDAYS);

    fireEvent.click(screen.getByRole("button", { name: "表示中の直す案をまとめて登録 (1 日)" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "登録する" }));
    await waitFor(() => expect(state.holidays).toHaveLength(2));
    expect(state.holidays[1]).toMatchObject({ date: "2026-10-15", label: "休講 (予定表)", targetGrades: ["高1"] });
    // 11/6 (振替の登録待ち) と 11/9 (振替元) は残る
    expect(dayCards()).toEqual(["11/6 (金)", "11/9 (月)"]);
  });

  it("まとめて登録の確認で、今日より前の日が含まれることを知らせる", async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0)); // 2026-10-20
    renderView();
    await loadWorkbook();
    expect(within(card("10/15 (木)")).getByText(/過ぎた日 \(直すと、この日以降の第N回が変わります\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /まとめて登録/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/今日より前の日が 1 日含まれます \(第N回の数え方が変わります\)/)).toBeTruthy();
  });

  it("確認の間に他の端末で足された休講日を消さない (書き込む時点の配列に足す)", async () => {
    let state = null;
    const onState = (s) => {
      state = s;
    };
    // 他の端末からの同期の代わりに、確認ダイアログを開いたまま休講日を足す
    let addRemote;
    function SyncHarness() {
      const [holidays, saveHolidays] = useState(HOLIDAYS);
      const [adjustments, saveAdjustments] = useState([]);
      const [session, setSession] = useState(null);
      addRemote = () =>
        saveHolidays((prev) => [
          ...prev,
          { id: 2, date: "2026-12-01", label: "他端末で追加", scope: ["全部"], targetGrades: [], subjKeywords: [] },
        ]);
      useEffect(() => onState({ holidays, adjustments }), [holidays, adjustments]);
      return (
        <YoteihyoCheckView
          slots={SMALL_SLOTS}
          holidays={holidays}
          saveHolidays={saveHolidays}
          adjustments={adjustments}
          saveAdjustments={saveAdjustments}
          isAdmin
          session={session}
          onSessionChange={setSession}
        />
      );
    }
    render(
      <ToastProvider>
        <ConfirmProvider>
          <SyncHarness />
        </ConfirmProvider>
      </ToastProvider>
    );
    await loadWorkbook();
    fireEvent.click(screen.getByRole("button", { name: /まとめて登録/ }));
    await screen.findByRole("dialog");
    act(() => addRemote());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "登録する" }));
    await waitFor(() => expect(state.holidays).toHaveLength(3));
    expect(state.holidays.map((h) => [h.id, h.label])).toEqual([
      [1, "スポーツの日"],
      [2, "他端末で追加"],
      [3, "休講 (予定表)"],
    ]);
  });

  it("振替で入る日は、注記の振替元から日まるごと振替を開く", async () => {
    const onOpenDayReschedule = vi.fn();
    renderView({ onOpenDayReschedule });
    await loadWorkbook();
    const c = card("11/6 (金)");
    expect(within(c).getByText(/注記「←11\/9\(月\)の振替→」/)).toBeTruthy();
    fireEvent.click(within(c).getByRole("button", { name: "11/9 (月) → 11/6 (金) の日まるごと振替を開く" }));
    expect(onOpenDayReschedule).toHaveBeenCalledWith({ sourceDate: "2026-11-09", targetDate: "2026-11-06" });
  });

  it("閲覧者には登録・振替のボタンを出さない", async () => {
    renderView({ isAdmin: false, onOpenDayReschedule: vi.fn() });
    await loadWorkbook();
    expect(dayCards()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "この日の案を登録" })).toBeNull();
    expect(screen.queryByRole("button", { name: /まとめて登録/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /日まるごと振替を開く/ })).toBeNull();
    expect(
      screen.getByText(
        "直す案の登録と日まるごと振替を開くには、管理者ログインが必要です (サイドバー下の「管理者ログイン」から)。"
      )
    ).toBeTruthy();
  });
});

describe("YoteihyoCheckView — 講座とコマの対応", () => {
  it("「比べない」にした講座は比べず、選んだ結果をこの端末に残す", async () => {
    renderView();
    await loadWorkbook();
    const row = screen.getByText("高1 高松西高校", { selector: "td > div" }).closest("tr");
    expect(within(row).getByText("高1 高松西 数学")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "高1 高松西高校 の対応を変える" }));
    fireEvent.click(screen.getByRole("button", { name: "この講座は比べない" }));

    expect(within(row).getByText("比べない")).toBeTruthy();
    expect(document.activeElement.getAttribute("aria-label")).toBe("高1 高松西高校 の対応を変える");
    expect(dayCards()).toEqual([]);
    expect(screen.getByText("食い違う日はありません。")).toBeTruthy();
    expect(screen.getByText(/ほかに 1 講座は比べていません/)).toBeTruthy();
    // 比べていない期間には数えない (表示期間とは関係ない)
    expect(screen.queryByText(/比べていない期間/)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LS.yoteihyoMapping))).toEqual({ "高1|高松西高校": { skip: true } });

    // 自動の対応に戻すと元どおり
    fireEvent.click(within(row).getByRole("button", { name: "高1 高松西高校 の対応を変える" }));
    fireEvent.click(screen.getByRole("button", { name: "自動の対応に戻す" }));
    expect(dayCards()).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem(LS.yoteihyoMapping))).toEqual({});
  });

  it("コマが見つからない講座があれば開いて知らせ、直しても勝手には閉じない", async () => {
    // 古文漢文のコマが無いシステム
    renderView({ slots: SMALL_SLOTS.filter((s) => s.id !== 3) });
    await loadWorkbook();
    const panel = screen.getByText(/講座とシステムのコマの対応 \(2 講座、うち 1 講座はコマが見つかりません\)/).closest(
      "details"
    );
    expect(panel.open).toBe(true);
    expect(screen.getByText(/コマが見つからないため比べていない講座: 高2 古文・漢文/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "高2 古文・漢文 の対応を変える" }));
    fireEvent.click(screen.getByRole("button", { name: "この講座は比べない" }));
    expect(screen.getByText("講座とシステムのコマの対応 (2 講座)").closest("details").open).toBe(true);
  });
});
