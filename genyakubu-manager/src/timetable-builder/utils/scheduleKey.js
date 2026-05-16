// スケジュールキーのユーティリティ
// 新形式: "d0-p1-c2" （インデックスベース）
// 旧形式: "12/25(木)-1限 (13:00~)-３S" （日本語文字列結合）

// --- キー生成・パース ---

export const makeKey = (dIdx, pIdx, cIdx) => `d${dIdx}-p${pIdx}-c${cIdx}`;

export const parseKey = (key) => {
  const m = key.match(/^d(\d+)-p(\d+)-c(\d+)$/);
  if (!m) return null;
  return { dIdx: parseInt(m[1]), pIdx: parseInt(m[2]), cIdx: parseInt(m[3]) };
};

// インデックスキーから実際の値を解決
export const resolveKey = (key, config) => {
  const parsed = parseKey(key);
  if (!parsed) return null;
  return {
    date: config.dates[parsed.dIdx],
    period: config.periods[parsed.pIdx],
    class: config.classes[parsed.cIdx],
  };
};

// --- NG スロットキー ---
// NG はタブ横断で使うため、日付名・時限名ベースのまま維持
// （config 変更時にインデックスがずれる問題を避けるため）
export const makeNgKey = (date, period) => `${date}-${period}`;

// --- 外部カウントキー ---
// 講師の日別外部コマ数: "日付名-講師名"
export const makeExternalKey = (date, teacherName) => `${date}-${teacherName}`;

// --- 合同グループヘルパー ---

// 指定の科目・クラス・日付に該当する合同グループを検索
export function findCombinedGroup(combinedGroups, subject, className, date) {
  if (!combinedGroups || !subject) return null;
  return combinedGroups.find(g =>
    g.subject === subject &&
    g.classes.includes(className) &&
    (g.dates === null || g.dates.includes(date))
  ) || null;
}

// クラスが合同グループの代表（先頭）クラスかどうか
export function isPrimaryCombinedClass(group, className) {
  return group && group.classes[0] === className;
}

// 合同グループを考慮した講師コマ数カウント
export function countTeacherHoursWithCombined(schedule, config, combinedGroups) {
  const totals = {};
  const counted = new Set();

  Object.keys(schedule).forEach(key => {
    const entry = schedule[key];
    if (!entry || !entry.teacher || entry.teacher === "未定") return;

    const parsed = parseKey(key);
    if (!parsed) return;
    const { dIdx, pIdx, cIdx } = parsed;
    const date = config.dates?.[dIdx];
    const className = config.classes?.[cIdx];
    if (!date || !className) return;

    const group = findCombinedGroup(combinedGroups, entry.subject, className, date);
    if (group) {
      const countKey = `${dIdx}-${pIdx}-${group.id}-${entry.teacher}`;
      if (counted.has(countKey)) return;
      counted.add(countKey);
    }

    if (!totals[entry.teacher]) totals[entry.teacher] = 0;
    totals[entry.teacher]++;
  });

  return totals;
}

// --- 旧形式の検出 ---
export const isLegacyKey = (key) => {
  // 新形式は "d数字-p数字-c数字" のパターン
  return !(/^d\d+-p\d+-c\d+$/.test(key));
};

// --- マイグレーション ---

// 旧形式のスケジュールキーをインデックスベースに変換
export function migrateScheduleKeys(schedule, config) {
  const hasLegacy = Object.keys(schedule).some(isLegacyKey);
  if (!hasLegacy) return schedule;

  const newSchedule = {};
  Object.keys(schedule).forEach(oldKey => {
    if (!isLegacyKey(oldKey)) {
      // 既に新形式
      newSchedule[oldKey] = schedule[oldKey];
      return;
    }

    // 旧形式: "日付-時限-クラス" → インデックスを探す
    // 旧キーは「日付-時限-クラス」だが、日付・時限・クラスの文字列自体に "-" を含む可能性がある
    // そのため、既知の config 値からマッチングを行う
    let matched = false;
    for (let dIdx = 0; dIdx < config.dates.length; dIdx++) {
      const d = config.dates[dIdx];
      if (!oldKey.startsWith(d + '-')) continue;
      const rest1 = oldKey.substring(d.length + 1);
      for (let pIdx = 0; pIdx < config.periods.length; pIdx++) {
        const p = config.periods[pIdx];
        if (!rest1.startsWith(p + '-')) continue;
        const rest2 = rest1.substring(p.length + 1);
        const cIdx = config.classes.indexOf(rest2);
        if (cIdx >= 0) {
          newSchedule[makeKey(dIdx, pIdx, cIdx)] = schedule[oldKey];
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      // マッチしなかった場合は破棄（config が変わっていて対応するスロットがない）
      console.warn('Migration: could not map legacy key:', oldKey);
    }
  });

  return newSchedule;
}

// 旧形式の NG スロットキーをマイグレーション（NG は文字列ベースのまま維持するので変換不要）

// プロジェクト全体のマイグレーション
export function migrateProject(project) {
  if (!project) return project;

  let result = project;

  // version が 2 未満なら旧形式からマイグレーション
  if (!project.version || project.version < 2) {
    const migratedTabs = project.tabs.map(tab => ({
      ...tab,
      schedule: migrateScheduleKeys(tab.schedule, tab.config),
    }));

    result = {
      ...project,
      version: 2,
      name: project.name || "",
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: migratedTabs,
    };
  }

  // subjectColors が未設定の場合はデフォルト値を追加
  if (!result.subjectColors) {
    result = { ...result, subjectColors: {} };
  }

  // subjects が未設定の場合は subjectCounts のキーから生成
  if (!result.subjects) {
    const firstTab = result.tabs[0];
    const subjects = firstTab ? Object.keys(firstTab.config.subjectCounts) : [];
    result = { ...result, subjects };
  }

  // combinedGroups が未設定の場合は空配列で初期化
  if (!result.combinedGroups) {
    result = { ...result, combinedGroups: [] };
  }

  return result;
}
