// E3d: 読み込んだプロジェクト JSON の構造を最小限バリデーションする純粋関数。
//
// migrateProject は tabs / config の配列を map で走査し、downstream は
// project.teachers を find する。これらが配列でないと crash するため、
// migrate / 適用の手前で「致命的な構造崩れ」だけを検出してフォールバックさせる。
// (任意フィールドの欠落は migrateProject 側が default で補うのでここでは見ない。)
//
// 返り値: { valid: boolean, error: string|null }
export function validateProjectShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, error: 'プロジェクトがオブジェクトではありません' };
  }
  if (!Array.isArray(obj.tabs) || obj.tabs.length === 0) {
    return { valid: false, error: 'tabs が配列でないか空です' };
  }
  if ('teachers' in obj && !Array.isArray(obj.teachers)) {
    return { valid: false, error: 'teachers が配列ではありません' };
  }
  for (let i = 0; i < obj.tabs.length; i++) {
    const tab = obj.tabs[i];
    if (!tab || typeof tab !== 'object') {
      return { valid: false, error: `tabs[${i}] がオブジェクトではありません` };
    }
    const cfg = tab.config;
    if (!cfg || typeof cfg !== 'object') {
      return { valid: false, error: `tabs[${i}].config がありません` };
    }
    for (const key of ['dates', 'periods', 'classes']) {
      if (!Array.isArray(cfg[key])) {
        return { valid: false, error: `tabs[${i}].config.${key} が配列ではありません` };
      }
    }
    if (!cfg.subjectCounts || typeof cfg.subjectCounts !== 'object' || Array.isArray(cfg.subjectCounts)) {
      return { valid: false, error: `tabs[${i}].config.subjectCounts がオブジェクトではありません` };
    }
    if ('schedule' in tab && (typeof tab.schedule !== 'object' || tab.schedule === null || Array.isArray(tab.schedule))) {
      return { valid: false, error: `tabs[${i}].schedule がオブジェクトではありません` };
    }
  }
  return { valid: true, error: null };
}
