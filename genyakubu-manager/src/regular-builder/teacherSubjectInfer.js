// ─── 担当科目の推定 (⚙ → 👤 講師 の「📚 割当から推定」) ───────────────
//
// 講師マスタの「担当科目」は科目別プルダウンのグループ分けに使うが、
// 20 人分を手で入れるのは面倒なので、**いま組んである割当から推定**して
// 初期値を入れる。推定した結果は普通のフィールドなので、後から手で足し
// 引きできる (推定は一度きりの入力補助であって、常時の自動分類ではない)。
//
// 語彙は**プロジェクトの科目マスタ (project.subjects)**。セルの科目名は
// 「英/数」「数/英」のような表記もあるため、次の順に読み替える:
//   1. 科目マスタと完全一致
//   2. 科目マスタの名前を含む ("中3数学" → "数学")
//   3. 親アプリの教科マスタ (別名つき) で正規化 ("英/数" → 英語) して、
//      その教科名が科目マスタにあれば採用
// どれにも当たらない科目 (「確認テスト」など) は担当科目にしない。

import { splitTeacherField } from "../utils/biweekly";
import { pickSubjectId } from "../utils/subjectMatch";

/**
 * セルの科目名を科目マスタの語彙へ読み替える。
 * @param {string} subj セルの科目名
 * @param {string[]} subjectMaster project.subjects
 * @param {{id: number, name: string, aliases?: string[]}[]} masterSubjects 親アプリの教科マスタ
 * @returns {string|null}
 */
export function resolveSubjectLabel(subj, subjectMaster, masterSubjects) {
  const s = (subj || "").trim();
  if (!s) return null;
  const master = Array.isArray(subjectMaster) ? subjectMaster : [];
  if (master.includes(s)) return s;
  const contained = master.find((m) => m && s.includes(m));
  if (contained) return contained;
  const list = Array.isArray(masterSubjects) ? masterSubjects : [];
  const id = pickSubjectId(s, list);
  if (id == null) return null;
  const name = list.find((m) => m.id === id)?.name;
  return name && master.includes(name) ? name : null;
}

/**
 * プロジェクトの割当から講師ごとの担当科目を推定する。
 * @param {object} project
 * @param {{id: number, name: string, aliases?: string[]}[]} masterSubjects 親アプリの教科マスタ
 * @returns {Map<string, string[]>} 講師名 → 担当科目 (科目マスタ順)
 */
export function inferTeacherSubjects(project, masterSubjects) {
  const subjectMaster = project?.subjects || [];
  const found = new Map(); // name → Set<subject>
  for (const tab of project?.tabs || []) {
    for (const cell of Object.values(tab?.schedule || {})) {
      const label = resolveSubjectLabel(cell?.subj, subjectMaster, masterSubjects);
      if (!label) continue;
      // 隔週コマの note のパートナーは**別の科目の担当**なので拾わない
      // (「英/数」の主担当が英語なら、パートナーはその週に数学を持つ)
      for (const name of splitTeacherField(cell?.teacher)) {
        if (!found.has(name)) found.set(name, new Set());
        found.get(name).add(label);
      }
    }
  }
  // 並びは科目マスタ順 → マスタ外は見つかった順
  const order = new Map(subjectMaster.map((s, i) => [s, i]));
  const result = new Map();
  for (const [name, set] of found) {
    result.set(
      name,
      [...set].sort(
        (a, b) =>
          (order.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b) ?? Number.MAX_SAFE_INTEGER)
      )
    );
  }
  return result;
}

/**
 * 推定結果を講師マスタへマージする (既存の担当科目は残す = 手入力を
 * 上書きしない)。
 * @param {object} project
 * @param {{id: number, name: string, aliases?: string[]}[]} masterSubjects
 * @returns {{teachers: object[], filled: number, added: number}}
 *   filled: 担当科目が増えた講師の数 / added: 追加された科目の延べ数
 */
export function applyInferredSubjects(project, masterSubjects) {
  const inferred = inferTeacherSubjects(project, masterSubjects);
  let filled = 0;
  let added = 0;
  const teachers = (project?.teachers || []).map((t) => {
    const guess = inferred.get(t.name);
    if (!guess || !guess.length) return t;
    const current = t.subjects || [];
    const merged = [...current, ...guess.filter((s) => !current.includes(s))];
    if (merged.length === current.length) return t;
    filled += 1;
    added += merged.length - current.length;
    return { ...t, subjects: merged };
  });
  return { teachers, filled, added };
}
