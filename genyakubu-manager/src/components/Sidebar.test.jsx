// @vitest-environment jsdom
// サイドバーの導線: ダイアログ項目 (管理者のみ) と、開いている画面の
// セクション一覧 (休講・テスト期間・イベントの中身) を出すこと。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { VIEWS } from "../constants/views";
import { EVENT_KIND } from "../constants/eventKinds";
import { MASTER_TAB } from "../constants/masterTabs";
import { TIMETABLE_SECTION } from "../constants/timetableSections";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// カテゴリを開く (サイドバーはカテゴリごとに開け閉めする。既定で開いているのは
// 「今日の対応」と今いる画面のカテゴリだけ)
const openCategory = (label) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^▸?\\s*\\S+ ${label}`), expanded: false }));

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
    openCategory("振替・追加授業");
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
    // 別の画面を見ているときは出さない (サイドバーが長くなりすぎるため)。
    // カテゴリ名「振替・追加授業」とは別に、セクションの「追加授業」だけを見る
    expect(screen.queryByRole("button", { name: /^\S+ 追加授業$/ })).toBeNull();

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
    expect(screen.getByRole("button", { name: /^\S+ 追加授業$/ })).toBeTruthy();
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

// 時間割管理はカードが縦に並ぶ長い画面で、コース別終講日が見つけにくかった (C4)
describe("Sidebar の時間割管理のセクション", () => {
  it("開いている間だけカードの名前 (コース別終講日) を並べ、クリックでキーを通知する", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: /コース別終講日/ })).toBeNull();

    cleanup();
    const onSelectTimetableSection = vi.fn();
    renderSidebar({ view: VIEWS.TIMETABLE, onSelectTimetableSection });
    expect(screen.getByRole("button", { name: /表示期間設定/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /授業セット/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /コース別終講日/ }));
    expect(onSelectTimetableSection).toHaveBeenCalledWith(TIMETABLE_SECTION.COHORT_CUTOFF);
  });

  it("管理者だけのカード (時刻一括変換) は閲覧者に出さない", () => {
    renderSidebar({ view: VIEWS.TIMETABLE });
    expect(screen.getByRole("button", { name: /時刻一括変換/ })).toBeTruthy();
    cleanup();
    renderSidebar({ view: VIEWS.TIMETABLE, isAdmin: false });
    expect(screen.queryByRole("button", { name: /時刻一括変換/ })).toBeNull();
    expect(screen.getByRole("button", { name: /コース別終講日/ })).toBeTruthy();
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

describe("Sidebar のテスト対策の振替・追加", () => {
  it("管理者にはボタンを出し、クリックでダイアログを開く", () => {
    const onOpenTestPrep = vi.fn();
    renderSidebar({ onOpenTestPrep });
    openCategory("振替・追加授業");
    fireEvent.click(screen.getByRole("button", { name: /テスト対策の振替・追加/ }));
    expect(onOpenTestPrep).toHaveBeenCalledTimes(1);
  });
  it("閲覧者には出さない", () => {
    renderSidebar({ isAdmin: false });
    expect(screen.queryByRole("button", { name: /テスト対策の振替・追加/ })).toBeNull();
  });
});

describe("Sidebar の月間予定の印刷・画像", () => {
  // 印刷・画像は書き込みではないので閲覧者にも出す (2026-10-15)
  it("閲覧者にも出し、クリックでダイアログを開く", () => {
    const onOpenMonthBatch = vi.fn();
    const onOpenDataMgr = vi.fn();
    renderSidebar({ isAdmin: false, onOpenMonthBatch, onOpenDataMgr });
    openCategory("講師・スタッフ");
    fireEvent.click(screen.getByRole("button", { name: /月間予定の印刷・画像/ }));
    expect(onOpenMonthBatch).toHaveBeenCalledTimes(1);
    // データ管理 (modal の既定の行き先) には落ちない
    expect(onOpenDataMgr).not.toHaveBeenCalled();
  });
});

describe("Sidebar の講師検索", () => {
  const groups = [{ key: "英語", label: "英語", teachers: ["堀上", "石原"] }];
  const slots = [
    { id: 1, day: "月", time: "19:00-20:20", grade: "中1", cls: "S", subj: "英語", teacher: "堀上", note: "" },
    { id: 2, day: "月", time: "20:30-21:50", grade: "中1", cls: "S", subj: "英語", teacher: "石原", note: "" },
  ];

  it("よみでも当てる (「ほり」で 堀上)", () => {
    renderSidebar({
      teacherGroups: groups,
      slots,
      teacherKana: { 堀上: "ほりかみ", 石原: "いしはら" },
    });
    fireEvent.change(screen.getByPlaceholderText("講師名・よみで検索…"), {
      target: { value: "ほり" },
    });
    expect(screen.getByRole("button", { name: /^堀上/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^石原/ })).toBeNull();
  });

  it("管理者専用の「欠勤組み換え」は閲覧者に出さない", () => {
    renderSidebar({ isAdmin: false });
    expect(screen.queryByRole("button", { name: /欠勤組み換え/ })).toBeNull();
  });
});

// 項目が 25 前後あり全部並べると画面に収まらないので、カテゴリごとに開け閉め
// する (2026-10-16)。並びは固定で、使用頻度では開くものを変えない (A18)
describe("Sidebar のカテゴリ", () => {
  it("既定で開いているのは「今日の対応」だけ。メインメニュー・ダッシュボードは常に出す", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /メインメニュー/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ダッシュボード/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /欠勤組み換え/ })).toBeInTheDocument();
    // 閉じているカテゴリは見出しだけ (項目の数を添える)
    expect(screen.queryByRole("button", { name: /コースマスター管理/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /時間割/, expanded: false })
    ).toHaveTextContent(/4$/);
  });

  it("今いる画面のカテゴリは自動で開く (閉じればその画面にいる間は閉じたまま)", () => {
    renderSidebar({ view: VIEWS.MASTER });
    expect(screen.getByRole("button", { name: /コースマスター管理/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /時間割/, expanded: true }));
    expect(screen.queryByRole("button", { name: /コースマスター管理/ })).toBeNull();
  });

  it("人が開いたカテゴリはこの端末に覚える", () => {
    renderSidebar();
    openCategory("記録・データ");
    expect(screen.getByRole("button", { name: /データ管理/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("genyakubu-sidebar-open-categories"))).toEqual([
      "today",
      "records",
    ]);
    cleanup();
    renderSidebar();
    expect(screen.getByRole("button", { name: /データ管理/ })).toBeInTheDocument();
  });

  it("「今日の対応」を閉じても未処理の代行の件数は見出しに出る", () => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ds = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    renderSidebar({
      subs: [{ id: 1, date: ds, slotId: 1, originalTeacher: "堀上", substitute: "", status: "requested" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /今日の対応/, expanded: true }));
    expect(screen.queryByRole("button", { name: /欠勤組み換え/ })).toBeNull();
    expect(screen.getByRole("button", { name: "未処理の代行 1 件を表示" })).toBeInTheDocument();
  });
});
