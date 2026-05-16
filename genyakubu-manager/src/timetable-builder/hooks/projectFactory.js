import {
  DEFAULT_INITIAL_TEACHERS,
  DEFAULT_TAB_CONFIG_BASE,
  DEFAULT_SUBJECTS,
  DEFAULT_SUBJECT_COLORS,
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_USER_DEFAULTS,
  LEGACY_STORAGE_KEYS,
  CURRENT_PROJECT_VERSION,
} from '../utils/constants';
import { migrateProject } from '../utils/scheduleKey';

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

export function createNewProject(tabs, teachers, subjectColors, subjects) {
  return {
    version: CURRENT_PROJECT_VERSION,
    name: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    teachers: teachers || DEFAULT_INITIAL_TEACHERS,
    activeTabId: tabs[0]?.id || 1,
    tabs,
    subjects: subjects || [...DEFAULT_SUBJECTS],
    subjectColors: subjectColors || { ...DEFAULT_SUBJECT_COLORS },
    combinedGroups: [],
    externalCounts: {},
  };
}

// localStorage から初期プロジェクトを復元、なければデフォルトを返す。
// 旧キーが見つかったら新キーへ移行する。読み込み失敗は console.error して
// デフォルトで起動する (壊れたデータで blank screen にしないため)。
export function loadInitialProject() {
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
      return migrateProject(parsed);
    }

    const savedDefaults = localStorage.getItem(STORAGE_KEY_USER_DEFAULTS);
    const legacyDefaults = !savedDefaults
      ? localStorage.getItem('schedule_user_defaults') ||
        localStorage.getItem('winter_schedule_user_defaults')
      : null;
    const defaultsStr = savedDefaults || legacyDefaults;
    if (defaultsStr) {
      const defaults = JSON.parse(defaultsStr);
      return createNewProject(
        [{ id: 1, name: "メイン", config: defaults.config || DEFAULT_TAB_CONFIG_BASE, schedule: {} }],
        defaults.teachers || DEFAULT_INITIAL_TEACHERS,
      );
    }
  } catch (e) { console.error("Load failed", e); }

  return createNewProject([
    {
      id: 1,
      name: "中３",
      config: { ...DEFAULT_TAB_CONFIG_BASE, classes: ["３S", "３A", "３B", "３C"] },
      schedule: {}
    },
    {
      id: 2,
      name: "中１・２",
      config: { ...DEFAULT_TAB_CONFIG_BASE, classes: ["１S", "１AB", "１附属", "２S", "２AB", "２C", "２附属"] },
      schedule: {}
    }
  ]);
}
