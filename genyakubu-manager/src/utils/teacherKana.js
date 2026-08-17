// ─── 講師の「よみ」と、よみに基づく並び順 ────────────────────────────
//
// **漢字の名前は読み順に並べられない**のが前提。`localeCompare("ja")` /
// `Intl.Collator("ja")` は漢字を読みではなく部首・画数順に並べるため、
// 「堀上」「河野」を "ほりかみ / こうの" の順にはできない。読み順の唯一の
// 手掛かりは講師ごとに登録した `kana` (よみ) — だから**よみが無い講師は
// 勝手に別の順序を捏造せず、従来どおりの文字列順のまま後ろに置く**。
// 画面で「未設定だから後ろなのだ」と分かる方が直しやすい。
//
// かなの比較だけは Intl.Collator("ja") が正しく効く (かな同士の照合は
// あいうえお順)。ひらがな / カタカナ / 半角カナ・前後の空白は表記ゆれと
// して正規化してから比較する。
//
// 保存形は **名前 → よみ の map** (`teacherKana`)。バイト (partTimeStaff)
// にも常勤講師 (時間割のコマにしか出てこない) にも同じ形でよみを付けたい
// ので、`teacherSubjects` と同型の独立したマップにしてある
// (partTimeStaff オブジェクトの項目にすると常勤講師に付けられない)。
//
// 通常時間割作成 (regular-builder) の講師マスタも同じ正規化・照合を使う
// (`regular-builder/teacherOrder.js` がこのモジュールを参照する)。

/** かな比較用のコレータ。base = 濁点・小書きの差を無視 (が = か, ぁ = あ) */
export const KANA_COLLATOR = new Intl.Collator("ja", { sensitivity: "base" });

/**
 * よみを比較用のキーに正規化する。
 * 半角カナ → 全角 (NFKC)、カタカナ → ひらがな、空白 (全角含む) を除去。
 * @param {string} kana
 * @returns {string}
 */
export function normalizeKana(kana) {
  if (!kana) return "";
  return (
    String(kana)
      .normalize("NFKC")
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      // JS の \s は全角スペース (U+3000) も含む
      .replace(/\s/g, "")
  );
}

/**
 * 保存された teacherKana を正規化する (useSyncedStorage の migrate 用)。
 * 壊れた値や空文字は落とす — 「よみが空文字で登録されている」状態と
 * 「未設定」を画面で区別できないため、空は未設定に寄せる。
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function sanitizeKanaMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [name, kana] of Object.entries(raw)) {
    if (typeof name !== "string" || !name.trim()) continue;
    if (typeof kana !== "string") continue;
    const trimmed = kana.trim();
    if (!trimmed) continue;
    out[name.trim()] = trimmed;
  }
  return out;
}

/**
 * 名前 → 比較キーを引くための Map を作る。
 * @param {Record<string, string>} [kanaMap]
 * @returns {Map<string, string>} よみが引けない名前は入らない
 */
function keyMap(kanaMap) {
  const m = new Map();
  if (!kanaMap || typeof kanaMap !== "object") return m;
  for (const [name, kana] of Object.entries(kanaMap)) {
    const key = normalizeKana(kana);
    if (key) m.set(name, key);
  }
  return m;
}

/**
 * 講師名用のコンパレータを作る。よみのある名前が先 (あいうえお順)、
 * よみが無い名前は後ろで従来どおりの文字列順 (`localeCompare("ja")`)。
 *
 * `Array.prototype.sort` に直接渡せる形なので、既存の `compareJa` を
 * 差し替えるだけで使える。
 * @param {Record<string, string>} [kanaMap]
 * @returns {(a: string, b: string) => number}
 */
export function compareTeacherNames(kanaMap) {
  const keys = keyMap(kanaMap);
  return (a, b) => {
    const ka = keys.get(a);
    const kb = keys.get(b);
    if (ka && kb) {
      // かなが同点 (が/か のような濁点差) のときは名前で安定させる
      return KANA_COLLATOR.compare(ka, kb) || String(a).localeCompare(String(b), "ja");
    }
    // よみのある人が先。片方だけ未設定ならそちらを後ろへ
    if (ka) return -1;
    if (kb) return 1;
    return String(a).localeCompare(String(b), "ja");
  };
}

/**
 * 講師名の配列をよみ順に並べる。元の配列は変更しない。
 * @param {string[]} names
 * @param {Record<string, string>} [kanaMap]
 * @returns {string[]}
 */
export function sortTeacherNames(names, kanaMap) {
  return [...(names || [])].sort(compareTeacherNames(kanaMap));
}

/**
 * 講師名を持つオブジェクトの配列をよみ順に並べる。元の配列は変更しない。
 * @template T
 * @param {T[]} items
 * @param {Record<string, string>} [kanaMap]
 * @param {(item: T) => string} [getName] 既定は `item.name`
 * @returns {T[]}
 */
export function sortByTeacherKana(items, kanaMap, getName = (x) => x?.name) {
  const cmp = compareTeacherNames(kanaMap);
  return [...(items || [])].sort((a, b) => cmp(getName(a) || "", getName(b) || ""));
}

/**
 * よみが未設定の講師名を返す (画面の「よみ未設定 N 名」表示用)。
 * 何が未設定かを画面で見せて直してもらうための一覧なので、順序は
 * 入力順のまま (よみが無いので並べようがない)。
 * @param {string[]} names
 * @param {Record<string, string>} [kanaMap]
 * @returns {string[]} 重複なし
 */
export function missingKanaNames(names, kanaMap) {
  const keys = keyMap(kanaMap);
  const out = [];
  const seen = new Set();
  for (const n of names || []) {
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (!keys.has(n)) out.push(n);
  }
  return out;
}

/**
 * 1 人ぶんのよみを設定した新しい map を返す (元の map は変更しない)。
 * 空文字 / 空白のみは**キーごと削除** = 未設定に戻す。
 * @param {Record<string, string>} kanaMap
 * @param {string} name
 * @param {string} kana
 * @returns {Record<string, string>}
 */
export function setTeacherKana(kanaMap, name, kana) {
  const next = { ...(kanaMap || {}) };
  const key = String(name || "").trim();
  if (!key) return next;
  const value = String(kana ?? "").trim();
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

/**
 * 別のよみ一覧を取り込んで新しい map を返す (元の map は変更しない)。
 * **既に入っているよみは上書きしない** — 手入力を黙って書き換えないため
 * (通常時間割作成の「📚 担当科目を推定」と同じ方針)。
 * @param {Record<string, string>} kanaMap
 * @param {{name?: string, kana?: string}[]} entries
 * @returns {{map: Record<string, string>, added: number, skipped: number}}
 *   added = 新しく入ったよみの数, skipped = 既に入っていて据え置いた数
 */
export function mergeTeacherKana(kanaMap, entries) {
  const next = { ...(kanaMap || {}) };
  let added = 0;
  let skipped = 0;
  for (const e of entries || []) {
    const name = String(e?.name || "").trim();
    const kana = String(e?.kana || "").trim();
    if (!name || !kana) continue;
    if (next[name]) {
      if (next[name] !== kana) skipped++;
      continue;
    }
    next[name] = kana;
    added++;
  }
  return { map: next, added, skipped };
}

/**
 * 通常時間割作成 (regular-builder) の下書きに登録されているよみを取り出す。
 * 講師マスタは**プロジェクトごと**にあるので、ワークスペース内の全
 * プロジェクトを見る (1学期 / 2学期 で別々に入れてある可能性がある)。
 * 同じ名前が複数プロジェクトにあれば**先に見つかった方**を採る。
 *
 * 読み取り専用の一度きりの入力補助であって、常時同期ではない
 * (正はそれぞれのマスタ)。
 * @param {unknown} workspace `LS.regularBuilderProject` をパースした値
 * @returns {{name: string, kana: string}[]}
 */
export function kanaEntriesFromRegularBuilder(workspace) {
  if (!workspace || typeof workspace !== "object") return [];
  const projects = Array.isArray(workspace.projects)
    ? workspace.projects
    : // 旧形式 (ワークスペース化する前の単体プロジェクト)
      Array.isArray(workspace.tabs)
      ? [workspace]
      : [];
  const out = [];
  const seen = new Set();
  for (const p of projects) {
    for (const t of p?.teachers || []) {
      const name = String(t?.name || "").trim();
      const kana = String(t?.kana || "").trim();
      if (!name || !kana || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, kana });
    }
  }
  return out;
}
