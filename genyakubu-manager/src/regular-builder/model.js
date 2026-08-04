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

// ─── 本校 / 亀井町 の表示分割 ───────────────────────────────────────
// 亀井町校舎の教室は「亀◯◯」。取込 (importTimetable) と曜日ビューの
// 表示分割の両方で使う建物判定。

export const isAnnexRoom = (room) => /^亀/.test((room || "").trim());

/**
 * クラス列の建物判定。セルの実効教室 (cell.room || cls.room) の多数決で
 * 決め、セルが無い (または教室不明の) 列は既定教室で判定する。同数も
 * 既定教室に倒す。実データには列の既定教室と実コマの教室 (セル上書き) が
 * 食い違う列があるため、既定教室だけでは判定しない。
 * @returns {"main" | "annex"}
 */
export function classCampus(tab, cls) {
  let annex = 0;
  let main = 0;
  for (const [key, cell] of Object.entries(tab.schedule || {})) {
    if (parseCellKey(key).classId !== cls.id) continue;
    const room = (cell.room || "").trim() || (cls.room || "").trim();
    if (!room) continue;
    if (isAnnexRoom(room)) annex++;
    else main++;
  }
  if (annex !== main) return annex > main ? "annex" : "main";
  return isAnnexRoom(cls.room) ? "annex" : "main";
}

// タブの時限を「渡したクラス列のセルが実際に使っている時限」に絞る。
// 1 つも無い場合 (セル未入力の建物側など) は全時限のまま返す。
function usedPeriodIds(tab, classes) {
  const clsIds = new Set(classes.map((c) => c.id));
  const used = new Set();
  for (const key of Object.keys(tab.schedule || {})) {
    const { periodId, classId } = parseCellKey(key);
    if (clsIds.has(classId)) used.add(periodId);
  }
  const ids = (tab.periodIds || []).filter((id) => used.has(id));
  return ids.length ? ids : tab.periodIds || [];
}

/**
 * 表示用にタブを本校 / 亀井町のクラス列で分割する。両方の建物のクラス列を
 * 持つタブだけ 2 つの仮想タブになり、時限もそれぞれの建物のセルが使う
 * ものに絞られる (時刻体系の違う建物同士で空行・空きマスが乱立しない)。
 * tab.id / classId / schedule は元のまま — セル編集・D&D 入替・重複
 * チェックの参照 (`tabId:cellKey`) はそのまま機能する表示専用の変形。
 * 全タブに campus ("main" | "annex") を注釈する。
 */
export function splitTabsByCampus(tabs) {
  return tabs.flatMap((t) => {
    const main = [];
    const annex = [];
    for (const c of t.classes || []) {
      (classCampus(t, c) === "annex" ? annex : main).push(c);
    }
    if (main.length === 0 || annex.length === 0) {
      return [{ ...t, campus: annex.length ? "annex" : "main" }];
    }
    return [
      { ...t, campus: "main", classes: main, periodIds: usedPeriodIds(t, main) },
      {
        ...t,
        campus: "annex",
        classes: annex,
        periodIds: usedPeriodIds(t, annex),
        // 手動グループも建物で分ける (同名のままだと同じセクションに
        // 戻ってしまい分割の意味がなくなる)
        group: t.group ? `${t.group}（亀井町）` : "",
      },
    ];
  });
}

// ─── セクション分け (曜日ビューの表の単位) ──────────────────────────
// ダッシュボードの時間割ビューと同じく、曜日ビューは「時間軸を共有する
// 学年のまとまり」ごとに別テーブルにする。
// - tab.group (手動のグループ名) があればその名前でまとめる
// - 未設定の学年は「時限セットが包含関係 (⊆) にある学年」を推移的に
//   自動で同じセクションへ。中1 ⊆ 中3 のような「同じ時間割系で一部の
//   時限だけ使う」関係はまとまり、高校の講座のように時刻がばらつく中で
//   たまたま 1 コマ重なるだけの学年 (本校と亀井町など) は併合しない
//   (「1 つでも共有で併合」は実データで無関係な学年を巻き込んだ)
// 並びはタブの定義順 (各セクションの先頭タブの位置)。

/**
 * @param {{splitCampus?: boolean}} [opts]
 *   splitCampus: 本校と亀井町 (教室「亀◯◯」) のクラス列を別セクションに
 *   分けて表示する (splitTabsByCampus)。自動クラスタリングも建物を跨いで
 *   併合しない。
 * @returns {{key: string, name: string, auto: boolean, tabs: object[]}[]}
 */
export function computeSections(project, day, { splitCampus = false } = {}) {
  let dayTabs = (project.tabs || []).filter(
    (t) =>
      (t.days || []).includes(day) &&
      (t.classes || []).length > 0 &&
      (t.periodIds || []).length > 0
  );
  if (splitCampus) dayTabs = splitTabsByCampus(dayTabs);
  // 両建物が存在する日だけ自動セクション名に（本校）/（亀井町）を付ける
  // (亀井町の無いプロジェクトで「（本校）」だけが並ぶのはノイズ)
  const labelCampus =
    splitCampus &&
    dayTabs.some((t) => t.campus === "annex") &&
    dayTabs.some((t) => t.campus === "main");

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

  // 時限セットが包含関係の学年を推移的にまとめる (小規模なので単純マージで
  // 十分)。大きいセットの学年が複数クラスタを橋渡しすることもある
  const isSubset = (a, b) => [...a].every((id) => b.has(id));
  const clusters = []; // {ids: Set<periodId>, tabs: [], campus}
  for (const t of autoTabs) {
    const mine = new Set(t.periodIds || []);
    // splitCampus 時は建物を跨いで併合しない (亀井町の時限セットが本校を
    // 包含していても別セクションのまま)。splitCampus off では campus は
    // 全タブ undefined なので従来どおり
    const hit = clusters.filter(
      (c) =>
        c.campus === t.campus && (isSubset(mine, c.ids) || isSubset(c.ids, mine))
    );
    if (hit.length === 0) {
      clusters.push({ ids: new Set(t.periodIds), tabs: [t], campus: t.campus });
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
      // 分割された本校側と亀井町側はタブ id が同じになるため、key に建物を
      // 含めて衝突を避ける (React key・折りたたみ状態のキーに使われる)
      key: `a:${c.tabs.map((t) => t.id).sort((x, y) => x - y).join("-")}${
        c.campus === "annex" ? ":亀" : ""
      }`,
      name: "",
      auto: true,
      campus: c.campus,
      tabs: c.tabs,
    })),
  ];
  for (const s of sections) {
    s.tabs.sort((a, b) => order.get(a.id) - order.get(b.id));
    if (s.auto) {
      s.name = s.tabs.map((t) => t.name).join("・");
      if (labelCampus) {
        s.name += s.campus === "annex" ? "（亀井町）" : "（本校）";
      }
    }
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
