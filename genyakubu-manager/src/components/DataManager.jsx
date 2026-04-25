import { S } from "../styles/common";
import { colors } from "../styles/tokens";
import { exportSlotsCsv, exportSubsCsv } from "../utils/csv";

export function DataManager({
  slots,
  holidays,
  subs,
  onExport,
  onImport,
  onReset,
  importing,
}) {
  const slotMap = {};
  if (subs && slots) {
    for (const s of slots) slotMap[s.id] = s;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          エクスポート（バックアップ）
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          現在のコマ数: {slots.length} ／ 休講日: {holidays.length}
          {subs ? ` ／ 代行: ${subs.length}` : ""}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onExport} style={S.btn(true)}>
            JSONファイルをダウンロード
          </button>
          <button
            onClick={() => exportSlotsCsv(slots)}
            style={{ ...S.btn(false), fontSize: 11 }}
          >
            コマ一覧CSV
          </button>
          {subs && (
            <button
              onClick={() => exportSubsCsv(subs, slotMap)}
              style={{ ...S.btn(false), fontSize: 11 }}
            >
              代行一覧CSV
            </button>
          )}
        </div>
      </div>
      <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          インポート（復元）
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          JSONファイルからデータを読み込みます
        </div>
        <label
          style={{
            ...S.btn(false),
            display: "inline-block",
            cursor: importing ? "wait" : "pointer",
            opacity: importing ? 0.6 : 1,
          }}
        >
          {importing ? "読み込み中…" : "ファイルを選択"}
          <input
            type="file"
            accept=".json"
            onChange={onImport}
            disabled={importing}
            style={{ display: "none" }}
          />
        </label>
      </div>
      <div
        style={{
          background: "#fff5f5",
          borderRadius: 8,
          padding: 14,
          border: "1px solid #fcc",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: colors.danger }}>
          初期化（リセット）
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          すべてのデータを初期状態に戻します
        </div>
        <button
          onClick={onReset}
          style={{
            ...S.btn(false),
            background: colors.dangerSoft,
            color: colors.danger,
            border: `1px solid ${colors.dangerBorder}`,
          }}
        >
          データを初期化
        </button>
      </div>
    </div>
  );
}
