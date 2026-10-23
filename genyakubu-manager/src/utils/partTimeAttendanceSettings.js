// ─── バイト出勤表の共有設定 (全端末共通) ─────────────────────────────
// 金額入りの Excel のパスワードを管理者が決めて固定する (LS.partTimeAttendanceSettings、
// appData)。強さは問わない (日数と単価が分かれば計算できる金額を、生々しいので
// 隠しておく程度の目的)。閲覧用の端末 (経理) も書き出せるよう、閲覧者も読める
// appData に置く。hooks/useAppData が読むので、このファイルは何も import しない
// (集計の処理を最初に読むバンドルへ引き込まない)。

export const MAX_EXCEL_PASSWORD_LENGTH = 255; // Excel のパスワードの上限
export const DEFAULT_ATTENDANCE_SETTINGS = Object.freeze({ excelPassword: "" });

/** 共有設定。形が崩れていれば既定値 (パスワードなし = 金額入りは書き出せない) */
export function sanitizeAttendanceSettings(v) {
  const pw = v && typeof v === "object" ? v.excelPassword : null;
  return {
    excelPassword: typeof pw === "string" && pw.length <= MAX_EXCEL_PASSWORD_LENGTH ? pw : "",
  };
}
