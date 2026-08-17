// @vitest-environment jsdom
// バイト管理の「よみ」まわり: 入力欄の保存タイミング・未設定の見せ方・
// 講師一覧があいうえお順で出ることを固定する。
//
// **漢字の名前は読み順に並べられない** (localeCompare("ja") は部首・画数順)
// ため、五十音順に出せるかどうかはよみが入っているかだけで決まる。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StaffManagerView } from "./StaffManagerView";
import { ToastProvider } from "../../hooks/useToasts";
import { ConfirmProvider } from "../../hooks/useConfirm";

afterEach(cleanup);

const SUBJECT_CATEGORIES = [{ id: 1, name: "文系", color: "#48a" }];
const SUBJECTS = [{ id: 1, name: "英語", categoryId: 1 }];

// 部首・画数順と読み順が食い違う 3 人 (いしはら / たかまつ / ほりかみ)
const PART_TIME = [
  { name: "堀上", subjectIds: [] },
  { name: "石原", subjectIds: [] },
  { name: "高松", subjectIds: [] },
];

const KANA = { 堀上: "ほりかみ", 石原: "いしはら", 高松: "たかまつ" };

// 時間割にだけ出てくる = 常勤講師
const SLOTS = [
  { id: 1, day: "月", time: "17:00-18:00", grade: "中3", subj: "英語", teacher: "武下" },
];

function renderView({ teacherKana = {}, ...rest } = {}) {
  const onSetStaffKana = vi.fn();
  const onImportKana = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <StaffManagerView
          partTimeStaff={PART_TIME}
          teacherSubjects={{}}
          teacherKana={teacherKana}
          subjectCategories={SUBJECT_CATEGORIES}
          subjects={SUBJECTS}
          slots={SLOTS}
          timetables={[]}
          activeTimetableId={1}
          subs={[]}
          holidays={[]}
          examPeriods={[]}
          onAddStaff={vi.fn()}
          onDelStaff={vi.fn()}
          onToggleStaffSubject={vi.fn()}
          onSetStaffKana={onSetStaffKana}
          onImportKana={onImportKana}
          onSaveCategory={vi.fn()}
          onDelCategory={vi.fn()}
          onSaveSubject={vi.fn()}
          onDelSubject={vi.fn()}
          isAdmin
          {...rest}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSetStaffKana, onImportKana };
}

// バイト一覧の並びは、各行の見出し (名前) の出現順で見る。
function staffOrder() {
  return screen
    .getAllByRole("textbox", { name: /のよみ$/ })
    .map((el) => el.getAttribute("aria-label").replace(" のよみ", ""));
}

describe("StaffManagerView — 講師の並び", () => {
  it("よみが揃っていればバイト一覧があいうえお順に並ぶ", () => {
    renderView({ teacherKana: KANA });
    expect(staffOrder()).toEqual(["石原", "高松", "堀上"]);
  });

  it("よみが一部だけなら、よみのある講師が先・未設定は末尾", () => {
    renderView({ teacherKana: { 高松: "たかまつ", 石原: "いしはら" } });
    const order = staffOrder();
    expect(order.slice(0, 2)).toEqual(["石原", "高松"]);
    expect(order[2]).toBe("堀上");
  });

  it("よみが誰にも無ければ従来どおりの並び (機能を使わない人の見た目を変えない)", () => {
    renderView({ teacherKana: {} });
    const expected = PART_TIME.map((s) => s.name).sort((a, b) =>
      a.localeCompare(b, "ja")
    );
    expect(staffOrder()).toEqual(expected);
  });
});

describe("StaffManagerView — よみの入力", () => {
  it("blur で保存する (打鍵ごとには保存しない)", () => {
    const { onSetStaffKana } = renderView();
    const input = screen.getByRole("textbox", { name: "堀上 のよみ" });

    fireEvent.change(input, { target: { value: "ほりかみ" } });
    expect(onSetStaffKana).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onSetStaffKana).toHaveBeenCalledWith("堀上", "ほりかみ");
  });

  it("Enter で確定できる", () => {
    const { onSetStaffKana } = renderView();
    const input = screen.getByRole("textbox", { name: "石原 のよみ" });
    fireEvent.change(input, { target: { value: "いしはら" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input); // jsdom では blur() が keyDown から自動発火しない
    expect(onSetStaffKana).toHaveBeenCalledWith("石原", "いしはら");
  });

  it("値が変わっていなければ保存しない", () => {
    const { onSetStaffKana } = renderView({ teacherKana: KANA });
    const input = screen.getByRole("textbox", { name: "堀上 のよみ" });
    fireEvent.blur(input);
    expect(onSetStaffKana).not.toHaveBeenCalled();
  });

  it("Escape で編集を捨てて元の値に戻す", () => {
    const { onSetStaffKana } = renderView({ teacherKana: KANA });
    const input = screen.getByRole("textbox", { name: "堀上 のよみ" });
    fireEvent.change(input, { target: { value: "まちがい" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("ほりかみ");
    fireEvent.blur(input);
    expect(onSetStaffKana).not.toHaveBeenCalled();
  });

  it("空にするとよみを未設定に戻せる", () => {
    const { onSetStaffKana } = renderView({ teacherKana: KANA });
    const input = screen.getByRole("textbox", { name: "堀上 のよみ" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onSetStaffKana).toHaveBeenCalledWith("堀上", "");
  });
});

describe("StaffManagerView — よみ未設定の見せ方", () => {
  it("未設定の人数と名前を帯に出す", () => {
    renderView({ teacherKana: { 石原: "いしはら" } });
    expect(screen.getByText(/よみ未設定 2 名/)).toBeInTheDocument();
    // どの講師が未設定かが分かる (直せるように)
    const banner = screen.getByText(/よみ未設定 2 名/).closest("div").parentElement
      .parentElement;
    expect(within(banner).getByText("堀上")).toBeInTheDocument();
    expect(within(banner).getByText("高松")).toBeInTheDocument();
  });

  it("全員に入っていれば完了表示になる", () => {
    renderView({ teacherKana: KANA });
    expect(screen.getByText(/3 名すべてによみが入っています/)).toBeInTheDocument();
    expect(screen.queryByText(/よみ未設定/)).not.toBeInTheDocument();
  });

  it("通常時間割作成からの取り込みを呼べる", () => {
    const { onImportKana } = renderView();
    fireEvent.click(screen.getByRole("button", { name: /通常時間割作成から取り込む/ }));
    expect(onImportKana).toHaveBeenCalled();
  });

  it("閲覧のみ (非管理者) では取り込みボタンを出さず、入力欄も編集できない", () => {
    renderView({ isAdmin: false });
    expect(
      screen.queryByRole("button", { name: /通常時間割作成から取り込む/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "堀上 のよみ" })).toBeDisabled();
  });
});

describe("StaffManagerView — 常勤講師タブ", () => {
  it("常勤講師にもよみを付けられる", () => {
    const { onSetStaffKana } = renderView();
    fireEvent.click(screen.getByRole("button", { name: /常勤講師/ }));

    const input = screen.getByRole("textbox", { name: "武下 のよみ" });
    fireEvent.change(input, { target: { value: "たけした" } });
    fireEvent.blur(input);
    expect(onSetStaffKana).toHaveBeenCalledWith("武下", "たけした");
  });

  it("常勤講師の未設定もタブごとに数える", () => {
    renderView({ teacherKana: KANA });
    fireEvent.click(screen.getByRole("button", { name: /常勤講師/ }));
    // バイト 3 名は入っているが、常勤の武下は未設定
    expect(screen.getByText(/よみ未設定 1 名/)).toBeInTheDocument();
  });
});
