import {
  DEFAULT_INITIAL_TEACHERS,
  DEFAULT_TAB_CONFIG_BASE,
  DEFAULT_PROJECT_DATES,
  DEFAULT_PROJECT_PERIODS,
  DEFAULT_SUBJECTS,
  DEFAULT_SUBJECT_COLORS,
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_PROJECT_BACKUP,
  STORAGE_KEY_USER_DEFAULTS,
  LEGACY_STORAGE_KEYS,
  CURRENT_PROJECT_VERSION,
} from '../utils/constants';
import { migrateProject } from '../utils/scheduleKey';
import { validateProjectShape } from '../utils/projectSchema';
import { GENERATION_PARAM_BOUNDS } from '../utils/generationParams';
import type { Entity, Project, Teacher } from '../types';

// user defaults から復元してよい生成パラメータのホワイトリスト (N1e)。
const GENERATION_PARAM_KEYS = new Set<string>(Object.keys(GENERATION_PARAM_BOUNDS));

// 講師マスタの差分を検出する。JSON 読み込み時の確認ダイアログ用。
export function detectTeacherDiffs(currentTeachers: Teacher[], loadedTeachers: Teacher[]): string[] {
  const diffs: string[] = [];
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
      // subjects 欠落の外部 JSON でも throw しないよう両側ともガードする
      // (F5b: ここが throw すると構造は valid なのに読込全体が失敗する)。
      const ctSubjects = Array.isArray(ct.subjects) ? ct.subjects : [];
      const ltSubjects = Array.isArray(lt.subjects) ? lt.subjects : [];
      const currentSubjects = [...ctSubjects].sort().join(',');
      const loadedSubjects = [...ltSubjects].sort().join(',');
      if (currentSubjects !== loadedSubjects) {
        diffs.push(`【科目変更】${lt.name}: ${ctSubjects.join('/')} → ${ltSubjects.join('/')}`);
      }
    }
  });

  return diffs;
}

// tabs は「schedule 空 + v3 互換 config」の生成用シードなので緩く受ける
export function createNewProject(
  tabs: any[],
  teachers?: Teacher[] | null,
  subjectColors?: Record<string, string> | null,
  subjects?: string[] | null,
  dates?: Entity[] | null,
  periods?: Entity[] | null,
): Project {
  // v4: dates / periods は project 共通。明示引数 > tabs[0].config > 既定 の順で
  // 解決し、各 tab.config からは strip して二重持ちを防ぐ (project が単一の正)。
  const srcDates = dates || tabs[0]?.config?.dates || DEFAULT_PROJECT_DATES;
  const srcPeriods = periods || tabs[0]?.config?.periods || DEFAULT_PROJECT_PERIODS;
  const strippedTabs = tabs.map((t: any) => {
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
export function loadInitialProject(): { project: Project; loadError: string | null } {
  let loadError: string | null = null;
  // catch 節で退避できるよう try の外で保持する (F2f)
  let savedProject: string | null = null;
  try {
    savedProject = localStorage.getItem(STORAGE_KEY_PROJECT);

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
      const isV3Shape = (arr: unknown) => Array.isArray(arr) && (arr.length === 0 || (typeof arr[0] === 'object' && arr[0] !== null && 'id' in arr[0]));
      const wrap = (arr: any[]) => isV3Shape(arr) ? arr : arr.map((label: string, i: number) => ({ id: i + 1, label }));
      const normalizedConfig = {
        ...rawConfig,
        dates: wrap(rawConfig.dates || []),
        periods: wrap(rawConfig.periods || []),
        classes: wrap(rawConfig.classes || []),
      };
      // N1e: 保存されていれば科目マスタ・科目カラーも復元する
      // (旧形式の defaults には無いので null → 既定へフォールバック)。
      const fromDefaults = createNewProject(
        [{ id: 1, name: "メイン", config: normalizedConfig, schedule: {} }],
        defaults.teachers || DEFAULT_INITIAL_TEACHERS,
        defaults.subjectColors || null,
        Array.isArray(defaults.subjects) && defaults.subjects.length > 0 ? defaults.subjects : null,
      );
      // 生成パラメータ (numPatterns 等、project 直下の optional 数値) も復元。
      // 値の妥当性は使用時に resolveGenerationParams / clamp が守るので、
      // ここでは有限数のみ通す。
      if (defaults.generationParams && typeof defaults.generationParams === 'object') {
        for (const [key, value] of Object.entries(defaults.generationParams)) {
          if (GENERATION_PARAM_KEYS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
            (fromDefaults as any)[key] = value;
          }
        }
      }
      return { project: fromDefaults, loadError: null };
    }
  } catch (e) {
    console.error("Load failed", e);
    loadError = (e as Error | null)?.message || String(e);
    // F2f: デフォルトへフォールバックすると、最初の編集の autosave が
    // STORAGE_KEY_PROJECT を上書きして元データが復旧不能になる。壊れていても
    // 原本を別キーへ退避しておけば手動復旧 (JSON 手直し → 読込) の余地が残る。
    if (savedProject) {
      try {
        localStorage.setItem(STORAGE_KEY_PROJECT_BACKUP, savedProject);
        loadError += `。元のデータは localStorage の「${STORAGE_KEY_PROJECT_BACKUP}」キーに退避しました`;
      } catch (backupError) {
        // 容量超過等で退避に失敗しても起動は続行する (原本は autosave までは残る)
        console.error("Backup of corrupt project failed", backupError);
      }
    }
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
