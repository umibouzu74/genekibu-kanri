import * as XLSX from 'xlsx-js-style';
import { cleanSchedule, getSubjectColor } from './constants';
import { makeKey, findCombinedGroup, isPrimaryCombinedClass } from './scheduleKey';

// --- 共通スタイル定義 ---

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'AAAAAA' } },
  bottom: { style: 'thin', color: { rgb: 'AAAAAA' } },
  left: { style: 'thin', color: { rgb: 'AAAAAA' } },
  right: { style: 'thin', color: { rgb: 'AAAAAA' } },
};

const HEADER_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: THIN_BORDER,
};

const DATE_HEADER_STYLE = {
  font: { bold: true, sz: 10 },
  fill: { fgColor: { rgb: 'E2EFDA' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: THIN_BORDER,
};

const PERIOD_STYLE = {
  font: { sz: 9 },
  fill: { fgColor: { rgb: 'F2F2F2' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: THIN_BORDER,
};

const EMPTY_CELL_STYLE = {
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: THIN_BORDER,
};

// HEX カラー (#RRGGBB) を RRGGBB に変換
function hexToRgb(hex) {
  return hex.replace('#', '').toUpperCase();
}

// 科目カラーからセルスタイルを生成
function makeSubjectCellStyle(subject, subjectColors) {
  const color = getSubjectColor(subject, subjectColors);
  const style = {
    font: { sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: THIN_BORDER,
  };
  if (color) {
    style.fill = { fgColor: { rgb: hexToRgb(color) } };
  }
  return style;
}

// ワークシートの全セルにスタイルを適用するヘルパー
function applyStylesToRange(ws, styleMap) {
  Object.keys(styleMap).forEach(cellRef => {
    if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
    ws[cellRef].s = styleMap[cellRef];
  });
}

// --- 全体Excel出力 ---
export function downloadScheduleExcel(project) {
  const cleaned = cleanSchedule(project);
  const wb = XLSX.utils.book_new();

  cleaned.tabs.forEach(tab => {
    const { dates, periods, classes } = tab.config;
    const subjectColors = project.subjectColors || {};

    const combinedGroups = project.combinedGroups || [];

    // データ行を構築
    const headerRow = ["日付", "時限", ...classes];
    const dataRows = dates.flatMap((d, dIdx) =>
      periods.map((p, pIdx) =>
        [d, p, ...classes.map((c, cIdx) => {
          const e = tab.schedule[makeKey(dIdx, pIdx, cIdx)];
          if (!e || !e.subject) return "";
          const group = findCombinedGroup(combinedGroups, e.subject, c, d);
          if (group && !isPrimaryCombinedClass(group, c)) {
            return `${e.subject}\n(合同)`;
          }
          return `${e.subject}\n${e.teacher}`;
        })]
      )
    );
    const allRows = [headerRow, ...dataRows];

    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // 列幅設定
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, ...classes.map(() => ({ wch: 16 }))];

    // 行高設定（データ行は2行分の高さ）
    ws['!rows'] = [{ hpt: 24 }]; // ヘッダー行
    for (let i = 0; i < dataRows.length; i++) {
      ws['!rows'].push({ hpt: 36 }); // データ行（科目＋講師の2行表示）
    }

    const styles = {};
    const numCols = 2 + classes.length;

    // ヘッダー行スタイル
    for (let c = 0; c < numCols; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      styles[cellRef] = HEADER_STYLE;
    }

    // データ行スタイル
    let rowIdx = 1;
    dates.forEach((d, dIdx) => {
      periods.forEach((p, pIdx) => {
        // 日付列
        const dateRef = XLSX.utils.encode_cell({ r: rowIdx, c: 0 });
        styles[dateRef] = DATE_HEADER_STYLE;

        // 時限列
        const periodRef = XLSX.utils.encode_cell({ r: rowIdx, c: 1 });
        styles[periodRef] = PERIOD_STYLE;

        // クラス列（科目カラー）
        classes.forEach((cls, cIdx) => {
          const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: 2 + cIdx });
          const entry = tab.schedule[makeKey(dIdx, pIdx, cIdx)];
          if (entry && entry.subject) {
            styles[cellRef] = makeSubjectCellStyle(entry.subject, subjectColors);
          } else {
            styles[cellRef] = EMPTY_CELL_STYLE;
          }
        });
        rowIdx++;
      });
    });

    applyStylesToRange(ws, styles);

    // 日付セルの結合（同一日付の時限をまとめる）
    const merges = [];
    let currentRow = 1;
    dates.forEach(() => {
      if (periods.length > 1) {
        merges.push({
          s: { r: currentRow, c: 0 },
          e: { r: currentRow + periods.length - 1, c: 0 },
        });
      }
      currentRow += periods.length;
    });
    if (merges.length > 0) {
      ws['!merges'] = merges;
    }

    XLSX.utils.book_append_sheet(wb, ws, tab.name);
  });

  const projectName = (project.name || "時間割").replace(/[\\/:?*[\]<>|"]/g, "");
  const datePart = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${projectName}_全体_${datePart}.xlsx`);
}

// --- 講師別Excel出力 ---
export function downloadTeacherExcel(project) {
  const wb = XLSX.utils.book_new();
  const subjectColors = project.subjectColors || {};

  // 講師別ヘッダースタイル
  const teacherHeaderStyle = {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '548235' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: THIN_BORDER,
  };

  const combinedGroups = project.combinedGroups || [];
  const allRows = [["講師名", "日付", "時限", "クラス", "科目", "タブ名", "備考"]];
  const allRowSubjects = [null]; // ヘッダー行は null

  project.teachers.forEach(t => {
    const personalRows = [["日付", "時限", "クラス", "科目", "場所(タブ)", "備考"]];
    const personalSubjects = [null]; // ヘッダー行は null

    project.tabs.forEach(tab => {
      tab.config.dates.forEach((d, dIdx) => {
        tab.config.periods.forEach((p, pIdx) => {
          tab.config.classes.forEach((c, cIdx) => {
            const k = makeKey(dIdx, pIdx, cIdx);
            const entry = tab.schedule[k];
            if (entry && entry.teacher === t.name) {
              const group = findCombinedGroup(combinedGroups, entry.subject, c, d);
              const note = group ? `合同(${group.classes.join(',')})` : "";
              const row = [d, p, c, entry.subject, tab.name, note];
              personalRows.push(row);
              personalSubjects.push(entry.subject);
              allRows.push([t.name, ...row]);
              allRowSubjects.push(entry.subject);
            }
          });
        });
      });
    });

    if (personalRows.length > 1) {
      const ws = XLSX.utils.aoa_to_sheet(personalRows);
      ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 18 }];

      // ヘッダースタイル
      const styles = {};
      for (let c = 0; c < 6; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c });
        styles[cellRef] = teacherHeaderStyle;
      }
      // データ行スタイル
      for (let r = 1; r < personalRows.length; r++) {
        const subject = personalSubjects[r];
        for (let c = 0; c < 6; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (c === 3 && subject) {
            // 科目列にカラーを適用
            styles[cellRef] = makeSubjectCellStyle(subject, subjectColors);
          } else {
            styles[cellRef] = {
              font: { sz: 10 },
              alignment: { horizontal: 'center', vertical: 'center' },
              border: THIN_BORDER,
            };
          }
        }
      }
      applyStylesToRange(ws, styles);

      const safeName = t.name.replace(/[\\/:?*[\]]/g, "").substring(0, 30);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    }
  });

  // 全講師リストシート
  const wsAll = XLSX.utils.aoa_to_sheet(allRows);
  wsAll['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 18 }];

  const allStyles = {};
  // ヘッダースタイル
  for (let c = 0; c < 7; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    allStyles[cellRef] = teacherHeaderStyle;
  }
  // データ行スタイル
  for (let r = 1; r < allRows.length; r++) {
    const subject = allRowSubjects[r];
    for (let c = 0; c < 7; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (c === 4 && subject) {
        // 科目列にカラーを適用
        allStyles[cellRef] = makeSubjectCellStyle(subject, subjectColors);
      } else {
        allStyles[cellRef] = {
          font: { sz: 10 },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_BORDER,
        };
      }
    }
  }
  applyStylesToRange(wsAll, allStyles);

  XLSX.utils.book_append_sheet(wb, wsAll, "全講師リスト");

  const projectName = (project.name || "時間割").replace(/[\\/:?*[\]<>|"]/g, "");
  const datePart = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${projectName}_講師別_${datePart}.xlsx`);
}
