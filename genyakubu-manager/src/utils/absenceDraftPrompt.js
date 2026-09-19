import { fmtDateWeekday } from "./dateHelpers";

// 欠勤組み換えの下書きを捨てる前の確認文言。App のビュー移動ガード・
// ビュー内の日付ジャンプ (initDate)・日付欄の変更の 3 か所で同じ文にする
// (別々に書くと件数の有無や OK ラベルがずれる)。
//
// count: 下書きの件数 (0 / 不明なら件数を出さない)
// toDate: 移動先の日付 ("YYYY-MM-DD")。あれば「9/21 (月) へ」と添える
// action: "移動" (既定) / "変更" など、OK ラベルの動詞
export function draftDiscardPrompt({ count = 0, toDate = null, action = "移動" } = {}) {
  const head = count > 0 ? `欠勤組み換えの下書きが ${count} 件あります。` : "欠勤組み換えの下書きが保存されていません。";
  const dest = toDate ? ` ${fmtDateWeekday(toDate)} へ` : "";
  return {
    title: "下書きがあります",
    message: `${head}破棄して${dest}${action}しますか？`,
    okLabel: `破棄して${action}`,
    tone: "danger",
  };
}

// 「保存してから続きの作業 (玉突き代行など) へ進む」の確認文言
export function draftSaveAndContinuePrompt({ count = 0, what = "玉突き代行" } = {}) {
  return {
    title: "下書きを保存しますか",
    message: `欠勤組み換えの下書きが ${count} 件あります。保存してから${what}を開きますか？ (キャンセルで留まります)`,
    okLabel: `保存して開く`,
    tone: "default",
  };
}
