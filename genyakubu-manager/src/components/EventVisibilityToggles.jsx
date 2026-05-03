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

// タグ別フィルタの判定。examTagFilters[tag] === false なら「OFF」、それ以外は ON。
// タグ無しの ExamPeriod は常に表示 (master toggle が ON 前提)。
// 複数タグを持つ ExamPeriod は「いずれかが ON」なら表示。
export function isExamPeriodVisible(period, visibility) {
  if (!isEventKindVisible(visibility, EVENT_KIND.EXAM)) return false;
  const tags = period?.tags || [];
  if (tags.length === 0) return true;
  const filters = visibility?.examTagFilters || {};
  return tags.some((t) => filters[t] !== false);
}

export function EventVisibilityToggles({
  visibility,
  onChange,
  availableExamTags = [],
}) {
  const examOn = isEventKindVisible(visibility, EVENT_KIND.EXAM);
  const tagFilters = visibility?.examTagFilters || {};

  const toggleTag = (tag) => {
    onChange((p) => {
      const cur = p?.examTagFilters || {};
      // 既定で ON 扱いなので、最初のクリックは OFF にする (false 明示)。
      // false → undefined (= ON) に戻す。
      const next = { ...cur };
      if (next[tag] === false) delete next[tag];
      else next[tag] = false;
      return { ...(p || {}), examTagFilters: next };
    });
  };

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
      {examOn && availableExamTags.length > 0 && (
        <>
          <span style={{ fontSize: 11, color: "#aaa" }}>|</span>
          <span style={{ fontSize: 11, color: "#888" }}>テスト期間タグ:</span>
          {availableExamTags.map((tag) => {
            const on = tagFilters[tag] !== false;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={on}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: on ? "#e6eef9" : "#f5f5f5",
                  color: on ? "#234a78" : "#aaa",
                  border: `1px solid ${on ? "#b4cde8" : "#ddd"}`,
                  fontWeight: on ? 700 : 400,
                }}
              >
                {tag}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
