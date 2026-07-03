// @vitest-environment jsdom
// 追加授業管理: 複数日の一括登録 / 編集 / Undo 付き削除の骨格を固定する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExtraLessonManager } from "./ExtraLessonManager";
import { ToastProvider } from "../hooks/useToasts";
import { ConfirmProvider } from "../hooks/useConfirm";

afterEach(cleanup);

const LESSON = {
  id: 1,
  date: "2026-07-25",
  time: "18:30-20:00",
  grade: "中3",
  cls: "",
  room: "亀73",
  subj: "プレップ個別指導",
  teacher: "香川·福江",
  label: "夏期講習",
  note: "",
};

function renderManager({ extraLessons = [LESSON], isAdmin = true } = {}) {
  const onSave = vi.fn();
  render(
    <ToastProvider
      render={(toasts) => (
        <div data-testid="toasts">
          {toasts.map((t) => (
            <div key={t.id}>
              {t.message}
              {t.action && (
                <button onClick={t.action.onClick}>{t.action.label}</button>
              )}
            </div>
          ))}
        </div>
      )}
    >
      <ConfirmProvider>
        <ExtraLessonManager
          extraLessons={extraLessons}
          onSave={onSave}
          isAdmin={isAdmin}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onSave };
}

const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("ExtraLessonManager", () => {
  it("登録済みの追加授業を一覧表示する", () => {
    renderManager();
    expect(screen.getByText("2026-07-25 (土)")).toBeInTheDocument();
    expect(screen.getByText(/プレップ個別指導/)).toBeInTheDocument();
    // 一覧行のバッジ (種別ラベル入り)。フォームのプリセットボタンとは別。
    expect(screen.getByText("追 夏期講習")).toBeInTheDocument();
  });

  it("複数日を追加して一括登録できる (id は連番)", () => {
    const { onSave } = renderManager({ extraLessons: [] });
    // 実施日を 2 日追加
    fill("実施日を選択", "2026-07-28");
    fireEvent.click(screen.getByText("＋ 日付を追加"));
    fill("実施日を選択", "2026-07-30");
    fireEvent.click(screen.getByText("＋ 日付を追加"));
    fill("時間", "18:30-20:00");
    fill("対象学年", "中1-3");
    fill("科目・講座名", "プレップ個別指導");
    fill("担当講師", "香川");
    fireEvent.click(screen.getByText("登録"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved.map((l) => l.date)).toEqual(["2026-07-28", "2026-07-30"]);
    expect(saved.map((l) => l.id)).toEqual([1, 2]);
    expect(saved[0]).toMatchObject({
      time: "18:30-20:00",
      grade: "中1-3",
      subj: "プレップ個別指導",
      teacher: "香川",
    });
  });

  it("必須項目が欠けていると登録できずエラーを表示する", () => {
    const { onSave } = renderManager({ extraLessons: [] });
    fireEvent.click(screen.getByText("登録"));
    expect(screen.getByRole("alert")).toHaveTextContent("実施日");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("編集は単一レコードを更新する", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByLabelText(/を編集$/));
    fill("時間", "19:00-20:30");
    fireEvent.click(screen.getByText("更新"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 1, time: "19:00-20:30", date: "2026-07-25" });
  });

  it("削除は即時 + Undo トースト (removeWithUndo)", () => {
    const { onSave } = renderManager();
    fireEvent.click(screen.getByLabelText(/を削除$/));
    expect(onSave).toHaveBeenCalledWith([]);
    // Undo トーストが出る
    expect(screen.getByText("元に戻す")).toBeInTheDocument();
  });

  it("isAdmin=false ではフォームと編集/削除ボタンを出さない", () => {
    renderManager({ isAdmin: false });
    expect(screen.queryByText("登録")).toBeNull();
    expect(screen.queryByLabelText(/を削除$/)).toBeNull();
    // 一覧は見える
    expect(screen.getByText(/プレップ個別指導/)).toBeInTheDocument();
  });
});
