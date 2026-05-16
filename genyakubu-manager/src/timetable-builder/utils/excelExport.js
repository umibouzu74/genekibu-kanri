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
import { makeKey, findCombinedGroup, isPrimaryCombinedClass } from './scheduleKey';

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
function hexToArgb(hex) {
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

// ─── 全体 Excel 出力 ───────────────────────────────────────────────
export async function downloadScheduleExcel(project) {
  const cleaned = cleanSchedule(project);
  const workbook = new ExcelJS.Workbook();
  const subjectColors = project.subjectColors || {};

  cleaned.tabs.forEach(tab => {
    const { dates, periods, classes } = tab.config;
    const combinedGroups = project.combinedGroups || [];
    const ws = workbook.addWorksheet(tab.name);

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
          return `${e.subject}\n${e.teacher}`;
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

  const projectName = (project.name || '時間割').replace(/[\\/:?*[\]<>|"]/g, '');
  const datePart = new Date().toISOString().slice(0, 10);
  await downloadWorkbook(workbook, `${projectName}_全体_${datePart}.xlsx`);
}

// ─── 講師別 Excel 出力 ─────────────────────────────────────────────
export async function downloadTeacherExcel(project) {
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

  const projectName = (project.name || '時間割').replace(/[\\/:?*[\]<>|"]/g, '');
  const datePart = new Date().toISOString().slice(0, 10);
  await downloadWorkbook(workbook, `${projectName}_講師別_${datePart}.xlsx`);
}
