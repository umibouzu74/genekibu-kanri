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
import { cleanSchedule, getSubjectColor, toCircleNum } from './constants';
import type { EffectiveConfig, Project, Schedule } from '../types';
import { makeKey, findCombinedGroup, isPrimaryCombinedClass, makeExternalKey, makeNgKey, effectiveConfigForTab } from './scheduleKey';
import { quotaForClass } from './subjectQuota';
import { computeActiveAnalysis, computeGlobalUsage } from './analysisHelpers';
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

// ─── 回数連番 (第N回) の丸数字 (Q1) ────────────────────────────────
// 画面のセル表示 (ScheduleCell) は科目の横に「その科目が同一クラス内で
// 何回目の授業か」を丸数字 (①②…) で出す。Excel の科目名にも同じ番号を
// 添えるため、キー → 付加文字列 (例 '②') の lookup を作って返す。
// 数え方は UI と同じ computeActiveAnalysis の subjectOrders (クラス内を
// 日付 → 時限順に走査した 1-based 連番) をそのまま使い、画面と番号が
// 食い違わないようにする。UI と同様、同一クラス×同日に同じ科目が重複して
// いる間 (subjectDup 違反) は番号が意味を成さないので付けない。
// overMark: クォータ超過の回に '!' を添える (UI の赤字 '!' に対応する
// 作成者向け注記)。配布用 (distributionExport) と講師別ではオフ。
// distributionExport.ts からも使うため export。
export function makeSubjectOrderMarker(
  effective: EffectiveConfig,
  schedule: Schedule,
  { overMark = false }: { overMark?: boolean } = {},
) {
  const { subjectOrders, dailySubjectMap } = computeActiveAnalysis(effective, schedule, {});
  return (key: string, subject: string, classId: number, dateId: number): string => {
    const order = subjectOrders[key] || 0;
    if (!order || dailySubjectMap[`c${classId}-d${dateId}-${subject}`] > 1) return '';
    const maxCnt = overMark ? quotaForClass(effective, classId, subject) : 0;
    return toCircleNum(order) + (maxCnt > 0 && order > maxCnt ? '!' : '');
  };
}

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

// ─── 講師別 Excel: workbook 構築 ───────────────────────────────────
export function buildTeacherWorkbook(project: Project): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const subjectColors = project.subjectColors || {};

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

    // ヘッダ (行 2)
    // N5d: 全講師リストと同じ「学年(タブ)」に統一 (旧「場所(タブ)」/「タブ名」)
    ws.addRow(header);
    header.forEach((_, ci) => applyCellStyle(ws.getCell(2, ci + 1), TEACHER_HEADER_STYLE));

    // データ行 (行 1 = タイトル、行 2 = ヘッダなのでデータは行 3 から)
    personalRows.forEach((row, ri) => {
      ws.addRow(row.cells);
      row.cells.forEach((_, ci) => {
        const cell = ws.getCell(ri + 3, ci + 1);
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
        applyRowEdge(ws, ri + 3, header.length, 'top');
      }
    });
    applyRowEdge(ws, personalRows.length + 2, header.length, 'bottom');

    // オートフィルタ: 学年(タブ) 列で「中3 だけ」「中1+中2」のように任意の
    // 組み合わせに絞って確認・印刷できるようにする (タブ別にシートや
    // セクションを分けるとシート・紙面が爆発するため、絞り込みは Excel の
    // フィルタに任せる)。外部授業行は同列の種別 (予備校・高校等) で同様に
    // 絞れる。
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2, column: header.length },
    };

    [14, 14, 10, 12, 15, 18].forEach((w, ci) => { ws.getColumn(ci + 1).width = w; });

    // P1: B4 縦 + タイトル/ヘッダ行 (1〜2 行目) の全ページ繰り返し
    applyTeacherPrintDefaults(ws, 2);
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
