// ─── 講師プルダウンの並び (科目別 + アイウエオ順) ────────────────────
//
// 講師マスタの並びは登録順なので、人数が増えるとセルのプルダウンから
// 目当ての講師を探しにくい。そこで **担当科目でグループ分けし、各
// グループ内をよみ (かな) のアイウエオ順**で出す。
//
// **漢字の名前はソートできない**のが前提。`localeCompare("ja")` /
// `Intl.Collator("ja")` は漢字を読みではなく部首・画数順に並べるため、
// 「堀上」「河野」を "ほりかみ / こうの" の順にはできない。読み順の唯一の
// 手掛かりは講師マスタの `kana` (よみ) — だから**よみが無い講師は
// 勝手に別の順序を捏造せず、マスタ順のまま末尾に置く**。画面で
// 「未設定だから末尾なのだ」と分かる方が直しやすい。
//
// かなの比較だけは Intl.Collator("ja") が正しく効く (かな同士の照合は
// あいうえお順)。ひらがな / カタカナ / 半角カナ・前後の空白は
// 表記ゆれとして正規化してから比較する。
//
// 正規化とコレータは親アプリ (`utils/teacherKana`) と共有する — 同じ
// 「よみ」を両方の画面で並べるので、表記ゆれの吸収がずれると片方だけ
// 順序が変わってしまう。

import { KANA_COLLATOR, normalizeKana } from "../utils/teacherKana";

export { normalizeKana };

/** 担当科目が未設定の講師を入れるグループの見出し */
export const UNGROUPED_LABEL = "その他";

/**
 * 未設定グループの見出し。科目マスタに「その他」という科目があると
 * 同じ見出しが 2 つ並んで区別できなくなるので、その時だけ言い換える。
 * @param {string[]} subjectMaster
 * @returns {string}
 */
export function ungroupedLabel(subjectMaster) {
  return (subjectMaster || []).includes(UNGROUPED_LABEL) ? "未設定" : UNGROUPED_LABEL;
}

/**
 * 講師をアイウエオ順に並べる。よみのある講師が先 (かな順)、よみが無い
 * 講師はマスタ順のまま後ろ。元の配列は変更しない。
 * @param {{name: string, kana?: string}[]} teachers
 * @returns {{name: string, kana?: string}[]}
 */
export function sortTeachersByKana(teachers) {
  const list = Array.isArray(teachers) ? teachers : [];
  const withKana = [];
  const without = [];
  list.forEach((t, i) => {
    const key = normalizeKana(t?.kana);
    if (key) withKana.push({ t, key, i });
    else without.push(t);
  });
  withKana.sort(
    // かなが同点 (が/か のような濁点差) のときは登録順で安定させる
    (a, b) => KANA_COLLATOR.compare(a.key, b.key) || a.i - b.i
  );
  return [...withKana.map((x) => x.t), ...without];
}

/**
 * 講師名の配列をアイウエオ順に並べる (マスタに無い名前も混ざる
 * 👁 強調表示・入力候補用)。よみを引けた名前が先、引けない名前は
 * 後ろで従来どおりの文字列順。元の配列は変更しない。
 * @param {string[]} names
 * @param {{name: string, kana?: string}[]} teachers 講師マスタ (よみの引き元)
 * @returns {string[]}
 */
export function sortTeacherNamesByKana(names, teachers) {
  const kanaByName = new Map(
    (Array.isArray(teachers) ? teachers : []).map((t) => [
      t?.name,
      normalizeKana(t?.kana),
    ])
  );
  const list = [...(names || [])];
  const withKana = list.filter((n) => kanaByName.get(n));
  const without = list.filter((n) => !kanaByName.get(n));
  withKana.sort(
    (a, b) =>
      KANA_COLLATOR.compare(kanaByName.get(a), kanaByName.get(b)) ||
      a.localeCompare(b)
  );
  without.sort((a, b) => a.localeCompare(b));
  return [...withKana, ...without];
}

/**
 * 講師を担当科目でグループ分けする。グループの並びは**科目マスタ順**
 * (⚙ → 📚 科目 で並べ替えた順がそのまま出る)、各グループ内はアイウエオ順。
 *
 * - 複数科目を担当する講師は**それぞれのグループに出る** (どちらから
 *   探しても見つかるように)
 * - 科目マスタに無い担当科目 (取込直後などにあり得る) はマスタ順の後ろへ
 * - 担当科目が未設定の講師は最後の「その他」グループへ
 * - 誰も担当科目を持たない = この機能を使っていない場合は、グループ 1 つ
 *   (subject: "") だけを返す。呼び出し側はそれを見て optgroup を出さない
 *
 * @param {{name: string, kana?: string, subjects?: string[]}[]} teachers
 * @param {string[]} subjectMaster 科目マスタ (project.subjects)
 * @returns {{subject: string, teachers: object[]}[]} subject: "" = 未設定
 */
export function groupTeachersBySubject(teachers, subjectMaster) {
  const list = Array.isArray(teachers) ? teachers : [];
  const master = Array.isArray(subjectMaster) ? subjectMaster : [];

  // 科目マスタに重複があっても見出しは 1 つ (取込・JSON 読み込みで
  // 重複しうる — sanitize は科目の重複を落とさない)
  const order = [...new Set(master)];
  const seen = new Set(order);
  for (const t of list) {
    for (const s of t?.subjects || []) {
      if (!seen.has(s)) {
        seen.add(s);
        order.push(s);
      }
    }
  }

  const groups = [];
  for (const subject of order) {
    const members = list.filter((t) => (t?.subjects || []).includes(subject));
    if (members.length) groups.push({ subject, teachers: sortTeachersByKana(members) });
  }
  const rest = list.filter((t) => !(t?.subjects || []).length);
  if (rest.length)
    groups.push({ subject: "", teachers: sortTeachersByKana(rest) });

  // 担当科目を誰も持たなければ [{subject: "", teachers: 全員}] の 1 つだけ
  // になる (= グループ分けする材料が無い)。講師が 0 人なら空配列
  return groups;
}
