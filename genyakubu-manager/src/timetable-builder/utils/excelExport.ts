// Excel 出力 (exceljs ベース)。
//
// 元は xlsx-js-style を使っていたが、2022-04 以降更新が止まりリスクが
// 蓄積していたため C4 で exceljs に置換。公開 API
// (downloadScheduleExcel / downloadTeacherExcel) は維持。
//
// 注意点:
// - exceljs の行/列インデックスは 1-based (旧 SheetJS は 0-based)
// - 色指定は ARGB (FF + RRGGBB)、旧 SheetJS の RGB (RRGGBB) と異なる
// - 出力は async (workbook.xlsx.writeBuffer)、ブラウザでは Blob 経由で download
//
// バンドルは Excel 出力ボタン押下時にだけ dynamic import される (Header.jsx)。
import ExcelJS from 'exceljs';
import { cleanSchedule, getSubjectColor } from './constants';
import type { Project } from '../types';
import { makeKey, findCombinedGroup, isPrimaryCombinedClass, makeExternalKey, makeNgKey, effectiveConfigForTab } from './scheduleKey';
import { quotaForClass } from './subjectQuota';
import { computeGlobalUsage, makeSubjectOrderMarker } from './analysisHelpers';
import { computeAutoNgByTeacher } from './autoNg';
import { getPeriodTimeRange, getSessionTimeRange } from './timeRange';
import { sortPoolDatesByCalendar } from './dateGenerate';
import { computePresetMemoBackfill } from './presetMemoBackfill';

// ─── 共通スタイル定義 (exceljs 形式) ──────────────────────────────

// SheetJS の `{ rgb: 'RRGGBB' }` 色指定は exceljs では
// `{ argb: 'FFRRGGBB' }` (アルファ FF = 不透明) となる。
const ARGB_FF = 'FFFFFFFF';
const ARGB_AAA = 'FFAAAAAA';
const ARGB_4472C4 = 'FF4472C4';
const ARGB_548235 = 'FF548235';
const ARGB_E2EFDA = 'FFE2EFDA';
const ARGB_F2F2F2 = 'FFF2F2F2';

// exceljs の型に合わせた style 断片。applyCellStyle でセルへ適用する。
interface CellStyleSpec {
  font?: Partial<ExcelJS.Font>;
  fill?: ExcelJS.Fill;
  alignment?: Partial<ExcelJS.Alignment>;
  border?: Partial<ExcelJS.Borders>;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: ARGB_AAA } },
  bottom: { style: 'thin', color: { argb: ARGB_AAA } },
  left: { style: 'thin', color: { argb: ARGB_AAA } },
  right: { style: 'thin', color: { argb: ARGB_AAA } },
};

const HEADER_STYLE: CellStyleSpec = {
  font: { bold: true, size: 11, color: { argb: ARGB_FF } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_4472C4 } },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: THIN_BORDER,
};

// シート先頭のタイトル行 (N5a: 学年グリッド / P1: 講師別個人シート)。
// 塗りなしの太字テキストのみ。
const TITLE_ROW_STYLE: CellStyleSpec = {
  font: { bold: true, size: 12 },
  alignment: { horizontal: 'left', vertical: 'middle' },
};

// P1 タイトル行の直下に置く個人シートの 1 行まとめ (S3)。タイトルより
// 一段小さい通常ウェイト。
const SUMMARY_LINE_STYLE: CellStyleSpec = {
  font: { size: 10 },
  alignment: { horizontal: 'left', vertical: 'middle' },
};

const TEACHER_HEADER_STYLE: CellStyleSpec = {
  font: { bold: true, size: 11, color: { argb: ARGB_FF } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_548235 } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

const DATE_HEADER_STYLE: CellStyleSpec = {
  font: { bold: true, size: 10 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_E2EFDA } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

const PERIOD_STYLE: CellStyleSpec = {
  font: { size: 9 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_F2F2F2 } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

const EMPTY_CELL_STYLE: CellStyleSpec = {
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: THIN_BORDER,
};

const BODY_CELL_STYLE: CellStyleSpec = {
  font: { size: 10 },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

// 講師別シートの外部授業 (予備校・高校等の他学年セッション) 行。
// 講習のコマと一目で見分けられるよう全セルを薄いグレーで塗る。
const EXTERNAL_ROW_STYLE: CellStyleSpec = {
  font: { size: 10 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_F2F2F2 } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

// 日付区切り線 (全体の学年グリッドシート・講師別シート共通)。日付が変わる
// 行の上辺を太線 (medium) にして 1 日のまとまりを紙面で追いやすくする。
const DATE_EDGE_BORDER: ExcelJS.Border = { style: 'medium', color: { argb: 'FF333333' } };

// 行の上辺 / 下辺を太線に上書きする。applyCellStyle は共有 style オブジェクト
// (THIN_BORDER) をそのまま cell に渡すため、直接 mutate せず新しい border を
// 組んで差し替える (mutate すると全セルの罫線が巻き添えで変わる)。
function applyRowEdge(ws: ExcelJS.Worksheet, rowIdx: number, columnCount: number, edge: 'top' | 'bottom') {
  for (let ci = 1; ci <= columnCount; ci++) {
    const cell = ws.getCell(rowIdx, ci);
    cell.border = { ...(cell.border || THIN_BORDER), [edge]: DATE_EDGE_BORDER };
  }
}

// HEX カラー (#RRGGBB) を ARGB (FFRRGGBB) に変換
export function hexToArgb(hex: string): string {
  return 'FF' + hex.replace('#', '').toUpperCase();
}

// 科目カラーから cell style を生成
function makeSubjectCellStyle(subject: string, subjectColors?: Record<string, string> | null): CellStyleSpec {
  const color = getSubjectColor(subject, subjectColors);
  const style: CellStyleSpec = {
    font: { size: 10 },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: THIN_BORDER,
  };
  if (color) {
    style.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(color) } };
  }
  return style;
}

// exceljs cell に style オブジェクトを適用。null / undefined は cell に
// 設定しないことで「style 未指定」の状態を保つ。
function applyCellStyle(cell: ExcelJS.Cell, style: CellStyleSpec) {
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
}

// 回数連番 (第N回) の丸数字 (Q1) は analysisHelpers.makeSubjectOrderMarker
// に移動 (exceljs 非依存の builderLessons からも使うため)。

// ブラウザでファイルダウンロードをトリガする。exceljs は Node API を
// 持つので、ブラウザでは writeBuffer() → Blob → anchor.click() の手順を踏む。
// distributionExport.ts からも使うため export。
export async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 全体 Excel: workbook 構築 (テストしやすいよう DL から分離) ──
// project から ExcelJS.Workbook を構築して返す。副作用無し。
// 稼働カウント・⚠NG・超過 '!' 入りの作成者向け出力。生徒掲示・保護者配布用は
// 完成版レイアウトの distributionExport.buildDistributionWorkbook を使う
// (旧 L5c の clean オプション = 注記なし学年グリッドは 2026-07-16 に
// 完成版レイアウトへ置き換えて廃止)。
export function buildScheduleWorkbook(project: Project): ExcelJS.Workbook {
  const cleaned = cleanSchedule(project);
  const workbook = new ExcelJS.Workbook();
  const subjectColors = project.subjectColors || {};
  const combinedGroups = project.combinedGroups || [];

  // 講師の日次稼働回数 (中学=schedule内コマ, 計=中学+externalCounts) を全タブ横断で集計。
  // 講習時間割本体 (中1/中2/中3 タブ) のコマが current、予備校・高校等の外部カウントが external。
  const { teacherDailyCounts } = computeGlobalUsage(
    cleaned.tabs,
    combinedGroups,
    cleaned.externalCounts || {},
    cleaned.externalSessions || [],
    cleaned.dates || [],
    cleaned.periods || [],
  );
  const teachersByName = new Map((project.teachers || []).map(t => [t.name, t] as const));

  cleaned.tabs.forEach(tab => {
    // v4(Y)+E-3: そのタブが使う日・使う時限だけをシートに出す
    // (使わない時限の空行や stale セルを紙面に出さない)。
    const effective = effectiveConfigForTab(cleaned, tab);
    const { dates, periods } = effective;
    const { classes } = tab.config;

    // Q1: 回数連番 (①②…) + クォータ超過の '!' (作成者向け注記)
    const orderMark = makeSubjectOrderMarker(effective, tab.schedule, { overMark: true });
    // タブ名は自由入力なので禁則文字・重複をそのまま渡すと throw する
    const ws = workbook.addWorksheet(uniqueSheetName(workbook, sanitizeSheetName(tab.name)));

    // タブ毎の period に合わせて自動NG (他学年セッションとの時間重複) を計算。
    // ⚠NG マークは手動NG (teacher.ngSlots) と自動NG の OR で出す。
    const autoNgByTeacher = computeAutoNgByTeacher(
      project.teachers || [],
      cleaned.externalSessions || [],
      periods,
    );

    // N5a: タイトル行。シートを単体で印刷・配布しても「何の・いつの時間割か」
    // が紙面に残るようにする (印刷経路の見出し L1f と対になる)。
    const columnCount = 2 + classes.length;
    const rangeText = dates.length > 0 ? `期間 ${dates[0].label}〜${dates[dates.length - 1].label}` : '';
    const d0 = new Date();
    const printedAt = `出力日 ${d0.getMonth() + 1}/${d0.getDate()}`;
    const titleText = [
      `${project.name || '講習時間割'} — ${tab.name}`,
      rangeText,
      printedAt,
    ].filter(Boolean).join(' / ');
    ws.addRow([titleText]);
    if (columnCount > 1) ws.mergeCells(1, 1, 1, columnCount);
    applyCellStyle(ws.getCell(1, 1), TITLE_ROW_STYLE);
    ws.getRow(1).height = 20;

    // ヘッダー行
    const headerRow = ['日付', '時限', ...classes.map(c => c.label)];
    ws.addRow(headerRow);
    headerRow.forEach((_, ci) => applyCellStyle(ws.getCell(2, ci + 1), HEADER_STYLE));

    // データ行を組み立て (日付ごとに時限分の行が生成される)
    let rowIdx = 3; // 1 = title, 2 = header
    dates.forEach((d) => {
      periods.forEach((p) => {
        const cells = [d.label, p.label, ...classes.map((c) => {
          const key = makeKey(d.id, p.id, c.id);
          const e = tab.schedule[key];
          if (!e || !e.subject) return '';
          // Q1: 科目名に回数連番 (①②…) を添える
          const subjText = e.subject + orderMark(key, e.subject, c.id, d.id);
          const group = findCombinedGroup(combinedGroups, e.subject, c.label, d.label);
          if (group && !isPrimaryCombinedClass(group, c.label)) {
            return `${subjText}\n(合同)`;
          }
          if (e.teacher && e.teacher !== '未定') {
            const daily = teacherDailyCounts[makeExternalKey(d.label, e.teacher)];
            const current = daily?.current ?? 0;
            const total = daily?.total ?? 0;
            const teacherEnt = teachersByName.get(e.teacher);
            const ngKey = makeNgKey(d.label, p.label);
            const isManualNg = !!teacherEnt?.ngSlots?.includes(ngKey);
            const isAutoNg = !!autoNgByTeacher.get(e.teacher)?.has(ngKey);
            const ngMark = (isManualNg || isAutoNg) ? '\n⚠NG' : '';
            return `${subjText}\n${e.teacher}(中学${current}:計${total})${ngMark}`;
          }
          return `${subjText}\n${e.teacher || ''}`;
        })];
        ws.addRow(cells);

        applyCellStyle(ws.getCell(rowIdx, 1), DATE_HEADER_STYLE);
        applyCellStyle(ws.getCell(rowIdx, 2), PERIOD_STYLE);

        classes.forEach((cls, cIdx) => {
          const cell = ws.getCell(rowIdx, 3 + cIdx);
          const entry = tab.schedule[makeKey(d.id, p.id, cls.id)];
          if (entry && entry.subject) {
            applyCellStyle(cell, makeSubjectCellStyle(entry.subject, subjectColors));
          } else {
            applyCellStyle(cell, EMPTY_CELL_STYLE);
          }
        });

        ws.getRow(rowIdx).height = 36;
        rowIdx++;
      });
    });

    // ヘッダー行高 (行 2 = 「日付/時限/クラス…」)
    ws.getRow(2).height = 24;

    // 列幅 (1-based)
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 14;
    classes.forEach((_, cIdx) => {
      ws.getColumn(3 + cIdx).width = 16;
    });

    // 日付セルの結合 (同一日付の時限分をまとめる)。1-based 行範囲。
    // 行 1 = タイトル、行 2 = ヘッダなのでデータは行 3 から。
    let mergeStart = 3;
    dates.forEach(() => {
      if (periods.length > 1) {
        ws.mergeCells(mergeStart, 1, mergeStart + periods.length - 1, 1);
      }
      mergeStart += periods.length;
    });

    // 日付の区切り: 日付が変わる行 (先頭日含む) の上辺 + 最終データ行の下辺を
    // 太線にして 1 日のまとまりを追いやすくする (講師別シートと同じ見せ方)。
    // 結合した日付セルは範囲内で style オブジェクトを共有する (exceljs の
    // merge が slave.style = master.style を代入する) ため、必ず merge の後に
    // 適用する — 先に塗ると列 1 の最終行に引いた下辺太線が merge で消える。
    if (dates.length > 0 && periods.length > 0) {
      let edgeRow = 3;
      dates.forEach(() => {
        applyRowEdge(ws, edgeRow, columnCount, 'top');
        edgeRow += periods.length;
      });
      applyRowEdge(ws, edgeRow - 1, columnCount, 'bottom');
    }
  });

  // 科目別集計シート (英語・数学… ごとに 1 枚)。講師別集計・⚠NG・
  // 必要/不足コマは作成者向けの分析情報 (配布物には載せない → 配布用は
  // distributionExport 側で科目別シートを作らないことで担保)。
  collectAllSubjects(cleaned).forEach(subject => {
    buildOneSubjectSheet(workbook, cleaned, subject);
  });

  return workbook;
}

// ─── 科目別集計シート ─────────────────────────────────────────────

// project から登場する全科目を収集する (project.subjects ∪ 各タブの
// subjectCounts のキー ∪ schedule entry の subject)。
function collectAllSubjects(project: Project): string[] {
  const set = new Set<string>(project.subjects || []);
  (project.tabs || []).forEach(tab => {
    Object.keys(tab.config?.subjectCounts || {}).forEach(s => set.add(s));
    Object.values(tab.schedule || {}).forEach(e => {
      if (e?.subject) set.add(e.subject);
    });
  });
  return Array.from(set);
}

// 1 科目分の集計を計算する純粋関数 (テスト用に export)。
// 返り値:
//   - tabStats: [{ tabName, needed, filled }]  必要 = Σ_クラス quotaForClass
//   - teacherStats: { [teacherName]: { [tabName]: count } }
//       (合同非 primary は除外、未定は "(未定)" キーで集計)
//   - teachersFound: Set<string>  teacherStats に登場した講師
//   - detailRows: [{ date, period, className, tabName, teacher, note }]
//       note には "合同(...)" / "⚠NG" が入る
export function computeSubjectStats(project: Project, subject: string) {
  const combinedGroups = project.combinedGroups || [];
  const teachersByName = new Map((project.teachers || []).map(t => [t.name, t] as const));
  const UNASSIGNED_KEY = '(未定)';

  const tabStats: Array<{ tabName: string; needed: number; filled: number }> = [];
  const teacherStats: Record<string, Record<string, number>> = {};
  const teachersFound = new Set<string>();
  const detailRows: Array<{ date: string; period: string; className: string; tabName: string; teacher: string; note: string }> = [];

  // 自動NG は project の periods (プール全体) で一度だけ計算。
  const autoNgByTeacher = computeAutoNgByTeacher(
    project.teachers || [],
    project.externalSessions || [],
    project.periods || [],
  );

  (project.tabs || []).forEach(tab => {
    // §N: 必要コマ数はクラス別上書きを考慮してクラスごとに解決して合算
    const needed = (tab.config?.classes || []).reduce(
      (sum, c) => sum + quotaForClass(tab.config, c.id, subject), 0);
    let filled = 0;
    // v4(Y)+E-3: そのタブが使う日・使う時限だけを集計対象にする。
    const { dates, periods } = effectiveConfigForTab(project, tab);

    dates.forEach(d => {
      periods.forEach(p => {
        (tab.config?.classes || []).forEach(c => {
          const e = tab.schedule?.[makeKey(d.id, p.id, c.id)];
          if (!e || e.subject !== subject) return;
          filled++;

          const group = findCombinedGroup(combinedGroups, subject, c.label, d.label);
          const isNonPrimary = group && !isPrimaryCombinedClass(group, c.label);

          const noteParts: string[] = [];
          if (group) noteParts.push(`合同(${group.classes.join(',')})`);
          if (e.teacher && e.teacher !== '未定') {
            const teacherEnt = teachersByName.get(e.teacher);
            const ngKey = makeNgKey(d.label, p.label);
            const isManualNg = !!teacherEnt?.ngSlots?.includes(ngKey);
            const isAutoNg = !!autoNgByTeacher.get(e.teacher)?.has(ngKey);
            if (isManualNg || isAutoNg) noteParts.push('⚠NG');
          }

          detailRows.push({
            date: d.label,
            period: p.label,
            className: c.label,
            tabName: tab.name,
            teacher: e.teacher || '',
            note: noteParts.join(' '),
          });

          if (!isNonPrimary) {
            const tKey = (e.teacher && e.teacher !== '未定') ? e.teacher : UNASSIGNED_KEY;
            teachersFound.add(tKey);
            if (!teacherStats[tKey]) teacherStats[tKey] = {};
            teacherStats[tKey][tab.name] = (teacherStats[tKey][tab.name] || 0) + 1;
          }
        });
      });
    });

    tabStats.push({ tabName: tab.name, needed, filled });
  });

  return { subject, tabStats, teacherStats, teachersFound, detailRows };
}

// exceljs の addWorksheet は禁則文字 (\\ / : ? * [ ])・空文字・予約名
// 'History'・重複名で throw する。ユーザ入力 (タブ名・講師名) を
// シート名にする前に必ずこれを通すこと。distributionExport.ts からも使う。
export function sanitizeSheetName(name: unknown): string {
  // 先頭/末尾のシングルクォートも exceljs が reject する (F5h)。内側の
  // クォートは合法なので端だけ落とす (空白と交互に現れても残らないよう
  // 文字クラスでまとめて strip)。
  const stripped = String(name || '')
    .replace(/[\\/:?*[\]]/g, '')
    .replace(/^['\s]+|['\s]+$/g, '');
  const safe = stripped || 'Sheet';
  return /^history$/i.test(safe) ? `${safe}_` : safe;
}

// Excel 上のシート名は 31 文字 + 一部の禁則文字。重複した場合は suffix を付与。
// 重複判定は case-insensitive (F5g)。exceljs の addWorksheet は
// toLowerCase 比較で重複を reject するため、getWorksheet (完全一致) で
// 判定すると "classA"/"CLASSA" のような大小文字違いの名前で throw する。
// distributionExport.ts からも使う。
export function uniqueSheetName(workbook: ExcelJS.Workbook, baseName: string): string {
  const taken = new Set(workbook.worksheets.map(ws => ws.name.toLowerCase()));
  let name = baseName.substring(0, 31);
  if (!taken.has(name.toLowerCase())) return name;
  let suffix = 1;
  while (true) {
    const tail = `_${suffix}`;
    name = (baseName.substring(0, 31 - tail.length) + tail);
    if (!taken.has(name.toLowerCase())) return name;
    suffix++;
  }
}

function buildOneSubjectSheet(workbook: ExcelJS.Workbook, project: Project, subject: string) {
  const safeSubject = subject.replace(/[\\/:?*[\]]/g, '');
  const ws = workbook.addWorksheet(uniqueSheetName(workbook, `科目別_${safeSubject}`));

  const stats = computeSubjectStats(project, subject);
  const subjColor = (project.subjectColors || {})[subject];
  const tabNames = (project.tabs || []).map(t => t.name);

  // 行ごとに値を書きつつ style 適用する小ヘルパ。
  let rowIdx = 1;
  const writeRow = (values: Array<string | number>, style?: CellStyleSpec) => {
    values.forEach((v, ci) => {
      const cell = ws.getCell(rowIdx, ci + 1);
      cell.value = v;
      if (style) applyCellStyle(cell, style);
    });
    rowIdx++;
  };

  // ── タイトル ──
  ws.getCell(rowIdx, 1).value = `科目: ${subject}`;
  ws.getCell(rowIdx, 1).font = { bold: true, size: 14 };
  if (subjColor) {
    ws.getCell(rowIdx, 1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(subjColor) },
    };
  }
  rowIdx += 2;

  // ── Section 1: 必要コマ数 ──
  ws.getCell(rowIdx, 1).value = '【必要コマ数】';
  ws.getCell(rowIdx, 1).font = { bold: true };
  rowIdx++;
  writeRow(['タブ', '必要', '充足', '不足'], HEADER_STYLE);

  let totalNeeded = 0;
  let totalFilled = 0;
  stats.tabStats.forEach(({ tabName, needed, filled }) => {
    totalNeeded += needed;
    totalFilled += filled;
    writeRow([tabName, needed, filled, Math.max(needed - filled, 0)], BODY_CELL_STYLE);
  });
  writeRow(['計', totalNeeded, totalFilled, Math.max(totalNeeded - totalFilled, 0)], DATE_HEADER_STYLE);
  rowIdx++;

  // ── Section 2: 講師別集計 (合同は 1 コマ扱い) ──
  ws.getCell(rowIdx, 1).value = '【講師別集計 (合同は 1 コマで集計)】';
  ws.getCell(rowIdx, 1).font = { bold: true };
  rowIdx++;
  writeRow(['講師', ...tabNames, '計'], HEADER_STYLE);

  // project.teachers の順 → 並び替え。未知名と (未定) は末尾に。
  const projectTeacherNames = (project.teachers || []).map(t => t.name);
  const orderedTeachers = [
    ...projectTeacherNames.filter(n => stats.teachersFound.has(n)),
    ...[...stats.teachersFound].filter(n => !projectTeacherNames.includes(n)),
  ];

  const tabTotals = new Array(tabNames.length).fill(0);
  let grandTotal = 0;
  orderedTeachers.forEach(tName => {
    const tabCounts = tabNames.map(tn => stats.teacherStats[tName]?.[tn] || 0);
    const sum = tabCounts.reduce((a, b) => a + b, 0);
    tabCounts.forEach((c, i) => { tabTotals[i] += c; });
    grandTotal += sum;
    writeRow([tName, ...tabCounts, sum], BODY_CELL_STYLE);
  });
  if (orderedTeachers.length > 0) {
    writeRow(['計', ...tabTotals, grandTotal], DATE_HEADER_STYLE);
  }
  rowIdx++;

  // ── Section 3: 詳細 ──
  ws.getCell(rowIdx, 1).value = '【詳細 (タブ → 日付 → 時限 → クラス 順)】';
  ws.getCell(rowIdx, 1).font = { bold: true };
  rowIdx++;
  writeRow(['日付', '時限', 'クラス', 'タブ', '講師', '備考'], HEADER_STYLE);

  stats.detailRows.forEach(d => {
    writeRow([d.date, d.period, d.className, d.tabName, d.teacher, d.note], BODY_CELL_STYLE);
  });

  // 列幅
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 22;
}

// ファイル名を組み立てる小ヘルパー (テスト用に分離)
export function buildExcelFilename(project: Pick<Project, 'name'>, suffix: string): string {
  const projectName = (project.name || '時間割').replace(/[\\/:?*[\]<>|"]/g, '');
  // N1f: toISOString() は UTC のため JST 0〜9 時の出力でファイル名だけ
  // 前日になる。印刷見出し (printHeader) と同じくローカル日付で組む。
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${projectName}_${suffix}_${datePart}.xlsx`;
}

// ─── 全体 Excel: 公開エントリ ──────────────────────────────────────
export async function downloadScheduleExcel(project: Project) {
  const workbook = buildScheduleWorkbook(project);
  await downloadWorkbook(workbook, buildExcelFilename(project, '全体'));
}

// ─── 講師別 Excel: 行の組み立て (純粋関数、テスト用に export) ─────
// 1 講師分の行を「講習のコマ + 外部授業 (予備校・高校等の他学年セッション)」
// を合わせて日付 (カレンダー順) → 時刻順で返す。
//
// - 講習コマが 1 つも無い講師は空配列 (シートを作らない従来挙動を維持)。
//   外部授業だけの講師は講習に出勤しないので紙面に載せない。
// - 時刻の取れないコマ (時限ラベルに時刻表記なし) は sortMin=-1 でその日の
//   先頭に時限順のまま並び、時刻の取れない外部授業は Infinity で末尾に沈む。
//   sort は stable なので同キー内は従来の生成順 (タブ → 時限) を保つ。
export interface TeacherRow {
  /**
   * [日付, 時限(または時刻), クラス, 科目, 学年(タブ), 備考]。
   * 科目には回数連番 (①②…、そのクラスで何回目の授業か = 画面表示と同じ
   * 番号) が付く (Q1)。
   * 外部授業の行は 科目=空欄、学年(タブ)=種別 (メモ＝プリセット名。メモ未設定
   * でも時刻がプリセットに一致すればその名前、どちらも無ければ '外部')。
   */
  cells: string[];
  /** 科目カラー適用用 (外部授業は undefined) */
  subject?: string;
  /** 外部授業 (他学年セッション) 由来の行 */
  isExternal: boolean;
}

export function buildTeacherRows(project: Project, teacherName: string): TeacherRow[] {
  const combinedGroups = project.combinedGroups || [];
  // 日付の並びはプールのカレンダー順 (時間割・NG パネルの表示順と同じ)。
  // プールに無いラベル (通常は無い) は末尾へ。
  const dateOrder = new Map(
    sortPoolDatesByCalendar(project.dates || []).map((d, i) => [d.label, i] as const),
  );
  const dateIdx = (label: string) => dateOrder.get(label) ?? Number.POSITIVE_INFINITY;

  const rows: Array<TeacherRow & { dateIdx: number; sortMin: number }> = [];

  project.tabs.forEach(tab => {
    // v4(Y)+E-3: タブごとに『使う日・使う時限』で絞る
    const effective = effectiveConfigForTab(project, tab);
    const { dates, periods } = effective;
    // Q1: 科目列に回数連番 (①②…) を付ける。数えるのはタブ内の全講師分
    // (連番は「そのクラスの何回目か」であって「この講師の何回目か」ではない)
    const orderMark = makeSubjectOrderMarker(effective, tab.schedule);
    dates.forEach((d) => {
      periods.forEach((p) => {
        tab.config.classes.forEach((c) => {
          const k = makeKey(d.id, p.id, c.id);
          const entry = tab.schedule[k];
          if (entry && entry.teacher === teacherName) {
            const group = findCombinedGroup(combinedGroups, entry.subject, c.label, d.label);
            const note = group ? `合同(${group.classes.join(',')})` : '';
            const subjText = entry.subject
              ? entry.subject + orderMark(k, entry.subject, c.id, d.id)
              : '';
            rows.push({
              cells: [d.label, p.label, c.label, subjText, tab.name, note],
              subject: entry.subject,
              isExternal: false,
              dateIdx: dateIdx(d.label),
              sortMin: getPeriodTimeRange(p)?.startMin ?? -1,
            });
          }
        });
      });
    });
  });

  // 講習コマ 0 の講師はシート自体を作らない (外部授業のみでも載せない)
  if (rows.length === 0) return [];

  // 学年(タブ) 列に出す種別ラベル: メモ (プリセット適用時はプリセット名) を
  // 優先し、メモ未設定でも時刻がプリセットに一致するならその名前を**表示に
  // だけ**使う (プロジェクトのデータは書き換えない)。どちらも無ければ '外部'。
  const sessions = project.externalSessions || [];
  const { assignments } = computePresetMemoBackfill(
    sessions,
    project.externalSessionPresets || [],
    project.dates || [],
  );
  const presetMemoBySessionId = new Map(assignments.map(a => [a.sessionId, a.memo]));

  sessions.forEach(s => {
    if (s.teacherName !== teacherName) return;
    const timeText = s.startTime
      ? (s.endTime ? `${s.startTime}〜${s.endTime}` : `${s.startTime}〜`)
      : (s.label || '-');
    const kind = s.memo || presetMemoBySessionId.get(s.id) || '外部';
    rows.push({
      // 科目欄は空欄 (講習の科目ではないため)。予備校 / 高校の判別は
      // 学年(タブ) 列の種別ラベルで行う。
      cells: [s.date, timeText, '-', '', kind, ''],
      isExternal: true,
      dateIdx: dateIdx(s.date),
      sortMin: getSessionTimeRange(s)?.startMin ?? Number.POSITIVE_INFINITY,
    });
  });

  rows.sort((a, b) => {
    if (a.dateIdx !== b.dateIdx) return a.dateIdx - b.dateIdx;
    if (a.sortMin !== b.sortMin) return a.sortMin - b.sortMin;
    return 0; // stable sort: 同キーは生成順を維持
  });

  return rows.map(({ cells, subject, isExternal }) => ({ cells, subject, isExternal }));
}

// ─── 講師別 Excel: 印刷デフォルト (P1) ─────────────────────────────
// B4 縦をシートの pageSetup に埋め込み、Excel で開いてそのまま印刷すれば
// B4 縦になるようにする。先頭 repeatRows 行 (タイトル/ヘッダ) は 2 ページ目
// 以降にも繰り返し印刷する。
//
// 両面 (長辺綴じ) はここでは設定**できない** — OOXML の pageSetup に duplex
// 属性は存在せず、プリンタドライバ固有の DEVMODE バイナリ
// (xl/printerSettings/*.bin) にしか載らないため、exceljs 非対応かつ
// 埋め込んでも開く端末・プリンタが変わると効かない。両面・綴じ方向は
// プリンタ側の既定設定で運用する (ファイル埋め込み案は再検討しない)。
// ECMA-376 ST_PaperSize: 12 = B4。exceljs の PaperSize enum は主要サイズしか
// 定義しておらず B4 が無いが、runtime は数値をそのまま書き出すので cast で通す。
const PAPER_SIZE_B4 = 12 as ExcelJS.PaperSize;

function applyTeacherPrintDefaults(ws: ExcelJS.Worksheet, repeatRows: number) {
  ws.pageSetup.paperSize = PAPER_SIZE_B4;
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.printTitlesRow = `1:${repeatRows}`;
}

// ─── 講師別 Excel: クラス別回数まとめ (S1) ─────────────────────────
// 「どの講師がどのクラスに結局何回行くか」の行列。座席表を毎回提出する
// 運用で、講師×クラスの回数が最初のシートで分かれば必要枚数をあらかじめ
// 印刷しておける、が動機。
//
// 集計規約:
//   - 合同 (複数クラス 1 コマ) は代表クラスの列に 1 回だけ数える
//     (科目別シートの「合同は 1 コマ扱い」と同じ。行の計 = 実際に行く回数)
//   - 講師未割当 (未定 / 空) のコマは '(未定)' 行に集計する。これにより
//     列の計 = そのクラスの総コマ数となり、割当が未完了なことも紙面で分かる
//   - 外部授業 (他学年セッション) は講習のクラスに行くものではないので対象外
//   - S2: その日の最終コマ (タブの実効時限リスト末尾) は授業時間 + 休憩
//     (中3 は 5 分、他は 10 分) + 確認テスト 15 分を含む長さで設計されて
//     おり、担当講師がそのまま確認テストを監督する。確認テストにも座席
//     管理があるため、最終コマの担当回数を「うち確認テスト」として併記する
const UNASSIGNED_TEACHER_KEY = '(未定)';

export interface TeacherClassCounts {
  /** 列 = タブ順 × クラス順 (コマ 0 のクラスも含む) */
  columns: Array<{ tabName: string; className: string }>;
  /** ヘッダのタブ名結合用: タブごとの連続列数 (クラス 0 のタブは出ない) */
  tabSpans: Array<{ tabName: string; count: number }>;
  /**
   * 行 = 講師 (project.teachers 順 → 未知名 → '(未定)' 末尾)。counts /
   * testCounts は columns と同順。testCounts は counts のうち最終コマ
   * (= 確認テスト監督) のもの (S2、常に counts 以下)。
   */
  rows: Array<{ teacher: string; counts: number[]; testCounts: number[]; total: number; testTotal: number }>;
  columnTotals: number[];
  columnTestTotals: number[];
  grandTotal: number;
  grandTestTotal: number;
}

export function computeTeacherClassCounts(project: Project): TeacherClassCounts {
  const combinedGroups = project.combinedGroups || [];

  const columns: TeacherClassCounts['columns'] = [];
  const tabSpans: TeacherClassCounts['tabSpans'] = [];
  const countsByTeacher = new Map<string, { lesson: number[]; test: number[] }>();

  (project.tabs || []).forEach(tab => {
    const classes = tab.config?.classes || [];
    if (classes.length === 0) return;
    // 同名タブが並んでも別の span になるようタブ単位で積む (ヘッダ結合が
    // 別タブのクラスを巻き込まない)
    tabSpans.push({ tabName: tab.name, count: classes.length });
    const colBase = columns.length;
    classes.forEach(c => columns.push({ tabName: tab.name, className: c.label }));

    // v4(Y)+E-3: そのタブが使う日・使う時限だけを集計対象にする
    const { dates, periods } = effectiveConfigForTab(project, tab);
    // S2: 確認テストが含まれるのは各日の最終コマ = 実効時限リストの末尾。
    // 時限は日をまたいで共通なので、末尾の時限 ID との一致で判定できる。
    const lastPeriodId = periods.length > 0 ? periods[periods.length - 1].id : null;
    dates.forEach(d => {
      periods.forEach(p => {
        classes.forEach((c, cIdx) => {
          const e = tab.schedule?.[makeKey(d.id, p.id, c.id)];
          if (!e || !e.subject) return;
          const group = findCombinedGroup(combinedGroups, e.subject, c.label, d.label);
          if (group && !isPrimaryCombinedClass(group, c.label)) return;
          const tKey = (e.teacher && e.teacher !== '未定') ? e.teacher : UNASSIGNED_TEACHER_KEY;
          let rec = countsByTeacher.get(tKey);
          if (!rec) {
            rec = { lesson: [], test: [] };
            countsByTeacher.set(tKey, rec);
          }
          rec.lesson[colBase + cIdx] = (rec.lesson[colBase + cIdx] || 0) + 1;
          if (p.id === lastPeriodId) {
            rec.test[colBase + cIdx] = (rec.test[colBase + cIdx] || 0) + 1;
          }
        });
      });
    });
  });

  // 行順: project.teachers の並び → 登録外の名前 (出現順) → '(未定)' は末尾
  const projectTeacherNames = (project.teachers || []).map(t => t.name);
  const foundNames = [...countsByTeacher.keys()];
  const orderedTeachers = [
    ...projectTeacherNames.filter(n => countsByTeacher.has(n)),
    ...foundNames.filter(n => n !== UNASSIGNED_TEACHER_KEY && !projectTeacherNames.includes(n)),
    ...(countsByTeacher.has(UNASSIGNED_TEACHER_KEY) ? [UNASSIGNED_TEACHER_KEY] : []),
  ];

  const columnTotals = new Array(columns.length).fill(0);
  const columnTestTotals = new Array(columns.length).fill(0);
  let grandTotal = 0;
  let grandTestTotal = 0;
  const rows = orderedTeachers.map(teacher => {
    const rec = countsByTeacher.get(teacher) || { lesson: [], test: [] };
    // 後続タブの列ぶんが歯抜けの sparse 配列なので、列数まで 0 詰めする
    const counts = columns.map((_, i) => rec.lesson[i] || 0);
    const testCounts = columns.map((_, i) => rec.test[i] || 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const testTotal = testCounts.reduce((a, b) => a + b, 0);
    counts.forEach((n, i) => { columnTotals[i] += n; });
    testCounts.forEach((n, i) => { columnTestTotals[i] += n; });
    grandTotal += total;
    grandTestTotal += testTotal;
    return { teacher, counts, testCounts, total, testTotal };
  });

  return { columns, tabSpans, rows, columnTotals, columnTestTotals, grandTotal, grandTestTotal };
}

// 回数の表記 (S2): 授業回数に、うち確認テスト付き (最終コマ) があれば
// "(テN)" を添える。まとめシートのセルと個人シートの 1 行まとめ (S3) で共用。
function fmtLessonWithTest(lesson: number, test: number): string | number {
  return test > 0 ? `${lesson}(テ${test})` : lesson;
}

// S3: 個人シート冒頭 (タイトル直下) に載せる 1 行まとめのテキストを組む
// 純粋関数 (テスト用に export)。まとめシート (S1/S2) と同じ集計値から
// その講師の分だけを「クラス 回数(テN)」の並びにする。印刷して個人に
// 渡った紙 1 枚で、座席表・確認テストの必要枚数が分かるようにする。
// タブが複数あるときはクラス名の前にタブ名を付けて同名クラスを区別する。
export function buildTeacherCountLineText(stats: TeacherClassCounts, teacherName: string): string {
  const row = stats.rows.find(r => r.teacher === teacherName);
  const multiTab = new Set(stats.columns.map(c => c.tabName)).size > 1;
  const parts: string[] = [];
  if (row) {
    row.counts.forEach((n, i) => {
      if (n === 0) return;
      const col = stats.columns[i];
      const label = multiTab ? `${col.tabName} ${col.className}` : col.className;
      parts.push(`${label} ${fmtLessonWithTest(n, row.testCounts[i])}`);
    });
  }
  // 講習コマがあっても集計 0 になる端ケース (合同の secondary 側にだけ
  // 講師が残っている等) は '—' で埋める (行の欠落で以降の行番号が
  // ずれるより、常に 1 行ある方が扱いやすい)
  if (!row || parts.length === 0) return 'クラス別回数: —';
  const note = row.testTotal > 0 ? ' ※(テN)=うち確認テスト付き(最終コマ)' : '';
  return `クラス別回数: ${parts.join('、')} ／ 計 ${fmtLessonWithTest(row.total, row.testTotal)}${note}`;
}

// クラス別回数まとめシートを workbook の先頭に積む (buildTeacherWorkbook の
// 冒頭で最初に呼ぶことで 1 枚目にする)。
function buildClassCountSummarySheet(
  workbook: ExcelJS.Workbook,
  project: Project,
  stats: TeacherClassCounts,
) {
  const {
    columns, tabSpans, rows, columnTotals, columnTestTotals, grandTotal, grandTestTotal,
  } = stats;
  // 講師名が「クラス別回数」でも throw しないよう固定名も uniq を通す (F5i)
  const ws = workbook.addWorksheet(uniqueSheetName(workbook, 'クラス別回数'));

  // 列構成: 講師 | クラス列 × N | 計
  const columnCount = 2 + columns.length;

  // タイトル (N5a / P1 と同じ「何の・いつの・いつ出したか」)。期間は
  // プール全日程のカレンダー順の初日〜最終日。
  const poolDates = sortPoolDatesByCalendar(project.dates || []);
  const rangeText = poolDates.length > 0
    ? `期間 ${poolDates[0].label}〜${poolDates[poolDates.length - 1].label}`
    : '';
  const d0 = new Date();
  const titleText = [
    `クラス別回数まとめ — ${project.name || '講習時間割'}`,
    rangeText,
    `出力日 ${d0.getMonth() + 1}/${d0.getDate()}`,
  ].filter(Boolean).join(' / ');
  ws.addRow([titleText]);
  if (columnCount > 1) ws.mergeCells(1, 1, 1, columnCount);
  applyCellStyle(ws.getCell(1, 1), TITLE_ROW_STYLE);
  ws.getRow(1).height = 20;

  // ヘッダ 2 段: 行 2 = 学年(タブ) (クラス列ぶんを横結合)、行 3 = クラス。
  // 講師 / 計 は 2 行縦結合。style は merge が slave.style = master.style を
  // 代入するため必ず merge の後に塗る (buildScheduleWorkbook の日付結合と同じ)。
  ws.addRow(['講師', ...columns.map(c => c.tabName), '計']);
  ws.addRow(['', ...columns.map(c => c.className), '']);
  ws.mergeCells(2, 1, 3, 1);
  ws.mergeCells(2, columnCount, 3, columnCount);
  let spanStart = 2; // クラス列の先頭 (1-based)
  tabSpans.forEach(span => {
    if (span.count > 1) ws.mergeCells(2, spanStart, 2, spanStart + span.count - 1);
    spanStart += span.count;
  });
  for (let ci = 1; ci <= columnCount; ci++) {
    applyCellStyle(ws.getCell(2, ci), TEACHER_HEADER_STYLE);
  }
  columns.forEach((_, i) => applyCellStyle(ws.getCell(3, 2 + i), DATE_HEADER_STYLE));

  // セル表記 (S2): fmtLessonWithTest ("N(テM)")。0 回のセルは空欄にして
  // 行列を見やすくする。合計行は突き合わせ用に 0 も数値で出す。
  const fmtCell = (lesson: number, test: number): string | number =>
    lesson === 0 ? '' : fmtLessonWithTest(lesson, test);
  const fmtTotal = fmtLessonWithTest;

  // データ行 (行 4〜)
  rows.forEach((r, ri) => {
    ws.addRow([
      r.teacher,
      ...r.counts.map((n, i) => fmtCell(n, r.testCounts[i])),
      fmtTotal(r.total, r.testTotal),
    ]);
    const style = r.teacher === UNASSIGNED_TEACHER_KEY ? EXTERNAL_ROW_STYLE : BODY_CELL_STYLE;
    for (let ci = 1; ci <= columnCount; ci++) {
      applyCellStyle(ws.getCell(4 + ri, ci), style);
    }
  });

  // 合計行 (列計 = クラスの総コマ数)
  if (rows.length > 0) {
    ws.addRow([
      '計',
      ...columnTotals.map((n, i) => fmtTotal(n, columnTestTotals[i])),
      fmtTotal(grandTotal, grandTestTotal),
    ]);
    for (let ci = 1; ci <= columnCount; ci++) {
      applyCellStyle(ws.getCell(4 + rows.length, ci), DATE_HEADER_STYLE);
    }
  }

  // 凡例 (該当がある場合のみ)。空行を 1 つ挟んで小さめの文字で。
  const notes: string[] = [];
  if (grandTestTotal > 0) notes.push('(テN) はうち確認テスト付き (その日の最終コマ) の回数');
  if ((project.combinedGroups || []).length > 0) notes.push('合同授業は代表クラスの列に 1 回で集計');
  if (rows.some(r => r.teacher === UNASSIGNED_TEACHER_KEY)) notes.push('(未定) は講師未割当のコマ');
  if (rows.length > 0 && notes.length > 0) {
    ws.addRow([]);
    ws.addRow([`※ ${notes.join(' / ')}`]);
    ws.getCell(ws.rowCount, 1).font = { size: 9 };
  }

  ws.getColumn(1).width = 14;
  columns.forEach((_, i) => { ws.getColumn(2 + i).width = 10; });
  ws.getColumn(columnCount).width = 10;

  // P1: B4 縦 + タイトル/ヘッダ行 (1〜3 行目) の全ページ繰り返し
  applyTeacherPrintDefaults(ws, 3);
}

// ─── 講師別 Excel: workbook 構築 ───────────────────────────────────
export function buildTeacherWorkbook(project: Project): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const subjectColors = project.subjectColors || {};

  // S1: クラス別回数まとめ (座席表の事前印刷用)。最初に積んで 1 枚目にする。
  // 集計は個人シート冒頭の 1 行まとめ (S3) と共用するため 1 回だけ計算する。
  const classCounts = computeTeacherClassCounts(project);
  buildClassCountSummarySheet(workbook, project, classCounts);

  // 「全講師リスト」シート用の集約
  const allRows: TeacherRow[] = [];
  const allRowTeachers: string[] = [];

  project.teachers.forEach(t => {
    // 講習コマ + 外部授業を日付 → 時刻順に統合した行 (コマ 0 の講師は空)
    const personalRows = buildTeacherRows(project, t.name);
    if (personalRows.length === 0) return;
    personalRows.forEach(row => {
      allRows.push(row);
      allRowTeachers.push(t.name);
    });

    // 禁則文字を strip した結果の空文字・重複 (例: 「田中/A」と「田中A」) で
    // throw しないよう sanitize + unique を通す
    const ws = workbook.addWorksheet(uniqueSheetName(workbook, sanitizeSheetName(t.name)));

    const header = ['日付', '時限', 'クラス', '科目', '学年(タブ)', '備考'];

    // P1: タイトル行。印刷した紙の一番上に「誰の・何の・いつの」スケジュール
    // かが必ず載るようにする (学年グリッドの N5a と対)。期間はその講師自身の
    // 初日〜最終日 (personalRows は日付順ソート済み)。
    const firstDate = personalRows[0].cells[0];
    const lastDate = personalRows[personalRows.length - 1].cells[0];
    const d0 = new Date();
    const titleText = [
      `${t.name} — ${project.name || '講習時間割'}`,
      firstDate === lastDate ? `期間 ${firstDate}` : `期間 ${firstDate}〜${lastDate}`,
      `出力日 ${d0.getMonth() + 1}/${d0.getDate()}`,
    ].join(' / ');
    ws.addRow([titleText]);
    ws.mergeCells(1, 1, 1, header.length);
    applyCellStyle(ws.getCell(1, 1), TITLE_ROW_STYLE);
    ws.getRow(1).height = 20;

    // S3: 自分のクラス別回数の 1 行まとめ (行 2)。まとめシート (S1/S2) と
    // 同じ集計値。Print_Titles に含まれるので 2 ページ目以降にも載る。
    ws.addRow([buildTeacherCountLineText(classCounts, t.name)]);
    ws.mergeCells(2, 1, 2, header.length);
    applyCellStyle(ws.getCell(2, 1), SUMMARY_LINE_STYLE);

    // ヘッダ (行 3)
    // N5d: 全講師リストと同じ「学年(タブ)」に統一 (旧「場所(タブ)」/「タブ名」)
    ws.addRow(header);
    header.forEach((_, ci) => applyCellStyle(ws.getCell(3, ci + 1), TEACHER_HEADER_STYLE));

    // データ行 (行 1 = タイトル、行 2 = S3 まとめ、行 3 = ヘッダなので行 4 から)
    personalRows.forEach((row, ri) => {
      ws.addRow(row.cells);
      row.cells.forEach((_, ci) => {
        const cell = ws.getCell(ri + 4, ci + 1);
        if (row.isExternal) {
          applyCellStyle(cell, EXTERNAL_ROW_STYLE);
        } else if (ci === 3 && row.subject) {
          applyCellStyle(cell, makeSubjectCellStyle(row.subject, subjectColors));
        } else {
          applyCellStyle(cell, BODY_CELL_STYLE);
        }
      });
    });

    // 日付の区切り: 日付が変わる行 (先頭行含む) の上辺 + 最終行の下辺を太線に
    personalRows.forEach((row, ri) => {
      if (ri === 0 || personalRows[ri - 1].cells[0] !== row.cells[0]) {
        applyRowEdge(ws, ri + 4, header.length, 'top');
      }
    });
    applyRowEdge(ws, personalRows.length + 3, header.length, 'bottom');

    // オートフィルタ: 学年(タブ) 列で「中3 だけ」「中1+中2」のように任意の
    // 組み合わせに絞って確認・印刷できるようにする (タブ別にシートや
    // セクションを分けるとシート・紙面が爆発するため、絞り込みは Excel の
    // フィルタに任せる)。外部授業行は同列の種別 (予備校・高校等) で同様に
    // 絞れる。
    ws.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: header.length },
    };

    [14, 14, 10, 12, 15, 18].forEach((w, ci) => { ws.getColumn(ci + 1).width = w; });

    // P1: B4 縦 + タイトル/S3 まとめ/ヘッダ行 (1〜3 行目) の全ページ繰り返し
    applyTeacherPrintDefaults(ws, 3);
  });

  // 全講師リストシート
  if (allRows.length > 0) {
    // 講師名が「全講師リスト」でも throw しないよう固定名も uniq を通す (F5i)
    const wsAll = workbook.addWorksheet(uniqueSheetName(workbook, '全講師リスト'));
    const allHeader = ['講師名', '日付', '時限', 'クラス', '科目', '学年(タブ)', '備考'];
    wsAll.addRow(allHeader);
    allHeader.forEach((_, ci) => applyCellStyle(wsAll.getCell(1, ci + 1), TEACHER_HEADER_STYLE));

    allRows.forEach((row, ri) => {
      wsAll.addRow([allRowTeachers[ri], ...row.cells]);
      for (let ci = 0; ci < row.cells.length + 1; ci++) {
        const cell = wsAll.getCell(ri + 2, ci + 1);
        if (row.isExternal) {
          applyCellStyle(cell, EXTERNAL_ROW_STYLE);
        } else if (ci === 4 && row.subject) {
          applyCellStyle(cell, makeSubjectCellStyle(row.subject, subjectColors));
        } else {
          applyCellStyle(cell, BODY_CELL_STYLE);
        }
      }
    });

    // 区切り: 講師または日付が変わる行 (先頭行含む) の上辺 + 最終行の下辺を太線に
    allRows.forEach((row, ri) => {
      const boundary = ri === 0
        || allRowTeachers[ri - 1] !== allRowTeachers[ri]
        || allRows[ri - 1].cells[0] !== row.cells[0];
      if (boundary) applyRowEdge(wsAll, ri + 2, allHeader.length, 'top');
    });
    applyRowEdge(wsAll, allRows.length + 1, allHeader.length, 'bottom');

    // オートフィルタ: 個人シートと同様。講師名 × 学年(タブ) の組み合わせでも
    // 絞れる (例: 中3 の全講師分だけを一覧・印刷)。
    wsAll.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: allHeader.length },
    };

    [10, 14, 14, 10, 12, 15, 18].forEach((w, ci) => { wsAll.getColumn(ci + 1).width = w; });

    // P1: B4 縦 + ヘッダ行 (1 行目) の全ページ繰り返し
    applyTeacherPrintDefaults(wsAll, 1);

    // P2: 講師の切り替わりで改ページ。通しで印刷しても講師ごとに新しい
    // ページから始まり、そのまま切り分けて個人へ渡せる (ヘッダ行は
    // Print_Titles で毎ページ載る)。同一講師内の日付切り替わりでは改めない。
    // addPageBreak() は「その行の後」に改ページを入れるので、前講師の
    // 最終行 (= データ行 ri-1、ヘッダが行 1 なのでシート行 ri+1) に付ける。
    allRowTeachers.forEach((tName, ri) => {
      if (ri > 0 && allRowTeachers[ri - 1] !== tName) {
        wsAll.getRow(ri + 1).addPageBreak();
      }
    });

    // P2: 印刷範囲を表の列 (A〜G) に固定。writer が Print_Area
    // (全講師リスト!$A:$G) として workbook に埋め込む。
    wsAll.pageSetup.printArea = `A:${wsAll.getColumn(allHeader.length).letter}`;
  } else {
    // 該当なしでも空シートを作って一貫性を保つ
    applyTeacherPrintDefaults(workbook.addWorksheet(uniqueSheetName(workbook, '全講師リスト')), 1);
  }

  return workbook;
}

// ─── 講師別 Excel: 公開エントリ ────────────────────────────────────
export async function downloadTeacherExcel(project: Project) {
  const workbook = buildTeacherWorkbook(project);
  await downloadWorkbook(workbook, buildExcelFilename(project, '講師別'));
}
