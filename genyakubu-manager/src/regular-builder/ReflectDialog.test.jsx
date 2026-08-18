// @vitest-environment jsdom
// 反映ダイアログの期切替 (1学期 → 2学期)。表示が切り替わるには
//   ① 新時間割の開始日 + 旧時間割の終了日 (日付ベースのビュー)
//   ② ヘッダの時間割セレクタ (集計ベースのビュー)
// の両方が要るので、その配線が外れていないことを画面から固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReflectDialog } from "./ReflectDialog";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";
import { makeProject } from "./testUtils";
import { makeCellKey } from "./model";

afterEach(cleanup);

const TIMETABLES = [
  { id: 1, name: "2026 1学期", type: "regular", startDate: "2026-04-06", endDate: null, grades: [] },
];

function renderDialog(props = {}) {
  const saveTimetables = vi.fn();
  const saveSlots = vi.fn();
  const onActivateTimetable = vi.fn();
  const saveDisplayCutoff = vi.fn();
  const { container } = render(
    <ToastProvider render={() => null}>
      <ConfirmProvider>
        <ReflectDialog
          project={makeProject({ name: "2026 2学期" })}
          timetables={TIMETABLES}
          slots={[]}
          saveTimetables={saveTimetables}
          saveSlots={saveSlots}
          saveProject={() => {}}
          activeTimetableId={1}
          saveDisplayCutoff={saveDisplayCutoff}
          onActivateTimetable={onActivateTimetable}
          onClose={() => {}}
          {...props}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  const dates = () => [...container.querySelectorAll('input[type="date"]')];
  return { saveTimetables, saveSlots, onActivateTimetable, saveDisplayCutoff, dates };
}

const switchCheckbox = () =>
  screen.getByRole("checkbox", { name: /期切替として反映する/ });
const activateCheckbox = () =>
  screen.getByRole("checkbox", { name: /表示中の時間割を/ });

describe("ReflectDialog (期切替)", () => {
  it("切替日を入れると旧時間割の終了日 (前日) を予告する", () => {
    const { dates } = renderDialog();
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    expect(
      screen.getByText(/終了日を 2026-08-31 に設定します/)
    ).toBeInTheDocument();
    // 期切替では表示の追従も既定でオン
    expect(activateCheckbox()).toBeChecked();
  });

  it("実行すると新時間割の追加・旧時間割の終了・表示の切替が揃って起きる", async () => {
    const { saveTimetables, saveSlots, onActivateTimetable, dates } = renderDialog();
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "切り替える" }));

    fireEvent.click(await screen.findByRole("button", { name: "期切替を実行" }));

    await waitFor(() => expect(saveTimetables).toHaveBeenCalled());
    const saved = saveTimetables.mock.calls[0][0];
    expect(saved[0]).toMatchObject({ id: 1, endDate: "2026-08-31" });
    expect(saved[1]).toMatchObject({ name: "2026 2学期", startDate: "2026-09-01" });
    // 旧時間割のコマは消さない
    expect(saveSlots.mock.calls[0][0]).toHaveLength(2);
    expect(onActivateTimetable).toHaveBeenCalledWith(2);
  });

  it("切替日が無いと実行できない", () => {
    renderDialog();
    fireEvent.click(switchCheckbox());
    expect(
      screen.getByText(/期切替には切替日 \(新しい時間割の開始日\) が必要です/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切り替える" })).toBeDisabled();
  });

  it("表示期間設定が切替日より前に終わっていると警告する", () => {
    const { dates } = renderDialog({
      displayCutoff: {
        groups: [
          { label: "中学部", grades: ["中3"], startDate: "2026-04-01", date: "2026-08-31" },
        ],
      },
    });
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    expect(
      screen.getByText(/表示期間設定の終了日が切替日より前の学年グループがあります/)
    ).toBeInTheDocument();
  });

  it("「表示期間設定も新しい期に合わせる」で終了日と旧期の終講日を直す", async () => {
    const displayCutoff = {
      groups: [
        { label: "中学部", grades: ["中3"], startDate: "2026-04-01", date: "2026-08-31" },
      ],
      cohorts: [
        { id: "M|中3|火金", label: "中3 火金", grade: "中3", date: "2026-07-17" },
      ],
    };
    const { dates, saveDisplayCutoff } = renderDialog({ displayCutoff });
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } }); // 切替日
    fireEvent.change(dates()[1], { target: { value: "2026-12-25" } }); // 新しい期の終了日

    const follow = screen.getByRole("checkbox", { name: /表示期間設定も新しい期に合わせる/ });
    expect(follow).not.toBeChecked(); // 既定はオフ (自動では触らない)
    fireEvent.click(follow);
    fireEvent.click(screen.getByRole("button", { name: "切り替える" }));
    fireEvent.click(await screen.findByRole("button", { name: "期切替を実行" }));

    await waitFor(() => expect(saveDisplayCutoff).toHaveBeenCalled());
    const saved = saveDisplayCutoff.mock.calls[0][0];
    expect(saved.groups[0].date).toBe("2026-12-25");
    expect(saved.cohorts).toEqual([]);
  });

  it("「新しい期はオリエンなし」だけを選ぶと日付は触らない", async () => {
    const displayCutoff = {
      groups: [
        { label: "中学部", grades: ["中3"], startDate: "2026-04-01", date: "2026-08-31" },
      ],
      cohorts: [],
    };
    const { dates, saveDisplayCutoff } = renderDialog({ displayCutoff });
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });

    fireEvent.click(screen.getByRole("checkbox", { name: /新しい期はオリエンなしにする/ }));
    fireEvent.click(screen.getByRole("button", { name: "切り替える" }));
    fireEvent.click(await screen.findByRole("button", { name: "期切替を実行" }));

    await waitFor(() => expect(saveDisplayCutoff).toHaveBeenCalled());
    const saved = saveDisplayCutoff.mock.calls[0][0];
    expect(saved.groups[0].orientationFirstDay).toBe(false);
    expect(saved.groups[0].date).toBe("2026-08-31"); // 日付は据え置き
  });

  it("何も選ばなければ表示期間設定は触らない", async () => {
    const displayCutoff = {
      groups: [
        { label: "中学部", grades: ["中3"], startDate: "2026-04-01", date: "2026-08-31" },
      ],
      cohorts: [],
    };
    const { dates, saveDisplayCutoff } = renderDialog({ displayCutoff });
    fireEvent.click(switchCheckbox());
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "切り替える" }));
    fireEvent.click(await screen.findByRole("button", { name: "期切替を実行" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "期切替を実行" })).toBeNull());
    expect(saveDisplayCutoff).not.toHaveBeenCalled();
  });

  it("期切替を使わなければ旧時間割に触らない", async () => {
    const { saveTimetables, onActivateTimetable, dates } = renderDialog();
    fireEvent.change(dates()[0], { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "反映する" }));

    await waitFor(() => expect(saveTimetables).toHaveBeenCalled());
    expect(saveTimetables.mock.calls[0][0][0]).toEqual(TIMETABLES[0]);
    // 表示の追従は既定オフ (明示的に選んだときだけ切り替える)
    expect(onActivateTimetable).not.toHaveBeenCalled();
  });
});

// ─── 部分反映 (学年・曜日を選んだ範囲だけ反映) ─────────────────────
// 画面から固定したいのは「**範囲外の既存コマが消えない**」こと。
// 下書きだけ絞ると突き合わせで範囲外まで削除に分類されるので、その配線が
// 外れていないかをダイアログ越しに見る。
describe("ReflectDialog (部分反映)", () => {
  // 中3 (月・火) + 中2 (火) の下書き
  function makeScopeProject() {
    const p = makeProject({ name: "2026 2学期" });
    p.tabs.push({
      id: 2,
      name: "中2",
      grade: "中2",
      classes: [{ id: 1, label: "S", room: "601" }],
      days: ["火"],
      periodIds: [1, 2],
      schedule: { [makeCellKey("火", 1, 1)]: { subj: "社会", teacher: "半田" } },
    });
    return p;
  }

  const scopeCheckbox = () =>
    screen.getByRole("checkbox", { name: /反映する範囲を絞る/ });

  it("既定では範囲の絞り込みはオフで、学年・曜日の選択肢も出ない", () => {
    renderDialog({ project: makeScopeProject() });
    expect(scopeCheckbox()).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "中2" })).not.toBeInTheDocument();
  });

  it("オンにするとプロジェクトの学年と曜日が選べる (曜日は月火水…順)", () => {
    renderDialog({ project: makeScopeProject() });
    fireEvent.click(scopeCheckbox());
    expect(screen.getByRole("checkbox", { name: "中3" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "中2" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "月" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "火" })).toBeInTheDocument();
  });

  it("何も選んでいないうちは「まだ絞られていません」と知らせる", () => {
    renderDialog({ project: makeScopeProject() });
    fireEvent.click(scopeCheckbox());
    expect(screen.getByText(/まだ絞られていません/)).toBeInTheDocument();
  });

  it("学年を選ぶと反映されるコマ数がその学年ぶんに減る", () => {
    renderDialog({ project: makeScopeProject() });
    // 全体では 中3 の 2 コマ + 中2 の 1 コマ = 3 件
    expect(screen.getByText(/反映されるコマ: 3 件/)).toBeInTheDocument();

    fireEvent.click(scopeCheckbox());
    fireEvent.click(screen.getByRole("checkbox", { name: "中2" }));
    expect(screen.getByText(/反映されるコマ: 1 件/)).toBeInTheDocument();
  });

  it("置き換えで範囲外の既存コマを消さない (最重要)", async () => {
    // 置き換え先には範囲外 (中3) のコマが入っている
    const slots = [
      { id: 10, day: "月", time: "18:00-18:45", grade: "中3", cls: "S", room: "501", subj: "数学", teacher: "半田", note: "", timetableId: 1 },
      { id: 11, day: "火", time: "18:00-18:45", grade: "中2", cls: "S", room: "601", subj: "古い", teacher: "誰か", note: "", timetableId: 1 },
    ];
    const { saveSlots } = renderDialog({ project: makeScopeProject(), slots });

    fireEvent.click(screen.getByRole("radio", { name: /既存の時間割を置き換え/ }));
    fireEvent.click(scopeCheckbox());
    fireEvent.click(screen.getByRole("checkbox", { name: "中2" }));

    // 範囲外が守られることを画面で予告している
    expect(screen.getByText(/範囲外の 1 コマは触りません/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "反映する" }));
    fireEvent.click(await screen.findByRole("button", { name: "置き換える" }));

    await waitFor(() => expect(saveSlots).toHaveBeenCalled());
    const saved = saveSlots.mock.calls[0][0];
    // 中3 のコマは手つかず
    expect(saved.find((s) => s.id === 10)).toMatchObject({ subj: "数学" });
    // 中2 のコマは下書きで上書きされる (id は引き継ぐ)
    expect(saved.find((s) => s.id === 11)).toMatchObject({ subj: "社会" });
  });

  it("差分プレビューに範囲外のコマを削除として出さない", () => {
    const slots = [
      { id: 10, day: "月", time: "18:00-18:45", grade: "中3", cls: "S", room: "501", subj: "数学", teacher: "半田", note: "", timetableId: 1 },
      { id: 12, day: "月", time: "20:40-20:55", grade: "中3", cls: "S", room: "501", subj: "補習", teacher: "誰か", note: "", timetableId: 1 },
      { id: 11, day: "火", time: "18:00-18:45", grade: "中2", cls: "S", room: "601", subj: "古い", teacher: "誰か", note: "", timetableId: 1 },
    ];
    renderDialog({ project: makeScopeProject(), slots });
    fireEvent.click(screen.getByRole("radio", { name: /既存の時間割を置き換え/ }));

    // 絞る前: 下書きに無い中3の補習が削除に出る
    expect(screen.getByText(/－ 月 20:40-20:55 中3 S 補習/)).toBeInTheDocument();

    // 中2 だけに絞ると、範囲外なので削除から消える
    fireEvent.click(scopeCheckbox());
    fireEvent.click(screen.getByRole("checkbox", { name: "中2" }));
    expect(screen.queryByText(/－ 月 20:40-20:55 中3 S 補習/)).not.toBeInTheDocument();
  });

  it("範囲に該当するコマが無ければ反映ボタンを押せない", () => {
    const p = makeScopeProject();
    // 中2 タブを空にすると「中2 のみ」に該当する下書きが無くなる
    p.tabs[1].schedule = {};
    renderDialog({ project: p });
    fireEvent.click(scopeCheckbox());
    fireEvent.click(screen.getByRole("checkbox", { name: "中2" }));

    expect(screen.getByText(/中2」に反映できるコマがありません/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "反映する" })).toBeDisabled();
  });

  it("学年で絞ると「対象学年を限定する」もその学年だけになる", () => {
    renderDialog({ project: makeScopeProject() });
    // 絞る前はプロジェクトの全学年
    expect(screen.getByText(/対象学年を下書きの学年に限定する（中3・中2）/)).toBeInTheDocument();

    fireEvent.click(scopeCheckbox());
    fireEvent.click(screen.getByRole("checkbox", { name: "中2" }));
    // コマの無い中3 を対象学年に入れない
    expect(screen.getByText(/対象学年を下書きの学年に限定する（中2）/)).toBeInTheDocument();
  });

  it("絞り込みを外すと全体に戻る", () => {
    renderDialog({ project: makeScopeProject() });
    fireEvent.click(scopeCheckbox());
    fireEvent.click(screen.getByRole("checkbox", { name: "中2" }));
    expect(screen.getByText(/反映されるコマ: 1 件/)).toBeInTheDocument();

    fireEvent.click(scopeCheckbox());
    expect(screen.getByText(/反映されるコマ: 3 件/)).toBeInTheDocument();
  });
});
