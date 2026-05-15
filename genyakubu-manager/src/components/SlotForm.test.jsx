// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SlotForm } from "./SlotForm";

afterEach(cleanup);

describe("SlotForm", () => {
  const noop = () => {};

  it("renders all fields", () => {
    render(<SlotForm slot={null} onSave={noop} onCancel={noop} />);
    expect(screen.getByLabelText(/曜日/)).toBeDefined();
    expect(screen.getByLabelText(/時間帯/)).toBeDefined();
    expect(screen.getByLabelText(/学年/)).toBeDefined();
    expect(screen.getByLabelText(/科目/)).toBeDefined();
    expect(screen.getByLabelText(/担当講師/)).toBeDefined();
  });

  it("shows validation errors for empty required fields", () => {
    render(
      <SlotForm
        slot={{ day: "月", time: "", grade: "", cls: "", room: "", subj: "", teacher: "", note: "" }}
        onSave={noop}
        onCancel={noop}
      />
    );
    const saveBtn = screen.getAllByText("保存")[0];
    fireEvent.click(saveBtn);
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });

  it("calls onSave with form data when valid", () => {
    const onSave = vi.fn();
    render(
      <SlotForm
        slot={{
          day: "月",
          time: "19:00-20:20",
          grade: "高1",
          cls: "S",
          room: "601",
          subj: "数学",
          teacher: "山田",
          note: "",
        }}
        onSave={onSave}
        onCancel={noop}
      />
    );
    const saveBtn = screen.getAllByText("保存")[0];
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        day: "月",
        teacher: "山田",
        subj: "数学",
      })
    );
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<SlotForm slot={null} onSave={noop} onCancel={onCancel} />);
    const cancelBtn = screen.getAllByText("キャンセル")[0];
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders datalist suggestions when provided", () => {
    const suggestions = {
      times: ["19:00-20:20", "20:30-21:50"],
      grades: ["中1", "高1"],
      rooms: ["601"],
      subjs: ["数学", "英語"],
      teachers: ["山田", "鈴木"],
    };
    const { container } = render(
      <SlotForm slot={null} onSave={noop} onCancel={noop} suggestions={suggestions} />
    );
    const datalists = container.querySelectorAll("datalist");
    expect(datalists.length).toBe(5);
  });

  describe("biweeklyAnchors", () => {
    const baseSlot = {
      day: "金",
      time: "18:55-19:40",
      grade: "中3",
      cls: "S",
      room: "501",
      subj: "英/数",
      teacher: "堀上",
      note: "隔週(川井)",
    };

    it("既存の個別 anchor の ✕ を押して保存すると undefined になる", () => {
      const slot = {
        ...baseSlot,
        biweeklyAnchors: [{ date: "2026-04-24", weekType: "A" }],
      };
      const onSave = vi.fn();
      render(<SlotForm slot={slot} onSave={onSave} onCancel={noop} />);
      // 個別 anchor の ✕ ボタンを押す
      const removeBtn = screen.getByText("✕");
      fireEvent.click(removeBtn);
      // 保存
      const saveBtn = screen.getAllByText("保存")[0];
      fireEvent.click(saveBtn);
      expect(onSave).toHaveBeenCalledTimes(1);
      const arg = onSave.mock.calls[0][0];
      expect(arg.biweeklyAnchors).toBeUndefined();
    });

    it("チェックボックスを外して保存すると undefined になる", () => {
      const slot = {
        ...baseSlot,
        biweeklyAnchors: [{ date: "2026-04-24", weekType: "A" }],
      };
      const onSave = vi.fn();
      render(<SlotForm slot={slot} onSave={onSave} onCancel={noop} />);
      // 「このコマ専用の基準日を設定する」のチェックを外す
      const checkbox = screen.getByLabelText("このコマ専用の基準日を設定する");
      fireEvent.click(checkbox);
      // 保存
      const saveBtn = screen.getAllByText("保存")[0];
      fireEvent.click(saveBtn);
      expect(onSave).toHaveBeenCalledTimes(1);
      const arg = onSave.mock.calls[0][0];
      expect(arg.biweeklyAnchors).toBeUndefined();
    });
  });
});
