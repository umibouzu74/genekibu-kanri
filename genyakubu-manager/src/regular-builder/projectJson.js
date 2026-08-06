// ─── プロジェクトの JSON 書き出し / 読み込み (RB20) ─────────────────
// 下書きは LocalStorage + クラウド同期にしか無いため、ファイルとしての
// バックアップ・他環境への移行手段を用意する。書き出しはアクティブな
// プロジェクト単位 (スナップショット込み)、読み込みは新しいプロジェクト
// として追加する (既存を上書きしない)。
//
// ファイル形式: { kind, version, exportedAt, project } の封筒に包む。
// 読み込みは封筒付き・生のプロジェクト (tabs 配列を持つ) の両方を受け、
// sanitizeProject で不正要素を落としてから返す。

import { sanitizeProject } from "./model";

export const PROJECT_JSON_KIND = "genyakubu-regular-project";

/**
 * プロジェクトを整形 JSON 文字列にする。id は環境ローカルなので含めない
 * (読み込み側で新しい id が振られる)。
 * @param {string} exportedAt ISO 文字列 (テストから固定値を渡せる)
 */
export function serializeProject(project, exportedAt) {
  const { id: _id, ...data } = project;
  return JSON.stringify(
    { kind: PROJECT_JSON_KIND, version: 1, exportedAt, project: data },
    null,
    2
  );
}

/**
 * JSON 文字列からプロジェクトを復元する。
 * @returns {{project: object} | {error: string}}
 */
export function parseProjectJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "JSON として読み取れませんでした" };
  }
  // 封筒付き (kind/project) と生のプロジェクトの両方を受ける
  const candidate =
    raw && typeof raw === "object" && raw.project && typeof raw.project === "object"
      ? raw.project
      : raw;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !Array.isArray(candidate.tabs)
  ) {
    return { error: "通常時間割のプロジェクト JSON ではありません" };
  }
  const project = sanitizeProject(candidate);
  if (!project) return { error: "通常時間割のプロジェクト JSON ではありません" };
  return { project };
}

/**
 * 書き出しファイル名 (例: 通常時間割_2026 2学期_2026-08-05.json)。
 * ファイル名に使えない文字は "_" に置き換える。
 * @param {Date} date
 */
export function projectFileName(name, date) {
  const safe = (name || "無題").replace(/[\\/:*?"<>|]/g, "_").trim() || "無題";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `通常時間割_${safe}_${y}-${m}-${d}.json`;
}
