// @vitest-environment jsdom
// 表示期間設定の「初回1限はオリエン（回数に数えない）」チェックボックス。
// 未設定 (従来データ) の既定表示と、切り替えたときの保存形を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimetableManagerView } from "./TimetableManagerView";
import { ConfirmProvider } from "../../hooks/useConfirm";
import { ToastProvider } from "../../hooks/useToasts";

afterEach(cleanup);

const TIMETABLES = [
  { id: 1, name: "1学期", type: "regular", startDate: null, endDate: null, grades: [] },
];

const CUTOFF = {
  groups: [
    { label: "中3", grades: ["中3"], startDate: "2026-04-07", date: null },
    { label: "高3", grades: ["高3"], startDate: "2026-04-07", date: null },
  ],
  cohorts: [],
};

function renderView(displayCutoff = CUTOFF) {
  const onSaveDisplayCutoff = vi.fn();
  render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <TimetableManagerView
          timetables={TIMETABLES}
          displayCutoff={displayCutoff}
          slots={[]}
          classSets={[]}
          onSaveClassSets={vi.fn()}
          ttCrud={{ add: vi.fn(), update: vi.fn(), remove: vi.fn(), duplicate: vi.fn() }}
          onSaveDisplayCutoff={onSaveDisplayCutoff}
          isAdmin
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSaveDisplayCutoff };
}

const orientationBoxes = () =>
  screen
    .getAllByLabelText("初回1限はオリエン（回数に数えない）")
    .filter((el) => el.type === "checkbox");

describe("TimetableManagerView 表示期間設定のオリエン設定", () => {
  it("未設定なら中学部グループだけチェック済みで出る (従来既定)", () => {
    renderView();
    const [chu3, kou3] = orientationBoxes();
    expect(chu3.checked).toBe(true);
    expect(kou3.checked).toBe(false);
  });

  it("外すと該当グループに orientationFirstDay: false が保存される", () => {
    const { onSaveDisplayCutoff } = renderView();
    fireEvent.click(orientationBoxes()[0]);
    expect(onSaveDisplayCutoff).toHaveBeenCalledTimes(1);
    const saved = onSaveDisplayCutoff.mock.calls[0][0];
    expect(saved.groups[0]).toMatchObject({
      label: "中3",
      startDate: "2026-04-07",
      orientationFirstDay: false,
    });
    // 他のグループは触らない
    expect(saved.groups[1].orientationFirstDay).toBeUndefined();
  });

  it("明示設定があればその値を表示する (高校部でも有効にできる)", () => {
    renderView({
      groups: [
        { label: "中3", grades: ["中3"], startDate: null, date: null, orientationFirstDay: false },
        { label: "高3", grades: ["高3"], startDate: null, date: null, orientationFirstDay: true },
      ],
      cohorts: [],
    });
    const [chu3, kou3] = orientationBoxes();
    expect(chu3.checked).toBe(false);
    expect(kou3.checked).toBe(true);
  });
});

// 作成 / 編集 / 複製フォームの検証と重なり警告 (2026-09-15)。
// 前の期に終了日を入れ忘れて両方有効になる事故を保存の手前で止める
describe("TimetableManagerView 時間割フォームの検証と重なり警告", () => {
  const TT2 = [
    { id: 1, name: "1学期", type: "regular", startDate: "2026-04-07", endDate: null, grades: [] },
    { id: 2, name: "土曜プレップ", type: "regular", startDate: "2026-04-07", endDate: "2026-08-31", grades: ["中3"] },
  ];
  const SLOTS = [
    { id: 1, day: "月", time: "19:00-20:20", grade: "中3", cls: "-", subj: "数学", teacher: "田中", timetableId: 1 },
  ];
  function renderWith(timetables = TT2) {
    const ttCrud = { add: vi.fn(), update: vi.fn(), remove: vi.fn(), duplicate: vi.fn() };
    render(
      <ToastProvider render={() => null}>
        <ConfirmProvider>
          <TimetableManagerView
            timetables={timetables}
            displayCutoff={{ groups: [], cohorts: [] }}
            slots={SLOTS}
            classSets={[]}
            onSaveClassSets={vi.fn()}
            ttCrud={ttCrud}
            onSaveDisplayCutoff={vi.fn()}
            isAdmin
          />
        </ConfirmProvider>
      </ToastProvider>
    );
    return { ttCrud };
  }
  const nameInput = () => screen.getByPlaceholderText("例: 2026年度 1学期");
  // 重なり警告の箱 (同じ名前の注意も role="status" なので文言で選ぶ)
  const overlapWarning = () =>
    screen
      .getAllByRole("status")
      .find((el) => el.textContent.includes("有効期間が他の時間割と重なります"));
  const dateInputs = () => screen.getAllByDisplayValue("").filter((el) => el.type === "date");

  it("名前が空のまま保存すると、黙って戻らずにエラーを出す", () => {
    const { ttCrud } = renderWith([]); // 重なる相手が無い状態
    fireEvent.click(screen.getByRole("button", { name: "+ 新規作成" }));
    expect(screen.queryByText("名前を入力してください")).toBeNull();
    // エラーが出ていない間は aria-describedby を付けない (FieldError は空だと
    // 何も描かないので、付けると存在しない id を指す)
    expect(nameInput().getAttribute("aria-describedby")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("名前を入力してください")).toBeInTheDocument();
    expect(nameInput().getAttribute("aria-describedby")).toBe("tt-form-name-err");
    expect(ttCrud.add).not.toHaveBeenCalled();
  });

  it("開始日 > 終了日 はエラーで保存ボタンが押せない", () => {
    const { ttCrud } = renderWith();
    fireEvent.click(screen.getByRole("button", { name: "+ 新規作成" }));
    fireEvent.change(nameInput(), { target: { value: "3学期" } });
    const [start, end] = dateInputs();
    fireEvent.change(start, { target: { value: "2027-01-10" } });
    fireEvent.change(end, { target: { value: "2027-01-01" } });
    expect(screen.getByText("終了日は開始日以降にしてください")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "保存" });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(ttCrud.add).not.toHaveBeenCalled();
  });

  it("同じ名前は警告だけで保存できる", () => {
    const { ttCrud } = renderWith();
    fireEvent.click(screen.getByRole("button", { name: "+ 新規作成" }));
    fireEvent.change(nameInput(), { target: { value: " 土曜プレップ " } });
    // 期間を土曜プレップの後ろ・1学期の終了日 (無し) の外にはできないので、
    // 学年で 1学期 (全学年) とも土曜プレップ (中3) とも交わらないようにする
    fireEvent.change(screen.getByPlaceholderText(/例: 中1, 中2/), { target: { value: "高1" } });
    const [start] = dateInputs();
    fireEvent.change(start, { target: { value: "2026-09-01" } });
    expect(screen.getByText(/同じ名前の時間割「土曜プレップ」/)).toBeInTheDocument();
    // 1学期は全学年・終了日なしなので高1でも重なる → 承知のチェックが要る
    fireEvent.click(screen.getByLabelText("重なりを承知で保存"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(ttCrud.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "土曜プレップ", grades: ["高1"], startDate: "2026-09-01" })
    );
  });

  it("前の期に終了日が無いと重なり警告が出て、承知のチェックを入れるまで保存できない", () => {
    const { ttCrud } = renderWith();
    fireEvent.click(screen.getByRole("button", { name: "+ 新規作成" }));
    fireEvent.change(nameInput(), { target: { value: "2学期" } });
    const [start] = dateInputs();
    fireEvent.change(start, { target: { value: "2026-09-01" } });
    // 1学期 (終了日なし・全学年) とは 9/1〜 で重なる。土曜プレップは 8/31 で終わるので出ない。
    // 入力のたびに再評価される警告なので alert ではなく status (保存を止める
    // エラーだけが alert)
    expect(screen.queryByRole("alert")).toBeNull();
    const warn = overlapWarning();
    expect(warn.textContent).toContain("1学期 と 9/1〜 が重なります (全学年)");
    expect(warn.textContent).not.toContain("土曜プレップ");
    expect(warn.textContent).toContain("前の期の終了日を入れると二重に出ません");
    expect(warn.textContent).toContain("1 コマ");
    const save = screen.getByRole("button", { name: "保存" });
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("重なりを承知で保存"));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(ttCrud.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "2学期", startDate: "2026-09-01", endDate: null, grades: [] })
    );
  });

  it("承知のチェックは重なる相手が変わったら取り直す", () => {
    renderWith();
    fireEvent.click(screen.getByRole("button", { name: "+ 新規作成" }));
    fireEvent.change(nameInput(), { target: { value: "2学期" } });
    const [start] = dateInputs();
    fireEvent.change(start, { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByLabelText("重なりを承知で保存"));
    expect(screen.getByLabelText("重なりを承知で保存").checked).toBe(true);
    // 開始日を前へ動かすと土曜プレップとも重なる → 承知を取り直す
    fireEvent.change(screen.getByDisplayValue("2026-09-01"), { target: { value: "2026-08-01" } });
    expect(overlapWarning().textContent).toContain("土曜プレップ と 8/1〜8/31 が重なります (中3)");
    expect(screen.getByLabelText("重なりを承知で保存").checked).toBe(false);
    expect(screen.getByRole("button", { name: "保存" }).disabled).toBe(true);
  });

  it("編集では自分自身を重なりの相手にしない。期間を戻せば警告は消える", () => {
    const { ttCrud } = renderWith([
      { id: 1, name: "1学期", type: "regular", startDate: "2026-04-07", endDate: "2026-08-31", grades: [] },
      { id: 2, name: "2学期", type: "regular", startDate: "2026-09-01", endDate: null, grades: [] },
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "編集" })[1]); // 2学期
    expect(screen.queryByRole("status")).toBeNull();
    // 開始日を 1 日前へ → 1学期と 8/31 で重なる。自分 (2学期) は相手に出ない
    fireEvent.change(screen.getByDisplayValue("2026-09-01"), { target: { value: "2026-08-31" } });
    expect(overlapWarning().textContent).toContain("1学期 と 8/31 が重なります (全学年)");
    expect(overlapWarning().textContent).not.toContain("2学期 と");
    fireEvent.change(screen.getByDisplayValue("2026-08-31"), { target: { value: "2026-09-01" } });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(ttCrud.update).toHaveBeenCalledWith(2, expect.objectContaining({ startDate: "2026-09-01" }));
  });

  it("複製も同じ検証を通す (複製元の学年で重なりを見る)", () => {
    const { ttCrud } = renderWith();
    fireEvent.click(screen.getAllByRole("button", { name: "複製" })[1]); // 土曜プレップ (中3)
    // 期間を空にしたままだと無制限 = 1学期とも複製元とも重なる
    const warn = overlapWarning();
    expect(warn.textContent).toContain("1学期 と 4/7〜 が重なります (中3)");
    expect(warn.textContent).toContain("土曜プレップ と 4/7〜8/31 が重なります (中3)");
    const dup = screen.getByRole("button", { name: "複製する" });
    expect(dup.disabled).toBe(true);
    // 名前を空にして押すとエラー (押した後の止めるエラーだけが alert で、
    // 入力欄の aria-describedby もエラーが出ている間だけ付く)
    fireEvent.click(screen.getByLabelText("重なりを承知で保存"));
    const name = screen.getByDisplayValue("土曜プレップ（コピー）");
    expect(name.getAttribute("aria-describedby")).toBeNull();
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.click(dup);
    expect(screen.getByRole("alert").textContent).toBe("名前を入力してください");
    expect(name.getAttribute("aria-describedby")).toBe("tt-dup-name-err");
    expect(ttCrud.duplicate).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: "土曜プレップ 2学期" } });
    fireEvent.click(dup);
    expect(ttCrud.duplicate).toHaveBeenCalledWith(2, "土曜プレップ 2学期", { startDate: null, endDate: null });
  });
});
