// ─── CSV export utilities ──────────────────────────────────────────

function escapeCsv(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }
  // BOM for Excel compatibility
  return "\uFEFF" + lines.join("\n");
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// コマ一覧 CSV
export function exportSlotsCsv(slots) {
  const headers = ["ID", "曜日", "時間帯", "学年", "クラス", "教室", "科目", "担当講師", "備考"];
  const rows = slots.map((s) => [
    s.id,
    s.day,
    s.time,
    s.grade,
    s.cls || "",
    s.room || "",
    s.subj,
    s.teacher,
    s.note || "",
  ]);
  downloadCsv(toCsv(headers, rows), "slots.csv");
}

// 代行一覧 CSV
export function exportSubsCsv(subs, slotMap) {
  const headers = [
    "ID", "日付", "コマID", "曜日", "時間帯", "学年", "科目",
    "元講師", "代行者", "ステータス", "メモ",
  ];
  const rows = subs.map((s) => {
    const slot = slotMap?.[s.slotId];
    return [
      s.id,
      s.date,
      s.slotId,
      slot?.day || "",
      slot?.time || "",
      slot?.grade || "",
      slot?.subj || "",
      s.originalTeacher || "",
      s.substitute || "",
      s.status || "",
      s.memo || "",
    ];
  });
  downloadCsv(toCsv(headers, rows), "substitutions.csv");
}
