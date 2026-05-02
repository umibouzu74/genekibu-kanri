/* eslint-disable react-refresh/only-export-components -- 共有定数 (DEFAULT/isEventKindVisible) を同居 */
import { EVENT_KIND, EXAM_META } from "../constants/eventKinds";

// 月次ビュー / イベントカレンダーで共有する「表示種別フィルタ」のチップ。
// 休講は常時表示なのでトグル対象外。
const TOGGLE_DEFS = Object.freeze([
  { key: EVENT_KIND.EXAM, label: "テスト期間", color: EXAM_META.accent },
  { key: EVENT_KIND.SPECIAL, label: "特別イベント", color: "#8a5ec4" },
]);

export const DEFAULT_EVENT_VISIBILITY = Object.freeze({
  [EVENT_KIND.EXAM]: false,
  [EVENT_KIND.SPECIAL]: false,
});

export function isEventKindVisible(visibility, kind) {
  return !!visibility?.[kind];
}

export function EventVisibilityToggles({ visibility, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#666" }}>表示:</span>
      {TOGGLE_DEFS.map((t) => {
        const on = isEventKindVisible(visibility, t.key);
        return (
          <label
            key={t.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              background: on ? "#fff" : "#f5f5f5",
              color: on ? t.color : "#aaa",
              border: `1px solid ${on ? t.color : "#ddd"}`,
              fontWeight: on ? 700 : 400,
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() =>
                onChange((p) => ({ ...(p || {}), [t.key]: !p?.[t.key] }))
              }
              style={{ display: "none" }}
            />
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: t.color,
                opacity: on ? 1 : 0.3,
              }}
            />
            {t.label}
          </label>
        );
      })}
    </div>
  );
}
