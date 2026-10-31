// ─── 講習時間割 (timetable-builder) → 個人月間スケジュール反映 ─────
// 講習時間割作成の project (季節ごとに Firebase RTDB
// `appData/builder/schedule_project_<季節>` に JSON 文字列で同期、E6a) を
// 親アプリ側で読み取り専用に解釈し、
// MonthView に「講」バッジ付きの日付指定コマ (KoshuLesson、types.d.ts 参照)
// として載せるためのヘルパ群。正は常に builder 側で、親アプリは一切
// 書き戻さない (購読は hooks/useBuilderProjects。project は季節ごと)。
//
// - parseBuilderProject:      RTDB / LocalStorage の生ペイロード → Project
// - resolveDateLabelYmd:      日付ラベル "M/D(曜)" → "YYYY-MM-DD" (年の推定)
// - buildKoshuLessons:        Project → KoshuLesson[] (実日付・講師名に展開)
// - buildKoshuLessonsForSeasons: 季節ごとの project → 全季節の KoshuLesson[]
// - indexKoshuLessonsByDate:  MonthView 用の日付索引 (extraLessons と同型)
//
// 対象は各タブの講習コマ (schedule、kind="koshu") と、externalSessions
// (予備校・高校等の他学年セッション、kind="external")。後者は講習期間中の
// 講師の他部門出勤で、通常時間割 (Slot) には無い日付指定の予定のため、
// 講師別 Excel (excelExport のグレー行) と同様に個人スケジュールへ載せる。
// 種別ラベルも Excel と同じ規則: メモ (プリセット適用時はプリセット名) を
// 優先し、メモ未設定でも時刻がプリセットに一致すればその名前を表示にだけ
// 使う (computePresetMemoBackfill)。どちらも無ければ「外部」。講座名があれば
// その後ろに並べる (「Ⅰ期 予備校３限 高3 共通テスト理科基礎」、externalSessionShape)。

import { newerSchemaVersion } from "../timetable-builder/utils/projectSync";
import { validateProjectShape } from "../timetable-builder/utils/projectSchema";
import {
  effectiveConfigForTab,
  migrateProject,
  parseKey,
} from "../timetable-builder/utils/scheduleKey";
import { cleanSchedule } from "../timetable-builder/utils/constants";
import { makeSubjectOrderMarker } from "../timetable-builder/utils/analysisHelpers";
import {
  projectBaseYmd,
  resolveDateLabelYmd,
  resolveDateLabelsYmd,
  sessionDateLabels,
} from "../timetable-builder/utils/courseDates";
import { computePresetMemoBackfill } from "../timetable-builder/utils/presetMemoBackfill";
import { sessionDisplayLabel } from "../timetable-builder/utils/externalSessionShape";
import { isPublished, publishStateForTab } from "../timetable-builder/utils/publishState";
import {
  frameById,
  frameIdForDate,
  frameOfTab,
  publishStateForSessionDate,
} from "../timetable-builder/utils/frames";
import {
  formatHHmm,
  getPeriodTimeRange,
  getSessionTimeRange,
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

// 日付ラベル "M/D(曜)" → "YYYY-MM-DD" と、その年を決める基準日。講習時間割
// 作成 (出勤可能調査の調査票) と同じ日付に置くため、決まりは builder 側の
// utils/courseDates に一本化してある (年は季節ごとにまとめて決める。過去方向
// 2 倍の重み + ラベルの曜日を信じる範囲)。既存の import 先を変えないよう、
// ここから再エクスポートする。
export { resolveDateLabelYmd, resolveDateLabelsYmd, projectBaseYmd };

// 時限ラベルの短表示: "1限 (13:00~13:45)" → "1限"。時刻注記の括弧
// (半角/全角) 以降を落とす (\s は全角スペース U+3000 も含む)。落とすと
// 空になるラベルはそのまま返す。
function periodShortLabel(label) {
  const s = String(label ?? "");
  const short = s.replace(/\s*[(（].*$/, "").trim();
  return short || s;
}

// project → KoshuLesson[] (日付昇順 → 開始時刻順)。
// - タブの実効 config (activeDateIds / activePeriodIds で絞った日・時限) の
//   範囲だけを対象にする (タブが使わない次元に温存された非表示セルを除外)
// - teacher が空 / "未定" のセルは除外 (個人スケジュールに載せる先が無い)
// - 同じ日・時限・講師・科目の複数クラス (合同) は 1 コマにまとめ、
//   cls をクラス登録順の "/" 連結にする
// - externalSessions は kind="external" として同じ配列に混ぜる (subj = 種別
//   ラベル、grade/cls/tabName は空)。時刻の読めないものは Excel の講師別
//   シートと同じく同日の末尾に沈める
// - 作成中の時間割 (publishState = draft) は出さない。仮確定は tentative=true
//   (月間のカードに「仮」の印)。決まりは timetable-builder/utils/publishState。
//   季節の中の枠 (utils/frames) があれば状態は枠ごと、frameName に枠の名前
export function buildKoshuLessons(project, { todayYmd } = {}) {
  if (!project || !Array.isArray(project.tabs)) return [];
  const baseYmd = projectBaseYmd(project, todayYmd);
  if (!baseYmd) return [];
  // 講習で使う日付 (どれかのタブが授業に使う日 + 外部授業だけの日) の年は季節ごとに
  // まとめて決める (ラベルごとに決めると、講習の半年後の編集で季節が 2 つの年に割れる)
  const sessionDates = sessionDateLabels(project);
  const ymdByLabel = resolveDateLabelsYmd(sessionDates, baseYmd);
  const ymdOf = (label) =>
    ymdByLabel.has(label) ? ymdByLabel.get(label) : resolveDateLabelYmd(label, baseYmd);

  const lessons = [];
  project.tabs.forEach((tab, tabIndex) => {
    // 作成中の時間割は出さない。仮確定は「仮」の印をつける (utils/publishState)
    const state = publishStateForTab(project, tab);
    if (!isPublished(state)) return;
    const cfg = effectiveConfigForTab(project, tab);
    // 回数連番 (①②… = そのクラスでその科目が何回目か)。builder の画面
    // (ScheduleCell) / 講師別 Excel / 配布用と同じ makeSubjectOrderMarker を
    // 使い、番号が紙面間で食い違わないようにする。同一クラス×同日の科目
    // 重複中 (subjectDup 違反) は空文字が返る。
    const orderMark = makeSubjectOrderMarker(cfg, tab.schedule || {});

    const dateById = new Map();
    for (const d of cfg.dates || []) {
      const ymd = ymdOf(d.label);
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
    // 丸ごと合同 (講習の ClassEntity.mergedInto、B4) は相手のクラスと 1 件: 従うクラスの
    // セル (温存しているだけ) は出さず、相手のクラスの名前・教室に並べる
    const rawClasses = tab.config?.classes || [];
    const rawById = new Map(rawClasses.map((c) => [c.id, c]));
    const leaderOf = (c) => {
      if (c?.mergedInto == null || c.mergedInto === c.id) return null;
      const lead = rawById.get(c.mergedInto);
      return lead && lead.mergedInto == null ? lead : null;
    };
    const roomOf = (c) => (typeof c?.room === "string" ? c.room.trim() : "");
    const classById = new Map(
      rawClasses
        .filter((c) => !leaderOf(c))
        .map((c, index) => {
          const followers = rawClasses.filter((x) => leaderOf(x)?.id === c.id);
          const rooms = [roomOf(c), ...followers.map(roomOf)];
          return [
            c.id,
            {
              label: [c.label, ...followers.map((x) => x.label)].join("・"),
              room: followers.length && rooms.some(Boolean) ? rooms.map((r) => r || "?").join("/") : roomOf(c),
              index,
            },
          ];
        })
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
      grouped.get(gKey).classes.push({
        ...cls,
        // classById の共有オブジェクトを直接使い回すとコマ間で mark が
        // 衝突するため、セルごとに複製して回数連番を持たせる
        mark: subj ? orderMark(key, subj, parsed.classId, parsed.dateId) : "",
      });
    }

    for (const g of grouped.values()) {
      g.classes.sort((a, b) => a.index - b.index);
      // 合同 (複数クラス 1 コマ) の回数はクラスごとに進み方が違いうる。
      // 全クラス同じ番号ならその 1 つ、違えば cls の並び順で "/" 連結する
      // (subjectDup 違反で番号が付かないクラスは "?" — builder 側の警告対象)。
      const marks = g.classes.map((c) => c.mark);
      const countText = marks.every((m) => m === marks[0])
        ? marks[0]
        : marks.map((m) => m || "?").join("/");
      lessons.push({
        kind: "koshu",
        key: g.key,
        date: g.date.ymd,
        dateLabel: g.date.label,
        time: g.period.time,
        periodLabel: g.period.short,
        teacher: g.teacher,
        subj: g.subj,
        countText,
        grade: tab.name || "",
        cls: g.classes.map((c) => c.label).join("/"),
        // 教室 (講習時間割作成のクラスの教室。合同はクラスの並びで "/" 連結、
        // 教室を入れていないクラスだけなら空)
        room: g.classes.some((c) => c.room) ? g.classes.map((c) => c.room || "?").join("/") : "",
        tabName: tab.name || "",
        projectName: project.name || "",
        // 季節の中の枠 (冬期講習 / 直前ポイント演習…)。カードの説明は枠の名前を出す
        frameName: frameOfTab(project, tab)?.name || "",
        tentative: state === "tentative",
        _sortMin: g.period.sortMin,
        _sortPeriod: g.period.index,
        _sortTab: tabIndex,
      });
    }
  });

  // 外部授業 (予備校・高校等の他学年セッション)。種別ラベルは講師別 Excel
  // (excelExport) と同じ規則で解決する。載せるのは「どれかのタブが授業に使う
  // 日」と「外部授業だけの日」(日付プールの印) のものだけ — 日付プールには前の
  // 季節の日付が残りうるので、そこに登録した予定まで拾うと、冬期の project を開いて
  // いる間に前の夏の予備校が翌年 7 月の予定として月間カレンダーに出ていた。講師別
  // Excel も同じ絞り込み (courseDates.sessionDateLabels)。
  const sessions = (Array.isArray(project.externalSessions)
    ? project.externalSessions
    : []
  ).filter(
    (s) =>
      sessionDates.has(s?.date) &&
      isPublished(publishStateForSessionDate(project, s.date)) &&
      // 本体の「高校・予備校の講習」から取り込んだもの (自動NG のため) は出さない。
      // 本体の登録の方が「講」カードで出る (utils/seniorKoshu)
      s?.source !== "seniorKoshu"
  );
  const { assignments } = computePresetMemoBackfill(
    sessions,
    project.externalSessionPresets || [],
    project.dates || []
  );
  const presetMemoBySessionId = new Map(
    assignments.map((a) => [a.sessionId, a.memo])
  );
  for (const s of sessions) {
    const teacher =
      typeof s?.teacherName === "string" ? s.teacherName.trim() : "";
    if (!teacher || teacher === "未定") continue;
    const ymd = ymdOf(s.date);
    if (!ymd) continue;
    const range = getSessionTimeRange(s);
    const time = range
      ? range.endMin != null
        ? `${formatHHmm(range.startMin)}-${formatHHmm(range.endMin)}`
        : formatHHmm(range.startMin)
      : null;
    lessons.push({
      kind: "external",
      key: `ext:${s.id}`,
      date: ymd,
      dateLabel: s.date,
      time,
      // 時刻が読めないセッションは自由記述 label が時刻代わりの表示になる
      // (Excel の timeText フォールバックと同じ)
      periodLabel: s.label || "",
      teacher,
      // 種別 (メモ → 時刻の合うプリセットの名前 → 「外部」) + 講座名
      subj: sessionDisplayLabel(s, presetMemoBySessionId.get(s.id)),
      countText: "",
      grade: "",
      cls: "",
      room: "",
      tabName: "",
      projectName: project.name || "",
      frameName: frameById(project, frameIdForDate(project, s.date))?.name || "",
      tentative: publishStateForSessionDate(project, s.date) === "tentative",
      _sortMin: range ? range.startMin : Number.POSITIVE_INFINITY,
      _sortPeriod: Number.POSITIVE_INFINITY,
      _sortTab: Number.POSITIVE_INFINITY,
    });
  }

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

// 季節ごとの project (hooks/useBuilderProjects の戻り値: 季節 → { project }) から、
// 全季節の講習コマを 1 本にまとめる。季節に分けたので、冬期を作っても夏期の
// 「講」は消えない (以前は project が 1 つで、夏期を冬期に作り替えると夏期の
// 「講」が本体から消えていた)。年は季節ごとの project の最終編集日で決まる
// (buildKoshuLessons)。key は季節で区別する (タブ id・外部授業 id は季節ごとの連番)
export function buildKoshuLessonsForSeasons(seasonProjects, { todayYmd } = {}) {
  if (!seasonProjects || typeof seasonProjects !== "object") return [];
  const lessons = [];
  for (const [season, entry] of Object.entries(seasonProjects)) {
    for (const l of buildKoshuLessons(entry?.project, { todayYmd })) {
      lessons.push({ ...l, key: `${season}:${l.key}`, season });
    }
  }
  // 季節ごとには整列済み。日付だけで並べ直す (安定ソートなので同じ日の中の順は保つ)
  return lessons.sort((a, b) => a.date.localeCompare(b.date));
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
