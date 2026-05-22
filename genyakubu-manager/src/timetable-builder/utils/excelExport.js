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
import { makeKey, findCombinedGroup, isPrimaryCombinedClass, makeExternalKey, makeNgKey } from './scheduleKey';
import { computeGlobalUsage } from './analysisHelpers';
import { computeAutoNgByTeacher } from './autoNg';

// ─── 共通スタイル定義 (exceljs 形式) ──────────────────────────────

// SheetJS の `{ rgb: 'RRGGBB' }` 色指定は exceljs では
// `{ argb: 'FFRRGGBB' }` (アルファ FF = 不透明) となる。
const ARGB_FF = 'FFFFFFFF';
const ARGB_AAA = 'FFAAAAAA';
const ARGB_4472C4 = 'FF4472C4';
const ARGB_548235 = 'FF548235';
const ARGB_E2EFDA = 'FFE2EFDA';
const ARGB_F2F2F2 = 'FFF2F2F2';

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: ARGB_AAA } },
  bottom: { style: 'thin', color: { argb: ARGB_AAA } },
  left: { style: 'thin', color: { argb: ARGB_AAA } },
  right: { style: 'thin', color: { argb: ARGB_AAA } },
};

const HEADER_STYLE = {
  font: { bold: true, size: 11, color: { argb: ARGB_FF } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_4472C4 } },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: THIN_BORDER,
};

const TEACHER_HEADER_STYLE = {
  font: { bold: true, size: 11, color: { argb: ARGB_FF } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_548235 } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

const DATE_HEADER_STYLE = {
  font: { bold: true, size: 10 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_E2EFDA } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

const PERIOD_STYLE = {
  font: { size: 9 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB_F2F2F2 } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

const EMPTY_CELL_STYLE = {
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  border: THIN_BORDER,
};

const BODY_CELL_STYLE = {
  font: { size: 10 },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: THIN_BORDER,
};

// HEX カラー (#RRGGBB) を ARGB (FFRRGGBB) に変換
export function hexToArgb(hex) {
  return 'FF' + hex.replace('#', '').toUpperCase();
}

// 科目カラーから cell style を生成
function makeSubjectCellStyle(subject, subjectColors) {
  const color = getSubjectColor(subject, subjectColors);
  const style = {
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
function applyCellStyle(cell, style) {
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
}

// ブラウザでファイルダウンロードをトリガする。exceljs は Node API を
// 持つので、ブラウザでは writeBuffer() → Blob → anchor.click() の手順を踏む。
async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
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
export function buildScheduleWorkbook(project) {
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
  );
  const teachersByName = new Map((project.teachers || []).map(t => [t.name, t]));

  cleaned.tabs.forEach(tab => {
    const { dates, periods, classes } = tab.config;
    const ws = workbook.addWorksheet(tab.name);

    // タブ毎の period に合わせて自動NG (他学年セッションとの時間重複) を計算。
    // ⚠NG マークは手動NG (teacher.ngSlots) と自動NG の OR で出す。
    const autoNgByTeacher = computeAutoNgByTeacher(
      project.teachers || [],
      cleaned.externalSessions || [],
      periods,
    );

    // ヘッダー行
    const headerRow = ['日付', '時限', ...classes.map(c => c.label)];
    ws.addRow(headerRow);
    headerRow.forEach((_, ci) => applyCellStyle(ws.getCell(1, ci + 1), HEADER_STYLE));

    // データ行を組み立て (日付ごとに時限分の行が生成される)
    let rowIdx = 2; // 1 = header
    dates.forEach((d) => {
      periods.forEach((p) => {
        const cells = [d.label, p.label, ...classes.map((c) => {
          const e = tab.schedule[makeKey(d.id, p.id, c.id)];
          if (!e || !e.subject) return '';
          const group = findCombinedGroup(combinedGroups, e.subject, c.label, d.label);
          if (group && !isPrimaryCombinedClass(group, c.label)) {
            return `${e.subject}\n(合同)`;
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
            return `${e.subject}\n${e.teacher}(中学${current}:計${total})${ngMark}`;
          }
          return `${e.subject}\n${e.teacher || ''}`;
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

    // ヘッダー行高
    ws.getRow(1).height = 24;

    // 列幅 (1-based)
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 14;
    classes.forEach((_, cIdx) => {
      ws.getColumn(3 + cIdx).width = 16;
    });

    // 日付セルの結合 (同一日付の時限分をまとめる)。1-based 行範囲。
    let mergeStart = 2;
    dates.forEach(() => {
      if (periods.length > 1) {
        ws.mergeCells(mergeStart, 1, mergeStart + periods.length - 1, 1);
      }
      mergeStart += periods.length;
    });
  });

  // 科目別集計シート (英語・数学… ごとに 1 枚)
  collectAllSubjects(cleaned).forEach(subject => {
    buildOneSubjectSheet(workbook, cleaned, subject);
  });

  return workbook;
}

// ─── 科目別集計シート ─────────────────────────────────────────────

// project から登場する全科目を収集する (project.subjects ∪ 各タブの
// subjectCounts のキー ∪ schedule entry の subject)。
function collectAllSubjects(project) {
  const set = new Set(project.subjects || []);
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
//   - tabStats: [{ tabName, needed, filled }]  必要 = subjectCounts*classes
//   - teacherStats: { [teacherName]: { [tabName]: count } }
//       (合同非 primary は除外、未定は "(未定)" キーで集計)
//   - teachersFound: Set<string>  teacherStats に登場した講師
//   - detailRows: [{ date, period, className, tabName, teacher, note }]
//       note には "合同(...)" / "⚠NG" が入る
export function computeSubjectStats(project, subject) {
  const combinedGroups = project.combinedGroups || [];
  const teachersByName = new Map((project.teachers || []).map(t => [t.name, t]));
  const UNASSIGNED_KEY = '(未定)';

  const tabStats = [];
  const teacherStats = {};
  const teachersFound = new Set();
  const detailRows = [];

  (project.tabs || []).forEach(tab => {
    const needed = (tab.config?.subjectCounts?.[subject] || 0) * (tab.config?.classes?.length || 0);
    let filled = 0;
    // タブごとに自動NGを再計算 (period 表記がタブで異なり得るため)
    const autoNgByTeacher = computeAutoNgByTeacher(
      project.teachers || [],
      project.externalSessions || [],
      tab.config?.periods || [],
    );

    (tab.config?.dates || []).forEach(d => {
      (tab.config?.periods || []).forEach(p => {
        (tab.config?.classes || []).forEach(c => {
          const e = tab.schedule?.[makeKey(d.id, p.id, c.id)];
          if (!e || e.subject !== subject) return;
          filled++;

          const group = findCombinedGroup(combinedGroups, subject, c.label, d.label);
          const isNonPrimary = group && !isPrimaryCombinedClass(group, c.label);

          const noteParts = [];
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

// Excel 上のシート名は 31 文字 + 一部の禁則文字。重複した場合は suffix を付与。
function uniqueSheetName(workbook, baseName) {
  let name = baseName.substring(0, 31);
  if (!workbook.getWorksheet(name)) return name;
  let suffix = 1;
  while (true) {
    const tail = `_${suffix}`;
    name = (baseName.substring(0, 31 - tail.length) + tail);
    if (!workbook.getWorksheet(name)) return name;
    suffix++;
  }
}

function buildOneSubjectSheet(workbook, project, subject) {
  const safeSubject = subject.replace(/[\\/:?*[\]]/g, '');
  const ws = workbook.addWorksheet(uniqueSheetName(workbook, `科目別_${safeSubject}`));

  const stats = computeSubjectStats(project, subject);
  const subjColor = (project.subjectColors || {})[subject];
  const tabNames = (project.tabs || []).map(t => t.name);

  // 行ごとに値を書きつつ style 適用する小ヘルパ。
  let rowIdx = 1;
  const writeRow = (values, style) => {
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
export function buildExcelFilename(project, suffix) {
  const projectName = (project.name || '時間割').replace(/[\\/:?*[\]<>|"]/g, '');
  const datePart = new Date().toISOString().slice(0, 10);
  return `${projectName}_${suffix}_${datePart}.xlsx`;
}

// ─── 全体 Excel: 公開エントリ ──────────────────────────────────────
export async function downloadScheduleExcel(project) {
  const workbook = buildScheduleWorkbook(project);
  await downloadWorkbook(workbook, buildExcelFilename(project, '全体'));
}

// ─── 講師別 Excel: workbook 構築 ───────────────────────────────────
export function buildTeacherWorkbook(project) {
  const workbook = new ExcelJS.Workbook();
  const subjectColors = project.subjectColors || {};
  const combinedGroups = project.combinedGroups || [];

  // 「全講師リスト」シート用の集約
  const allRows = [];
  const allRowSubjects = [];

  project.teachers.forEach(t => {
    // この講師の出勤コマを集める
    const personalRows = [];
    const personalSubjects = [];

    project.tabs.forEach(tab => {
      tab.config.dates.forEach((d) => {
        tab.config.periods.forEach((p) => {
          tab.config.classes.forEach((c) => {
            const k = makeKey(d.id, p.id, c.id);
            const entry = tab.schedule[k];
            if (entry && entry.teacher === t.name) {
              const group = findCombinedGroup(combinedGroups, entry.subject, c.label, d.label);
              const note = group ? `合同(${group.classes.join(',')})` : '';
              const row = [d.label, p.label, c.label, entry.subject, tab.name, note];
              personalRows.push(row);
              personalSubjects.push(entry.subject);
              allRows.push([t.name, ...row]);
              allRowSubjects.push(entry.subject);
            }
          });
        });
      });
    });

    if (personalRows.length === 0) return;

    const safeName = t.name.replace(/[\\/:?*[\]]/g, '').substring(0, 30);
    const ws = workbook.addWorksheet(safeName);

    // ヘッダ
    const header = ['日付', '時限', 'クラス', '科目', '場所(タブ)', '備考'];
    ws.addRow(header);
    header.forEach((_, ci) => applyCellStyle(ws.getCell(1, ci + 1), TEACHER_HEADER_STYLE));

    // データ行
    personalRows.forEach((row, ri) => {
      ws.addRow(row);
      const subject = personalSubjects[ri];
      row.forEach((_, ci) => {
        const cell = ws.getCell(ri + 2, ci + 1);
        if (ci === 3 && subject) {
          applyCellStyle(cell, makeSubjectCellStyle(subject, subjectColors));
        } else {
          applyCellStyle(cell, BODY_CELL_STYLE);
        }
      });
    });

    [14, 14, 10, 10, 15, 18].forEach((w, ci) => { ws.getColumn(ci + 1).width = w; });
  });

  // 全講師リストシート
  if (allRows.length > 0) {
    const wsAll = workbook.addWorksheet('全講師リスト');
    const allHeader = ['講師名', '日付', '時限', 'クラス', '科目', 'タブ名', '備考'];
    wsAll.addRow(allHeader);
    allHeader.forEach((_, ci) => applyCellStyle(wsAll.getCell(1, ci + 1), TEACHER_HEADER_STYLE));

    allRows.forEach((row, ri) => {
      wsAll.addRow(row);
      const subject = allRowSubjects[ri];
      row.forEach((_, ci) => {
        const cell = wsAll.getCell(ri + 2, ci + 1);
        if (ci === 4 && subject) {
          applyCellStyle(cell, makeSubjectCellStyle(subject, subjectColors));
        } else {
          applyCellStyle(cell, BODY_CELL_STYLE);
        }
      });
    });

    [10, 14, 14, 10, 10, 15, 18].forEach((w, ci) => { wsAll.getColumn(ci + 1).width = w; });
  } else {
    // 該当なしでも空シートを作って一貫性を保つ
    workbook.addWorksheet('全講師リスト');
  }

  return workbook;
}

// ─── 講師別 Excel: 公開エントリ ────────────────────────────────────
export async function downloadTeacherExcel(project) {
  const workbook = buildTeacherWorkbook(project);
  await downloadWorkbook(workbook, buildExcelFilename(project, '講師別'));
}
