// @vitest-environment jsdom
// 表示期間設定: 効き目の表示 (対象コマ数・最終授業日) と設定ミスの警告。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DisplayCutoffEditor } from "./DisplayCutoffEditor";
import { ConfirmProvider } from "../hooks/useConfirm";

afterEach(cleanup);

const mk = (id, grade, day, extras = {}) => ({
  id,
  grade,
  day,
  time: "18:55-19:40",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "T",
  note: "",
  ...extras,
});

// 中1 火曜 / 中2 月曜 / どのグループにも属さない「附中」水曜
const SLOTS = [mk(1, "中1", "火"), mk(2, "中2", "月"), mk(3, "附中", "水")];

const cutoff = (groupPatch = {}) => ({
  groups: [
    {
      label: "中1・2",
      grades: ["中1", "中2"],
      startDate: "2026-04-07",
      date: "2026-07-18",
      ...groupPatch,
    },
  ],
  cohorts: [],
});

function renderEditor(displayCutoff = cutoff(), opts = {}) {
  const onSave = vi.fn();
  const sessionCtx = {
    classSets: [],
    allSlots: SLOTS,
    displayCutoff,
    timetables: [],
    isOffForGrade: () => false,
    biweeklyAnchors: [],
    holidays: [],
    examPeriods: [],
    sessionOverrides: [],
    daySchedules: [],
    orientationOnFirstDay: true,
    ...(opts.sessionCtx || {}),
  };
  render(
    <ConfirmProvider>
      <DisplayCutoffEditor
        slots={SLOTS}
        displayCutoff={displayCutoff}
        onSave={onSave}
        isAdmin
        sessionCtx={opts.noCtx ? null : sessionCtx}
      />
    </ConfirmProvider>
  );
  return { onSave };
}

describe("DisplayCutoffEditor", () => {
  it("対象コマ数・授業曜日・開講日を出す", () => {
    renderEditor();
    expect(screen.getByText("2 コマ")).toBeInTheDocument();
    expect(screen.getByText("授業曜日 月火")).toBeInTheDocument();
    expect(screen.getByText("開講 2026-04-07 (火)")).toBeInTheDocument();
  });

  it("終了日から実際の最終授業日を逆算して出す", () => {
    renderEditor();
    // 7/18 は土曜。中1・2 の授業は月火なので最後は 7/14 (火)
    expect(screen.getByText(/最終授業日 2026-07-14 \(火\)/)).toBeInTheDocument();
  });

  it("開始日が終了日より後なら警告する", () => {
    renderEditor(cutoff({ startDate: "2026-09-01", date: "2026-07-18" }));
    expect(screen.getByText(/開始日が終了日より後です/)).toBeInTheDocument();
  });

  it("終了日の直前に授業が無ければ警告する (時間割が先に終わっている等)", () => {
    const dc = cutoff({ date: "2026-09-30" });
    renderEditor(dc, {
      sessionCtx: {
        timetables: [
          {
            id: 1,
            name: "1学期",
            type: "regular",
            startDate: "2026-04-07",
            endDate: "2026-07-18",
            grades: [],
          },
        ],
      },
    });
    expect(
      screen.getByText(/終了日の直前 4 週間にこの学年の授業がありません/)
    ).toBeInTheDocument();
  });

  it("どのグループにも属さない学年を警告する", () => {
    renderEditor();
    expect(
      screen.getByText("⚠ どの学年グループにも属さない学年があります")
    ).toBeInTheDocument();
    expect(screen.getByText("附中 (1 コマ)")).toBeInTheDocument();
  });

  it("コマの無い学年グループはその旨を出す", () => {
    renderEditor({
      groups: [{ label: "高3", grades: ["高3"], startDate: null, date: null }],
      cohorts: [],
    });
    expect(
      screen.getByText(/この学年グループのコマは登録されていません/)
    ).toBeInTheDocument();
  });

  it("日付を変えると displayCutoff ごと保存する", () => {
    const { onSave } = renderEditor();
    fireEvent.change(screen.getByLabelText("中1・2 の終了日"), {
      target: { value: "2026-07-20" },
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].groups[0].date).toBe("2026-07-20");
  });

  it("対象学年チップから外せる", () => {
    const { onSave } = renderEditor();
    fireEvent.click(screen.getByLabelText("中1・2 から 中2 を外す"));
    expect(onSave.mock.calls[0][0].groups[0].grades).toEqual(["中1"]);
  });

  it("未所属の学年をプルダウンでグループに入れられる", () => {
    const { onSave } = renderEditor();
    fireEvent.change(screen.getByLabelText("附中 をグループに追加"), {
      target: { value: "0" },
    });
    expect(onSave.mock.calls[0][0].groups[0].grades).toEqual(["中1", "中2", "附中"]);
  });

  it("学年は 1 つのグループにしか属さない (追加時に他から外す)", () => {
    const two = {
      groups: [
        { label: "中1・2", grades: ["中1", "中2"], startDate: null, date: null },
        { label: "土曜", grades: [], startDate: null, date: null },
      ],
      cohorts: [],
    };
    const { onSave } = renderEditor(two);
    fireEvent.change(screen.getByLabelText("土曜 に学年を追加"), {
      target: { value: "中2" },
    });
    fireEvent.click(screen.getByLabelText("土曜 に入力した学年を追加"));
    const saved = onSave.mock.calls[0][0];
    expect(saved.groups[0].grades).toEqual(["中1"]);
    expect(saved.groups[1].grades).toEqual(["中2"]);
  });

  it("学年グループを追加できる (同名は不可)", () => {
    const { onSave } = renderEditor();
    const input = screen.getByLabelText("新しい学年グループ名");
    fireEvent.change(input, { target: { value: "土曜プレップ" } });
    fireEvent.click(screen.getByText("+ グループを追加"));
    const saved = onSave.mock.calls[0][0];
    expect(saved.groups).toHaveLength(2);
    expect(saved.groups[1]).toMatchObject({ label: "土曜プレップ", grades: [] });

    fireEvent.change(input, { target: { value: "中1・2" } });
    expect(screen.getByText("同じ名前のグループがあります")).toBeInTheDocument();
    expect(screen.getByText("+ グループを追加")).toBeDisabled();
  });

  it("一括設定は対象を絞って空欄の項目を触らない", () => {
    const two = {
      groups: [
        { label: "中1・2", grades: ["中1", "中2"], startDate: "2026-04-07", date: "2026-07-18" },
        { label: "高3", grades: ["高3"], startDate: "2026-04-07", date: "2026-07-18" },
      ],
      cohorts: [],
    };
    const { onSave } = renderEditor(two);
    fireEvent.change(screen.getByLabelText("一括設定の対象"), { target: { value: "中学部" } });
    fireEvent.change(screen.getByLabelText("一括設定の終了日"), {
      target: { value: "2026-07-25" },
    });
    fireEvent.click(screen.getByText("1 グループに適用"));
    const saved = onSave.mock.calls[0][0];
    expect(saved.groups[0]).toMatchObject({ startDate: "2026-04-07", date: "2026-07-25" });
    expect(saved.groups[1]).toMatchObject({ startDate: "2026-04-07", date: "2026-07-18" });
  });

  it("グループ削除は確認ダイアログを通す", async () => {
    const { onSave } = renderEditor();
    fireEvent.click(screen.getByLabelText("中1・2 を削除"));
    // 確認ダイアログが出るまでは保存しない
    expect(onSave).not.toHaveBeenCalled();
    const okButton = await screen.findByText("削除する");
    expect(screen.getByText(/この学年の 2 コマは表示期間・終講日のフィルタが効かなくなり/)).toBeInTheDocument();
    fireEvent.click(okButton);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].groups).toEqual([]);
  });

  it("sessionCtx が無くても落ちない (最終授業日は出さない)", () => {
    renderEditor(cutoff(), { noCtx: true });
    expect(screen.queryByText(/最終授業日/)).not.toBeInTheDocument();
    expect(screen.getByText("2 コマ")).toBeInTheDocument();
  });
});
