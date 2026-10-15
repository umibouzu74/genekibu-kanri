import { colors } from "../styles/tokens";

// ─── メインメニューのカテゴリとボタン ───────────────────────────────
// 中身は constants/mainMenu (visibleMainMenu で見ている人の分に絞ったもの)。
// 押したときの移動は呼び出し側 (App の navigateMenuItem) が項目の kind で
// 振り分ける。
//
// variant:
//   "full"    … メインメニュー画面。カテゴリごとのカードに、名前と 1 行の説明
//   "compact" … ダッシュボードの下。カテゴリごとに 1 行、名前だけのボタン
//
// ダッシュボードの下に置くときは呼び出し側で no-print に包むこと (紙面に
// 載せない。ダッシュボードは PrintButton = window.print で刷る)。

const CATEGORY_TONE = {
  today: "#c0392b",
  reschedule: "#a52a2a",
  calendar: "#2e6a9e",
  staff: "#2a7a4a",
  timetable: "#6a3d8e",
  records: "#555",
};

function toneOf(cat) {
  return CATEGORY_TONE[cat.key] || colors.primary;
}

function FullCategory({ cat, onNavigate }) {
  const tone = toneOf(cat);
  const headingId = `main-menu-cat-${cat.key}`;
  return (
    <section
      aria-labelledby={headingId}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderTop: `4px solid ${tone}`,
        borderRadius: 8,
        padding: "10px 12px 12px",
        minWidth: 0,
      }}
    >
      <h2
        id={headingId}
        style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800, color: tone }}
      >
        <span aria-hidden="true">{cat.icon}</span> {cat.label}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cat.items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item)}
            className="main-menu-item"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              background: colors.surfaceAlt,
              cursor: "pointer",
              color: colors.ink,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1.2, width: 22, flexShrink: 0, textAlign: "center" }}>
              {item.icon}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{item.label}</span>
              {item.desc && (
                <span style={{ display: "block", fontSize: 11, color: colors.inkMuted, marginTop: 2, lineHeight: 1.5 }}>
                  {item.desc}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CompactCategory({ cat, onNavigate }) {
  const tone = toneOf(cat);
  return (
    <div
      role="group"
      aria-label={cat.label}
      style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", padding: "4px 0" }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: tone,
          minWidth: 104,
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true">{cat.icon}</span> {cat.label}
      </span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
        {cat.items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item)}
            title={item.desc}
            className="main-menu-item"
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 14,
              background: colors.surface,
              color: colors.ink,
              padding: "3px 10px",
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * @param {{categories: object[], onNavigate: (item: object) => void,
 *          variant?: "full"|"compact"}} props
 */
export function MainMenuPanel({ categories, onNavigate, variant = "full" }) {
  if (variant === "compact") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {categories.map((cat) => (
          <CompactCategory key={cat.key} cat={cat} onNavigate={onNavigate} />
        ))}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
        gap: 12,
        alignItems: "start",
      }}
    >
      {categories.map((cat) => (
        <FullCategory key={cat.key} cat={cat} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
