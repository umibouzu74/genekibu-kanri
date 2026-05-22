// スケジュールキーのユーティリティ
//
// 形式の変遷:
//   - v1 旧形式: "12/25(木)-1限 (13:00~)-３S" (ラベル結合)
//   - v2: "d0-p1-c2" (インデックスベース)
//   - v3: "d1-p2-c3" (タブごとに永続な ID ベース)
//
// 同じ "d{n}-p{n}-c{n}" の string 形式だが、v2 はインデックス、v3 は ID。
// 並び替え・追加・削除でずれない (v3) のが重要な性質。
//
// v3 schema:
//   config.dates:   [{ id: number, label: string }, ...]
//   config.periods: [{ id: number, label: string }, ...]
//   config.classes: [{ id: number, label: string }, ...]
//
// NG キー (`{dateLabel}-{periodLabel}`) と external キー
// (`{dateLabel}-{teacherName}`) はラベル基準のまま維持。タブ横断の参照と
// JSON 出力の人間可読性のため。

// --- キー生成・パース ---

export const makeKey = (dateId, periodId, classId) => `d${dateId}-p${periodId}-c${classId}`;

export const parseKey = (key) => {
  const m = key.match(/^d(\d+)-p(\d+)-c(\d+)$/);
  if (!m) return null;
  return { dateId: parseInt(m[1]), periodId: parseInt(m[2]), classId: parseInt(m[3]) };
};

// --- ID ベース config の lookup ヘルパー ---

// dates/periods/classes 配列 (entity 配列) から id 一致するものを返す。
// 見つからなければ undefined。
export function findEntityById(entities, id) {
  return entities?.find(e => e.id === id);
}

// 次に使うべき ID を計算 (max + 1、空なら 1)
export function nextId(entities) {
  if (!entities || entities.length === 0) return 1;
  return Math.max(...entities.map(e => e.id)) + 1;
}

// --- NG スロットキー ---
// NG はタブ横断で使うため、日付名・時限名ベースのまま維持
// (config 変更時にインデックスがずれる問題を避けるため)
export const makeNgKey = (date, period) => `${date}-${period}`;

// --- 外部カウントキー ---
// 講師の日別外部コマ数: "日付名-講師名"
export const makeExternalKey = (date, teacherName) => `${date}-${teacherName}`;

// --- 合同グループヘルパー ---

// 指定の科目・クラス・日付に該当する合同グループを検索
// className と date は **ラベル** (合同グループ自体はラベルで指定するため)
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
    const { dateId, periodId, classId } = parsed;
    const dateEnt = findEntityById(config.dates, dateId);
    const classEnt = findEntityById(config.classes, classId);
    if (!dateEnt || !classEnt) return;

    const group = findCombinedGroup(combinedGroups, entry.subject, classEnt.label, dateEnt.label);
    if (group) {
      const countKey = `${dateId}-${periodId}-${group.id}-${entry.teacher}`;
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

// --- v1 → v2 マイグレーション (旧 string 結合形式 → インデックスベース) ---

export function migrateScheduleKeys(schedule, config) {
  const hasLegacy = Object.keys(schedule).some(isLegacyKey);
  if (!hasLegacy) return schedule;

  const newSchedule = {};
  Object.keys(schedule).forEach(oldKey => {
    if (!isLegacyKey(oldKey)) {
      newSchedule[oldKey] = schedule[oldKey];
      return;
    }

    // 旧形式: "日付-時限-クラス" → インデックスを探す。日本語文字列に "-" を
    // 含む可能性があるため、既知 config 値の prefix match で復元する。
    // v1 から v2 への移行 (v2 ではキーがインデックスベース) なので、ここで
    // makeKey(dIdx, pIdx, cIdx) と書いていたものはそのままインデックスで OK。
    // (v2→v3 migration が後段で ID ベースに振り直す)
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
          // v1→v2 では「インデックス」をそのままキーに埋める
          newSchedule[`d${dIdx}-p${pIdx}-c${cIdx}`] = schedule[oldKey];
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      console.warn('Migration: could not map legacy key:', oldKey);
    }
  });

  return newSchedule;
}

// --- v2 → v3 マイグレーション (インデックス → ID 永続化) ---
//
// dates/periods/classes が string[] のものを [{id, label}] に変換し、既存
// schedule キー (d{dIdx}-p{pIdx}-c{cIdx}) を新 ID キー (d{dateId}-p{periodId}-c{classId})
// に書き換える。ID はタブごとに 1 始まりの incremental。
//
// 注意: 各次元を独立に判定する (v3 と v2 が混在しても各次元で正しく処理)。
// 空配列は v3 互換とみなす (v3 schema は length 0 を許容する)。これにより
// 「片方の次元だけ空で他は v3」というケースで残りの次元を破壊しない。
export function migrateTabV2toV3(tab) {
  // entity 配列の形を判定: 空配列は v3 互換、内部が { id, label } object なら v3
  const isV3Shape = (arr) =>
    Array.isArray(arr) && (arr.length === 0 || (typeof arr[0] === 'object' && arr[0] !== null && 'id' in arr[0]));

  // 全 dimension が v3 形式 (空含む) ならそのまま返す
  if (isV3Shape(tab.config.dates) && isV3Shape(tab.config.periods) && isV3Shape(tab.config.classes)) {
    return tab;
  }

  // 次元ごとに「v3 形式 → そのまま使う」「string array → wrap」を独立判定。
  // 戻り値: { arr: 新配列, idxToId: 配列位置(0-based) → entity.id の Map }
  const normalize = (arr) => {
    if (isV3Shape(arr)) {
      return { arr, idxToId: new Map(arr.map((e, idx) => [idx, e.id])) };
    }
    const wrapped = arr.map((label, idx) => ({ id: idx + 1, label }));
    return { arr: wrapped, idxToId: new Map(wrapped.map((e, idx) => [idx, e.id])) };
  };

  const { arr: newDates, idxToId: dateMap } = normalize(tab.config.dates);
  const { arr: newPeriods, idxToId: periodMap } = normalize(tab.config.periods);
  const { arr: newClasses, idxToId: classMap } = normalize(tab.config.classes);

  // schedule キーは「v2 のインデックスベース」を前提に書き換える。
  // version < 3 のときにだけここに来るので、key の数値部分は配列位置と解釈してよい。
  // 範囲外のキーは drop (cleanSchedule 相当)。
  const newSchedule = {};
  Object.keys(tab.schedule).forEach(oldKey => {
    const m = oldKey.match(/^d(\d+)-p(\d+)-c(\d+)$/);
    if (!m) return; // 不正キー
    const dIdx = parseInt(m[1]), pIdx = parseInt(m[2]), cIdx = parseInt(m[3]);
    const dateId = dateMap.get(dIdx);
    const periodId = periodMap.get(pIdx);
    const classId = classMap.get(cIdx);
    if (dateId == null || periodId == null || classId == null) return; // 範囲外
    newSchedule[makeKey(dateId, periodId, classId)] = tab.schedule[oldKey];
  });

  return {
    ...tab,
    config: { ...tab.config, dates: newDates, periods: newPeriods, classes: newClasses },
    schedule: newSchedule,
  };
}

// プロジェクト全体のマイグレーション
export function migrateProject(project) {
  if (!project) return project;

  let result = project;

  // v1 → v2: 旧 string 結合キーをインデックスベースに変換
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

  // v2 → v3: dates/periods/classes を {id, label} に、schedule を ID キーに
  if (!result.version || result.version < 3) {
    const migratedTabs = result.tabs.map(migrateTabV2toV3);
    result = {
      ...result,
      version: 3,
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

  // externalSessions が未設定の場合は空配列で初期化 (v3 で追加された後発フィールド)
  if (!result.externalSessions) {
    result = { ...result, externalSessions: [] };
  }

  // externalSessionPresets が未設定の場合は空配列で初期化 (他学年セッション
  // 登録テンプレートの保存先、後発フィールド)
  if (!result.externalSessionPresets) {
    result = { ...result, externalSessionPresets: [] };
  }

  // 同名講師がいる場合は " (2)" / " (3)" の suffix を付けて自動で uniq 化する。
  // teacher.name は NG / 優先度 / 他学年セッション等の参照キーになるため、
  // 重複したまま load すると UI で『どちらの行を操作しているか分からない』
  // 状態になる (code-review P1)。古い projects に対する idempotent な migration。
  if (Array.isArray(result.teachers)) {
    const deduped = dedupeTeacherNames(result.teachers);
    if (deduped !== result.teachers) {
      result = { ...result, teachers: deduped };
    }
  }

  return result;
}

// 配列内の同名講師に suffix を振って衝突を解消する純粋関数。
// 戻り値が === で元と等しいなら変更無し (no-op)。
export function dedupeTeacherNames(teachers) {
  if (!Array.isArray(teachers)) return teachers;
  const seen = new Set();
  let changed = false;
  const result = teachers.map(t => {
    if (!t?.name) return t;
    if (!seen.has(t.name)) {
      seen.add(t.name);
      return t;
    }
    // 2 件目以降は " (2)" / " (3)" の suffix を試して空きを探す
    changed = true;
    let suffix = 2;
    let newName;
    do {
      newName = `${t.name} (${suffix})`;
      suffix++;
    } while (seen.has(newName));
    seen.add(newName);
    return { ...t, name: newName };
  });
  return changed ? result : teachers;
}
