import {
  DEFAULT_INITIAL_TEACHERS,
  DEFAULT_TAB_CONFIG_BASE,
  DEFAULT_PROJECT_DATES,
  DEFAULT_PROJECT_PERIODS,
  DEFAULT_SUBJECTS,
  DEFAULT_SUBJECT_COLORS,
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_USER_DEFAULTS,
  LEGACY_STORAGE_KEYS,
  CURRENT_PROJECT_VERSION,
} from '../utils/constants';
import { migrateProject } from '../utils/scheduleKey';
import { validateProjectShape } from '../utils/projectSchema';

// 講師マスタの差分を検出する。JSON 読み込み時の確認ダイアログ用。
export function detectTeacherDiffs(currentTeachers, loadedTeachers) {
  const diffs = [];
  const currentNames = new Set(currentTeachers.map(t => t.name));
  const loadedNames = new Set(loadedTeachers.map(t => t.name));

  const added = loadedTeachers.filter(t => !currentNames.has(t.name));
  if (added.length > 0) {
    diffs.push(`【追加】${added.map(t => t.name).join('、')}`);
  }

  const removed = currentTeachers.filter(t => !loadedNames.has(t.name));
  if (removed.length > 0) {
    diffs.push(`【削除】${removed.map(t => t.name).join('、')}`);
  }

  loadedTeachers.forEach(lt => {
    const ct = currentTeachers.find(t => t.name === lt.name);
    if (ct) {
      const currentSubjects = [...ct.subjects].sort().join(',');
      const loadedSubjects = [...(lt.subjects || [])].sort().join(',');
      if (currentSubjects !== loadedSubjects) {
        diffs.push(`【科目変更】${lt.name}: ${ct.subjects.join('/')} → ${lt.subjects.join('/')}`);
      }
    }
  });

  return diffs;
}

export function createNewProject(tabs, teachers, subjectColors, subjects, dates, periods) {
  // v4: dates / periods は project 共通。明示引数 > tabs[0].config > 既定 の順で
  // 解決し、各 tab.config からは strip して二重持ちを防ぐ (project が単一の正)。
  const srcDates = dates || tabs[0]?.config?.dates || DEFAULT_PROJECT_DATES;
  const srcPeriods = periods || tabs[0]?.config?.periods || DEFAULT_PROJECT_PERIODS;
  const strippedTabs = tabs.map(t => {
    const cfg = t.config || {};
    const { dates: _omitDates, periods: _omitPeriods, ...restConfig } = cfg;
    return { ...t, config: restConfig };
  });
  return {
    version: CURRENT_PROJECT_VERSION,
    name: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    teachers: teachers || DEFAULT_INITIAL_TEACHERS,
    activeTabId: strippedTabs[0]?.id || 1,
    dates: srcDates,
    periods: srcPeriods,
    tabs: strippedTabs,
    subjects: subjects || [...DEFAULT_SUBJECTS],
    subjectColors: subjectColors || { ...DEFAULT_SUBJECT_COLORS },
    combinedGroups: [],
    externalCounts: {},
    externalSessions: [],
    externalSessionPresets: [],
    snapshots: [],
  };
}

// localStorage から初期プロジェクトを復元、なければデフォルトを返す。
// 旧キーが見つかったら新キーへ移行する。読み込み失敗時は console.error した
// 上で loadError 情報を併せて返し、UI 層で toast 通知する (壊れたデータで
// blank screen にしないためデフォルト project は必ず返す)。
//
// 戻り値: { project, loadError } の tuple
//   - project: 復元 or デフォルトの project
//   - loadError: 読み込み失敗時の説明文 (成功時 null)
export function loadInitialProject() {
  let loadError = null;
  try {
    let savedProject = localStorage.getItem(STORAGE_KEY_PROJECT);

    if (!savedProject) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        savedProject = localStorage.getItem(legacyKey);
        if (savedProject) {
          localStorage.setItem(STORAGE_KEY_PROJECT, savedProject);
          localStorage.removeItem(legacyKey);
          break;
        }
      }
    }

    if (savedProject) {
      const parsed = JSON.parse(savedProject);
      // 構造が致命的に壊れていたら migrate で crash する前に検出し、
      // デフォルトへフォールバックさせる (E3d)。
      const { valid, error } = validateProjectShape(parsed);
      if (!valid) {
        console.error('Invalid project shape', error);
        throw new Error(`保存データの構造が不正です: ${error}`);
      }
      return { project: migrateProject(parsed), loadError: null };
    }

    const savedDefaults = localStorage.getItem(STORAGE_KEY_USER_DEFAULTS);
    const legacyDefaults = !savedDefaults
      ? localStorage.getItem('schedule_user_defaults') ||
        localStorage.getItem('winter_schedule_user_defaults')
      : null;
    const defaultsStr = savedDefaults || legacyDefaults;
    if (defaultsStr) {
      const defaults = JSON.parse(defaultsStr);
      const rawConfig = defaults.config || DEFAULT_TAB_CONFIG_BASE;
      // v2 形式 (string 配列) で保存された user defaults を v3 形式 ({id, label})
      // に正規化する。既に v3 形式 (object 配列) なら素通し。
      const isV3Shape = (arr) => Array.isArray(arr) && (arr.length === 0 || (typeof arr[0] === 'object' && arr[0] !== null && 'id' in arr[0]));
      const wrap = (arr) => isV3Shape(arr) ? arr : arr.map((label, i) => ({ id: i + 1, label }));
      const normalizedConfig = {
        ...rawConfig,
        dates: wrap(rawConfig.dates || []),
        periods: wrap(rawConfig.periods || []),
        classes: wrap(rawConfig.classes || []),
      };
      return {
        project: createNewProject(
          [{ id: 1, name: "メイン", config: normalizedConfig, schedule: {} }],
          defaults.teachers || DEFAULT_INITIAL_TEACHERS,
        ),
        loadError: null,
      };
    }
  } catch (e) {
    console.error("Load failed", e);
    loadError = e?.message || String(e);
  }

  return {
    project: createNewProject([
      {
        id: 1,
        name: "中３",
        config: {
          ...DEFAULT_TAB_CONFIG_BASE,
          classes: [
            { id: 1, label: "３S" },
            { id: 2, label: "３A" },
            { id: 3, label: "３B" },
            { id: 4, label: "３C" },
          ],
        },
        schedule: {}
      },
      {
        id: 2,
        name: "中１・２",
        config: {
          ...DEFAULT_TAB_CONFIG_BASE,
          classes: [
            { id: 1, label: "１S" },
            { id: 2, label: "１AB" },
            { id: 3, label: "１附属" },
            { id: 4, label: "２S" },
            { id: 5, label: "２AB" },
            { id: 6, label: "２C" },
            { id: 7, label: "２附属" },
          ],
        },
        schedule: {}
      }
    ]),
    loadError,
  };
}
