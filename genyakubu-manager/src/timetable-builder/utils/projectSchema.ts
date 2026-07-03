// E3d: 読み込んだプロジェクト JSON の構造を最小限バリデーションする純粋関数。
//
// migrateProject は tabs / config の配列を map で走査し、downstream は
// project.teachers を find する。これらが配列でないと crash するため、
// migrate / 適用の手前で「致命的な構造崩れ」だけを検出してフォールバックさせる。
// (任意フィールドの欠落は migrateProject 側が default で補うのでここでは見ない。)
//
// 返り値: { valid: boolean, error: string|null }
// 入力は untrusted JSON なので any で受け、構造を絞り込みながら検証する。
export function validateProjectShape(obj: any): { valid: boolean; error: string | null } {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, error: 'プロジェクトがオブジェクトではありません' };
  }
  if (!Array.isArray(obj.tabs) || obj.tabs.length === 0) {
    return { valid: false, error: 'tabs が配列でないか空です' };
  }
  if ('teachers' in obj && !Array.isArray(obj.teachers)) {
    return { valid: false, error: 'teachers が配列ではありません' };
  }
  // v4: dates / periods は project レベル。存在する場合のみ配列性を検証する
  // (v3 以前は tab.config 側に入っており migrate で project へ昇格する)。
  for (const key of ['dates', 'periods']) {
    if (key in obj && !Array.isArray(obj[key])) {
      return { valid: false, error: `${key} が配列ではありません` };
    }
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
    // classes は v4 でも tab 単位なので必須。dates / periods は v3 以前のデータ
    // 互換のため『存在する場合のみ』配列性を検証する (v4 では tab 側に無い)。
    if (!Array.isArray(cfg.classes)) {
      return { valid: false, error: `tabs[${i}].config.classes が配列ではありません` };
    }
    for (const key of ['dates', 'periods']) {
      if (key in cfg && !Array.isArray(cfg[key])) {
        return { valid: false, error: `tabs[${i}].config.${key} が配列ではありません` };
      }
    }
    if (!cfg.subjectCounts || typeof cfg.subjectCounts !== 'object' || Array.isArray(cfg.subjectCounts)) {
      return { valid: false, error: `tabs[${i}].config.subjectCounts がオブジェクトではありません` };
    }
    // schedule は必須 (オブジェクト)。欠落すると migrateScheduleKeys /
    // migrateTabV2toV3 / cleanSchedule が Object.keys(undefined) で crash する
    // ため、optional 扱いにせず構造崩れとして弾く (review F4)。
    if (typeof tab.schedule !== 'object' || tab.schedule === null || Array.isArray(tab.schedule)) {
      return { valid: false, error: `tabs[${i}].schedule がオブジェクトではありません` };
    }
  }
  return { valid: true, error: null };
}
