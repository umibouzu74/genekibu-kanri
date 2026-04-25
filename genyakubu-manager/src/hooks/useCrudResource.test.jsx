// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { useCrudResource } from "./useCrudResource";
import { ToastProvider } from "./useToasts";
import { ConfirmProvider } from "./useConfirm";

afterEach(cleanup);

function TestWrapper({ children }) {
  return (
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id} data-tone={t.tone}>
              {t.message}
            </div>
          ))}
        </div>
      )}
    >
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}

function renderCrud(initialList, { idKey } = {}) {
  const saveSpy = vi.fn();
  const { result, rerender } = renderHook(
    ({ list }) => useCrudResource({ list, save: saveSpy, idKey }),
    { wrapper: TestWrapper, initialProps: { list: initialList } }
  );
  return { result, rerender, saveSpy };
}

describe("useCrudResource", () => {
  describe("add", () => {
    it("空リストに追加したら id=1 が採番される", () => {
      const { result, saveSpy } = renderCrud([]);
      let newId;
      act(() => {
        newId = result.current.add({ name: "foo" });
      });
      expect(newId).toBe(1);
      expect(saveSpy).toHaveBeenCalledWith([{ id: 1, name: "foo" }]);
    });

    it("既存の最大 id + 1 が採番される", () => {
      const { result, saveSpy } = renderCrud([{ id: 3 }, { id: 7 }]);
      let newId;
      act(() => {
        newId = result.current.add({ name: "bar" });
      });
      expect(newId).toBe(8);
      expect(saveSpy).toHaveBeenCalledWith([
        { id: 3 },
        { id: 7 },
        { id: 8, name: "bar" },
      ]);
    });

    it("withCreatedAt=true で createdAt が ISO-8601 形式で付与される", () => {
      const { result, saveSpy } = renderCrud([]);
      act(() => {
        result.current.add({ name: "foo" }, { withCreatedAt: true });
      });
      const [record] = saveSpy.mock.calls[0][0];
      expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(record.updatedAt).toBeUndefined();
    });

    it("withUpdatedAt=true で updatedAt が付与される", () => {
      const { result, saveSpy } = renderCrud([]);
      act(() => {
        result.current.add({ name: "foo" }, { withUpdatedAt: true });
      });
      const [record] = saveSpy.mock.calls[0][0];
      expect(record.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(record.createdAt).toBeUndefined();
    });

    it("両 flag false ならタイムスタンプは付かない", () => {
      const { result, saveSpy } = renderCrud([]);
      act(() => {
        result.current.add({ name: "foo" });
      });
      const [record] = saveSpy.mock.calls[0][0];
      expect(record.createdAt).toBeUndefined();
      expect(record.updatedAt).toBeUndefined();
    });

    it("successMsg が指定されれば toasts.success が呼ばれる", () => {
      const { result } = renderCrud([]);
      act(() => {
        result.current.add({ name: "foo" }, { successMsg: "追加しました" });
      });
      expect(screen.getByText("追加しました")).toBeInTheDocument();
      expect(screen.getByText("追加しました").dataset.tone).toBe("success");
    });
  });

  describe("update", () => {
    it("該当 id のレコードだけ更新し他は不変", () => {
      const initial = [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ];
      const { result, saveSpy } = renderCrud(initial);
      act(() => {
        result.current.update(2, { name: "B" });
      });
      expect(saveSpy).toHaveBeenCalledWith([
        { id: 1, name: "a" },
        { id: 2, name: "B" },
      ]);
    });

    it("changes に id が含まれていても idKey の値は保持される", () => {
      const { result, saveSpy } = renderCrud([{ id: 1, name: "a" }]);
      act(() => {
        result.current.update(1, { id: 99, name: "x" });
      });
      expect(saveSpy.mock.calls[0][0][0]).toEqual({ id: 1, name: "x" });
    });

    it("withTimestamp=true で updatedAt が付与される", () => {
      const { result, saveSpy } = renderCrud([{ id: 1, name: "a" }]);
      act(() => {
        result.current.update(1, { name: "x" }, { withTimestamp: true });
      });
      const updated = saveSpy.mock.calls[0][0][0];
      expect(updated.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("remove", () => {
    it("指定 id のレコードだけ削除", () => {
      const { result, saveSpy } = renderCrud([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);
      act(() => {
        result.current.remove(2);
      });
      expect(saveSpy).toHaveBeenCalledWith([{ id: 1 }, { id: 3 }]);
    });

    it("存在しない id でも save は呼ばれるが内容は変わらない", () => {
      const { result, saveSpy } = renderCrud([{ id: 1 }]);
      act(() => {
        result.current.remove(99);
      });
      expect(saveSpy).toHaveBeenCalledWith([{ id: 1 }]);
    });
  });

  describe("confirmedRemove", () => {
    function Harness({ initialList, saveSpy, apiRef }) {
      const [list, setList] = useState(initialList);
      const api = useCrudResource({
        list,
        save: (next) => {
          saveSpy(next);
          setList(next);
        },
      });
      apiRef.current = api;
      return null;
    }

    function renderHarness(initialList) {
      const saveSpy = vi.fn();
      const apiRef = { current: null };
      render(
        <ToastProvider
          render={(toasts) => (
            <div data-testid="toasts">
              {toasts.map((t) => (
                <div key={t.id} data-tone={t.tone}>
                  {t.message}
                </div>
              ))}
            </div>
          )}
        >
          <ConfirmProvider>
            <Harness initialList={initialList} saveSpy={saveSpy} apiRef={apiRef} />
          </ConfirmProvider>
        </ToastProvider>
      );
      return { saveSpy, apiRef };
    }

    it("キャンセル時: save 未呼び出し・false を返す", async () => {
      const { saveSpy, apiRef } = renderHarness([{ id: 1 }, { id: 2 }]);
      let promise;
      act(() => {
        promise = apiRef.current.confirmedRemove(1);
      });
      const cancel = await screen.findByRole("button", { name: "キャンセル" });
      fireEvent.click(cancel);
      const result = await promise;
      expect(result).toBe(false);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it("承諾時: cascade → 主リスト削除の順に実行される", async () => {
      const { saveSpy, apiRef } = renderHarness([{ id: 1 }, { id: 2 }]);
      const cascadeSpy = vi.fn();
      let promise;
      act(() => {
        promise = apiRef.current.confirmedRemove(1, { cascade: cascadeSpy });
      });
      const ok = await screen.findByRole("button", { name: "削除" });
      fireEvent.click(ok);
      const result = await promise;
      expect(result).toBe(true);
      expect(cascadeSpy).toHaveBeenCalledWith(1);
      expect(saveSpy).toHaveBeenCalledWith([{ id: 2 }]);
      // cascade は save より先に呼ばれる
      expect(cascadeSpy.mock.invocationCallOrder[0]).toBeLessThan(
        saveSpy.mock.invocationCallOrder[0]
      );
    });

    it("cascade 未指定でも削除は走る", async () => {
      const { saveSpy, apiRef } = renderHarness([{ id: 1 }]);
      let promise;
      act(() => {
        promise = apiRef.current.confirmedRemove(1);
      });
      const ok = await screen.findByRole("button", { name: "削除" });
      fireEvent.click(ok);
      await promise;
      expect(saveSpy).toHaveBeenCalledWith([]);
    });

    it("successMsg 指定時は toasts に success が追加される", async () => {
      const { apiRef } = renderHarness([{ id: 1 }]);
      let promise;
      act(() => {
        promise = apiRef.current.confirmedRemove(1, {
          successMsg: "削除しました",
        });
      });
      const ok = await screen.findByRole("button", { name: "削除" });
      fireEvent.click(ok);
      await promise;
      expect(screen.getByText("削除しました")).toBeInTheDocument();
      expect(screen.getByText("削除しました").dataset.tone).toBe("success");
    });

    it("カスタム okLabel が Modal に反映される", async () => {
      const { apiRef } = renderHarness([{ id: 1 }]);
      let promise;
      act(() => {
        promise = apiRef.current.confirmedRemove(1, { okLabel: "破棄" });
      });
      const ok = await screen.findByRole("button", { name: "破棄" });
      fireEvent.click(ok);
      await promise;
    });
  });

  describe("idKey custom", () => {
    it("idKey='pk' で採番と削除が pk キーで動く", () => {
      const { result, saveSpy } = renderCrud([{ pk: 3 }], { idKey: "pk" });
      let newId;
      act(() => {
        newId = result.current.add({ name: "foo" });
      });
      expect(newId).toBe(4);
      expect(saveSpy).toHaveBeenCalledWith([
        { pk: 3 },
        { pk: 4, name: "foo" },
      ]);
    });
  });

  describe("removeWithUndo", () => {
    // confirm を介さず即削除されるため、ToastProvider を独立に使って
    // toast に表示された Undo ボタンを押下する E2E 風のフローを検証する。
    function UndoHarness({ initialList, saveSpy, apiRef }) {
      const [list, setList] = useState(initialList);
      const api = useCrudResource({
        list,
        save: (next) => {
          saveSpy(next);
          setList(next);
        },
      });
      apiRef.current = api;
      return null;
    }

    function renderUndoHarness(initialList) {
      const saveSpy = vi.fn();
      const apiRef = { current: null };
      render(
        <ToastProvider
          render={(toasts) => (
            <div data-testid="toasts">
              {toasts.map((t) => (
                <div key={t.id} data-tone={t.tone}>
                  <span>{t.message}</span>
                  {t.action && (
                    <button onClick={t.action.onClick}>{t.action.label}</button>
                  )}
                </div>
              ))}
            </div>
          )}
        >
          <ConfirmProvider>
            <UndoHarness initialList={initialList} saveSpy={saveSpy} apiRef={apiRef} />
          </ConfirmProvider>
        </ToastProvider>
      );
      return { saveSpy, apiRef };
    }

    it("即削除され、toast に Undo ボタンが付く", () => {
      const { saveSpy, apiRef } = renderUndoHarness([
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ]);
      act(() => {
        apiRef.current.removeWithUndo(1, { successMsg: "削除しました" });
      });
      expect(saveSpy).toHaveBeenCalledWith([{ id: 2, name: "b" }]);
      expect(screen.getByText("削除しました")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "元に戻す" })).toBeInTheDocument();
    });

    it("Undo クリックで削除前の record が復元される", () => {
      const { saveSpy, apiRef } = renderUndoHarness([
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ]);
      act(() => {
        apiRef.current.removeWithUndo(1);
      });
      saveSpy.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
      // 復元時は最新 list (= 削除後の list) に対象を append する。
      const restored = saveSpy.mock.calls.at(-1)[0];
      expect(restored).toEqual(
        expect.arrayContaining([
          { id: 2, name: "b" },
          { id: 1, name: "a" },
        ])
      );
      expect(restored).toHaveLength(2);
    });

    it("存在しない id を指定したら何もせず false を返す", () => {
      const { saveSpy, apiRef } = renderUndoHarness([{ id: 1 }]);
      let returned;
      act(() => {
        returned = apiRef.current.removeWithUndo(99);
      });
      expect(returned).toBe(false);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it("Undo 後にもう一度 Undo を押しても二重投入しない", () => {
      const { saveSpy, apiRef } = renderUndoHarness([{ id: 1 }, { id: 2 }]);
      act(() => {
        apiRef.current.removeWithUndo(1);
      });
      const undoBtn = screen.getByRole("button", { name: "元に戻す" });
      fireEvent.click(undoBtn);
      saveSpy.mockClear();
      // wrapped action は consumed フラグで 2 度目以降を握りつぶし、
      // toast 自体も remove されるためそもそもボタンが消えている。
      expect(screen.queryByRole("button", { name: "元に戻す" })).not.toBeInTheDocument();
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
