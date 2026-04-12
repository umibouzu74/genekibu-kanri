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
});
