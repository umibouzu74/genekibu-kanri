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
//     group,                                   // セクション名の手動上書き (空 = 自動)
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

// ─── セル参照 (タブ横断) ────────────────────────────────────────────
// 曜日ビューは複数タブ (学年) のセルを 1 つの表に並べるため、タブ id を
// 含む `${tabId}:${cellKey}` を一意参照に使う (conflicts.entryRef と同形)。

export function makeCellRef(tabId, cellKey) {
  return `${tabId}:${cellKey}`;
}

export function parseCellRef(ref) {
  const s = String(ref);
  const i = s.indexOf(":");
  return { tabId: Number(s.slice(0, i)), key: s.slice(i + 1) };
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

/**
 * ref (`tabId:cellKey`) で指した 2 セルの中身を入れ替えた新しい tabs 配列を
 * 返す (純関数)。同一タブ内は swapScheduleCells に委譲。タブをまたぐ場合も
 * 片側が空セルなら移動になり、空いた側のキーは残さない。
 * 参照先のタブが見つからなければ元の配列をそのまま返す。
 */
export function swapCellsAcrossTabs(tabs, refA, refB) {
  if (refA === refB) return tabs;
  const a = parseCellRef(refA);
  const b = parseCellRef(refB);
  if (a.tabId === b.tabId) {
    return tabs.map((t) =>
      t.id === a.tabId
        ? { ...t, schedule: swapScheduleCells(t.schedule, a.key, b.key) }
        : t
    );
  }
  const tabA = tabs.find((t) => t.id === a.tabId);
  const tabB = tabs.find((t) => t.id === b.tabId);
  if (!tabA || !tabB) return tabs;
  const cellA = tabA.schedule[a.key];
  const cellB = tabB.schedule[b.key];
  const put = (schedule, key, cell) => {
    const next = { ...schedule };
    if (cell) next[key] = cell;
    else delete next[key];
    return next;
  };
  return tabs.map((t) => {
    if (t.id === a.tabId) return { ...t, schedule: put(t.schedule, a.key, cellB) };
    if (t.id === b.tabId) return { ...t, schedule: put(t.schedule, b.key, cellA) };
    return t;
  });
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
            group: str(x.group),
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

// ─── セクション分け (曜日ビューの表の単位) ──────────────────────────
// ダッシュボードの時間割ビューと同じく、曜日ビューは「時間軸を共有する
// 学年のまとまり」ごとに別テーブルにする。
// - tab.group (手動のグループ名) があればその名前でまとめる
// - 未設定の学年は「使う時限を 1 つでも共有する学年」を推移的に自動で
//   同じセクションへ (中1・中2・中3 は同居、時刻体系の違う高校部は別)
// 並びはタブの定義順 (各セクションの先頭タブの位置)。

/**
 * @returns {{key: string, name: string, auto: boolean, tabs: object[]}[]}
 */
export function computeSections(project, day) {
  const dayTabs = (project.tabs || []).filter(
    (t) =>
      (t.days || []).includes(day) &&
      (t.classes || []).length > 0 &&
      (t.periodIds || []).length > 0
  );

  const manual = new Map(); // グループ名 → tabs
  const autoTabs = [];
  for (const t of dayTabs) {
    const g = (t.group || "").trim();
    if (g) {
      if (!manual.has(g)) manual.set(g, []);
      manual.get(g).push(t);
    } else {
      autoTabs.push(t);
    }
  }

  // 時限を共有する学年を推移的にまとめる (小規模なので単純マージで十分)
  const clusters = []; // {ids: Set<periodId>, tabs: []}
  for (const t of autoTabs) {
    const hit = clusters.filter((c) => (t.periodIds || []).some((id) => c.ids.has(id)));
    if (hit.length === 0) {
      clusters.push({ ids: new Set(t.periodIds), tabs: [t] });
    } else {
      const base = hit[0];
      base.tabs.push(t);
      for (const id of t.periodIds) base.ids.add(id);
      for (const c of hit.slice(1)) {
        base.tabs.push(...c.tabs);
        for (const id of c.ids) base.ids.add(id);
        clusters.splice(clusters.indexOf(c), 1);
      }
    }
  }

  const order = new Map((project.tabs || []).map((t, i) => [t.id, i]));
  const sections = [
    ...[...manual.entries()].map(([name, tabs]) => ({
      key: `g:${name}`,
      name,
      auto: false,
      tabs,
    })),
    ...clusters.map((c) => ({
      key: `a:${c.tabs.map((t) => t.id).sort((x, y) => x - y).join("-")}`,
      name: "",
      auto: true,
      tabs: c.tabs,
    })),
  ];
  for (const s of sections) {
    s.tabs.sort((a, b) => order.get(a.id) - order.get(b.id));
    if (s.auto) s.name = s.tabs.map((t) => t.name).join("・");
  }
  sections.sort((a, b) => order.get(a.tabs[0].id) - order.get(b.tabs[0].id));
  return sections;
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
