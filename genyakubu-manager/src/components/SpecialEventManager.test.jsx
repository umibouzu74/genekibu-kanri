// @vitest-environment jsdom
// 特別イベント管理: 講師の月間予定に出す種別・まとめて登録 (確認 → 登録 →
// 元に戻す)・出典ごとの表示 / まとめて削除・種別のチップ・月の見出し。
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SpecialEventManager } from "./SpecialEventManager";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";
import { DEFAULT_SPECIAL_EVENT_DISPLAY } from "../utils/specialEventDisplay";

afterEach(cleanup);

const ev = (id, name, startDate, endDate, eventType, extra = {}) => ({
  id,
  name,
  startDate,
  endDate,
  eventType,
  targetGrades: ["中3", "附中3"],
  memo: "",
  tags: [],
  ...extra,
});

const EVENTS = [
  ev(1, "第4回 公立高校チャレンジテスト", "2026-11-01", "2026-11-01", "jukuTest", { source: "2026中学予定表" }),
  ev(2, "学習の診断④", "2026-11-10", "2026-11-10", "school", { source: "2026中学予定表" }),
  ev(3, "私立プレテスト", "2026-12-06", "2026-12-06", "jukuTest"),
];

// useSyncedStorage と同じく updater も受ける保存関数で、実際に state を持つ
function Harness({ initial, isAdmin, store }) {
  const [events, setEvents] = useState(initial);
  const [display, setDisplay] = useState(DEFAULT_SPECIAL_EVENT_DISPLAY);
  store.events = events;
  store.display = display;
  return (
    <SpecialEventManager
      specialEvents={events}
      onSave={(next) => setEvents((p) => (typeof next === "function" ? next(p) : next))}
      display={display}
      onSaveDisplay={(next) => setDisplay((p) => (typeof next === "function" ? next(p) : next))}
      isAdmin={isAdmin}
    />
  );
}

function renderManager({ events = EVENTS, isAdmin = true } = {}) {
  const store = {};
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
        <Harness initial={events} isAdmin={isAdmin} store={store} />
      </ConfirmProvider>
    </ToastProvider>
  );
  // 一覧は既定で「今月以降」。サンプルの日付に左右されないよう「すべて」に
  fireEvent.click(screen.getByRole("button", { name: "すべて" }));
  return store;
}

const settings = () => screen.getByRole("group", { name: "講師の月間予定に出す種別" });

describe("講師の月間予定に出す種別", () => {
  it("管理者は切り替えられる (全種別の真偽値を持ったまま)", () => {
    const store = renderManager();
    const school = within(settings()).getByRole("button", { name: /学校の予定/ });
    expect(school).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(school);
    expect(store.display.monthTypes).toEqual({ ...DEFAULT_SPECIAL_EVENT_DISPLAY.monthTypes, school: true });
  });

  it("閲覧者には今の設定を見せるだけ (まとめて登録も出さない)", () => {
    renderManager({ isAdmin: false });
    expect(within(settings()).queryAllByRole("button")).toHaveLength(0);
    expect(within(settings()).getByLabelText("学校の予定: 出さない")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "📋 まとめて登録" })).toBeNull();
  });
});

describe("一覧", () => {
  it("月ごとの見出しと種別のチップ (件数付き)", () => {
    renderManager();
    expect(screen.getByText("2026年11月")).toBeInTheDocument();
    expect(screen.getByText("2026年12月")).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "種別で絞り込む" });
    fireEvent.click(within(chips).getByRole("button", { name: /塾のテスト 2/ }));
    expect(screen.queryByText("学習の診断④")).toBeNull();
    expect(screen.getByText("私立プレテスト")).toBeInTheDocument();
    // もう一度押すと全部
    fireEvent.click(within(chips).getByRole("button", { name: /塾のテスト 2/ }));
    expect(screen.getByText("学習の診断④")).toBeInTheDocument();
  });

  it("出典で絞り、まとめて削除 → 元に戻す", () => {
    const store = renderManager();
    const sources = screen.getByRole("group", { name: "出典で絞り込む" });
    fireEvent.click(within(sources).getByRole("button", { name: /2026中学予定表 2/ }));
    expect(screen.queryByText("私立プレテスト")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "この出典の 2 件をまとめて削除" }));
    expect(store.events.map((e) => e.id)).toEqual([3]);
    expect(screen.getByTestId("toasts")).toHaveTextContent("出典「2026中学予定表」の 2 件を削除しました");
    fireEvent.click(within(screen.getByTestId("toasts")).getByRole("button", { name: "元に戻す" }));
    expect(store.events.map((e) => e.id).sort()).toEqual([1, 2, 3]);
  });
});

describe("📋 まとめて登録", () => {
  const TSV = [
    "開始日\t終了日\t種別\t名称\t対象学年\tタグ\tメモ",
    "12/6\t\t塾のテスト\t私立プレテスト\t中3,附中3\t\t", // 登録済み = 重複
    "12/20\t\t塾のテスト\t公立プレテスト①\t中3,附中3\t\t",
    "12/25\t12/28\t講習\t冬期講習（前半）\t中学部\t\t",
    "1/3\t\t遠足\tx\t\t\t", // 種別が読めない
  ].join("\n");

  it("確認で行ごとの状態を出し、OK の行だけを 1 回で登録し、元に戻せる", () => {
    const store = renderManager();
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("出典"), { target: { value: "2026中学予定表 改訂" } });
    fireEvent.change(within(dialog).getByLabelText("年度"), { target: { value: "2026" } });
    fireEvent.change(within(dialog).getByLabelText("貼り付ける表 (TSV)"), { target: { value: TSV } });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("OK 2 件 / 重複 1 件 / エラー 1 件");
    expect(within(dialog).getByText(/種別「遠足」が読めません/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "2 件を登録" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const added = store.events.filter((e) => e.id > 3);
    expect(added).toEqual([
      expect.objectContaining({
        id: 4,
        name: "公立プレテスト①",
        startDate: "2026-12-20",
        eventType: "jukuTest",
        source: "2026中学予定表 改訂",
      }),
      expect.objectContaining({
        id: 5,
        name: "冬期講習（前半）",
        startDate: "2026-12-25",
        endDate: "2026-12-28",
        eventType: "course",
      }),
    ]);
    const toasts = screen.getByTestId("toasts");
    expect(toasts).toHaveTextContent("2 件を登録しました");
    fireEvent.click(within(toasts).getByRole("button", { name: "元に戻す" }));
    expect(store.events.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("重複の行も登録するを選ぶと重複も入る", () => {
    const store = renderManager();
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("年度"), { target: { value: "2026" } });
    fireEvent.change(within(dialog).getByLabelText("貼り付ける表 (TSV)"), { target: { value: TSV } });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
    fireEvent.click(within(dialog).getByLabelText(/重複の行も登録する/));
    fireEvent.click(within(dialog).getByRole("button", { name: "3 件を登録" }));
    expect(store.events).toHaveLength(6);
  });

  it("貼り直すと確認をやり直す (古いプレビューで登録しない)", () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: "📋 まとめて登録" }));
    const dialog = screen.getByRole("dialog");
    const area = within(dialog).getByLabelText("貼り付ける表 (TSV)");
    fireEvent.change(area, { target: { value: TSV } });
    fireEvent.click(within(dialog).getByRole("button", { name: "確認" }));
    fireEvent.change(area, { target: { value: `${TSV}\n` } });
    expect(within(dialog).getByRole("button", { name: "登録" })).toBeDisabled();
  });
});
