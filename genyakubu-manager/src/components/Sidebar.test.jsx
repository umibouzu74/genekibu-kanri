// @vitest-environment jsdom
// サイドバーの導線: ダイアログ項目 (管理者のみ) と、開いている画面の
// セクション一覧 (休講・テスト期間・イベントの中身) を出すこと。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { VIEWS } from "../constants/views";
import { EVENT_KIND } from "../constants/eventKinds";
import { MASTER_TAB } from "../constants/masterTabs";

afterEach(cleanup);

function renderSidebar(props = {}) {
  return render(
    <Sidebar
      open
      onClose={vi.fn()}
      view={VIEWS.DASH}
      selected={null}
      onSelectView={vi.fn()}
      onSelectTeacher={vi.fn()}
      onOpenDataMgr={vi.fn()}
      onJumpToRequestedSubs={vi.fn()}
      search=""
      onSearchChange={vi.fn()}
      teacherGroups={[]}
      subjectCategories={[]}
      slots={[]}
      subs={[]}
      isAdmin
      onSignIn={vi.fn()}
      onSignOut={vi.fn()}
      {...props}
    />
  );
}

describe("Sidebar の日まるごと振替", () => {
  it("管理者にはボタンを出し、クリックでダイアログを開く", () => {
    const onOpenDayReschedule = vi.fn();
    renderSidebar({ onOpenDayReschedule });
    fireEvent.click(screen.getByRole("button", { name: /日まるごと振替/ }));
    expect(onOpenDayReschedule).toHaveBeenCalledTimes(1);
  });

  it("閲覧者には出さない (登録できないため)", () => {
    renderSidebar({ isAdmin: false, onOpenDayReschedule: vi.fn() });
    expect(screen.queryByText(/日まるごと振替/)).toBeNull();
  });
});

describe("Sidebar のイベント系セクション", () => {
  it("休講・テスト期間・イベントを開いている間だけ中身を並べる", () => {
    const { rerender } = renderSidebar();
    // 別の画面を見ているときは出さない (サイドバーが長くなりすぎるため)
    expect(screen.queryByText(/追加授業/)).toBeNull();

    rerender(
      <Sidebar
        open
        onClose={vi.fn()}
        view={VIEWS.HOLIDAYS}
        selected={null}
        onSelectView={vi.fn()}
        onSelectTeacher={vi.fn()}
        onOpenDataMgr={vi.fn()}
        onJumpToRequestedSubs={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        teacherGroups={[]}
        subjectCategories={[]}
        slots={[]}
        subs={[]}
        isAdmin
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />
    );
    // 画面名からは辿れない 2 つが、名前でサイドバーに出る
    expect(screen.getByRole("button", { name: /追加授業/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /特別時程/ })).toBeTruthy();
  });

  it("セクションのクリックで種別を通知する", () => {
    const onSelectEventSection = vi.fn();
    renderSidebar({ view: VIEWS.HOLIDAYS, onSelectEventSection });
    fireEvent.click(screen.getByRole("button", { name: /特別時程/ }));
    expect(onSelectEventSection).toHaveBeenCalledWith(EVENT_KIND.DAY_SCHEDULE);
  });
});

describe("Sidebar のコースマスター管理のタブ", () => {
  it("開いている間だけタブ名 (隔週管理) を並べる", () => {
    renderSidebar();
    // 別の画面を見ているときは出さない
    expect(screen.queryByRole("button", { name: /隔週管理/ })).toBeNull();

    cleanup();
    renderSidebar({ view: VIEWS.MASTER });
    // 画面名 (コースマスター管理) からは辿れないタブが名前で出る
    expect(screen.getByRole("button", { name: /隔週管理/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /時間割表/ })).toBeTruthy();
  });

  it("タブのクリックでタブキーを通知する", () => {
    const onSelectMasterTab = vi.fn();
    renderSidebar({ view: VIEWS.MASTER, onSelectMasterTab });
    fireEvent.click(screen.getByRole("button", { name: /隔週管理/ }));
    expect(onSelectMasterTab).toHaveBeenCalledWith(MASTER_TAB.BIWEEKLY);
  });
});

// 赤バッジは「今日以降の未処理 (代行未定 + 依頼中)」だけ。全期間で数えると
// 前期の確定し忘れが永久に乗って数字が意味を失う (2026-09-12)。
describe("Sidebar の未処理バッジ", () => {
  const far = "2999-01-01";
  it("今日以降の未処理だけを数え、過去の分と代行なしで確定は数えない", () => {
    const onJumpToRequestedSubs = vi.fn();
    renderSidebar({
      onJumpToRequestedSubs,
      subs: [
        { id: 1, date: far, slotId: 1, originalTeacher: "a", substitute: "", status: "requested" },
        { id: 2, date: far, slotId: 1, originalTeacher: "a", substitute: "b", status: "requested" },
        { id: 3, date: far, slotId: 1, originalTeacher: "a", substitute: "", status: "confirmed" },
        { id: 4, date: "2000-01-01", slotId: 1, originalTeacher: "a", substitute: "", status: "requested" },
      ],
    });
    const badge = screen.getByRole("button", { name: /未処理の代行 2 件/ });
    fireEvent.click(badge);
    expect(onJumpToRequestedSubs).toHaveBeenCalled();
  });

  it("未処理が無ければバッジを出さない", () => {
    renderSidebar({
      subs: [{ id: 1, date: "2000-01-01", slotId: 1, originalTeacher: "a", substitute: "", status: "requested" }],
    });
    expect(screen.queryByRole("button", { name: /未処理の代行/ })).toBeNull();
  });
});

describe("Sidebar の複数日の欠勤登録", () => {
  it("管理者にはボタンを出し、クリックでダイアログを開く", () => {
    const onOpenMultiDayAbsence = vi.fn();
    renderSidebar({ onOpenMultiDayAbsence });
    fireEvent.click(screen.getByRole("button", { name: /複数日の欠勤登録/ }));
    expect(onOpenMultiDayAbsence).toHaveBeenCalledTimes(1);
  });
  it("閲覧者には出さない", () => {
    renderSidebar({ isAdmin: false });
    expect(screen.queryByRole("button", { name: /複数日の欠勤登録/ })).toBeNull();
  });
});
