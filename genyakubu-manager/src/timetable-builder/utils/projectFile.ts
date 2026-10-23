// プロジェクトの JSON ファイル (💾 プロジェクト保存で書き出したもの) の読み取り。
// ヘッダの「📂 開く」(hooks/useJsonIO) と、まだ作っていない季節を JSON から
// 始めるとき (components/SeasonStartPanel) が共有する。

import { CURRENT_PROJECT_VERSION, cleanSchedule } from './constants';
import { migrateProject } from './scheduleKey';
import { validateProjectShape } from './projectSchema';
import { addTemplate, loadTemplates, persistTemplates } from './templates';
import type { Project } from '../types';

export type ParsedProjectFile =
  | { ok: true; project: Project; templates: unknown[] }
  | { ok: false; error: string };

// JSON の文字列 → 適用できる project (migrate + cleanSchedule 済み) と同梱テンプレート。
// 読めなければ利用者に見せる文言を返す。
export function parseProjectFile(text: string): ParsedProjectFile {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: '読み込みエラー' };
  }
  // このアプリより新しいスキーマ version の JSON は解釈できない
  // (migrate は素通しになり、以降の挙動が未定義)。クラウド同期の
  // stale-client ガード (projectSync) と同様に読込前に弾く。
  if (typeof data?.version === 'number' && data.version > CURRENT_PROJECT_VERSION) {
    return {
      ok: false,
      error: `このファイルはアプリより新しい形式 (v${data.version}) です。ページを再読み込みして最新版のアプリで読み込んでください`,
    };
  }
  // 構造を検証してから migrate / 適用 (E3d)。不正なら適用せず通知。
  const { valid, error } = validateProjectShape(data);
  if (!valid) return { ok: false, error: `JSON の構造が不正です: ${error}` };
  // L1d: 同梱テンプレート (任意フィールド) は project state とは別管理
  // なので、migrate / replace に流す前に分離する。
  const { templates, ...projectData } = data;
  try {
    return {
      ok: true,
      project: cleanSchedule(migrateProject(projectData)),
      templates: Array.isArray(templates) ? templates : [],
    };
  } catch {
    return { ok: false, error: '読み込みエラー' };
  }
}

// L1d: 同梱テンプレートは既存を温存しつつ追記マージする。
// 「同名 + 同 createdAt」は同一テンプレの再取込とみなして skip。
// dedupe キーは F2h と同じ JSON 配列方式 (区切り文字の衝突なし)。
// 戻り値は取り込んだ件数。
export function mergeImportedTemplates(importedTemplates: unknown[]): number {
  if (!Array.isArray(importedTemplates) || importedTemplates.length === 0) return 0;
  const existing = loadTemplates();
  const dedupeKey = (t: { name?: string; createdAt?: string | null }) =>
    JSON.stringify([t.name, t.createdAt ?? '']);
  const seen = new Set(existing.map(dedupeKey));
  let mergedTemplates = existing;
  let importedCount = 0;
  for (const t of importedTemplates as any[]) {
    if (!t || typeof t !== 'object' || !t.name || !t.payload || typeof t.payload !== 'object') continue;
    const key = dedupeKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    // addTemplate が payload の deep copy と id 採番 (max+1) を行う
    mergedTemplates = addTemplate(mergedTemplates, { name: t.name, project: t.payload, createdAt: t.createdAt ?? null });
    importedCount += 1;
  }
  if (importedCount > 0) persistTemplates(mergedTemplates);
  return importedCount;
}
