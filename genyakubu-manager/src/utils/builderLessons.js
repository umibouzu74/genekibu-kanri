// ─── 講習時間割 (timetable-builder) → 個人月間スケジュール反映 ─────
// 講習時間割作成の project (Firebase RTDB `appData/builder/schedule_project`
// に JSON 文字列で同期、E6a) を親アプリ側で読み取り専用に解釈し、
// MonthView に「講」バッジ付きの日付指定コマ (KoshuLesson、types.d.ts 参照)
// として載せるためのヘルパ群。正は常に builder 側で、親アプリは一切
// 書き戻さない (購読は hooks/useBuilderProject)。
//
// - parseBuilderProject:      RTDB / LocalStorage の生ペイロード → Project
// - resolveDateLabelYmd:      日付ラベル "M/D(曜)" → "YYYY-MM-DD" (年の推定)
// - buildKoshuLessons:        Project → KoshuLesson[] (実日付・講師名に展開)
// - indexKoshuLessonsByDate:  MonthView 用の日付索引 (extraLessons と同型)
//
// 対象は各タブの講習コマ (schedule) のみ。externalSessions (予備校・高校等の
// 他学年セッション) は親アプリ側に通常コマとして既に存在する予定の重複登録
// なので反映しない。

import { newerSchemaVersion } from "../timetable-builder/utils/projectSync";
import { validateProjectShape } from "../timetable-builder/utils/projectSchema";
import {
  effectiveConfigForTab,
  migrateProject,
  parseKey,
} from "../timetable-builder/utils/scheduleKey";
import { cleanSchedule } from "../timetable-builder/utils/constants";
import {
  formatHHmm,
  getPeriodTimeRange,
} from "../timetable-builder/utils/timeRange";

// RTDB / LocalStorage の生値 (project の JSON 文字列) を Project に解釈する。
// 判定は builder の projectSync.decideRemoteProject と同系だが、こちらは
// ローカル project との比較 (identical / apply) が無い読み取り専用なので、
// 「解釈できたら返す・できなければ null」に単純化している。
//   - このクライアントより新しいスキーマ version は解釈しない (null)。
//     旧アプリキャッシュで新データを誤読するより表示しない方が安全
//   - 壊れた JSON / 構造不正 / migrate throw も null (呼び出し側は直前値を保持)
export function parseBuilderProject(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  if (newerSchemaVersion(raw) != null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  // 同梱テンプレートは project 本体ではないので外す (projectSync と同じ扱い)
  const { templates: _templates, ...projectData } = parsed;
  if (!validateProjectShape(projectData).valid) return null;
  try {
    return cleanSchedule(migrateProject(projectData));
  } catch {
    return null;
  }
}

// 日付ラベル "M/D(曜)" → "YYYY-MM-DD"。ラベルは年を持たないため、基準日
// (project.updatedAt など) に最も近い年を前年・当年・翌年の 3 候補から選ぶ。
// 冬期講習の年跨ぎ (12月・1月の混在) も基準日との距離で自然に解決する
// (11月編集の "12/25" → 当年、"1/7" → 翌年。1月に編集しても "12/25" は前年)。
// M/D として解釈できない / 実在しない日付 (2/30 等) は null。
export function resolveDateLabelYmd(label, baseYmd) {
  const m = String(label ?? "").match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const bm = String(baseYmd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!bm) return null;
  const baseYear = Number(bm[1]);
  // ローカル正午基準で DST / タイムゾーン揺れを避ける (dateGenerate と同じ)
  const base = new Date(baseYear, Number(bm[2]) - 1, Number(bm[3]), 12);
  let best = null;
  for (const year of [baseYear - 1, baseYear, baseYear + 1]) {
    const dt = new Date(year, month - 1, day, 12);
    // 桁あふれ (2/30、平年の 2/29 等) はその年の候補から除外
    if (dt.getMonth() !== month - 1 || dt.getDate() !== day) continue;
    const dist = Math.abs(dt.getTime() - base.getTime());
    if (!best || dist < best.dist) best = { dt, dist };
  }
  if (!best) return null;
  const mo = String(best.dt.getMonth() + 1).padStart(2, "0");
  const d = String(best.dt.getDate()).padStart(2, "0");
  return `${best.dt.getFullYear()}-${mo}-${d}`;
}

// 年推定の基準日。project の updatedAt (無ければ createdAt) を使う —
// 講習の作成・調整はシーズン近傍で行われるので、閲覧日 (today) よりも
// 「シーズン後に見返しても年がずれない」安定した錨になる。どちらも無い
// 外部 JSON だけ fallback (呼び出し側の今日) に頼る。
function projectBaseYmd(project, fallbackYmd) {
  for (const key of ["updatedAt", "createdAt"]) {
    const m = String(project?.[key] ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return typeof fallbackYmd === "string" && /^\d{4}-\d{2}-\d{2}/.test(fallbackYmd)
    ? fallbackYmd.slice(0, 10)
    : null;
}

// 時限ラベルの短表示: "1限 (13:00~13:45)" → "1限"。時刻注記の括弧
// (半角/全角) 以降を落とす (\s は全角スペース U+3000 も含む)。落とすと
// 空になるラベルはそのまま返す。
function periodShortLabel(label) {
  const s = String(label ?? "");
  const short = s.replace(/\s*[(（].*$/, "").trim();
  return short || s;
}

// project → KoshuLesson[] (日付昇順 → 時限の開始時刻順)。
// - タブの実効 config (activeDateIds / activePeriodIds で絞った日・時限) の
//   範囲だけを対象にする (タブが使わない次元に温存された非表示セルを除外)
// - teacher が空 / "未定" のセルは除外 (個人スケジュールに載せる先が無い)
// - 同じ日・時限・講師・科目の複数クラス (合同) は 1 コマにまとめ、
//   cls をクラス登録順の "/" 連結にする
export function buildKoshuLessons(project, { todayYmd } = {}) {
  if (!project || !Array.isArray(project.tabs)) return [];
  const baseYmd = projectBaseYmd(project, todayYmd);
  if (!baseYmd) return [];

  const lessons = [];
  project.tabs.forEach((tab, tabIndex) => {
    const cfg = effectiveConfigForTab(project, tab);

    const dateById = new Map();
    for (const d of cfg.dates || []) {
      const ymd = resolveDateLabelYmd(d.label, baseYmd);
      if (ymd) dateById.set(d.id, { ymd, label: d.label });
    }
    const periodById = new Map();
    (cfg.periods || []).forEach((p, index) => {
      const range = getPeriodTimeRange(p);
      const time = range
        ? range.endMin != null
          ? `${formatHHmm(range.startMin)}-${formatHHmm(range.endMin)}`
          : formatHHmm(range.startMin)
        : null;
      periodById.set(p.id, {
        short: periodShortLabel(p.label),
        time,
        // 同日内の表示順: 開始時刻 → 時限のプール順 (時刻が読めない時限は末尾)
        sortMin: range ? range.startMin : 24 * 60 + index,
        index,
      });
    });
    const classById = new Map(
      (tab.config?.classes || []).map((c, index) => [c.id, { label: c.label, index }])
    );

    const grouped = new Map();
    for (const [key, entry] of Object.entries(tab.schedule || {})) {
      if (!entry || typeof entry !== "object") continue;
      const teacher =
        typeof entry.teacher === "string" ? entry.teacher.trim() : "";
      if (!teacher || teacher === "未定") continue;
      const parsed = parseKey(key);
      if (!parsed) continue;
      const date = dateById.get(parsed.dateId);
      const period = periodById.get(parsed.periodId);
      const cls = classById.get(parsed.classId);
      if (!date || !period || !cls) continue;
      const subj = typeof entry.subject === "string" ? entry.subject : "";
      const gKey = `${parsed.dateId}|${parsed.periodId}|${teacher}|${subj}`;
      if (!grouped.has(gKey)) {
        grouped.set(gKey, {
          key: `${tab.id}:${parsed.dateId}:${parsed.periodId}:${teacher}:${subj}`,
          date,
          period,
          teacher,
          subj,
          classes: [],
        });
      }
      grouped.get(gKey).classes.push(cls);
    }

    for (const g of grouped.values()) {
      g.classes.sort((a, b) => a.index - b.index);
      lessons.push({
        key: g.key,
        date: g.date.ymd,
        dateLabel: g.date.label,
        time: g.period.time,
        periodLabel: g.period.short,
        teacher: g.teacher,
        subj: g.subj,
        grade: tab.name || "",
        cls: g.classes.map((c) => c.label).join("/"),
        tabName: tab.name || "",
        projectName: project.name || "",
        _sortMin: g.period.sortMin,
        _sortPeriod: g.period.index,
        _sortTab: tabIndex,
      });
    }
  });

  lessons.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a._sortMin - b._sortMin ||
      a._sortPeriod - b._sortPeriod ||
      a._sortTab - b._sortTab ||
      a.cls.localeCompare(b.cls, "ja")
  );
  return lessons.map(
    ({ _sortMin, _sortPeriod, _sortTab, ...lesson }) => lesson
  );
}

// 日付 → その講師の講習コマの Map (indexExtraLessonsByDate と同型)。
// 講師照合は完全一致: builder のセルは単一講師で、Slot/ExtraLesson の
// "·" 連結・note 内併記の慣習は無い (splitTeacherField の対象外)。
// teacher = null なら全講師分。buildKoshuLessons が整列済みなので
// 各日のリストもその順を保つ。
export function indexKoshuLessonsByDate(lessons, teacher = null) {
  const m = new Map();
  if (!Array.isArray(lessons)) return m;
  for (const l of lessons) {
    if (teacher != null && l.teacher !== teacher) continue;
    if (!m.has(l.date)) m.set(l.date, []);
    m.get(l.date).push(l);
  }
  return m;
}
