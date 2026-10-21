// @vitest-environment jsdom
// 「今の時間割」(週計・全講師一覧など日付を持たない画面の時間割) は今日の
// 日付で決まる (講師の一覧は次の期から入る講師も出す)。以前はヘッダの時間割
// セレクタで端末ごとに選んで localStorage に覚えていたため、期切替のあと
// 閲覧用の端末だけ前の期のまま、が起きた (2026-10-21)。古い端末に残った選択は
// 読まずに消す。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { ToastProvider } from "./hooks/useToasts";
import { ConfirmProvider } from "./hooks/useConfirm";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LS } from "./constants/storageKeys";

const TERM1 = { id: 1, name: "1学期", type: "regular", startDate: "2026-04-01", endDate: "2026-08-31", grades: [] };
const TERM2 = { id: 2, name: "2学期", type: "regular", startDate: "2026-09-01", endDate: null, grades: [] };

const slot = (id, teacher, timetableId) => ({
  id,
  day: "月",
  time: "19:00-20:20",
  grade: "中1",
  cls: "S",
  room: "601",
  subj: "英語",
  teacher,
  note: "",
  timetableId,
});

const SLOTS = [slot(1, "前期だけの講師", 1), slot(2, "後期の講師", 2)];

function setup({ timetables = [TERM1, TERM2], slots = SLOTS } = {}) {
  localStorage.setItem(LS.timetables, JSON.stringify(timetables));
  localStorage.setItem(LS.slots, JSON.stringify(slots));
}

beforeEach(() => {
  // Date だけを固定する (Suspense / waitFor が使うタイマーは本物のまま)
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 26, 12, 0, 0)); // 2026-09-26
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderApp() {
  return render(
    <ErrorBoundary>
      <ToastProvider render={() => null}>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

async function findBadge() {
  const badge = await screen.findByRole("button", { name: /^今の時間割:/ });
  // 読み込み待ち (ビューの lazy import) が終わってから見る
  await waitFor(() => expect(screen.queryByText("読み込み中...")).toBeNull(), { timeout: 10000 });
  return badge;
}

const sidebarTeachers = () => within(document.querySelector(".sidebar-teachers"));

describe("App の今の時間割", () => {
  it("今日有効な時間割 (2学期) を表示し、講師の一覧も 2学期の講師", async () => {
    setup();
    renderApp();
    const badge = await findBadge();
    expect(badge).toHaveAccessibleName("今の時間割: 2学期");
    expect(sidebarTeachers().getByText("後期の講師")).toBeInTheDocument();
    expect(sidebarTeachers().queryByText("前期だけの講師")).toBeNull();
    // 切り替えの操作は無い (端末ごとの選択を持たない)
    expect(screen.queryByTitle("表示する時間割を選択")).toBeNull();
  });

  it("古い端末に残った選択 (1学期) は読まずに消す", async () => {
    setup();
    localStorage.setItem(LS.activeTimetableId, "1");
    renderApp();
    const badge = await findBadge();
    expect(badge).toHaveAccessibleName("今の時間割: 2学期");
    expect(sidebarTeachers().getByText("後期の講師")).toBeInTheDocument();
    expect(sidebarTeachers().queryByText("前期だけの講師")).toBeNull();
    expect(localStorage.getItem(LS.activeTimetableId)).toBeNull();
  });

  it("前の期に終了日が無く同じ学年が 2 つの時間割から出るときは重複を知らせる", async () => {
    setup({ timetables: [{ ...TERM1, endDate: null }, TERM2] });
    renderApp();
    const badge = await findBadge();
    expect(badge).toHaveAccessibleName(
      "今の時間割: 1学期・2学期（中1 のコマが 1学期・2学期 で重複）"
    );
    expect(within(badge).getByText("⚠ 中1 のコマが重複")).toBeInTheDocument();
  });

  it("講師名の横のコマ数は今の時間割だけで数える (前の期のコマを足さない)", async () => {
    // 同じ講師が 1学期にも 2学期にも 1 コマずつ
    setup({ slots: [slot(1, "通年の講師", 1), slot(2, "通年の講師", 2)] });
    renderApp();
    await findBadge();
    const button = sidebarTeachers().getByText("通年の講師").closest("button");
    expect(within(button).getByText("1")).toBeInTheDocument();
  });

  it("切替日の前でも、次の期から入る講師は講師の一覧に出る (コマ数は今の期で 0)", async () => {
    vi.setSystemTime(new Date(2026, 7, 26, 12, 0, 0)); // 2026-08-26 (2学期は 9/1 から)
    setup();
    renderApp();
    const badge = await findBadge();
    expect(badge).toHaveAccessibleName("今の時間割: 1学期");
    expect(sidebarTeachers().getByText("前期だけの講師")).toBeInTheDocument();
    const next = sidebarTeachers().getByText("後期の講師").closest("button");
    expect(within(next).getByText("0")).toBeInTheDocument();
  });
});
