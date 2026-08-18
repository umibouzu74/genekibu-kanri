// ─── 表示期間外の日に出す文言 (画面共通) ───────────────────────────
// getDayCutoffKind (utils/timetable) の戻り値ごとの文言。
// 「開講前」と「終講後 (未確定)」は意味が逆なので必ず出し分けること
// (2学期の開始日を先に入れておくと、夏休み中ずっと「未確定」になっていた)。
export const CUTOFF_BANNER_TEXT = {
  before: "この日は開講前です（通常授業はまだ始まっていません）",
  after: "この日以降の予定は未確定です",
  mixed: "この日は通常授業の期間外です",
};

// カレンダーのセルなど、幅の無いところ用の短縮版。
export const CUTOFF_SHORT_TEXT = {
  before: "開講前",
  after: "未確定",
  mixed: "期間外",
};

export const cutoffBannerText = (kind) => CUTOFF_BANNER_TEXT[kind] || "";
export const cutoffShortText = (kind) => CUTOFF_SHORT_TEXT[kind] || "";
