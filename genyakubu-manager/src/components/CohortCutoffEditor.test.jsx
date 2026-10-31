// @vitest-environment jsdom
// コース別 終講日: 効き目 (最終授業日・第N回) と設定ミスの警告。
// 未設定のコースには「予定上の最終授業日（案）」を出す (C4)。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CohortCutoffEditor } from "./CohortCutoffEditor";
import { ConfirmProvider } from "../hooks/useConfirm";

afterEach(cleanup);

const mk = (id, day) => ({
  id,
  grade: "中1",
  day,
  time: "18:55-19:40",
  cls: "",
  room: "602",
  subj: "数学",
  teacher: "T",
  note: "",
});

// 中1 火金コース (deriveCohortsFromSlots が M|中1|火金 を作る)
const SLOTS = [mk(1, "火"), mk(2, "金")];
const COHORT_ID = "M|中1|火金";

function renderEditor(cohortDate, groupPatch = {}, opts = {}) {
  const displayCutoff = {
    ...(opts.displayCutoff || {}),
    groups: [
      {
        label: "中1・2",
        grades: ["中1", "中2"],
        startDate: "2026-04-07",
        date: "2026-07-31",
        ...groupPatch,
      },
    ],
    cohorts: [
      ...(opts.displayCutoff?.cohorts || []),
      ...(cohortDate
        ? [{ id: COHORT_ID, label: "中1 火金", grade: "中1", date: cohortDate }]
        : []),
    ],
  };
  const sessionCtx = {
    classSets: [],
    allSlots: opts.slots || SLOTS,
    displayCutoff,
    timetables: [],
    isOffForGrade: opts.isOffForGrade || (() => false),
    biweeklyAnchors: [],
    holidays: [],
    examPeriods: [],
    sessionOverrides: [],
    daySchedules: [],
    orientationOnFirstDay: true,
  };
  const onSave = vi.fn();
  render(
    <ConfirmProvider>
      <CohortCutoffEditor
        slots={opts.slots || SLOTS}
        displayCutoff={displayCutoff}
        onSave={onSave}
        isAdmin
        sessionCtx={sessionCtx}
        timetables={opts.timetables}
      />
    </ConfirmProvider>
  );
  return { onSave, displayCutoff };
}

describe("CohortCutoffEditor", () => {
  it("終講日を入れたコースは実際の最終授業日と第N回を出す", () => {
    // 2026-07-18 は土曜 → 火金コースの最後は 7/17 (金)
    renderEditor("2026-07-18");
    expect(screen.getByText(/最終授業日 2026-07-17 \(金\)/)).toBeInTheDocument();
    expect(screen.getByText(/第\d+回/)).toBeInTheDocument();
  });

  it("終講日が未設定なら確定の最終授業日は出さず、表示期間の終了日からの案を出す", () => {
    // 表示期間の終了日 8/1 は土曜 → 火金コースの授業は 7/31 (金) で終わる
    const { onSave } = renderEditor(null, { date: "2026-08-01" });
    expect(screen.getByText("予定上の最終授業日（案）: 7/31 (金)")).toBeInTheDocument();
    expect(screen.queryByText(/^最終授業日/)).not.toBeInTheDocument();
    expect(screen.queryByText(/第\d+回/)).not.toBeInTheDocument();
    // 案を出すだけでは何も書き換えない
    expect(onSave).not.toHaveBeenCalled();
    // 学年の見出しに、未設定のコースが従う終わりを出す
    expect(screen.getByText("表示期間の終了日 8/1 (土)")).toBeInTheDocument();
  });

  it("案は「この日を終講日にする」を押したときだけ終講日として保存する", () => {
    const { onSave } = renderEditor(null, { date: "2026-08-01" });
    fireEvent.click(screen.getByLabelText("中1 火金 の終講日を予定上の最終授業日にする"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].cohorts).toEqual([
      { id: COHORT_ID, label: "中1 火金", grade: "中1", date: "2026-07-31" },
    ]);
  });

  it("終講日を入れたコースには案を出さない", () => {
    renderEditor("2026-07-17", { date: "2026-08-01" });
    expect(screen.queryByText(/予定上の最終授業日/)).not.toBeInTheDocument();
  });

  it("案は休講の日を飛ばす (実施の判定は回数計算と同じ)", () => {
    // 7/31 (金) が休講なら、その前の授業 7/28 (火) が最後
    renderEditor(null, { date: "2026-08-01" }, {
      isOffForGrade: (date) => date === "2026-07-31",
    });
    expect(screen.getByText("予定上の最終授業日（案）: 7/28 (火)")).toBeInTheDocument();
  });

  it("不定期のコマは実施日の一覧にある日だけで案を出す", () => {
    const irregular = [
      { ...mk(1, "火"), irregular: true, onlyDates: ["2026-07-07", "2026-07-21"] },
    ];
    renderEditor(null, { date: "2026-08-01" }, { slots: irregular });
    expect(screen.getByText("予定上の最終授業日（案）: 7/21 (火)")).toBeInTheDocument();
  });

  it("終了日の直前 4 週間に授業が無ければ、案の代わりにそう出す", () => {
    renderEditor(null, { date: "2026-08-01" }, {
      isOffForGrade: (date) => date >= "2026-07-01",
    });
    expect(
      screen.getByText(/予定上の最終授業日（案）: 表示期間の終了日の直前 4 週間にこのコースの授業がありません/)
    ).toBeInTheDocument();
  });

  it("表示期間の終了日が無ければ推し量らず、学年の見出しで知らせる", () => {
    renderEditor(null, { date: null });
    expect(screen.queryByText(/予定上の最終授業日/)).not.toBeInTheDocument();
    expect(screen.getByText("表示期間の終了日 未設定")).toBeInTheDocument();
  });

  it("どの学年グループにも属さない学年は、見出しでそう知らせる", () => {
    renderEditor(null, { grades: ["中2"] });
    expect(screen.queryByText(/予定上の最終授業日/)).not.toBeInTheDocument();
    expect(screen.getByText("学年グループなし").title).toMatch(/どの学年グループにも属さない/);
  });

  it("グループ終了日より後なら従来どおり警告する", () => {
    renderEditor("2026-08-10");
    expect(screen.getByText(/グループ終了日 \(2026-07-31\) より後です/)).toBeInTheDocument();
  });

  it("グループ開始日より前なら警告する", () => {
    renderEditor("2026-04-01");
    expect(screen.getByText(/グループ開始日 \(2026-04-07\) より前です/)).toBeInTheDocument();
  });

  it("終講日が最終授業日とズレていれば、そろえるボタンを出す", async () => {
    // 7/18 (土) 終講 → 火金コースの最終授業は 7/17 (金)
    const { onSave } = renderEditor("2026-07-18");
    fireEvent.click(screen.getByLabelText("中1 火金 の終講日を最終授業日にそろえる"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].cohorts[0].date).toBe("2026-07-17");
  });

  it("終講日と最終授業日が同じならそろえるボタンは出さない", () => {
    renderEditor("2026-07-17");
    expect(
      screen.queryByLabelText("中1 火金 の終講日を最終授業日にそろえる")
    ).not.toBeInTheDocument();
  });

  it("「未設定のみ」で設定済みのコースを隠す", () => {
    renderEditor("2026-07-17");
    expect(screen.getByText("中1 火金")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("未設定のみ", { selector: "input" }));
    expect(screen.queryByText("中1 火金")).not.toBeInTheDocument();
    expect(screen.getByText(/条件に合うコースがありません/)).toBeInTheDocument();
  });

  it("検索でコースを絞り込める", () => {
    renderEditor(null);
    fireEvent.change(screen.getByLabelText("コースを検索"), {
      target: { value: "水木" },
    });
    expect(screen.queryByText("中1 火金")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("コースを検索"), {
      target: { value: "火金" },
    });
    expect(screen.getByText("中1 火金")).toBeInTheDocument();
  });

  it("絞り込みに該当するコースへ終講日を一括設定できる", () => {
    const { onSave } = renderEditor(null);
    fireEvent.change(screen.getByLabelText("該当するコースに一括設定する終講日"), {
      target: { value: "2026-07-17" },
    });
    fireEvent.click(screen.getByText(/該当 1 コースに設定/));
    expect(onSave.mock.calls[0][0].cohorts).toEqual([
      { id: "M|中1|火金", label: "中1 火金", grade: "中1", date: "2026-07-17" },
    ]);
  });

  it("絞り込みに該当するコースの終講日をまとめて解除できる", () => {
    const { onSave } = renderEditor("2026-07-17");
    fireEvent.click(screen.getByText("該当を解除"));
    expect(onSave.mock.calls[0][0].cohorts).toEqual([]);
  });

  it("未使用エントリをまとめて削除できる", async () => {
    const { onSave } = renderEditor(null, {}, {
      displayCutoff: {
        cohorts: [
          { id: "M|中9|月", label: "中9 月", grade: "中9", date: "2026-07-01" },
        ],
      },
    });
    expect(screen.getByText(/未使用（対象の授業が見つかりません）/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/まとめて削除（1 件）/));
    const ok = await screen.findByText("削除する");
    fireEvent.click(ok);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].cohorts).toEqual([]);
  });

  it("1 学年のコースが多いときは折りたたむ", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: 100 + i,
      grade: "高3",
      day: "月",
      time: "19:00-20:20",
      cls: "",
      room: "602",
      subj: `共テ科目${i} 演習`,
      teacher: "T",
      note: "",
    }));
    renderEditor(null, {}, { slots: many });
    // 既定は 8 件まで表示 → 残り 2 件はボタンの裏
    expect(screen.getByText("高3 共テ科目0")).toBeInTheDocument();
    expect(screen.queryByText("高3 共テ科目9")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("他 2 コースを表示"));
    expect(screen.getByText("高3 共テ科目9")).toBeInTheDocument();
  });

  it("expandRequest が来たら折りたたみを全部開く (目次から飛んできたとき)", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: 300 + i,
      grade: "高3",
      day: "月",
      time: "19:00-20:20",
      cls: "",
      room: "602",
      subj: `共テ科目${i} 演習`,
      teacher: "T",
      note: "",
    }));
    const displayCutoff = { groups: [], cohorts: [] };
    const props = { slots: many, displayCutoff, onSave: vi.fn(), isAdmin: true, sessionCtx: null };
    const { rerender } = render(
      <ConfirmProvider>
        <CohortCutoffEditor {...props} />
      </ConfirmProvider>
    );
    expect(screen.queryByText("高3 共テ科目9")).not.toBeInTheDocument();
    rerender(
      <ConfirmProvider>
        <CohortCutoffEditor {...props} expandRequest={1} />
      </ConfirmProvider>
    );
    expect(screen.getByText("高3 共テ科目9")).toBeInTheDocument();
    expect(screen.queryByText(/他 \d+ コースを表示/)).not.toBeInTheDocument();
  });

  it("一括設定は 10 コース以上なら確認を挟む", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: 200 + i,
      grade: "高3",
      day: "月",
      time: "19:00-20:20",
      cls: "",
      room: "602",
      subj: `共テ科目${i} 演習`,
      teacher: "T",
      note: "",
    }));
    const { onSave } = renderEditor(null, {}, { slots: many });
    fireEvent.change(screen.getByLabelText("該当するコースに一括設定する終講日"), {
      target: { value: "2027-01-17" },
    });
    fireEvent.click(screen.getByText(/該当 12 コースに設定/));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText("まとめて設定"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].cohorts).toHaveLength(12);
  });
});

describe("CohortCutoffEditor — 時間割ごとの終講日 (A1)", () => {
  const TTS = [
    { id: 3, name: "2学期", startDate: "2026-04-01", endDate: "2026-12-21", grades: [] },
    { id: 4, name: "3学期", startDate: "2027-01-07", endDate: null, grades: ["中1", "中2"] },
  ];
  const slots = [
    { ...mk(1, "火"), timetableId: 3 },
    { ...mk(2, "金"), timetableId: 3 },
    { ...mk(3, "火"), timetableId: 4 },
    { ...mk(4, "金"), timetableId: 4 },
  ];

  it("選んだ時間割の終講日だけを並べ、保存した終講日に時間割を付ける (ほかの時間割はそのまま)", () => {
    const other = { id: COHORT_ID, label: "中1 火金", grade: "中1", date: "2026-12-18", timetableId: 3 };
    const { onSave } = renderEditor(null, { date: "2027-03-31" }, {
      slots,
      timetables: TTS,
      displayCutoff: { cohorts: [other] },
    });
    const picker = screen.getByLabelText("終講日を設定する時間割");
    // 既定は今の時間割 (テストの日付によらず、どちらかが選ばれている)
    fireEvent.change(picker, { target: { value: "4" } });
    // 3学期には終講日がまだ無い
    expect(screen.getByLabelText("中1 火金 の終講日")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("中1 火金 の終講日"), { target: { value: "2027-03-12" } });
    expect(onSave.mock.calls.at(-1)[0].cohorts).toEqual([
      other,
      { id: COHORT_ID, label: "中1 火金", grade: "中1", date: "2027-03-12", timetableId: 4 },
    ]);
    fireEvent.change(picker, { target: { value: "3" } });
    expect(screen.getByLabelText("中1 火金 の終講日")).toHaveValue("2026-12-18");
  });

  it("時間割の付いていない旧データを片方の時間割で消しても、ほかの時間割には残す", () => {
    const legacy = { id: COHORT_ID, label: "中1 火金", grade: "中1", date: "2026-12-18" };
    const { onSave } = renderEditor(null, { date: "2027-03-31" }, {
      slots,
      timetables: TTS,
      displayCutoff: { cohorts: [legacy] },
    });
    fireEvent.change(screen.getByLabelText("終講日を設定する時間割"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("中1 火金 の終講日"), { target: { value: "" } });
    expect(onSave.mock.calls.at(-1)[0].cohorts).toEqual([{ ...legacy, timetableId: 3 }]);
  });
});
