import { Modal } from "./Modal";

// キーボードショートカット ヘルプオーバーレイ
// `?` キーで開き、Modal 共通の focus trap / Esc / フォーカス復帰を利用する。

const SHORTCUTS = [
  {
    section: "全般",
    items: [
      { keys: ["Ctrl", "K"], alt: ["⌘", "K"], label: "コマンドパレット" },
      { keys: ["?"], label: "このヘルプを表示" },
      { keys: ["Esc"], label: "モーダル / ヘルプを閉じる" },
    ],
  },
  {
    section: "ビュー移動 (g から開始)",
    note: "g を押した直後にもう 1 キー",
    items: [
      { keys: ["g", "d"], label: "ダッシュボード" },
      { keys: ["g", "a"], label: "欠勤組み換え" },
      { keys: ["g", "s"], label: "授業管理" },
      { keys: ["g", "c"], label: "代行確定一覧" },
      { keys: ["g", "t"], label: "時間割管理" },
      { keys: ["g", "h"], label: "休講日・テスト期間" },
      { keys: ["g", "m"], label: "コースマスター管理" },
      { keys: ["g", "v"], label: "バイト管理" },
    ],
  },
  {
    section: "コマンドパレット内",
    items: [
      { keys: ["↑"], label: "前の候補に移動" },
      { keys: ["↓"], label: "次の候補に移動" },
      { keys: ["Enter"], label: "選択" },
    ],
  },
  {
    section: "検索入力",
    items: [
      { keys: ["Esc"], label: "検索をクリア (サイドバー)" },
    ],
  },
  {
    section: "マウス操作",
    items: [
      { gesture: "ドラッグ", label: "欠勤組み換え: コマを他講師に移動／合同設定" },
      { gesture: "右クリック", label: "欠勤組み換え: コマに対するコンテキストメニュー" },
      { gesture: "クリック", label: "時間割セル: 代行先を選ぶポップオーバーを開く" },
    ],
  },
  {
    section: "ブラウザ",
    note: "アプリ固有ではなくブラウザ標準",
    items: [
      { keys: ["Ctrl", "P"], alt: ["⌘", "P"], label: "現在のビューを印刷" },
    ],
  },
];

function Key({ children }) {
  return (
    <kbd
      style={{
        display: "inline-block",
        background: "#f3f4f8",
        border: "1px solid #d6d8e0",
        borderBottomWidth: 2,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#333",
        minWidth: 20,
        textAlign: "center",
      }}
    >
      {children}
    </kbd>
  );
}

function Gesture({ children }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: "#eef2ff",
        border: "1px solid #ccd6f5",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        color: "#3a3a6e",
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function ItemRow({ item }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 0",
        fontSize: 13,
        color: "#333",
        borderBottom: "1px dashed #eee",
        gap: 12,
      }}
    >
      <span>{item.label}</span>
      <span
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {item.gesture ? (
          <Gesture>{item.gesture}</Gesture>
        ) : (
          <>
            {item.keys.map((k, i) => (
              <Key key={`${item.label}-${i}`}>{k}</Key>
            ))}
            {item.alt && (
              <>
                <span style={{ fontSize: 10, color: "#aaa", margin: "0 4px" }}>/</span>
                {item.alt.map((k, i) => (
                  <Key key={`${item.label}-alt-${i}`}>{k}</Key>
                ))}
              </>
            )}
          </>
        )}
      </span>
    </div>
  );
}

export function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <Modal title="キーボードショートカット" onClose={onClose} width={520}>
      {SHORTCUTS.map((sec) => (
        <div key={sec.section} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#888",
              letterSpacing: 1,
              margin: "8px 0 6px",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <span>{sec.section}</span>
            {sec.note && (
              <span style={{ fontSize: 10, fontWeight: 400, color: "#aaa", letterSpacing: 0 }}>
                {sec.note}
              </span>
            )}
          </div>
          {sec.items.map((it) => (
            <ItemRow key={it.label} item={it} />
          ))}
        </div>
      ))}
    </Modal>
  );
}
