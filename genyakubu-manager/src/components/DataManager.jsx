import { S } from "../styles/common";

export function DataManager({ slots, holidays, onExport, onImport, onReset }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          エクスポート（バックアップ）
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          現在のコマ数: {slots.length} ／ 休講日: {holidays.length}
        </div>
        <button onClick={onExport} style={S.btn(true)}>
          JSONファイルをダウンロード
        </button>
      </div>
      <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          インポート（復元）
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          JSONファイルからデータを読み込みます
        </div>
        <label style={{ ...S.btn(false), display: "inline-block", cursor: "pointer" }}>
          ファイルを選択
          <input
            type="file"
            accept=".json"
            onChange={onImport}
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
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#c44" }}>
          初期化（リセット）
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          すべてのデータを初期状態に戻します
        </div>
        <button
          onClick={onReset}
          style={{
            ...S.btn(false),
            background: "#fee",
            color: "#c44",
            border: "1px solid #fcc",
          }}
        >
          データを初期化
        </button>
      </div>
    </div>
  );
}
