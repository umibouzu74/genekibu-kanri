// @vitest-environment jsdom
// RegularBuilderApp から切り出したフック群の単体テスト。App の JSX を通さずに
// 「件数は表示用に現時点の project で数え、保存は saveProject の最新値で
// 再計算する」契約と、toast / confirm の呼び分けを固定する。
import { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { makeProject } from "../testUtils";
import { makeCellKey, makeCellRef } from "../model";
import { useGridEdits } from "./useGridEdits";
import { useTabOps } from "./useTabOps";
import { useConflictApprovals } from "./useConflictApprovals";
import { useCellOps } from "./useCellOps";
import { useProjectOptions } from "./useProjectOptions";

afterEach(cleanup);

const REF_S = makeCellRef(1, makeCellKey("月", 1, 1)); // 数学/半田
const REF_A = makeCellRef(1, makeCellKey("月", 2, 2)); // 英語/堀上 room 601
const REF_EMPTY = makeCellRef(1, makeCellKey("火", 1, 1));

const makeToasts = () => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() });

// project を state に持ち、saveProject(fn) をその場で適用する土台。
// 各フックは useHook(ctx) で組み立てる。
function renderWithProject(useHook, over = {}, extra = {}) {
  const toasts = makeToasts();
  const confirm = vi.fn(async () => true);
  const view = renderHook(() => {
    const [project, setProject] = useState(() => makeProject(over));
    const saveProject = useCallback(
      (fn) => setProject((prev) => (typeof fn === "function" ? fn(prev) : fn)),
      []
    );
    const updateTab = useCallback(
      (tabId, fn) =>
        saveProject((p) => ({ ...p, tabs: p.tabs.map((t) => (t.id === tabId ? fn(t) : t)) })),
      [saveProject]
    );
    const hook = useHook({ project, saveProject, updateTab, toasts, confirm, ...extra });
    return { project, hook };
  });
  const cell = (ref) => {
    const [tabId, key] = ref.split(":");
    return view.result.current.project.tabs.find((t) => t.id === Number(tabId))?.schedule[key];
  };
  return { view, toasts, confirm, cell, hook: () => view.result.current.hook, project: () => view.result.current.project };
}

describe("useGridEdits", () => {
  it("onCellChange はフィールドを書き、全部空になったらセルごと消す", () => {
    const { hook, cell } = renderWithProject(useGridEdits);
    act(() => hook().onCellChange(REF_EMPTY, "subj", "理科"));
    expect(cell(REF_EMPTY)).toEqual({ subj: "理科" });
    act(() => hook().onCellChange(REF_EMPTY, "subj", ""));
    expect(cell(REF_EMPTY)).toBeUndefined();
  });

  it("onSwapCells は 2 セルを入れ替える", () => {
    const { hook, cell } = renderWithProject(useGridEdits);
    act(() => hook().onSwapCells(REF_S, REF_EMPTY));
    expect(cell(REF_S)).toBeUndefined();
    expect(cell(REF_EMPTY)).toMatchObject({ subj: "数学", teacher: "半田" });
  });

  it("onSetClassRoom は曜日を指定すると曜日別既定 (roomByDay) だけを変え、toast に「全曜日に適用」を付ける", () => {
    const { hook, project, toasts } = renderWithProject(useGridEdits);
    act(() => hook().onSetClassRoom(1, 1, "701", "月"));
    const cls = project().tabs[0].classes[0];
    expect(cls.room).toBe("501");
    expect(cls.roomByDay).toEqual({ 月: "701" });
    expect(toasts.success).toHaveBeenCalledWith(
      expect.stringContaining("月曜の教室を「501」→「701」に変更しました"),
      expect.objectContaining({ action: expect.objectContaining({ label: "全曜日に適用" }) })
    );
    // toast の「全曜日に適用」で基本の既定へ昇格する
    act(() => toasts.success.mock.calls[0][1].action.onClick());
    expect(project().tabs[0].classes[0].room).toBe("701");
  });

  it("基本の既定教室が空の列は曜日指定でも全曜日の既定として設定する", () => {
    const { hook, project } = renderWithProject(useGridEdits, {
      tabs: [{ ...makeProject().tabs[0], classes: [{ id: 1, label: "S", room: "" }, { id: 2, label: "A", room: "502" }] }],
    });
    act(() => hook().onSetClassRoom(1, 1, "701", "月"));
    expect(project().tabs[0].classes[0].room).toBe("701");
    expect(project().tabs[0].classes[0].roomByDay).toBeUndefined();
  });

  it("applyDayCopy は曜日をコピーして onDayCopied(to) を呼び、0 件なら info だけ", () => {
    const onDayCopied = vi.fn();
    const { hook, cell, toasts } = renderWithProject(useGridEdits, {}, { onDayCopied });
    act(() => hook().applyDayCopy({ from: "月", to: "火", mode: "overwrite", addDay: false }));
    expect(cell(makeCellRef(1, makeCellKey("火", 1, 1)))).toMatchObject({ subj: "数学" });
    expect(onDayCopied).toHaveBeenCalledWith("火");
    expect(toasts.success).toHaveBeenCalledTimes(1);
    // 火 は月と同じ内容になったので 木 (使っていない曜日) へは addDay 無しではコピーできない
    act(() => hook().applyDayCopy({ from: "水", to: "火", mode: "overwrite", addDay: false }));
    expect(toasts.info).toHaveBeenCalledTimes(1);
    expect(onDayCopied).toHaveBeenCalledTimes(1);
  });
});

describe("useTabOps", () => {
  it("addTab は直前の学年から曜日・時限を引き継ぎ、新しい id を onTabAdded に渡す", () => {
    const onTabAdded = vi.fn();
    const { hook, project } = renderWithProject(
      (ctx) => useTabOps({ ...ctx, activeTab: ctx.project.tabs[0], onTabAdded }),
    );
    act(() => hook().addTab());
    const tabs = project().tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toMatchObject({ id: 2, name: "学年2", days: ["月", "火"], periodIds: [1, 2], schedule: {} });
    expect(onTabAdded).toHaveBeenCalledWith(2);
  });

  it("reorderTabs は範囲内だけ並べ替える", () => {
    const base = makeProject();
    const { hook, project } = renderWithProject(
      (ctx) => useTabOps({ ...ctx, activeTab: null }),
      { tabs: [base.tabs[0], { ...base.tabs[0], id: 2, name: "中2" }] }
    );
    act(() => hook().reorderTabs(0, 1));
    expect(project().tabs.map((t) => t.id)).toEqual([2, 1]);
    act(() => hook().reorderTabs(0, 5));
    expect(project().tabs.map((t) => t.id)).toEqual([2, 1]);
  });

  it("removeTab は確認してから消し、キャンセルなら何もしない", async () => {
    const onTabRemoved = vi.fn();
    const { hook, project, confirm } = renderWithProject(
      (ctx) => useTabOps({ ...ctx, activeTab: ctx.project.tabs[0], onTabRemoved }),
    );
    confirm.mockResolvedValueOnce(false);
    await act(() => hook().removeTab());
    expect(project().tabs).toHaveLength(1);
    expect(onTabRemoved).not.toHaveBeenCalled();
    await act(() => hook().removeTab());
    expect(project().tabs).toHaveLength(0);
    expect(onTabRemoved).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "学年の削除", message: expect.stringContaining("セル 2 件") })
    );
  });
});

// 同じ講師が同じ曜日・時限の 2 クラスに入っている = 講師重複
const conflictingProject = () => {
  const base = makeProject();
  const tab = base.tabs[0];
  return {
    ...base,
    tabs: [
      {
        ...tab,
        schedule: {
          ...tab.schedule,
          [makeCellKey("月", 1, 2)]: { subj: "英語", teacher: "半田" },
        },
      },
    ],
  };
};

describe("useConflictApprovals", () => {
  it("重なりを検出してタブ別に数え、承認 / 解除で active が増減する", () => {
    const { hook } = renderWithProject(useConflictApprovals, conflictingProject());
    const active0 = hook().conflictView.active;
    expect(active0.length).toBeGreaterThan(0);
    expect(hook().tabConflictCounts[1]).toBe(active0.length);
    act(() => hook().approveConflict(active0[0]));
    expect(hook().conflictView.active).toHaveLength(active0.length - 1);
    act(() => hook().unapproveConflict(active0[0]));
    expect(hook().conflictView.active).toHaveLength(active0.length);
  });

  it("purgeStaleApprovals は対象の無くなった承認だけ消す", () => {
    const { hook, project, toasts } = renderWithProject(useConflictApprovals, {
      ...conflictingProject(),
      approvedConflicts: ["stale:key:that:no:longer:matches"],
    });
    expect(hook().conflictView.stale).toEqual(["stale:key:that:no:longer:matches"]);
    act(() => hook().purgeStaleApprovals());
    expect(project().approvedConflicts).toEqual([]);
    expect(toasts.success).toHaveBeenCalledWith(expect.stringContaining("1 件を削除"));
    // 消すものが無ければ何もしない
    act(() => hook().purgeStaleApprovals());
    expect(toasts.success).toHaveBeenCalledTimes(1);
  });
});

describe("useCellOps", () => {
  const setup = (over = {}) =>
    renderWithProject(
      (ctx) =>
        useCellOps({
          ...ctx,
          jumpToCells: vi.fn(),
          conflictView: { active: [], stale: [] },
          selectionResetKey: "k",
        }),
      over
    );

  it("コピー → 貼り付けはロックを引き継がず、ロック中のセルには貼り付けない", () => {
    const { hook, cell, toasts } = setup();
    act(() => hook().toggleLockRefs([REF_S], true));
    expect(cell(REF_S).locked).toBe(true);
    expect(toasts.success).toHaveBeenLastCalledWith(expect.stringContaining("1 コマをロック"));

    act(() => hook().copyCell(REF_S));
    expect(hook().cellClipboard).toEqual({ subj: "数学", teacher: "半田" });
    act(() => hook().pasteCell(REF_EMPTY));
    expect(cell(REF_EMPTY)).toEqual({ subj: "数学", teacher: "半田" });

    act(() => hook().copyCell(REF_A));
    act(() => hook().pasteCell(REF_S));
    expect(cell(REF_S)).toMatchObject({ subj: "数学", locked: true });
    expect(toasts.info).toHaveBeenCalledWith(expect.stringContaining("ロック中のセルには貼り付けできません"));
  });

  it("空セルはロックできない (件数 0 は info)", () => {
    const { hook, toasts } = setup();
    act(() => hook().toggleLockRefs([REF_EMPTY], true));
    expect(toasts.info).toHaveBeenCalledWith(expect.stringContaining("ロックできるコマがありません"));
  });

  it("onClearCell はロック中を除いてセルを消す", () => {
    const { hook, cell } = setup();
    act(() => hook().toggleLockRefs([REF_S], true));
    act(() => hook().onClearCell(REF_S));
    expect(cell(REF_S)).toBeDefined();
    act(() => hook().onClearCell(REF_A));
    expect(cell(REF_A)).toBeUndefined();
  });

  it("選択範囲の一括クリアは確認してから消し、選択も解く", async () => {
    const { hook, cell, confirm } = setup();
    act(() => hook().rectSelect([REF_S, REF_A, REF_EMPTY]));
    expect(hook().selectedRefs.size).toBe(3);
    await act(() => hook().clearSelectedCells());
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("2 コマをクリア") }));
    expect(cell(REF_S)).toBeUndefined();
    expect(cell(REF_A)).toBeUndefined();
    expect(hook().selectedRefs.size).toBe(0);
  });

  it("一括変更と選択範囲への貼り付けは選択中のセルに効く", () => {
    const { hook, cell, toasts } = setup();
    act(() => hook().rectSelect([REF_S, REF_A]));
    act(() => hook().applyBulkEdit({ teacher: "河野" }));
    expect(cell(REF_S).teacher).toBe("河野");
    expect(cell(REF_A).teacher).toBe("河野");
    expect(hook().showBulkEdit).toBe(false);

    act(() => hook().copyCell(REF_S));
    act(() => hook().rectSelect([REF_EMPTY, makeCellRef(1, makeCellKey("火", 2, 2))]));
    act(() => hook().pasteIntoSelection());
    expect(cell(REF_EMPTY)).toMatchObject({ subj: "数学", teacher: "河野" });
    expect(toasts.success).toHaveBeenLastCalledWith(expect.stringContaining("2 コマに"));
  });

  it("右クリックメニューを開くと jointItem が出て、onCtxAction で閉じつつ実行する", () => {
    const { hook, cell } = setup();
    act(() => hook().openCellMenu({ clientX: 10, clientY: 20 }, REF_S));
    expect(hook().ctxMenu).toMatchObject({ kind: "cell", x: 10, y: 20, ref: REF_S });
    expect(hook().jointItem).toMatchObject({ isJoint: false, disabled: false });
    act(() => hook().onCtxAction("lock"));
    expect(hook().ctxMenu).toBeNull();
    expect(cell(REF_S).locked).toBe(true);
    act(() => hook().openCellMenu({ clientX: 0, clientY: 0 }, REF_S));
    expect(hook().jointItem.disabled).toBe(true); // ロック中は合同にできない
    act(() => hook().onCtxAction("joint"));
    expect(hook().jointTarget).toBe(REF_S);
  });
});

describe("useProjectOptions", () => {
  it("講師候補はマスタ + セルの講師 + 隔週パートナー、教室候補はマスタ + クラス既定 + セル上書き", () => {
    const base = makeProject({ rooms: ["901"] });
    const tab = base.tabs[0];
    const { result } = renderHook(() =>
      useProjectOptions({
        ...base,
        tabs: [
          {
            ...tab,
            classes: [...tab.classes.slice(0, 1), { id: 2, label: "A", room: "502", roomByDay: { 火: "503" } }],
            schedule: {
              ...tab.schedule,
              [makeCellKey("火", 1, 1)]: { subj: "国語", teacher: "河野", note: "隔週(香川)" },
            },
          },
        ],
      })
    );
    expect(result.current.teacherOptions).toEqual(expect.arrayContaining(["堀上", "半田", "河野", "香川"]));
    expect(result.current.roomOptions).toEqual(["501", "502", "503", "601", "901"]);
    expect(result.current.sortedTeachers.map((t) => t.name)).toEqual(["堀上", "半田"]);
  });
});
