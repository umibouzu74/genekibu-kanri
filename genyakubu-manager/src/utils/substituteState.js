// ─── 代行レコードの 4 状態 ─────────────────────────────────────────
// 代行レコード (Substitute) は「誰が休むか」と「その穴をどうするか」の
// 両方を 1 本で表す。判定の軸は 2 つあり、**混ぜてはいけない**:
//
//   substitute の有無 … 代行者が付いたか
//   status            … 対応が確定したか (requested = 依頼中 / confirmed = 確定)
//
// 掛け合わせると 4 状態になる:
//
//   | substitute | status    | 状態      | 意味                               |
//   | ---------- | --------- | --------- | ---------------------------------- |
//   | ""         | requested | pending   | 欠勤・代行を探し中 (代行未定)      |
//   | ""         | confirmed | nosub     | 欠勤・代行なしで確定 (他の担当者で回す / 自習等) |
//   | 名前       | requested | requested | 代行を頼んだが未確定               |
//   | 名前       | confirmed | confirmed | 代行確定                           |
//
// **「代行が付いたか」を status で判定しないこと。** confirmed には
// 「代行なしで確定」が含まれるので、代行者の有無は必ず `substitute` を見る
// (代行確定一覧・月次集計・バイト管理がこれを取り違えていた)。
//
// nosub は 3 人担当のプレップのように「1 人休んでも残りの担当者で回す」
// ケース。休んだ事実はスケジュールに出すが、代行を探す導線
// (代行未定の一覧・玉突き代行の候補・依頼中バッジ) には出さない。

export const SUB_STATE = Object.freeze({
  PENDING: "pending",
  NOSUB: "nosub",
  REQUESTED: "requested",
  CONFIRMED: "confirmed",
});

/**
 * 代行レコードの状態を返す。
 * @param {{substitute?: string, status?: string} | null | undefined} sub
 * @returns {"pending"|"nosub"|"requested"|"confirmed"|null} sub が無ければ null
 */
export function subState(sub) {
  if (!sub) return null;
  if (sub.substitute) {
    return sub.status === "confirmed" ? SUB_STATE.CONFIRMED : SUB_STATE.REQUESTED;
  }
  return sub.status === "confirmed" ? SUB_STATE.NOSUB : SUB_STATE.PENDING;
}

/** 代行者が付いているか (「代行された」の唯一の判定)。 */
export function hasSubstitute(sub) {
  return !!sub?.substitute;
}

/** まだ代行者を探している状態か (代行未定の一覧・玉突き代行の対象)。 */
export function needsSubstitute(sub) {
  return subState(sub) === SUB_STATE.PENDING;
}

/** その日その講師がそのコマの担当を外れているか (4 状態すべてで true)。 */
export function isAway(sub) {
  return !!sub;
}

// 画面に出す短いラベルと色。SUB_STATUS (依頼中/確定) と違い、代行者の
// 有無まで含めた 4 状態ぶん。バッジは他のチップに合わせて 2〜4 文字。
const META = {
  // 「未定」(代行者を探す必要がある) と「依頼」(頼んだが未返事) は別の
  // アクションなので色も分ける。同じ赤だと遠目・白黒印刷で区別できない
  [SUB_STATE.PENDING]: {
    badge: "未定",
    label: "代行未定",
    note: "代行を探し中",
    color: "#b34700",
    bg: "#ffe6cc",
  },
  [SUB_STATE.NOSUB]: {
    badge: "代行なし",
    label: "代行なし",
    note: "他の担当者で回す",
    color: "#8a6a20",
    bg: "#fdf5e8",
  },
  [SUB_STATE.REQUESTED]: {
    badge: "依頼",
    label: "依頼中",
    note: "代行を依頼済み (未確定)",
    color: "#c03030",
    bg: "#fde4e4",
  },
  [SUB_STATE.CONFIRMED]: {
    badge: "代行",
    label: "代行確定",
    note: "代行確定",
    color: "#2a7a4a",
    bg: "#e0f2e4",
  },
};

/**
 * 状態ごとの表示メタ (badge / label / note / color / bg)。
 * @param {{substitute?: string, status?: string} | null | undefined} sub
 */
export function subStateMeta(sub) {
  return META[subState(sub)] || null;
}

/**
 * 「◯◯ ⇒ 杉原」「◯◯ ⇒ 代行未定」のように、代行者側に出す文字列。
 * 代行者が決まっていれば名前、決まっていなければ状態のラベル。
 */
export function subTargetLabel(sub) {
  if (!sub) return "";
  return sub.substitute || META[subState(sub)].label;
}

/**
 * まだ人の対応が要る (= 未処理) か。代行未定 (pending) と依頼中 (requested)
 * の 2 状態。「代行なしで確定」(nosub) は対応済みなので含めない。
 * サイドバーの赤バッジ・ダッシュボードの要対応カード・代行一覧の
 * 「未処理」フィルタはすべてこれを使う (画面ごとに status を見ない)。
 */
export function isUnresolved(sub) {
  const st = subState(sub);
  return st === SUB_STATE.PENDING || st === SUB_STATE.REQUESTED;
}

/**
 * 未処理の代行を「今日以降」と「過去」に分けて数える。
 * 過去の分は放っておくと永久に赤バッジに乗るので、別枠で出して
 * 片付けられるようにする (今日以降の件数だけを主表示にする)。
 * @param {Array} subs
 * @param {string} todayStr "YYYY-MM-DD"
 */
export function summarizeOpenSubs(subs, todayStr) {
  const res = {
    upcoming: [],
    past: [],
    upcomingPending: 0,
    upcomingRequested: 0,
  };
  for (const s of subs || []) {
    if (!isUnresolved(s)) continue;
    if (s.date && todayStr && s.date < todayStr) {
      res.past.push(s);
    } else {
      res.upcoming.push(s);
      if (subState(s) === SUB_STATE.PENDING) res.upcomingPending++;
      else res.upcomingRequested++;
    }
  }
  return res;
}

// 代行一覧のステータス絞り込み。旧 2 値 (requested / confirmed) は
// status の生の値だったが、4 状態 + 「未処理」でも絞れるようにする。
// 旧キーも同じ名前で受けるので、外部から initFilter で渡された
// "requested" はそのまま「依頼中」に当たる。
export const SUB_STATE_FILTERS = Object.freeze([
  { key: "open", label: "未処理 (未定 + 依頼中)" },
  { key: SUB_STATE.PENDING, label: META[SUB_STATE.PENDING].label },
  { key: SUB_STATE.REQUESTED, label: META[SUB_STATE.REQUESTED].label },
  { key: SUB_STATE.CONFIRMED, label: META[SUB_STATE.CONFIRMED].label },
  { key: SUB_STATE.NOSUB, label: META[SUB_STATE.NOSUB].label },
]);

/** 絞り込みキー (SUB_STATE_FILTERS の key) にレコードが当たるか。 */
export function matchesSubStateFilter(sub, key) {
  if (!key) return true;
  if (key === "open") return isUnresolved(sub);
  return subState(sub) === key;
}
