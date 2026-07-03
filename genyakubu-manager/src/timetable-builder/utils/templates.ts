// E2d: 年度間コピー用のテンプレート。現在のプロジェクトを名前付きで保存し、
// 翌年などに「全体」または「講師マスタのみ」を適用して使い回す。
//
// 保存先は localStorage (STORAGE_KEY_TEMPLATES)。配列操作は純粋関数として
// 切り出し、localStorage I/O は薄いラッパに分ける (テスト容易性のため)。
import { STORAGE_KEY_TEMPLATES } from './constants';
import type { Project } from '../types';

export interface ProjectTemplate {
  id: number;
  name: string;
  createdAt: string | null;
  /** snapshots を除いた Project の deep copy (適用時に migrate を通す) */
  payload: Omit<Project, 'snapshots'>;
}

// テンプレートに載せる payload を作る。snapshots は試行錯誤の作業履歴で
// 年度間で引き継ぐ意味が薄いので除外し、deep copy で固める。
export function buildTemplatePayload(project: Project | null | undefined): Omit<Project, 'snapshots'> {
  // snapshots は除外 (rest に含めない)。_snapshots は意図的に未使用。
  const { snapshots: _snapshots, ...rest } = project || {};
  return JSON.parse(JSON.stringify(rest));
}

// 配列にテンプレートを追加した新配列を返す (純粋)。id は max+1。
export function addTemplate(
  templates: ProjectTemplate[] | null | undefined,
  { name, project, createdAt = null }: { name: string; project: Project; createdAt?: string | null },
): ProjectTemplate[] {
  if (!name) return templates;
  const list = Array.isArray(templates) ? templates : [];
  const id = list.reduce((max, t) => Math.max(max, t.id || 0), 0) + 1;
  return [...list, { id, name, createdAt, payload: buildTemplatePayload(project) }];
}

// id を取り除いた新配列を返す (純粋)。
export function removeTemplate(templates: ProjectTemplate[] | null | undefined, id: number): ProjectTemplate[] {
  const list = Array.isArray(templates) ? templates : [];
  return list.filter(t => t.id !== id);
}

// N4a: 既存テンプレートの payload を現在の project で差し替えた新配列を返す
// (純粋)。id・name は維持し、createdAt は更新時刻に付け替える。
// 対象 id が無ければ元の配列をそのまま返す。
export function updateTemplate(
  templates: ProjectTemplate[] | null | undefined,
  { id, project, createdAt = null }: { id: number; project: Project; createdAt?: string | null },
): ProjectTemplate[] {
  const list = Array.isArray(templates) ? templates : [];
  if (!list.some(t => t.id === id)) return list;
  return list.map(t => (t.id === id ? { ...t, createdAt, payload: buildTemplatePayload(project) } : t));
}

// localStorage から読み込む。壊れていれば空配列 (UI を blank にしない)。
export function loadTemplates(): ProjectTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TEMPLATES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// localStorage へ保存する。private mode 等の失敗は握りつぶす (次回再保存可)。
export function persistTemplates(templates: ProjectTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
  } catch {
    // ignore
  }
}
