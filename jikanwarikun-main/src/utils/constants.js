// --- デフォルト講師データ ---
export const DEFAULT_INITIAL_TEACHERS = [
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
export const DEFAULT_SUBJECTS = ["英語", "数学", "国語", "理科", "社会"];

// --- デフォルトタブ設定 ---
export const DEFAULT_TAB_CONFIG_BASE = {
  dates: ["12/25(木)", "12/26(金)", "12/27(土)", "1/4(日)", "1/6(火)", "1/7(水)"],
  periods: ["1限 (13:00~)", "2限 (14:10~)", "3限 (15:20~)"],
  classes: ["３S", "３A", "３B", "３C"],
  subjectCounts: { "英語": 4, "数学": 4, "国語": 3, "理科": 4, "社会": 3 }
};

// --- localStorage キー ---
export const STORAGE_KEY_PROJECT = 'schedule_project';
export const STORAGE_KEY_USER_DEFAULTS = 'schedule_user_defaults';

// 旧キー（互換性のため読み込み時に参照）
export const LEGACY_STORAGE_KEYS = [
  'winter_schedule_project_v45',
];

// --- 科目カラー ---
export const DEFAULT_SUBJECT_COLORS = {
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

export const getSubjectColor = (subject, subjectColors) => {
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
export const toCircleNum = (num) => {
  const circles = ["0", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return circles[num] || `(${num})`;
};

// --- プロジェクトバージョン ---
export const CURRENT_PROJECT_VERSION = 2;

// --- スケジュールのクリーンアップ ---
export const cleanSchedule = (proj) => {
  const newTabs = proj.tabs.map(tab => {
    const newSch = {};
    const validKeys = new Set();
    tab.config.dates.forEach((_, dIdx) => {
      tab.config.periods.forEach((_, pIdx) => {
        tab.config.classes.forEach((_, cIdx) => {
          validKeys.add(`d${dIdx}-p${pIdx}-c${cIdx}`);
        });
      });
    });
    Object.keys(tab.schedule).forEach(k => {
      if (validKeys.has(k)) newSch[k] = tab.schedule[k];
    });
    return { ...tab, schedule: newSch };
  });
  return { ...proj, tabs: newTabs };
};
