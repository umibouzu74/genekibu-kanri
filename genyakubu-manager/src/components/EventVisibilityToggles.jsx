/* eslint-disable react-refresh/only-export-components -- 共有定数 (DEFAULT/isEventKindVisible) を同居 */
import {
  EVENT_KIND,
  EXAM_META,
  EXTRA_LESSON_META,
  TAG_META,
} from "../constants/eventKinds";
import { TOGGLE_LABEL_CLASS, VISUALLY_HIDDEN } from "../styles/common";
import { isTypeShownInTeacherMonth } from "../utils/specialEventDisplay";
import { SPECIAL_EVENT_TYPES } from "../constants/specialEvents";

// 月次ビュー / イベントカレンダーで共有する「表示種別フィルタ」のチップ。
// 休講は常時表示なのでトグル対象外。
const TOGGLE_DEFS = Object.freeze([
  { key: EVENT_KIND.EXAM, label: "テスト期間", color: EXAM_META.accent },
  { key: EVENT_KIND.SPECIAL, label: "特別イベント", color: "#8a5ec4" },
]);

// 追加授業トグルはイベントカレンダー専用 (includeExtraLessons で opt-in)。
// MonthView の追加授業は「講師本人の担当コマ」なので通常コマと同様に常時
// 表示され、visibility フィルタの対象にしない (H1b)。
const EXTRA_LESSON_TOGGLE = Object.freeze({
  key: EVENT_KIND.EXTRA_LESSON,
  label: "追加授業",
  color: EXTRA_LESSON_META.accent,
});

export const DEFAULT_EVENT_VISIBILITY = Object.freeze({
  [EVENT_KIND.EXAM]: false,
  [EVENT_KIND.SPECIAL]: false,
  [EVENT_KIND.EXTRA_LESSON]: false,
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

// 講師の月間予定 (講師別の月間・週間 → まとめて印刷・画像) での判定。
// 全員共通の「講師の月間予定に出す種別」(utils/specialEventDisplay) に絞った
// うえで、閲覧者の表示トグル・タグの絞り込みを掛ける。イベントカレンダー・
// ダッシュボードは全種別を出すので isSpecialEventVisible のまま。
// **この判定を各ビューで書き起こさないこと。**
export const isSpecialEventVisibleInTeacherView = (event, visibility, display) =>
  isTypeShownInTeacherMonth(display, event?.eventType) &&
  isSpecialEventVisible(event, visibility);

// イベントカレンダーの「種別」チップ (specialTypeFilters: キー無し = ON /
// false = OFF。タグと同じ形)。講師の月間予定は全員共通の設定で種別を決める
// ので、このチップはイベントカレンダーだけが読む
export const isSpecialEventVisibleInCalendar = (event, visibility) =>
  visibility?.specialTypeFilters?.[event?.eventType] !== false &&
  isSpecialEventVisible(event, visibility);

const ROW = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };

export function EventVisibilityToggles({
  visibility,
  onChange,
  availableTags = [],
  includeExtraLessons = false,
  // イベントカレンダーだけ: 特別イベントの種別チップを出し、種別・タグを
  // それぞれ別の行に分ける (学校名タグと種別を混ぜない)
  includeSpecialTypes = false,
}) {
  const examOn = isEventKindVisible(visibility, EVENT_KIND.EXAM);
  const specialOn = isEventKindVisible(visibility, EVENT_KIND.SPECIAL);
  const tagFilters = getTagFilters(visibility);
  const typeFilters = visibility?.specialTypeFilters || {};
  const toggleDefs = includeExtraLessons
    ? [...TOGGLE_DEFS, EXTRA_LESSON_TOGGLE]
    : TOGGLE_DEFS;

  // 既定で ON 扱いなので、最初のクリックは OFF (false 明示)、再クリックで
  // delete して ON に戻す
  const flipOff = (map, key) => {
    const next = { ...map };
    if (next[key] === false) delete next[key];
    else next[key] = false;
    return next;
  };
  const toggleTag = (tag) => {
    // 書き込みは常に新キー `tagFilters` 側のみ。
    onChange((p) => ({ ...(p || {}), tagFilters: flipOff(getTagFilters(p), tag) }));
  };
  const toggleType = (key) => {
    onChange((p) => ({
      ...(p || {}),
      specialTypeFilters: flipOff(p?.specialTypeFilters || {}, key),
    }));
  };

  const showTags = (examOn || specialOn) && availableTags.length > 0;
  const tagChips = showTags && (
    <>
      {!includeSpecialTypes && <span style={{ fontSize: 11, color: "#aaa" }}>|</span>}
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
  );

  const kindRow = (
    <>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#666" }}>表示:</span>
      {toggleDefs.map((t) => {
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
    </>
  );

  // no-print: 操作チップは紙面に不要 (印刷時のフィルタ状態は月次 popup 側が
  // describeMonthVisibility でテキスト表示し、window.print() 系は表示結果
  // そのものが紙面に出る)
  if (!includeSpecialTypes) {
    return (
      <div className="no-print" style={ROW}>
        {kindRow}
        {tagChips}
      </div>
    );
  }
  return (
    <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={ROW}>{kindRow}</div>
      {specialOn && (
        <div style={ROW} role="group" aria-label="特別イベントの種別">
          <span style={{ fontSize: 11, color: "#888" }}>種別:</span>
          {SPECIAL_EVENT_TYPES.map((t) => {
            const on = typeFilters[t.key] !== false;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleType(t.key)}
                aria-pressed={on}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: on ? t.bg : "#f5f5f5",
                  color: on ? t.fg : "#aaa",
                  border: `1px solid ${on ? t.accent : "#ddd"}`,
                  fontWeight: on ? 700 : 400,
                }}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      )}
      {showTags && <div style={ROW}>{tagChips}</div>}
    </div>
  );
}
