// 有給・半休の画面と入力欄 (LeaveView / LeaveEditor) で共有する見た目。
// コンポーネントのファイルから定数を export すると Fast Refresh が効かなく
// なるので分けてある。

export const LEAVE_SEVERITY_TONE = {
  warn: { fg: "#a02020", bg: "#fdecec", border: "#f0b0b0" },
  info: { fg: "#1f5a8a", bg: "#eef6fc", border: "#b5d3ea" },
};

export const leaveKindChip = (k, extra) => ({
  display: "inline-block",
  padding: "1px 7px",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 800,
  background: k.tone.bg,
  color: k.tone.fg,
  border: `1px solid ${k.tone.border}`,
  whiteSpace: "nowrap",
  ...extra,
});
