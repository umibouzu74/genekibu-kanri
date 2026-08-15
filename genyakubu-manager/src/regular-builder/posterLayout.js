// ─── 掲示用「中学生コース時間割」の紙面レイアウト計算 (純関数) ───────
//
// 例年の掲示紙面 (◯◯年度 中学生コース時間割) を通常時間割作成の
// プロジェクトから組み直すためのレイアウト計算。exceljs には触らず、
// 「方眼のどこに何を置くか」だけを返す — 描画は posterExport.js。
//
// **既存の Excel 出力 (excelExport.js) とは別系統。** あちらは
// 「画面の曜日ビューをそのまま写す」のが要件で、こちらは
// 「例年の掲示紙面をそのまま再現する」のが要件。統合しないこと。
//
// ## 紙面の骨格 (元 xls の実測)
//
// 全列を同じ幅・全行を同じ高さにした細かい方眼の上に、すべてを
// セル結合で組んでいる:
//
// - クラス 1 列 = 方眼 2 列 / 時限 1 行 = 方眼 4 行 (上 2 行 = 科目、
//   下 2 行 = 講師)
// - 左端の見出し列 = 方眼 3 列
// - ヘッダは「曜日 / 学年 / コース / クラス / 教室」の 5 段 × 各 2 行
// - 隔週コマだけは結合せず、2×2 の素のセルを右上→左下の対角罫で仕切って
//   左上 = A 週 (講師欄の主担当)、右下 = B 週 (note「隔週(◯◯)」の
//   パートナー) を置く。**A/B の定義は CLAUDE.md「隔週コマの担当週」と
//   同じ** — ここで独自解釈をしないこと
// - 合同コマ (範囲・列挙ラベルの列) は構成クラスの上に結合して被せる。
//   配置は画面と共有の mergedColumns.computeRowCells に委ねる
// - 確認テストのように「科目 + 担任 + 教室」を 1 かたまりで見せるコマは
//   4 行まるごと 1 セルに結合する (並列監督は担任行を並べる)
//
// ## 表の束ね方と置き方 (2026-08-15 確定)
//
// - 表 (テーブル) = **時間軸を共有する (曜日 × 学年タブ) のかたまり**。
//   時限集合が交わるブロック同士を推移的に束ねる。附中 (16:25〜) や
//   土曜の内申対策 (10:00〜) は本科 (18:00〜) と交わらないので自然に
//   別の表になり、元 xls と同じ切れ方になる
//   - computeSections (曜日ビューのセクション) は**使わない**。あちらは
//     包含関係で束ねるため、月 {2限〜5限} と 火 {1限〜4限} のように
//     どちらも他方の部分集合でない曜日が同じ表に入らない
// - 広すぎる表は曜日の切れ目で分割する (MAX_TABLE_CLASS_COLS)。元 xls の
//   月火水 / 木金 の 2 段組はこの分割で再現される
// - 置き方は左上から詰める段組み。1 段に入るだけ横に並べ、入らなければ
//   次の段へ送る (MAX_GRID_COLS)
//
// 紙面に無い情報 (欄外のお知らせなど) は出力後に Excel 上で書き足す運用。

import {
  biweeklyPartner,
  isBiweekly,
  splitTeacherField,
} from "../utils/biweekly";
import { classRoomForDay, makeCellKey, REGULAR_DAYS } from "./model";
import {
  computeMergeLayout,
  computeRowCells,
  mergeFallback,
  visibleClassesForDay,
} from "./mergedColumns";

// ─── 方眼の寸法 ─────────────────────────────────────────────────────
/** 左端の見出し列 (曜日 / 学年 / … / 時刻) の方眼列数 */
export const LABEL_COLS = 3;
/** クラス 1 列ぶんの方眼列数 */
export const CLASS_COLS = 2;
/** ヘッダ 1 段ぶんの方眼行数 */
export const HEAD_ROWS = 2;
/** ヘッダの段数 (曜日 / 学年 / コース / クラス / 教室) */
export const HEAD_BANDS = 5;
/** 時限 1 行ぶんの方眼行数 (科目 2 行 + 講師 2 行) */
export const PERIOD_ROWS = 4;

/** 表 1 つに入れるクラス列の上限 (超えたら曜日の切れ目で分割) */
export const MAX_TABLE_CLASS_COLS = 13;
/** 1 段に並べる方眼列の上限 */
export const MAX_GRID_COLS = 60;
/** 表と表の間 (横) の空き列 */
export const TABLE_GAP_COLS = 1;
/** 段と段の間の空き行 */
export const BAND_GAP_ROWS = 4;
/** 表が始まる方眼行 (0-based)。上はタイトルと注記 */
export const TABLE_TOP_ROW = 4;

// 時刻 "HH:MM-HH:MM" の開始分。パース不能 (時刻未設定) は末尾送り
const startMin = (time) => {
  const m = /^(\d{1,2}):(\d{2})/.exec((time || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

/** 高校系の学年か (掲示紙面は中学生のみ) */
const isHighGrade = (g) => String(g || "").includes("高");

/**
 * 中学生の紙面に載せるタブか。学年 (無ければ表示名) に「高」を含まない
 * ものだけを対象にする (sectionTone の部の判定と同じ規則)。
 */
export function isJuniorTab(tab) {
  return !isHighGrade(tab?.grade || tab?.name || "");
}

/**
 * コース行に出す文字列。tab.course が空ならタブ名から学年の接頭辞を
 * 落としたものを使う (「中3 本科（火・木）」→「本科（火・木）」)。
 * 落とした結果が空になるならタブ名をそのまま返す。
 */
export function courseLabel(tab) {
  const course = (tab?.course || "").trim();
  if (course) return course;
  const name = (tab?.name || "").trim();
  const grade = (tab?.grade || "").trim();
  if (!grade || !name.startsWith(grade)) return name;
  const rest = name.slice(grade.length).replace(/^[\s・\-–—]+/, "").trim();
  return rest || name;
}

/** 学年行に出す文字列 */
export const gradeLabel = (tab) => (tab?.grade || "").trim() || (tab?.name || "").trim();

/**
 * 時刻 "18:00-18:45" → 紙面の 3 行表記 "18：00\n〜\n18：45"。
 * 時刻が無い時限は label をそのまま返す。
 */
export function periodTimeText(period) {
  const time = (period?.time || "").trim();
  const m = /^(\d{1,2}:\d{2})\s*[-–—~〜～]\s*(\d{1,2}:\d{2})$/.exec(time);
  const wide = (s) => s.replace(":", "：");
  if (m) return `${wide(m[1])}\n〜\n${wide(m[2])}`;
  if (time) return wide(time);
  return (period?.label || "").trim();
}

/**
 * 教室名を紙面の表記にする。数字だけの教室は「（601教室）」、
 * それ以外 (亀63 など) は「（亀63）」。
 */
export function roomText(room) {
  const r = (room || "").trim();
  if (!r) return "";
  return /^\d+$/.test(r) ? `（${r}教室）` : `（${r}）`;
}

/** 講師欄 ("·" 区切り) の表示。区切りは必ず splitTeacherField で分解する */
const teacherText = (field) => splitTeacherField(field).join("・");

/** 隔週マーカーを取り除いた残りの note (紙面に載せる備考) */
const restNote = (note) =>
  String(note || "")
    .replace(/隔週\([^)]*\)/g, "")
    .replace(/隔週/g, "")
    .trim();

/** 確認テストのように「科目 + 担任 + 教室」を 1 かたまりで見せるコマか */
const isTestCell = (cell) => /テスト/.test(cell?.subj || "");

// ─── ブロック収集 ───────────────────────────────────────────────────

/**
 * (曜日 × 中学タブ) のブロックを集める。中身の無い曜日・クラス列・
 * 時限は落とす (紙面には常に出さない — excelExport と同じ割り切り)。
 *
 * @param {object} project RegularProject
 * @param {{days?: string[]}} [opts] days 省略時は REGULAR_DAYS
 * @returns {{day: string, dayIdx: number, tab: object, classes: object[],
 *            layout: object, fallback: boolean, periodIds: number[]}[]}
 */
export function collectPosterBlocks(project, { days } = {}) {
  const dayList = (days && days.length ? days : REGULAR_DAYS).filter((d) =>
    REGULAR_DAYS.includes(d)
  );
  const periodById = new Map((project.periods || []).map((p) => [p.id, p]));
  const out = [];
  for (const day of dayList) {
    const dayIdx = REGULAR_DAYS.indexOf(day);
    for (const tab of project.tabs || []) {
      if (!isJuniorTab(tab)) continue;
      if (!(tab.days || []).includes(day)) continue;
      const classes = visibleClassesForDay(tab, day);
      if (classes.length === 0) continue;
      const scoped = { ...tab, classes };
      const layout = computeMergeLayout(scoped);
      // 中身のある時限だけ (開始時刻順)
      const periodIds = (tab.periodIds || [])
        .filter((pid) =>
          classes.some((cls) => tab.schedule?.[makeCellKey(day, pid, cls.id)])
        )
        .sort(
          (a, b) =>
            startMin(periodById.get(a)?.time) - startMin(periodById.get(b)?.time)
        );
      if (periodIds.length === 0) continue;
      const periods = periodIds.map((pid) => periodById.get(pid)).filter(Boolean);
      const fallback = mergeFallback(scoped, day, periods, layout);
      out.push({
        day,
        dayIdx,
        tab: scoped,
        classes: fallback ? scoped.classes : layout.visible,
        layout,
        fallback,
        periodIds,
      });
    }
  }
  return out;
}

// ─── 表への束ね ─────────────────────────────────────────────────────

/**
 * 時限集合が交わるブロック同士を推移的に束ねる。附中 (16:25〜) のように
 * 本科と時刻が 1 つも重ならないものは別の束になる。
 * @returns {object[][]} 束ごとのブロック配列
 */
export function clusterByPeriodOverlap(blocks) {
  const clusters = []; // {ids: Set<periodId>, blocks: []}
  for (const b of blocks) {
    const mine = new Set(b.periodIds);
    const hit = clusters.filter((c) => [...mine].some((id) => c.ids.has(id)));
    if (hit.length === 0) {
      clusters.push({ ids: mine, blocks: [b] });
      continue;
    }
    const base = hit[0];
    base.blocks.push(b);
    for (const id of mine) base.ids.add(id);
    for (const c of hit.slice(1)) {
      base.blocks.push(...c.blocks);
      for (const id of c.ids) base.ids.add(id);
      clusters.splice(clusters.indexOf(c), 1);
    }
  }
  return clusters.map((c) => c.blocks);
}

/** 束のブロックを曜日ごとにまとめる (曜日の並びは REGULAR_DAYS 順) */
function groupByDay(blocks) {
  const byDay = new Map();
  for (const b of blocks) {
    if (!byDay.has(b.day)) byDay.set(b.day, []);
    byDay.get(b.day).push(b);
  }
  return [...byDay.entries()]
    .map(([day, list]) => ({
      day,
      dayIdx: REGULAR_DAYS.indexOf(day),
      blocks: list,
      classCount: list.reduce((n, b) => n + b.classes.length, 0),
    }))
    .sort((a, b) => a.dayIdx - b.dayIdx);
}

/**
 * クラス列が多すぎる表を曜日の切れ目で分割する。1 曜日だけで上限を
 * 超える場合はその曜日 1 つで 1 表にする (曜日の途中では割らない)。
 */
export function splitWideTable(dayGroups, maxClassCols = MAX_TABLE_CLASS_COLS) {
  const chunks = [];
  let cur = [];
  let width = 0;
  for (const g of dayGroups) {
    if (cur.length > 0 && width + g.classCount > maxClassCols) {
      chunks.push(cur);
      cur = [];
      width = 0;
    }
    cur.push(g);
    width += g.classCount;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/**
 * 束 → 表。時限は束全体の和 (開始時刻順) を使う。曜日ごとに時限の
 * 有無は違うが、行は表で共有する (紙面はどの曜日も同じ高さで並ぶ)。
 */
function makeTable(dayGroups, project, key) {
  const periodById = new Map((project.periods || []).map((p) => [p.id, p]));
  const usedIds = new Set(
    dayGroups.flatMap((g) => g.blocks.flatMap((b) => b.periodIds))
  );
  const periods = [...usedIds]
    .map((id) => periodById.get(id))
    .filter(Boolean)
    .sort((a, b) => startMin(a.time) - startMin(b.time) || a.id - b.id);
  const classCount = dayGroups.reduce((n, g) => n + g.classCount, 0);
  // クラス名がどこにも無い表 (附中のように教室だけで見せる) は
  // 「クラス」段と「教室」段を 1 つに畳む
  const showClassRow = dayGroups.some((g) =>
    g.blocks.some((b) => b.classes.some((c) => (c.label || "").trim()))
  );
  return {
    key,
    days: dayGroups,
    periods,
    classCount,
    showClassRow,
    cols: LABEL_COLS + CLASS_COLS * classCount,
    rows: HEAD_ROWS * HEAD_BANDS + PERIOD_ROWS * periods.length,
    // 配置は arrangeTables が埋める
    row0: 0,
    col0: 0,
  };
}

/**
 * 表を左上から段組みで詰める。1 段に入るだけ横に並べ、入らなければ
 * 次の段へ送る。段の高さはその段で一番高い表に合わせる。
 */
export function arrangeTables(tables, { maxGridCols = MAX_GRID_COLS } = {}) {
  let row = TABLE_TOP_ROW;
  let col = 0;
  let bandHeight = 0;
  for (const t of tables) {
    const gap = col === 0 ? 0 : TABLE_GAP_COLS;
    if (col > 0 && col + gap + t.cols > maxGridCols) {
      row += bandHeight + BAND_GAP_ROWS;
      col = 0;
      bandHeight = 0;
    }
    t.col0 = col + (col === 0 ? 0 : TABLE_GAP_COLS);
    t.row0 = row;
    col = t.col0 + t.cols;
    bandHeight = Math.max(bandHeight, t.rows);
  }
  return {
    gridCols: Math.max(...tables.map((t) => t.col0 + t.cols), 1),
    gridRows: row + bandHeight,
  };
}

// ─── セルの中身 ─────────────────────────────────────────────────────

/**
 * 1 行 (時限 × 曜日 × 学年タブ) ぶんのセルを紙面のブロックに変換する。
 * 返す startIdx / colSpan は「そのタブの表示クラス列」の添字と幅。
 *
 * @returns {({kind: "normal", startIdx, colSpan, subject, teacher}
 *          | {kind: "biweekly", startIdx, colSpan, subjectA, teacherA,
 *             subjectB, teacherB}
 *          | {kind: "block", startIdx, colSpan, lines: string[]})[]}
 */
export function posterRowCells(block, periodId) {
  const { tab, day, classes, layout, fallback } = block;
  const items = [];
  if (fallback) {
    // 結合表示できないデータの学年は従来どおり全列を独立で並べる
    classes.forEach((cls, i) =>
      items.push({ cls, colSpan: 1, isRange: false, startIdx: i })
    );
  } else {
    let idx = 0;
    for (const it of computeRowCells(tab, day, periodId, layout)) {
      items.push({ ...it, startIdx: idx });
      idx += it.colSpan;
    }
  }

  const withCell = items
    .map((it) => ({ ...it, cell: tab.schedule?.[makeCellKey(day, periodId, it.cls.id)] }))
    .filter((it) => it.cell);

  const out = [];
  for (let i = 0; i < withCell.length; i++) {
    const it = withCell[i];
    // 確認テスト等は 4 行まるごと 1 セル。隣り合う並列 (監督が複数) は
    // 1 つのブロックにまとめて担任行を並べる。合同列かどうかは問わない —
    // 附中のように学年 1 クラスずつでも紙面では 1 枠になる
    if (isTestCell(it.cell)) {
      const run = [it];
      while (
        i + 1 < withCell.length &&
        isTestCell(withCell[i + 1].cell) &&
        withCell[i + 1].startIdx === run[run.length - 1].startIdx + run[run.length - 1].colSpan
      ) {
        run.push(withCell[++i]);
      }
      const subject = (run[0].cell.subj || "").trim();
      const lines = [subject];
      if (run.length === 1) {
        const t = teacherText(run[0].cell.teacher);
        if (t) lines.push(`担任：${t}`);
        const r = roomText(run[0].cell.room || classRoomForDay(run[0].cls, day));
        if (r) lines.push(r);
      } else {
        for (const r of run) {
          const t = teacherText(r.cell.teacher);
          const room = roomText(r.cell.room || classRoomForDay(r.cls, day));
          if (t || room) lines.push(`担任：${t}${room}`);
        }
      }
      out.push({
        kind: "block",
        startIdx: run[0].startIdx,
        colSpan: run.reduce((n, r) => n + r.colSpan, 0),
        lines: lines.filter(Boolean),
      });
      continue;
    }

    const cell = it.cell;
    // 教室は「セルで上書きしたとき」と「列見出しを持たない合同セル」だけ
    // 出す (既定の教室はクラス見出しに出ているため — excelExport と同じ)
    const room = (cell.room || "").trim() || (it.isRange ? classRoomForDay(it.cls, day) : "");
    const extra = restNote(cell.note);
    const partner = biweeklyPartner(cell.note);

    if (isBiweekly(cell.note) && partner) {
      const parts = String(cell.subj || "")
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
      out.push({
        kind: "biweekly",
        startIdx: it.startIdx,
        colSpan: it.colSpan,
        subjectA: parts[0] || "",
        subjectB: parts[1] || parts[0] || "",
        teacherA: teacherText(cell.teacher),
        teacherB: partner,
      });
      continue;
    }

    out.push({
      kind: "normal",
      startIdx: it.startIdx,
      colSpan: it.colSpan,
      subject: `${(cell.subj || "").trim()}${roomText(room)}`,
      teacher: [teacherText(cell.teacher), extra].filter(Boolean).join(" "),
    });
  }
  return out;
}

// ─── 紙面全体 ───────────────────────────────────────────────────────

/**
 * プロジェクト → 掲示用紙面のレイアウト。
 *
 * @param {object} project RegularProject
 * @param {{days?: string[], title?: string, maxGridCols?: number,
 *          maxTableClassCols?: number}} [opts]
 * @returns {{title: string, note: string, tables: object[],
 *            gridCols: number, gridRows: number, hasBiweekly: boolean}}
 */
export function buildPosterLayout(project, opts = {}) {
  const blocks = collectPosterBlocks(project, { days: opts.days });
  const clusters = clusterByPeriodOverlap(blocks);

  const tables = [];
  for (const cluster of clusters) {
    const dayGroups = groupByDay(cluster);
    const chunks = splitWideTable(
      dayGroups,
      opts.maxTableClassCols ?? MAX_TABLE_CLASS_COLS
    );
    chunks.forEach((chunk, i) =>
      tables.push(makeTable(chunk, project, `${chunk[0].day}-${chunk[0].blocks[0].tab.id}-${i}`))
    );
  }
  // 置き順: 最初の曜日 → 開始時刻。元 xls の「月火水 / 附中(水)」
  // 「木金 / 土」の並びはこの順序で再現される
  tables.sort(
    (a, b) =>
      a.days[0].dayIdx - b.days[0].dayIdx ||
      startMin(a.periods[0]?.time) - startMin(b.periods[0]?.time)
  );

  const size = tables.length
    ? arrangeTables(tables, { maxGridCols: opts.maxGridCols ?? MAX_GRID_COLS })
    : { gridCols: 1, gridRows: TABLE_TOP_ROW };

  const hasBiweekly = blocks.some((b) =>
    Object.entries(b.tab.schedule || {}).some(
      ([key, cell]) => key.startsWith(`${b.day}|`) && isBiweekly(cell?.note)
    )
  );

  return {
    title: opts.title || `${(project.name || "").trim()}\u3000中学生コース時間割`.trim(),
    note: hasBiweekly ? '※”英／数”表示は隔週授業です。' : "",
    tables,
    hasBiweekly,
    ...size,
  };
}
