// ─── 通常時間割作成 (regular-builder) のドメインモデル ──────────────
// 講習時間割作成 (timetable-builder) の操作感を「曜日 × 時限 × クラス」の
// 通常時間割向けに再構成した専用サブシステム。講習版とはデータモデル・
// 保存先とも独立で、互いに影響しない。
//
// RegularProject = {
//   version: 1,
//   name: string,                 // 例 "2026 後期"
//   periods:  [{ id, label, time }],          // 時限プール (時刻付き, 全タブ共通)
//   subjects: string[],                        // 科目マスタ
//   teachers: [{ name }],                      // 講師マスタ
//   tabs: [{
//     id, name, grade,                         // grade は反映時の slot.grade
//     classes: [{ id, label, room }],          // room はクラス既定教室 (セルで上書き可)
//     days: string[],                          // 使う曜日 ("月".."日")
//     periodIds: number[],                     // 使う時限 (periods プールの id)
//     schedule: { [cellKey]: Cell },           // cellKey = `${day}|${periodId}|${classId}`
//   }],
// }
// Cell = { subj?, teacher?, room?, note? }     // teacher は "·" 区切りで複数可

export const REGULAR_DAYS = ["月", "火", "水", "木", "金", "土", "日"];

export const DEFAULT_SUBJECTS = ["英語", "数学", "国語", "理科", "社会"];

export function createDefaultProject() {
  return {
    version: 1,
    name: "新しい通常時間割",
    periods: [],
    subjects: [...DEFAULT_SUBJECTS],
    teachers: [],
    tabs: [],
  };
}

// ─── ワークスペース (複数プロジェクト) ──────────────────────────────
// 「2026 1学期」「2026 2学期」のように複数の時間割案を並行して持てる
// ように、保存単位はプロジェクト配列 + アクティブ id のワークスペース。
// RegularWorkspace = { version: 2, activeProjectId, projects: [{id, ...RegularProject}] }

export function createDefaultWorkspace() {
  return {
    version: 2,
    activeProjectId: 1,
    projects: [{ id: 1, ...createDefaultProject() }],
  };
}

// ─── セルキー ───────────────────────────────────────────────────────
// 区切りに "|" を使う (曜日は 1 文字、id は数値なので衝突しない)。

export function makeCellKey(day, periodId, classId) {
  return `${day}|${periodId}|${classId}`;
}

export function parseCellKey(key) {
  const [day, periodId, classId] = String(key).split("|");
  return { day, periodId: Number(periodId), classId: Number(classId) };
}

// ─── セル入替 (D&D スワップ) ────────────────────────────────────────

/**
 * schedule マップの 2 セルの中身を入れ替えた新しいマップを返す (純関数)。
 * 片側が空セル (キーなし) なら実質「移動」になり、空いた側のキーは残さない。
 */
export function swapScheduleCells(schedule, keyA, keyB) {
  if (keyA === keyB) return schedule;
  const next = { ...schedule };
  const a = schedule[keyA];
  const b = schedule[keyB];
  if (b) next[keyA] = b;
  else delete next[keyA];
  if (a) next[keyB] = a;
  else delete next[keyB];
  return next;
}

// ─── サニタイズ (useSyncedStorage の migrate 用) ────────────────────
// 同期で壊れたペイロードが来ても UI が落ちないよう、最低限の形に整える。
// 解釈不能なら null を返し、呼び出し側で「直前の値を保持」に倒す。

const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
const numOr = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

function sanitizeCell(raw) {
  if (!raw || typeof raw !== "object") return null;
  const cell = {};
  if (str(raw.subj)) cell.subj = str(raw.subj);
  if (str(raw.teacher)) cell.teacher = str(raw.teacher);
  if (str(raw.room)) cell.room = str(raw.room);
  if (str(raw.note)) cell.note = str(raw.note);
  return Object.keys(cell).length ? cell : null;
}

export function sanitizeProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const base = createDefaultProject();
  const p = {
    ...base,
    version: 1,
    name: str(raw.name, base.name),
  };
  p.periods = Array.isArray(raw.periods)
    ? raw.periods
        .filter((x) => x && typeof x === "object")
        .map((x, i) => ({
          id: numOr(x.id, i + 1),
          label: str(x.label),
          time: str(x.time),
        }))
    : [];
  p.subjects = Array.isArray(raw.subjects)
    ? raw.subjects.map((s) => str(s)).filter(Boolean)
    : [...DEFAULT_SUBJECTS];
  p.teachers = Array.isArray(raw.teachers)
    ? raw.teachers
        .map((t) => ({ name: str(t?.name) }))
        .filter((t) => t.name)
    : [];
  // 承認済みの重なり (conflicts.conflictKey の配列)。任意フィールド
  if (Array.isArray(raw.approvedConflicts)) {
    p.approvedConflicts = raw.approvedConflicts.map((s) => str(s)).filter(Boolean);
  }
  p.tabs = Array.isArray(raw.tabs)
    ? raw.tabs
        .filter((x) => x && typeof x === "object")
        .map((x, i) => {
          const tab = {
            id: numOr(x.id, i + 1),
            name: str(x.name, `タブ${i + 1}`),
            grade: str(x.grade),
            classes: Array.isArray(x.classes)
              ? x.classes
                  .filter((c) => c && typeof c === "object")
                  .map((c, j) => ({
                    id: numOr(c.id, j + 1),
                    label: str(c.label),
                    room: str(c.room),
                  }))
              : [],
            days: Array.isArray(x.days)
              ? x.days.filter((d) => REGULAR_DAYS.includes(d))
              : [],
            periodIds: Array.isArray(x.periodIds)
              ? x.periodIds.map((n) => numOr(n, null)).filter((n) => n != null)
              : [],
            schedule: {},
          };
          if (x.schedule && typeof x.schedule === "object") {
            for (const [key, cellRaw] of Object.entries(x.schedule)) {
              const cell = sanitizeCell(cellRaw);
              if (cell) tab.schedule[key] = cell;
            }
          }
          return tab;
        })
    : [];
  return p;
}

/**
 * ワークスペースのサニタイズ (useSyncedStorage の migrate 用)。
 * v1 の単一プロジェクト形状 (top-level に tabs がある) は 1 プロジェクトの
 * ワークスペースに包んで引き継ぐ。解釈不能なら null。
 */
export function sanitizeWorkspace(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw.tabs)) {
    const p = sanitizeProject(raw);
    if (!p) return null;
    return { version: 2, activeProjectId: 1, projects: [{ id: 1, ...p }] };
  }
  if (!Array.isArray(raw.projects)) return null;
  const projects = raw.projects
    .map((x, i) => {
      const p = sanitizeProject(x);
      return p ? { id: numOr(x?.id, i + 1), ...p } : null;
    })
    .filter(Boolean);
  if (projects.length === 0) return null;
  const activeProjectId = projects.some((p) => p.id === raw.activeProjectId)
    ? raw.activeProjectId
    : projects[0].id;
  return { version: 2, activeProjectId, projects };
}

// ─── 参照ヘルパ ─────────────────────────────────────────────────────

export function findPeriod(project, periodId) {
  return project.periods.find((p) => p.id === periodId) || null;
}

/** タブで使う時限を periods プールの並び順で返す */
export function tabPeriods(project, tab) {
  const use = new Set(tab.periodIds || []);
  return project.periods.filter((p) => use.has(p.id));
}

/**
 * タブの全セルを「解決済みエントリ」に展開する。存在しない時限/クラス/
 * 曜日を指すセル (設定変更後の残骸) は落とす。
 * @returns {{tab, day, period, cls, cell, key}[]}
 */
export function resolveTabEntries(project, tab) {
  const out = [];
  const dayset = new Set(tab.days || []);
  const periodById = new Map(project.periods.map((p) => [p.id, p]));
  const useP = new Set(tab.periodIds || []);
  const classById = new Map((tab.classes || []).map((c) => [c.id, c]));
  for (const [key, cell] of Object.entries(tab.schedule || {})) {
    const { day, periodId, classId } = parseCellKey(key);
    if (!dayset.has(day)) continue;
    if (!useP.has(periodId)) continue;
    const period = periodById.get(periodId);
    const cls = classById.get(classId);
    if (!period || !cls) continue;
    out.push({ tab, day, period, cls, cell, key });
  }
  return out;
}

/** プロジェクト全体の解決済みエントリ (衝突チェック・反映の共通入口) */
export function resolveAllEntries(project) {
  return (project.tabs || []).flatMap((tab) => resolveTabEntries(project, tab));
}

/** セルの実効教室 (セル上書き → クラス既定の順) */
export function effectiveRoom(entry) {
  return (entry.cell.room || "").trim() || (entry.cls.room || "").trim();
}
