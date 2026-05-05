/* eslint-disable react-refresh/only-export-components -- 共有定数 (DEFAULT/isEventKindVisible) を同居 */
import { EVENT_KIND, EXAM_META, TAG_META } from "../constants/eventKinds";
import { TOGGLE_LABEL_CLASS, VISUALLY_HIDDEN } from "../styles/common";

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

// タグ別フィルタの内部表現を取得。新キー `tagFilters` を優先しつつ、旧キー
// `examTagFilters` (テスト期間専用時代の名残) も読み出してフォールバックする。
function getTagFilters(visibility) {
  return visibility?.tagFilters || visibility?.examTagFilters || {};
}

// テスト期間 / 特別イベント の master toggle + タグフィルタを統合した判定。
// 複数タグを持つエントリは「いずれかが ON」なら表示。タグ無しは master 通過時に常に表示。
export function isTaggedEventVisible(entry, kind, visibility) {
  if (!isEventKindVisible(visibility, kind)) return false;
  const tags = entry?.tags;
  if (!tags || tags.length === 0) return true;
  const filters = getTagFilters(visibility);
  return tags.some((t) => filters[t] !== false);
}

// 呼び出し側可読性のための薄ラッパ。
export const isExamPeriodVisible = (period, visibility) =>
  isTaggedEventVisible(period, EVENT_KIND.EXAM, visibility);
export const isSpecialEventVisible = (event, visibility) =>
  isTaggedEventVisible(event, EVENT_KIND.SPECIAL, visibility);

export function EventVisibilityToggles({
  visibility,
  onChange,
  availableTags = [],
}) {
  const examOn = isEventKindVisible(visibility, EVENT_KIND.EXAM);
  const specialOn = isEventKindVisible(visibility, EVENT_KIND.SPECIAL);
  const tagFilters = getTagFilters(visibility);

  const toggleTag = (tag) => {
    onChange((p) => {
      const cur = getTagFilters(p);
      // 既定で ON 扱いなので、最初のクリックは OFF (false 明示)、再クリックで
      // delete して ON に戻す。書き込みは常に新キー `tagFilters` 側のみ。
      const next = { ...cur };
      if (next[tag] === false) delete next[tag];
      else next[tag] = false;
      return { ...(p || {}), tagFilters: next };
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
            className={TOGGLE_LABEL_CLASS}
            style={{
              position: "relative",
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
              style={VISUALLY_HIDDEN}
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
      {(examOn || specialOn) && availableTags.length > 0 && (
        <>
          <span style={{ fontSize: 11, color: "#aaa" }}>|</span>
          <span style={{ fontSize: 11, color: "#888" }}>タグ:</span>
          {availableTags.map((tag) => {
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
                  background: on ? TAG_META.bg : "#f5f5f5",
                  color: on ? TAG_META.fg : "#aaa",
                  border: `1px solid ${on ? TAG_META.accent : "#ddd"}`,
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
