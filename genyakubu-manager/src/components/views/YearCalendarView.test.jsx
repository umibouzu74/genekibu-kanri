// @vitest-environment jsdom
// 年間カレンダー: 1 日の欄が上 = 予備校部 / 下 = 現役部 に分かれて並ぶ・予備校部の
// 日の種別 (休校日) は日付の塗りと短い名前で出る・段を隠せる・管理者は日付の
// 「＋」/ まとめて登録で予備校部の予定を入れ、Undo 付きで消せる・現役部の記録は
// 編集画面へ、閲覧者は見るだけ、を固定する。
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { YearCalendarView, SS_YEAR_CAL_KEY } from "./YearCalendarView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0)); // 2026-10-21 (水)
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const holidays = [{ id: 1, date: "2026-11-03", label: "文化の日", scope: ["全部"], targetGrades: [], subjKeywords: [] }];
const examPeriods = [
  {
    id: 7,
    name: "テスト直前特訓",
    startDate: "2026-11-17",
    endDate: "2026-11-26",
    targetGrades: ["中1", "中2"],
    classExceptions: [{ date: "2026-11-21", grades: ["中2"] }],
  },
  { id: 8, name: "高校 期末", startDate: "2026-12-08", endDate: "2026-12-08", targetGrades: [], stopsClasses: false },
];
const specialEvents = [
  { id: 3, name: "第2回保護者会", startDate: "2026-11-28", endDate: "2026-12-06", eventType: "parents", targetGrades: [], memo: "" },
];
const yobiko = [
  { id: 1, name: "", startDate: "2026-10-04", endDate: "2026-10-04", kind: "closed" },
  { id: 2, name: "スポーツの日", startDate: "2026-10-12", endDate: "2026-10-12", kind: "closed" },
  { id: 3, name: "冬期講習Ⅰ期", startDate: "2026-12-24", endDate: "2026-12-27", kind: "event", source: "予備校2026" },
  { id: 4, name: "進研模試(記述)", startDate: "2026-10-10", endDate: "2026-10-10", kind: "event", source: "予備校2026" },
];

function Harness({ initial = yobiko, isAdmin = true, onSaveSpy, onEditGenyakuEvent, adminRef }) {
  const [list, setList] = useState(initial);
  const [admin, setAdmin] = useState(isAdmin);
  if (adminRef) adminRef.current = setAdmin;
  isAdmin = admin;
  return (
    <YearCalendarView
      yobikoEvents={list}
      onSaveYobikoEvents={
        isAdmin
          ? (next) => {
              onSaveSpy?.(next);
              setList(next);
            }
          : undefined
      }
      holidays={holidays}
      examPeriods={examPeriods}
      specialEvents={specialEvents}
      isAdmin={isAdmin}
      onEditGenyakuEvent={onEditGenyakuEvent}
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

const month = (label) => screen.getByRole("region", { name: label });

describe("YearCalendarView", () => {
  it("既定は今月から 3 か月。週ごとに 予備校部 / 現役部 の段が並ぶ", () => {
    renderView();
    expect(screen.getByText("2026年10月〜12月")).toBeTruthy();
    const oct = month("2026年10月");
    expect(within(oct).getAllByRole("rowheader", { name: "予備校部" }).length).toBe(5);
    expect(within(oct).getAllByRole("rowheader", { name: "現役部" }).length).toBe(5);
    // 予備校部: 名前の無い休校日は日付の塗りと短い名前だけ、名前のある休校日は欄にも
    expect(within(oct).getAllByText("休校").length).toBe(2);
    expect(within(oct).getByText("スポーツの日")).toBeTruthy();
    expect(within(oct).getByText("進研模試(記述)")).toBeTruthy();
    // 現役部: 休講・テスト期間 (対象つき)・特別イベント
    const nov = month("2026年11月");
    expect(within(nov).getByText("文化の日")).toBeTruthy();
    expect(within(nov).getByText("テスト直前特訓 (中1・中2) 〜11/26")).toBeTruthy();
    expect(within(nov).getByText("👪 第2回保護者会 〜12/6")).toBeTruthy();
    // 期間の続きの日も (画面では薄く) 同じ名前で出る
    expect(within(month("2026年12月")).getAllByText("👪 第2回保護者会").length).toBe(6);
    expect(within(month("2026年12月")).getByText("冬期講習Ⅰ期 〜12/27")).toBeTruthy();
    // テスト期間の例外日 (授業あり)・授業を止めないテスト期間は見分けが付く
    expect(within(nov).getByText("テスト直前特訓 (中1・中2) · 📖 授業あり (中2)")).toBeTruthy();
    expect(within(month("2026年12月")).getByText("高校 期末 [表示のみ]")).toBeTruthy();
  });

  it("紙面の見出しは表示中の段だけ。印刷ジョブ名は期間から", () => {
    renderView();
    const title = screen.getByRole("heading", { level: 2, hidden: true });
    expect(title.textContent).toBe("2026年10月〜12月 (上: 予備校部 / 下: 現役部)");
    expect(title.getAttribute("data-print-title")).toBe("年間カレンダー 2026年10月〜12月");
    fireEvent.click(screen.getByRole("checkbox", { name: "現役部" }));
    expect(title.textContent).toBe("2026年10月〜12月 (予備校部)");
  });

  it("段を隠せる (最後の 1 つは外せない)。期間と段は sessionStorage に残る", () => {
    renderView();
    fireEvent.click(screen.getByRole("checkbox", { name: "現役部" }));
    expect(screen.queryAllByRole("rowheader", { name: "現役部" })).toHaveLength(0);
    expect(screen.getByRole("checkbox", { name: "予備校部" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "1か月" }));
    expect(screen.queryByRole("region", { name: "2026年11月" })).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(SS_YEAR_CAL_KEY))).toMatchObject({
      ym: "2026-10",
      count: 1,
      lanes: { yobiko: true, genyaku: false },
    });
  });

  it("年度ボタンで 4 月〜3 月の 12 か月。◀ / ▶ は 1 年ずつ", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "年度" }));
    expect(screen.getByText("2026年4月〜2027年3月")).toBeTruthy();
    expect(screen.getByRole("region", { name: "2027年3月" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(screen.getByText("2027年4月〜2028年3月")).toBeTruthy();
    expect(screen.getByRole("button", { name: "年度" }).getAttribute("aria-pressed")).toBe("true");
    // 今月 (t) は 12 か月の表示では今年度へ
    fireEvent.click(screen.getByRole("button", { name: "今月" }));
    expect(screen.getByText("2026年4月〜2027年3月")).toBeTruthy();
  });

  it("「年度」は今日ではなく見ている月の年度 (3 月に来年度を見る)", () => {
    sessionStorage.setItem(SS_YEAR_CAL_KEY, JSON.stringify({ ym: "2027-05", count: 1 }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "年度" }));
    expect(screen.getByText("2027年4月〜2028年3月")).toBeTruthy();
    // まとめて登録の年度の既定も見ている年度
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    expect(screen.getByLabelText("年度").value).toBe("2027");
  });

  it("管理者: 日付の「＋」から追加、一覧から削除して元に戻せる", () => {
    const spy = vi.fn();
    renderView({ onSaveSpy: spy });
    fireEvent.click(screen.getByRole("button", { name: "2026-10-31 (土) に予備校部の予定を追加" }));
    const dialog = screen.getByRole("dialog", { name: "予備校部の予定を追加" });
    expect(within(dialog).getByLabelText("開始日").value).toBe("2026-10-31");
    // 行事は名称が要る
    fireEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("名称を入れてください");
    fireEvent.change(within(dialog).getByLabelText("名称"), { target: { value: "進研模試(マーク)" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(month("2026年10月")).getByText("進研模試(マーク)")).toBeTruthy();

    // 一覧の削除 → 元に戻す
    const panel = screen.getByRole("region", { name: "予備校部の予定の登録" });
    fireEvent.click(within(panel).getByRole("button", { name: "「進研模試(記述)」を削除" }));
    expect(within(month("2026年10月")).queryByText("進研模試(記述)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(within(month("2026年10月")).getByText("進研模試(記述)")).toBeTruthy();
  });

  it("管理者: 一番新しい予定を消してすぐ足しても、消した方を元に戻せる (id を使い回さない)", () => {
    renderView();
    const panel = screen.getByRole("region", { name: "予備校部の予定の登録" });
    // id 4 (最大) を消す
    fireEvent.click(within(panel).getByRole("button", { name: "「進研模試(記述)」を削除" }));
    fireEvent.click(within(panel).getByRole("button", { name: "＋ 追加" }));
    const dialog = screen.getByRole("dialog", { name: "予備校部の予定を追加" });
    fireEvent.change(within(dialog).getByLabelText("開始日"), { target: { value: "2026-10-20" } });
    fireEvent.change(within(dialog).getByLabelText("名称"), { target: { value: "新しい予定" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    fireEvent.click(screen.getAllByRole("button", { name: "元に戻す" })[0]);
    expect(within(month("2026年10月")).getByText("進研模試(記述)")).toBeTruthy();
    expect(within(month("2026年10月")).getByText("新しい予定")).toBeTruthy();
  });

  it("開いている間に管理者でなくなったら、ダイアログを閉じる (保存できないまま残さない)", () => {
    const adminRef = { current: null };
    renderView({ adminRef });
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => adminRef.current(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("管理者: 欄の予定をクリックすると編集。休校日は名称なしで登録できる", () => {
    renderView();
    fireEvent.click(within(month("2026年10月")).getByRole("button", { name: "スポーツの日" }));
    const dialog = screen.getByRole("dialog", { name: "予備校部の予定を編集" });
    fireEvent.change(within(dialog).getByLabelText("名称 (任意)"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "更新" }));
    // 欄からは消え、日付の「休校」だけが残る
    expect(within(month("2026年10月")).queryByText("スポーツの日")).toBeNull();
    expect(within(month("2026年10月")).getAllByText("休校").length).toBe(2);
  });

  it("管理者: まとめて登録 → 確認 → 登録", () => {
    renderView({ initial: [] });
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    const dialog = screen.getByRole("dialog", { name: "📋 予備校部の予定をまとめて登録" });
    fireEvent.change(within(dialog).getByLabelText("貼り付ける表 (TSV)"), {
      target: { value: "開始日\t終了日\t種別\t名称\tメモ\n10/18\t\t休校日\t\t\n10/19\t\t行事\tダブル授業(5校時迄)\t\n10/20\t\t祝日\tx\t" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
    expect(within(dialog).getByRole("status").textContent).toMatch("OK 2 件 / 重複 0 件 / エラー 1 件");
    fireEvent.click(within(dialog).getByRole("button", { name: "2 件を登録" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(month("2026年10月")).getByText("ダブル授業(5校時迄)")).toBeTruthy();
    expect(within(month("2026年10月")).getByText("休校")).toBeTruthy();
  });

  it("管理者: 現役部の記録をクリックすると種類と id で編集画面へ", () => {
    const onEdit = vi.fn();
    renderView({ onEditGenyakuEvent: onEdit });
    fireEvent.click(within(month("2026年11月")).getByRole("button", { name: "文化の日" }));
    expect(onEdit).toHaveBeenCalledWith("holiday", 1);
  });

  it("閲覧者: 見るだけ (追加・編集・一覧の道具を出さない)", () => {
    renderView({ isAdmin: false, onEditGenyakuEvent: vi.fn() });
    expect(screen.queryByRole("button", { name: /予備校部の予定を追加/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "予備校部の予定の登録" })).toBeNull();
    expect(within(month("2026年11月")).queryByRole("button", { name: "文化の日" })).toBeNull();
    expect(within(month("2026年11月")).getByText("文化の日")).toBeTruthy();
  });
});
