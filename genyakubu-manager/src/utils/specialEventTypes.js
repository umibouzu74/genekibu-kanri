// ─── 特別イベントの種別の移行 (schema v24) ─────────────────────────
// v23 までの種別 (trip / ceremony / festival / announcement) と、種別が
// 足りなかった間にタグで仮置きした種別 (「公立中」「塾テスト」…) を v24 の
// 種別へ寄せる純関数。読み込み (migrate.migrateSpecialEvents) とバックアップの
// 移行 (schema.migrateExportBundle) の両方がこれを通す。
//
// 規則:
//   - 種別を読み替えるのは「旧種別」か「その他 (other)」のときだけ。新しい
//     種別 (school など) が付いているものは人が選んだ種別なので触らない
//   - 仮置きのタグがあればタグを優先する (旧種別は種別が足りなかったときの
//     間に合わせなので、タグの方が正しい)。無ければ旧種別の行き先
//     (LEGACY_SPECIAL_EVENT_TYPES)。announcement は「入試」タグ付きなら
//     entrance (= タグの規則)、それ以外は other
//   - 移したタグは消す。学校名・部のタグ (「中学」「高松」) は残す
//     (utils/teacherTags の講師ごとの導出に使われている)
//   - 何も変わらないときは同じオブジェクトを返す (何度通しても同じ = 冪等)

import {
  LEGACY_SPECIAL_EVENT_TYPES,
  SPECIAL_EVENT_TYPE_BY_KEY,
  SPECIAL_EVENT_TYPE_TAGS,
} from "../constants/specialEvents";

const isTypeTag = (t) => Object.prototype.hasOwnProperty.call(SPECIAL_EVENT_TYPE_TAGS, t);

export function upgradeSpecialEventType(ev) {
  if (!ev || typeof ev !== "object") return ev;
  const cur = ev.eventType;
  const legacy = Object.prototype.hasOwnProperty.call(LEGACY_SPECIAL_EVENT_TYPES, cur);
  const known = SPECIAL_EVENT_TYPE_BY_KEY.has(cur);
  // 新しい種別 (other 以外) は人が選んだもの
  if (known && cur !== "other") return ev;

  const tags = Array.isArray(ev.tags) ? ev.tags : [];
  const typeTag = tags.find(isTypeTag);
  const nextType = typeTag
    ? SPECIAL_EVENT_TYPE_TAGS[typeTag]
    : legacy
      ? LEGACY_SPECIAL_EVENT_TYPES[cur]
      : "other";
  const nextTags = typeTag ? tags.filter((t) => !isTypeTag(t)) : tags;

  if (nextType === cur && nextTags === tags) return ev;
  const next = { ...ev, eventType: nextType };
  if (Array.isArray(ev.tags)) next.tags = nextTags;
  return next;
}

export function upgradeSpecialEventTypes(list) {
  return Array.isArray(list) ? list.map(upgradeSpecialEventType) : list;
}
