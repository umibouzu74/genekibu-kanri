// @vitest-environment jsdom
// サイドバーの導線: ダイアログ項目 (管理者のみ) と、開いている画面の
// セクション一覧 (休講・テスト期間・イベントの中身) を出すこと。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { VIEWS } from "../constants/views";
import { EVENT_KIND } from "../constants/eventKinds";

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
