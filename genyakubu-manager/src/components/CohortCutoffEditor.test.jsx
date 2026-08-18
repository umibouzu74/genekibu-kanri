// @vitest-environment jsdom
// コース別 終講日: 効き目 (最終授業日・第N回) と設定ミスの警告。
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

  it("終講日が未設定なら最終授業日は出さない", () => {
    renderEditor(null);
    expect(screen.queryByText(/最終授業日/)).not.toBeInTheDocument();
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

  it("表示中のコースに終講日を一括設定できる", () => {
    const { onSave } = renderEditor(null);
    fireEvent.change(screen.getByLabelText("表示中のコースに一括設定する終講日"), {
      target: { value: "2026-07-17" },
    });
    fireEvent.click(screen.getByText(/表示中の 1 コースに設定/));
    expect(onSave.mock.calls[0][0].cohorts).toEqual([
      { id: "M|中1|火金", label: "中1 火金", grade: "中1", date: "2026-07-17" },
    ]);
  });

  it("表示中のコースの終講日をまとめて解除できる", () => {
    const { onSave } = renderEditor("2026-07-17");
    fireEvent.click(screen.getByText("表示中を解除"));
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
});
