// 通常時間割作成のセル背景色 (科目カラー) の解決。
//
// 素の `getSubjectColor(subj)` は **文字列そのもの** を見るため、
// 「理科A」と「理科B」、「共テ数IA」と「高松西 文系数学」のように
// 同じ教科でもクラス記号や冠がひとつ違うだけで別色 (ハッシュ fallback)
// になっていた。画面ではさほど困らないが、紙面 (掲示・配布) では
// 「色 = 教科」で読ませたいので、**教科マスタで正規化してから**色を引く。
//
// 正規化はアプリ共通の `pickSubjectId` (完全一致 → 名前を含む →
// 別名を含む) をそのまま使う。代行の教科判定・講師の担当教科推定と
// 同じ規則なので、「このコマは何の教科か」の解釈がアプリ全体で 1 つに
// 揃う。マスタのどれにも当たらない科目 (確認テスト・個別指導など) は
// 従来どおり文字列ハッシュの色に落とす — 文字列が同じなら常に同じ色。
import { getSubjectColor } from "../timetable-builder/utils/constants";
import { pickSubjectId } from "../utils/subjectMatch";

/**
 * 科目名 → 背景色 (#RRGGBB | null) を返す関数を作る。
 * 同じ文字列は何度でも同じ色になる (結果はキャッシュする)。
 * @param {{id: number, name: string, aliases?: string[]}[]} subjects 教科マスタ
 * @returns {(subj: string | null | undefined) => string | null}
 */
export function makeSubjectColorResolver(subjects) {
  const list = Array.isArray(subjects) ? subjects : [];
  const nameById = new Map(list.map((s) => [s.id, s.name]));
  const cache = new Map();
  return function subjectColor(subj) {
    if (!subj) return null;
    if (cache.has(subj)) return cache.get(subj);
    const id = pickSubjectId(subj, list);
    // マスタに当たれば教科名で、当たらなければ元の文字列で色を引く
    const color = getSubjectColor((id != null && nameById.get(id)) || subj);
    cache.set(subj, color);
    return color;
  };
}
