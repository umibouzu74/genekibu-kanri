import { parseKey } from './scheduleKey';
import type { Entity, Project, Teacher } from '../types';

// --- デフォルト講師データ ---
export const DEFAULT_INITIAL_TEACHERS: Teacher[] = [
  { name: "堀上", subjects: ["英語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "石原", subjects: ["英語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "高松", subjects: ["英語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "南條", subjects: ["英語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "片岡", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "半田", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "香川", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "江本", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "河野", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "杉原", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "奥村", subjects: ["数学"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "小松", subjects: ["国語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "松川", subjects: ["国語"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "三宮", subjects: ["理科"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "滝澤", subjects: ["理科"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "井上", subjects: ["社会"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "野口", subjects: ["社会"], ngSlots: [], ngClasses: [], priorityClasses: [] },
  { name: "未定", subjects: ["英語", "数学", "国語", "理科", "社会"], ngSlots: [], ngClasses: [], priorityClasses: [] }
];

// --- デフォルト科目マスタ ---
export const DEFAULT_SUBJECTS: string[] = ["英語", "数学", "国語", "理科", "社会"];

// --- デフォルト日付 / 時限 (v4: プロジェクト共通) ---
// v4 で dates / periods は tab 単位から project 単位へ昇格した (全タブ共通の
// 講習カレンダー)。ID は project-global な 1 始まり incremental。
export const DEFAULT_PROJECT_DATES: Entity[] = [
  { id: 1, label: "12/25(木)" },
  { id: 2, label: "12/26(金)" },
  { id: 3, label: "12/27(土)" },
  { id: 4, label: "1/4(日)" },
  { id: 5, label: "1/6(火)" },
  { id: 6, label: "1/7(水)" },
];
export const DEFAULT_PROJECT_PERIODS: Entity[] = [
  { id: 1, label: "1限 (13:00~)" },
  { id: 2, label: "2限 (14:10~)" },
  { id: 3, label: "3限 (15:20~)" },
];

// --- デフォルトタブ設定 ---
// v3: dates / periods / classes は { id, label } の object 配列。
// ID は tab-local の 1 始まり incremental。
// 注: v4 では dates / periods は project 側 (DEFAULT_PROJECT_DATES/PERIODS) が
// 正となり、createNewProject が tab.config から strip して project へ hoist する。
// ここに残すのは v2/v3 互換 (旧 user-defaults の wrap 経路) と単体テスト用途。
export const DEFAULT_TAB_CONFIG_BASE = {
  dates: DEFAULT_PROJECT_DATES,
  periods: DEFAULT_PROJECT_PERIODS,
  classes: [
    { id: 1, label: "３S" },
    { id: 2, label: "３A" },
    { id: 3, label: "３B" },
    { id: 4, label: "３C" },
  ],
  subjectCounts: { "英語": 4, "数学": 4, "国語": 3, "理科": 4, "社会": 3 }
};

// --- localStorage キー ---
// 親アプリ (genyakubu-manager) の LocalStorage と衝突しないよう
// `builder.` で namespace している。旧スタンドアロン版の
// `schedule_project` / `winter_schedule_project_v45` も読み込み互換のため
// 残してあり、見つかれば新キーへ移行する。
export const STORAGE_KEY_PROJECT = 'builder.schedule_project';
export const STORAGE_KEY_USER_DEFAULTS = 'builder.schedule_user_defaults';
// 読込失敗 (JSON 壊れ / 構造不正 / migration throw) 時に元データを退避する
// 先 (F2f)。デフォルトへフォールバック後の最初の autosave が
// STORAGE_KEY_PROJECT を上書きしても、こちらに原本が残り手動復旧できる。
export const STORAGE_KEY_PROJECT_BACKUP = 'builder.schedule_project_corrupt';
// 初回オンボーディングを表示済みかの 1 bit flag。値の存在 ('1') のみを見る
// ので UI を学習・自動変形するものではない (CLAUDE.md の禁止事項に抵触しない)。
export const STORAGE_KEY_ONBOARDING_SEEN = 'builder.onboarding_seen';
// 年度間コピー用のテンプレート保存先 (E2d)。ユーザが明示的に保存した
// プロジェクトのスナップショット配列。自動学習・自動変形ではない。
export const STORAGE_KEY_TEMPLATES = 'builder.templates';

// 旧キー（互換性のため読み込み時に参照）
export const LEGACY_STORAGE_KEYS = [
  'schedule_project',
  'winter_schedule_project_v45',
];

// --- 科目カラー ---
export const DEFAULT_SUBJECT_COLORS: Record<string, string> = {
  "英語": "#DBEAFE",  // 青系
  "数学": "#FEE2E2",  // 赤系
  "国語": "#FEF3C7",  // 黄系
  "理科": "#D1FAE5",  // 緑系
  "社会": "#EDE9FE",  // 紫系
};

// カラーパレット（設定画面で選択可能な色）
export const SUBJECT_COLOR_PALETTE = [
  { label: "青系", value: "#DBEAFE" },
  { label: "赤系", value: "#FEE2E2" },
  { label: "黄系", value: "#FEF3C7" },
  { label: "緑系", value: "#D1FAE5" },
  { label: "紫系", value: "#EDE9FE" },
  { label: "ピンク系", value: "#FCE7F3" },
  { label: "インディゴ系", value: "#E0E7FF" },
  { label: "ティール系", value: "#CCFBF1" },
  { label: "オレンジ系", value: "#FFEDD5" },
  { label: "ライム系", value: "#ECFCCB" },
];

// 違反セル (講師重複 / NG 違反) の背景色。inline style で使うため hex で持つ
// (Tailwind の builder-danger-soft は淡すぎて科目カラーと区別しづらい)。
export const CONFLICT_CELL_BG = '#FECACA';

export const getSubjectColor = (
  subject: string | null | undefined,
  subjectColors?: Record<string, string> | null,
): string | null => {
  if (!subject) return null;
  if (subjectColors && subjectColors[subject]) return subjectColors[subject];
  if (DEFAULT_SUBJECT_COLORS[subject]) return DEFAULT_SUBJECT_COLORS[subject];
  // 未登録科目はハッシュベースでフォールバック
  const fallbackColors = SUBJECT_COLOR_PALETTE.map(c => c.value);
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash += subject.charCodeAt(i);
  return fallbackColors[hash % fallbackColors.length];
};

// --- 丸数字変換 ---
export const toCircleNum = (num: number): string => {
  const circles = ["0", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return circles[num] || `(${num})`;
};

// --- 自動生成パラメータ (E2e) ---
// 実体は utils/generationParams.js (無依存モジュール、F5d で切り出し)。
// migrateProject (scheduleKey.js) が clamp を使うため、constants.js に置くと
// 循環 import になる。既存の import 元互換のためここから再エクスポートする。
export {
  DEFAULT_NUM_PATTERNS,
  DEFAULT_MAX_DAILY_HOURS,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MAX_CONSECUTIVE_PERIODS,
  GENERATION_PARAM_BOUNDS,
  clampGenerationParam,
  resolveGenerationParams,
} from './generationParams';

// --- プロジェクトバージョン ---
// v4: dates / periods を tab.config から project レベルへ昇格 (全タブ共通)。
export const CURRENT_PROJECT_VERSION = 4;

// --- スケジュールのクリーンアップ ---
// v3: dates/periods/classes は { id, label } で、key は ID ベース。
// config から消滅した ID を参照する schedule entry を破棄する。
//
// E4a: 旧実装は全 (dates × periods × classes) を展開して validKey Set を
// 作っていた (O(D×P×C + K))。既存 schedule キーを走査して entity の存在を
// 直接判定する方式に反転し O(D+P+C + K) に。挙動は等価 (有効キー =
// date/period/class が全て config に存在)。
export const cleanSchedule = (proj: Project): Project => {
  // v4: dates / periods は project 共通。classes のみ tab 単位。
  const dateIds = new Set((proj.dates || []).map(d => d.id));
  const periodIds = new Set((proj.periods || []).map(p => p.id));
  const newTabs = proj.tabs.map(tab => {
    const classIds = new Set(tab.config.classes.map(c => c.id));
    const newSch: typeof tab.schedule = {};
    Object.keys(tab.schedule).forEach(k => {
      const p = parseKey(k);
      if (p && dateIds.has(p.dateId) && periodIds.has(p.periodId) && classIds.has(p.classId)) {
        newSch[k] = tab.schedule[k];
      }
    });
    return { ...tab, schedule: newSch };
  });
  return { ...proj, tabs: newTabs };
};
