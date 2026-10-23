// バイト出勤表の共有設定 (utils/partTimeAttendanceSettings)。
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTENDANCE_SETTINGS,
  MAX_EXCEL_PASSWORD_LENGTH,
  sanitizeAttendanceSettings,
} from "./partTimeAttendanceSettings";

describe("sanitizeAttendanceSettings", () => {
  it("パスワードの文字列を持つ。無い・崩れていれば空 (= 金額入りは書き出せない)", () => {
    expect(sanitizeAttendanceSettings({ excelPassword: "12345" })).toEqual({ excelPassword: "12345" });
    expect(sanitizeAttendanceSettings({})).toEqual(DEFAULT_ATTENDANCE_SETTINGS);
    expect(sanitizeAttendanceSettings(null)).toEqual({ excelPassword: "" });
    expect(sanitizeAttendanceSettings({ excelPassword: 12345 })).toEqual({ excelPassword: "" });
    expect(sanitizeAttendanceSettings({ excelPassword: "x".repeat(MAX_EXCEL_PASSWORD_LENGTH + 1) })).toEqual({
      excelPassword: "",
    });
  });
});
