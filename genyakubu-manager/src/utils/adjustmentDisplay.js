// 調整 (合同/移動/振替) の表示用インデックスを日付ごとに構築するヘルパ。
// ビュー側で同じロジックを繰り返さないために集約。

import { activeTeachersOnDate } from "./absenceHelpers";
import { biweeklyDisplaySubject, splitTeacherField } from "./biweekly";
import { resolveSlotDaySchedule } from "./daySchedules";
import { dateToDay, fmtDateWeekday, timeStartToMin } from "./dateHelpers";

/**
 * 指定日の adjustments から、slot id ベースの表示用情報を構築する。
 * 振替 (reschedule) は、date が源泉日と一致するコマを
 * rescheduleOutBySlot に、targetDate が一致する (他日からこの日へ入る)
 * 振替を rescheduleIn (配列) に集める。入ってくる側はコマ id で引かない
 * こと — 同じコマの 9/7 と 9/14 を同じ 9/19 へ振り替えると 2 件になる
 * (Map にすると後の 1 件で上書きされ、1 コマ消えていた。2026-10-03)。
 *
 * opts.slots + opts.daySchedules を渡すと、特別時程 (日単位の時刻読み替え)
 * を moveBySlot に合流させる — 既存のコマ移動表示 (実効時間グループ化・
 * 移 バッジ) がそのまま特別時程にも効く。個別の move 調整が同じコマに
 * ある場合はそちらが優先。特別時程由来の読み替えは dayScheduleMoveBySlot
 * にも載る (バッジのツールチップ出し分け用)。cancelTimes による部分休講は
 * ここでは扱わない (休講系の表示・フィルタはビュー側の既存経路で行う)。
 *
 * @param {Array} adjustments  全 adjustments 配列
 * @param {string} date        "YYYY-MM-DD"
 * @param {{slots?: Array, daySchedules?: Array}} [opts]
 * @returns {{
 *   combineAbsorbedBySlot: Map<number, number>,
 *   combineHostBySlot: Map<number, number[]>,
 *   moveBySlot: Map<number, string>,
 *   rescheduleOutBySlot: Map<number, object>,  // slotId -> adjustment (他日へ出ていく)
 *   rescheduleIn: object[],                     // 他日からこの日へ来る振替 (同じコマが複数あり得る)
 *   dayScheduleMoveBySlot: Map<number, object>, // slotId -> DaySchedule (特別時程由来)
 * }}
 */
export function buildAdjustmentIndex(adjustments, date, opts = {}) {
  const combineAbsorbedBySlot = new Map();
  const combineHostBySlot = new Map();
  const moveBySlot = new Map();
  const rescheduleOutBySlot = new Map();
  const rescheduleIn = [];
  const dayScheduleMoveBySlot = new Map();
  const index = {
    combineAbsorbedBySlot,
    combineHostBySlot,
    moveBySlot,
    rescheduleOutBySlot,
    rescheduleIn,
    dayScheduleMoveBySlot,
  };
  if (!date) return index;
  for (const adj of adjustments || []) {
    if (adj.type === "reschedule") {
      if (adj.date === date) rescheduleOutBySlot.set(adj.slotId, adj);
      if (adj.targetDate === date) rescheduleIn.push(adj);
      continue;
    }
    if (adj.date !== date) continue;
    if (adj.type === "combine") {
      const ids = adj.combineSlotIds || [];
      if (ids.length > 0) combineHostBySlot.set(adj.slotId, [...ids]);
      for (const id of ids) combineAbsorbedBySlot.set(id, adj.slotId);
    } else if (adj.type === "move" && adj.targetTime) {
      moveBySlot.set(adj.slotId, adj.targetTime);
    }
  }

  // 特別時程の時刻読み替えを合流 (個別 move 優先)。休講扱い
  // (resolve が cancelled を返すコマ) には読み替えを作らない。
  // opts.slots は曜日フィルタ前の一覧でも良いよう、date の曜日と
  // slot.day が一致するコマだけを対象にする。
  if (Array.isArray(opts.daySchedules) && Array.isArray(opts.slots)) {
    const dow = dateToDay(date);
    for (const s of opts.slots) {
      if (dow && s.day !== dow) continue;
      if (moveBySlot.has(s.id)) continue;
      const r = resolveSlotDaySchedule(s, date, opts.daySchedules);
      if (r && !r.cancelled && r.time) {
        moveBySlot.set(s.id, r.time);
        dayScheduleMoveBySlot.set(s.id, r.schedule);
      }
    }
  }
  return index;
}

// ─── 振替先での合同 (2026-10-10) ─────────────────────────────
// 「10/16 の高1 文系数学と理系数学を 10/9 へ振り替え、10/9 では合同にする」
// のように、**振替で入ってきたコマ同士を振替先の日で合同にする**。
// 振替はコマごとに登録したまま (振替元の表示・第N回は何も変わらない)、
// 吸収される側の振替に `combineWith` = 受け入れる側の振替の
// **振替元の日とコマ `{date, slotId}`** を持たせる。
//
// - 日付 × コマの combine を振替先の日付で作らないのは、振替元と振替先が
//   同じ曜日 (10/16 金 → 10/9 金) だと同じコマ id が振替先の日の通常の
//   コマとしても居て、どちらを合同にしたのか区別できないため
// - 相手を adjustment の id で指さないのは、id が再利用されるため
//   (`nextNumericId` は最大 + 1。いちばん新しい振替を消した後に作った
//   別のコマの振替が同じ id になり、黙ってそちらへ合同されてしまう)。
//   振替元の日とコマなら、受け入れる側の振替を登録し直しても合同が残る
//
// 受け入れる側は「同じ日へ入ってくる振替で、自分は合同されていないもの」。
// 相手の振替が無い・別の日へ変わった・連鎖している合同は無かったことにして、
// 吸収される側も 1 コマの振替として出す (黙って消さない)。

/** 受け入れる側の振替 (reschedule) から combineWith の値を作る。 */
export function incomingCombineKey(hostAdj) {
  return { date: hostAdj.date, slotId: hostAdj.slotId };
}

/**
 * その日へ入ってくる振替の合同の対応を解く。
 * @param {object[]} incomingAdjs targetDate が同じ日の reschedule
 * @returns {{hostOf: Map<number, object>, partnersOf: Map<number, object[]>}}
 *   hostOf: 吸収される振替の id → 受け入れる振替 / partnersOf: 受け入れる振替の id → 吸収される振替
 */
export function resolveIncomingCombines(incomingAdjs) {
  const hostOf = new Map();
  const partnersOf = new Map();
  const list = (incomingAdjs || []).filter((a) => a?.type === "reschedule");
  const findHost = (adj) => {
    const key = adj.combineWith;
    if (!key || typeof key !== "object") return null;
    return (
      list.find(
        (a) =>
          a !== adj &&
          a.date === key.date &&
          a.slotId === key.slotId &&
          a.targetDate === adj.targetDate
      ) || null
    );
  };
  for (const adj of list) {
    const host = findHost(adj);
    if (!host) continue;
    if (findHost(host)) continue; // 連鎖は無効
    hostOf.set(adj.id, host);
    if (!partnersOf.has(host.id)) partnersOf.set(host.id, []);
    partnersOf.get(host.id).push(adj);
  }
  return { hostOf, partnersOf };
}

/**
 * 他日から「その日へ」振り替えられてくるコマを集める (時刻順)。
 * 元コマは別の曜日に属するので、日付で絞ったコマ一覧には出てこない。
 * ダッシュボード日別・タイムテーブルのバナーで共有する。
 *
 * **休講・全日休講で除外しないこと。** 「その日にやる」と明示登録された
 * コマなので、休みの日へ寄せる日まるごと振替の受け先で消えてしまう。
 *
 * 振替先で合同にしたもの (`resolveIncomingCombines`) は、受け入れる側の
 * 項目に `combined: [{adj, slot}]` を付け、**吸収された側は既定で外す**
 * (授業は 1 コマ・担当も受け入れる側の講師だけ)。授業が行われたかを見る
 * 用途 (予定表チェック・イベントカレンダーの件数) は `includeAbsorbed: true`
 * で吸収された側も受け取る (`combinedInto: {adj, slot}` 付き)。
 *
 * @param {Array} adjustments
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {Array} slots 元コマを引くための一覧 (全コマ)
 * @param {{includeAbsorbed?: boolean}} [opts]
 * @returns {{adj: object, slot: object, combined?: object[], combinedInto?: object}[]}
 */
export function collectIncomingReschedules(adjustments, dateStr, slots, opts = {}) {
  if (!dateStr || !adjustments?.length) return [];
  const incoming = adjustments.filter(
    (adj) => adj?.type === "reschedule" && adj.targetDate === dateStr
  );
  return buildIncomingItems(incoming, slots, opts);
}

/**
 * その日へ入ってくる振替 (reschedule の配列) を、表示用の項目にする。
 * buildAdjustmentIndex の `rescheduleIn` をそのまま渡せる。slots は配列か
 * id → コマの Map。並び・合同の扱いは collectIncomingReschedules と同じ。
 */
export function buildIncomingItems(incomingAdjs, slots, { includeAbsorbed = false } = {}) {
  if (!incomingAdjs?.length) return [];
  const byId =
    slots instanceof Map ? slots : new Map((slots || []).map((s) => [s.id, s]));
  const { hostOf, partnersOf } = resolveIncomingCombines(incomingAdjs);
  const out = [];
  for (const adj of incomingAdjs) {
    const slot = byId.get(adj.slotId);
    if (!slot) continue;
    const host = hostOf.get(adj.id);
    if (host && byId.has(host.slotId)) {
      if (!includeAbsorbed) continue;
      out.push({ adj, slot, combinedInto: { adj: host, slot: byId.get(host.slotId) } });
      continue;
    }
    const partners = (partnersOf.get(adj.id) || [])
      .map((p) => ({ adj: p, slot: byId.get(p.slotId) }))
      .filter((p) => p.slot);
    out.push(partners.length > 0 ? { adj, slot, combined: partners } : { adj, slot });
  }
  return out.sort(
    (a, b) =>
      timeStartToMin(a.adj.targetTime || a.slot.time) -
      timeStartToMin(b.adj.targetTime || b.slot.time)
  );
}

/**
 * 振替 1 件について、振替先での合同の注記を返す (一覧・週間の行用)。
 * 吸収された側は "→ 高1A 数学 に合同"、受け入れる側は "+ 高1B 数学 合同"、
 * どちらでもなければ ""。
 * @param {object} adj reschedule
 * @param {Array} adjustments 全 adjustments
 * @param {(id: number) => object|undefined} slotOf コマを引く関数
 */
export function incomingCombineNote(adj, adjustments, slotOf) {
  if (adj?.type !== "reschedule" || !adj.targetDate) return "";
  const sameDay = (adjustments || []).filter(
    (a) => a?.type === "reschedule" && a.targetDate === adj.targetDate
  );
  const { hostOf, partnersOf } = resolveIncomingCombines(sameDay);
  const host = hostOf.get(adj.id);
  if (host) return `→ ${describeSlot(slotOf(host.slotId))} に合同`;
  const partners = partnersOf.get(adj.id) || [];
  if (partners.length === 0) return "";
  return `${partners.map((p) => `+ ${describeSlot(slotOf(p.slotId))}`).join(" ")} 合同`;
}

/** 振替で入るコマのカードの id ("rs:<振替の id>")。本物のコマ id とは混ざらない。 */
export function incomingCardId(adj) {
  return `rs:${adj.id}`;
}

/**
 * その日へ振替で入ってくるコマを、**コマの形をした項目**にする (欠勤組み換えの
 * グリッドに通常のコマと同じカードで並べるため。2026-10-10)。
 *
 * - `id` は `incomingCardId` ("rs:<振替の id>")。本物のコマ id にしないのは、
 *   振替元と振替先が同じ曜日 (10/16 金 → 10/9 金) だと同じコマが振替先の日の
 *   通常のコマとしても並び、下書き・代行・合同の索引が混ざるため
 * - `day` はその日の曜日、`time` は振替先の時刻 (`targetTime` が無ければ元の時刻)
 * - `teacher` は振替先の担当 (`rescheduleTargetTeachers` = 振替元の日の A/B で
 *   解決済み)、`note` は空 (振替先の日で隔週を解き直さないように)、`subj` は
 *   振替元の日の科目 (複合教科の隔週)
 * - 振替先で合同にした吸収された側は含めない。受け入れる側の
 *   `_incoming.combined` に入る
 *
 * @param {Array} adjustments 時間割調整 (解除予定のものは呼び出し側で除く)
 * @param {string} dateStr 振替先の日 "YYYY-MM-DD"
 * @param {Array|Map} slots 元のコマを引くための全コマ
 * @param {{biweeklyAnchors?: Array, holidays?: Array, examPeriods?: Array}} [ctx]
 * @returns {Array<object>} コマの形 + `_incoming: {adj, slot, combined}`
 */
export function buildIncomingCards(adjustments, dateStr, slots, ctx = {}) {
  if (!dateStr || !adjustments?.length) return [];
  const incoming = adjustments.filter(
    (a) => a?.type === "reschedule" && a.targetDate === dateStr
  );
  const day = dateToDay(dateStr);
  const anchors = ctx.biweeklyAnchors || [];
  return buildIncomingItems(incoming, slots).map(({ adj, slot, combined }) => ({
    ...slot,
    id: incomingCardId(adj),
    day,
    time: adj.targetTime || slot.time,
    teacher: rescheduleTargetTeachers(adj, slot, ctx).join("·"),
    note: "",
    subj: biweeklyDisplaySubject(slot, adj.date, anchors, ctx.holidays, ctx.examPeriods),
    _incoming: { adj, slot, combined: combined || [] },
  }));
}

/** 振替先での合同の相手を "+ 高1B 数学" のように並べる (無ければ "")。 */
export function incomingCombinedLabel(item) {
  if (!item?.combined?.length) return "";
  return item.combined.map(({ slot }) => `+ ${describeSlot(slot)}`).join(" ");
}

/**
 * 振替で他日から入ってくるコマを、振替先の日に担当する講師 (名前の配列)。
 *
 * - `targetTeacher` があればその人 (複数担当は区切りで分ける)
 * - 無ければ**振替元の日**の担当。隔週コマは振替元の日の A/B で解決する
 *   (B 週の 12/7 を 12/4 へ移したなら、12/4 に来るのはパートナー)
 *
 * **`adj.targetTeacher || slot.teacher` を名前と完全一致で比べないこと。**
 * 講師欄は「香川·福江」のような複数担当や隔週のパートナーを持つので、
 * 文字列のままだと講師別の月間で振替のカードが丸ごと消えていた
 * (2026-10-03)。ctx が無ければ隔週は主担当のまま (従来の表示と同じ)。
 *
 * @param {object} adj reschedule の adjustment
 * @param {object} slot 振替元のコマ
 * @param {{biweeklyAnchors?: Array, holidays?: Array, examPeriods?: Array}} [ctx]
 * @returns {string[]}
 */
export function rescheduleTargetTeachers(adj, slot, ctx = {}) {
  if (!adj || !slot) return [];
  const named = splitTeacherField(adj.targetTeacher);
  if (named.length > 0) return named;
  return activeTeachersOnDate(slot, adj.date, ctx);
}

/** rescheduleTargetTeachers の表示用 ("香川·福江")。 */
export function rescheduleTeacherLabel(adj, slot, ctx = {}) {
  return rescheduleTargetTeachers(adj, slot, ctx).join("·");
}

// スロットの短い表示ラベル "grade(cls) subj" を返す。slot が null の場合は fallback。
export function describeSlot(slot, fallback = "(不明コマ)") {
  if (!slot) return fallback;
  const cls = slot.cls && slot.cls !== "-" ? slot.cls : "";
  return `${slot.grade}${cls} ${slot.subj}`;
}

/**
 * 「この日から他日へ出ていく」振替を、渡したコマの範囲で集める (時刻順)。
 * rescheduleOutBySlot は buildAdjustmentIndex の戻り値のものをそのまま渡す。
 *
 * @param {Array} slots その日に表示しているコマ (ビューごとに絞り込み済み)
 * @param {Map<number, object>} rescheduleOutBySlot
 * @returns {{slot: object, adj: object}[]}
 */
export function collectOutgoingReschedules(slots, rescheduleOutBySlot) {
  if (!slots?.length || !rescheduleOutBySlot?.size) return [];
  const out = [];
  for (const slot of slots) {
    const adj = rescheduleOutBySlot.get(slot.id);
    if (adj) out.push({ slot, adj });
  }
  return out.sort(
    (a, b) => timeStartToMin(a.slot.time) - timeStartToMin(b.slot.time)
  );
}

/**
 * その日が「振替で授業なし」= 実質休みになったか。
 *
 * 出ていくコマの数だけでは足りない。**その日にやると明示登録されたもの**
 * (他日から入ってくる振替・追加授業・講習コマ) が 1 つでも残っていれば
 * 休みではないので、呼び出し側がその件数を `otherLessons` に渡すこと。
 *
 * @param {Array} slots その日に表示しているコマ
 * @param {{slot: object, adj: object}[]} outgoing collectOutgoingReschedules の結果
 * @param {number} [otherLessons] その日に残る他のコマ数 (振替で入る / 追加授業 / 講習)
 * @returns {boolean}
 */
export function isDayEmptiedByReschedule(slots, outgoing, otherLessons = 0) {
  if (!slots?.length) return false;
  if (otherLessons > 0) return false;
  return outgoing.length === slots.length;
}

/**
 * 振替先の表記。"2026-08-28 (金) 19:40 (福江)" のように、
 * 日付 → 時刻 → 担当 の順で、入っているものだけを並べる。
 * short: true で日付を "8/28" に縮める (月間カレンダーのカード内など)。
 *
 * originalTeacher を渡すと、**担当が変わらない振替では担当を出さない**。
 * 振替の targetTeacher には元担当がそのまま入っていることがあり
 * (振替ピッカーの既定だった)、そのまま出すと担当が変わったように読める。
 */
export function describeRescheduleTarget(
  adj,
  { short = false, originalTeacher = "" } = {}
) {
  if (!adj?.targetDate) return "";
  const parts = [short ? shortDate(adj.targetDate) : fmtDateWeekday(adj.targetDate)];
  if (adj.targetTime) parts.push(short ? adj.targetTime.split("-")[0] : adj.targetTime);
  if (adj.targetTeacher && adj.targetTeacher !== originalTeacher) {
    parts.push(`(${adj.targetTeacher})`);
  }
  return parts.join(" ");
}

// "2026-08-28" → "8/28"
function shortDate(dateStr) {
  const [, m, d] = (dateStr || "").split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : dateStr || "";
}

/**
 * 「振替で授業なし」バナーの見出し文。行き先が 1 つならその日付まで出す。
 * @param {{slot: object, adj: object}[]} outgoing
 */
export function outgoingDayLabel(outgoing) {
  if (!outgoing?.length) return "";
  const targets = [...new Set(outgoing.map((o) => o.adj.targetDate))].sort();
  const to =
    targets.length === 1
      ? fmtDateWeekday(targets[0])
      : `${fmtDateWeekday(targets[0])} 他 ${targets.length - 1} 日`;
  return `この日の授業は ${outgoing.length} コマとも ${to} へ振替済み`;
}
