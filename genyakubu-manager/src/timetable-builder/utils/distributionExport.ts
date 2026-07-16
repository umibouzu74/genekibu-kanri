// 配布用 (完成版レイアウト) Excel 出力。
//
// 例年手作業で仕上げていた掲示・配布用の紙面 (2025 年夏期の完成版 xls) を
// そのまま再現するビルダー。学年グリッド (excelExport.buildScheduleWorkbook)
// が「作成作業用の一覧表」なのに対し、こちらは「そのまま印刷して掲示する
// ポスター」を目指す。紙面の特徴:
//
//   - 1 シート = 同じ時限セットを使うタブのグループ (例: 中1+中2 の夜帯を
//     1 枚に横並び、中3 の昼帯は別の 1 枚)
//   - 日付ごとのブロックを縦に積み、左列 → 右列の 2 段組 (新聞式) で並べる
//   - 各時限は「時限名 + クラス別科目」「時刻 + クラス別講師」の 2 行ペア
//   - 先頭に クラス行 + 教室行 (複数タブなら 学年 行も) のヘッダ
//   - A4 縦・1×1 ページに収める fit-to-page を pageSetup に埋め込み
//
// モデルに無い情報 (教室番号・確認テストの出題範囲・イベント日の説明文・
// 欄外のお知らせ) は空欄 or 結合済みの空セルとして紙面に確保し、Excel 上で
// 手書きして完成させる運用 (完成版レイアウトの範囲はあくまで時間割本体)。
//
// 書式 (フォント・罫線・塗り・列幅・ページ設定) は 2025 年版 xls の実測値。
// 科目セルの色分けは行わない (モノクロ印刷前提の紙面のため)。
import ExcelJS from 'exceljs';
import { cleanSchedule } from './constants';
import type { Entity, Project, Schedule, Tab } from '../types';
import { makeKey, findCombinedGroup, isPrimaryCombinedClass, effectiveConfigForTab } from './scheduleKey';
import { getPeriodTimeRange } from './timeRange';
import { sortPoolDatesByCalendar } from './dateGenerate';
import {
  buildExcelFilename,
  downloadWorkbook,
  makeSubjectOrderMarker,
  sanitizeSheetName,
  uniqueSheetName,
} from './excelExport';

// ─── 紙面の実測定数 (2025 年版 xls 由来) ──────────────────────────

const GOTHIC = 'ＭＳ Ｐゴシック';
const MINCHO = 'ＭＳ Ｐ明朝';

// シートごとのアクセント色 (ヘッダ行 + 日付セルの塗り)。元紙面は
// 中1中2 = 薄緑 / 中3 = 水色。シート順に循環して割り当てる。
const ACCENT_ARGBS = ['FFCCFFCC', 'FFCCFFFF', 'FFFFFFCC', 'FFFFE4CC'];

// 列幅 (Excel の文字数単位)。元紙面の 1/256 文字値を丸めたもの。
const WIDTH_MARGIN_COL = 13.75; // A 列: ポスターの左余白
const WIDTH_DATE_COL = 5.5;
const WIDTH_LABEL_COL = 9.5;
const WIDTH_CLASS_COL = 5.75;
const WIDTH_GAP_COL = 2.88; // 左右段組の間

// 行高 (pt)。元紙面は全行 12.75pt (Excel 既定) で 4 校時 × 13 日でも
// A4 縦 1 枚に収まる密度にしている。
const ROW_HEIGHT = 12.75;
const TITLE_ROW_HEIGHT = 18;

type BorderStyle = 'thin' | 'hair';

// ─── 小ヘルパ (純粋関数、テスト用に export) ───────────────────────

// 日付ラベル "7/29(火)" → 日付セル表示 "7/29\n(火)" (2 行組)。
// 曜日括弧が無いラベルはそのまま。
export function formatDateCell(label: string): string {
  const m = String(label || '').match(/^(.*?)\s*([(（][^)）]*[)）])\s*$/);
  if (!m || !m[1]) return String(label || '');
  return `${m[1]}\n${m[2]}`;
}

// 時限ラベル "1限 (13:00~13:45)" → { name: '1限', time: '13:00～13:45' }。
// 時刻は timeRange のパース結果から組み直す (表記ゆれを紙面では統一)。
// 時刻の取れないラベルは name にそのまま、time は '' を返す。
export function splitPeriodLabel(period: Entity): { name: string; time: string } {
  const label = String(period.label || '').trim();
  const range = getPeriodTimeRange(period);
  if (!range) return { name: label, time: '' };

  const fmt = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const time = range.endMin != null
    ? `${fmt(range.startMin)}～${fmt(range.endMin)}`
    : `${fmt(range.startMin)}～`;

  // ラベルから時刻部分 (括弧ごと) を除いた残りを時限名とする
  const name = label
    .replace(/[(（]?\s*\d{1,2}[:：]\d{2}\s*(?:[~～〜\-–]\s*(?:\d{1,2}[:：]\d{2})?)?\s*[)）]?/, '')
    .trim();
  return { name: name || label, time };
}

// 日付リストを左段 → 右段へ振り分ける (新聞式 2 段組)。左段が多い側。
export function splitDatesIntoColumns<T>(dates: T[]): { left: T[]; right: T[] } {
  const half = Math.ceil(dates.length / 2);
  return { left: dates.slice(0, half), right: dates.slice(half) };
}

// ─── タブのグルーピング ────────────────────────────────────────────

export interface DistributionSheetGroup {
  /** 同じ時限セットを使うタブ (project.tabs の順) */
  tabs: Tab[];
  /** グループ共通の時限 (プール順) */
  periods: Entity[];
  /** グループ内タブが使う日の和集合 (カレンダー順) */
  dates: Entity[];
}

// 「同じ時限セット (effective periods) を使うタブ」を 1 シートに束ねる。
// 元紙面の T1T2 (中1+中2 の夜帯) / T3 (中3 の昼帯) の分かれ方を、時限
// 構成から機械的に導く。クラス 0 のタブは紙面に列が無いので除外。
export function groupTabsForDistribution(project: Project): DistributionSheetGroup[] {
  const groups: DistributionSheetGroup[] = [];
  const groupByKey = new Map<string, DistributionSheetGroup>();

  (project.tabs || []).forEach(tab => {
    if ((tab.config?.classes || []).length === 0) return;
    const effective = effectiveConfigForTab(project, tab);
    const key = effective.periods.map(p => p.id).sort((a, b) => a - b).join(',');
    let group = groupByKey.get(key);
    if (!group) {
      group = { tabs: [], periods: effective.periods, dates: [] };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.tabs.push(tab);
  });

  // 日付は各タブの使用日の和集合。並びはプールのカレンダー順に合わせる。
  groups.forEach(group => {
    const usedIds = new Set<number>();
    group.tabs.forEach(tab => {
      effectiveConfigForTab(project, tab).dates.forEach(d => usedIds.add(d.id));
    });
    group.dates = sortPoolDatesByCalendar(project.dates || []).filter(d => usedIds.has(d.id));
  });

  return groups;
}

// ─── 罫線ペインタ ──────────────────────────────────────────────────

type Edge = 'top' | 'bottom' | 'left' | 'right';
type EdgeSet = Partial<Record<Edge, BorderStyle>>;

// 罫線はセルへ直接書かず、いったんマトリクスに溜めて最後に一括適用する。
// exceljs は mergeCells 時に結合範囲の全セルへ master の style オブジェクト
// を「共有」させるため、結合セルの一辺だけを後から書き換えると同じ結合内の
// 他のセルの罫線まで巻き添えで変わる (最後の書き込みが勝つ)。結合領域は
// 「外枠ボックス」を master に 1 回だけ適用すれば全セルに行き渡り、内側の
// 辺は Excel が描画しないので、この方式で紙面どおりの枠になる。
class BorderPainter {
  private edges = new Map<string, EdgeSet>();

  set(row: number, col: number, edge: Edge, style: BorderStyle) {
    const key = `${row}:${col}`;
    const cur = this.edges.get(key) || {};
    cur[edge] = style;
    this.edges.set(key, cur);
  }

  get(row: number, col: number): EdgeSet {
    return this.edges.get(`${row}:${col}`) || {};
  }

  /** 矩形領域の外周に罫線を引く */
  outline(r1: number, c1: number, r2: number, c2: number, style: BorderStyle) {
    for (let c = c1; c <= c2; c++) {
      this.set(r1, c, 'top', style);
      this.set(r2, c, 'bottom', style);
    }
    for (let r = r1; r <= r2; r++) {
      this.set(r, c1, 'left', style);
      this.set(r, c2, 'right', style);
    }
  }

  /** 溜めた罫線を適用。merges は mergeCells 済み領域 [r1,c1,r2,c2] のリスト */
  applyTo(ws: ExcelJS.Worksheet, merges: Array<[number, number, number, number]>) {
    const inMerge = (row: number, col: number) =>
      merges.some(([r1, c1, r2, c2]) => row >= r1 && row <= r2 && col >= c1 && col <= c2);

    const toBorder = (set: EdgeSet): Partial<ExcelJS.Borders> => {
      const border: Partial<ExcelJS.Borders> = {};
      (Object.keys(set) as Edge[]).forEach(edge => {
        border[edge] = { style: set[edge] as BorderStyle };
      });
      return border;
    };

    this.edges.forEach((set, key) => {
      const [row, col] = key.split(':').map(Number);
      if (inMerge(row, col)) return; // 結合領域は下でボックスとして適用
      ws.getCell(row, col).border = toBorder(set);
    });

    merges.forEach(([r1, c1, r2, c2]) => {
      const box: EdgeSet = {
        top: this.get(r1, c1).top,
        left: this.get(r1, c1).left,
        right: this.get(r1, c2).right,
        bottom: this.get(r2, c1).bottom,
      };
      (Object.keys(box) as Edge[]).forEach(edge => { if (!box[edge]) delete box[edge]; });
      ws.getCell(r1, c1).border = toBorder(box);
    });
  }
}

// ─── シート 1 枚分の構築 ───────────────────────────────────────────

/** クラス列 1 本分: どのタブのどのクラスが何列目 (0-based offset) か */
interface ClassColumn {
  tabIdx: number; // group.tabs 内の index
  cls: Entity;
  offset: number;
}

// 半段 (左 or 右) の列位置。base = 日付列の列番号 (1-based)。
interface HalfCols {
  dateCol: number;
  labelCol: number;
  firstClassCol: number;
  lastClassCol: number;
}

function halfCols(base: number, classCount: number): HalfCols {
  return {
    dateCol: base,
    labelCol: base + 1,
    firstClassCol: base + 2,
    lastClassCol: base + 1 + classCount,
  };
}

function buildDistributionSheet(
  workbook: ExcelJS.Workbook,
  project: Project,
  group: DistributionSheetGroup,
  accentArgb: string,
) {
  const sheetBase = group.tabs.map(t => t.name).join('') + '時間割';
  const ws = workbook.addWorksheet(uniqueSheetName(workbook, sanitizeSheetName(sheetBase)));
  // 画面上もポスターとして見えるよう目盛線は消す (印刷には影響しない)
  ws.views = [{ showGridLines: false }];

  const accentFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } };
  const combinedGroups = project.combinedGroups || [];
  const multiTab = group.tabs.length > 1;

  // 罫線はマトリクスに溜めて最後に適用 (クラス上の注意コメント参照)。
  // 結合は mergeCells と同時に記録して applyTo に渡す。
  const painter = new BorderPainter();
  const merges: Array<[number, number, number, number]> = [];
  const merge = (r1: number, c1: number, r2: number, c2: number) => {
    ws.mergeCells(r1, c1, r2, c2);
    merges.push([r1, c1, r2, c2]);
  };

  // クラス列の平坦化 (タブ順 → クラス順)
  const classColumns: ClassColumn[] = [];
  group.tabs.forEach((tab, tabIdx) => {
    tab.config.classes.forEach(cls => {
      classColumns.push({ tabIdx, cls, offset: classColumns.length });
    });
  });
  const classCount = classColumns.length;

  // クラス見出しの結合グループ: 同一タブ内で隣接して同名ラベルが並ぶ範囲
  // (元紙面の「S が 2 教室に跨る」表現)。境界は罫線の太さにも使う
  // (グループ内 = hair、グループ境界 = thin)。
  const headerSpans: Array<{ start: number; end: number; label: string; tabIdx: number }> = [];
  classColumns.forEach(({ tabIdx, cls, offset }) => {
    const last = headerSpans[headerSpans.length - 1];
    if (last && last.tabIdx === tabIdx && last.label === cls.label && last.end === offset - 1) {
      last.end = offset;
    } else {
      headerSpans.push({ start: offset, end: offset, label: cls.label, tabIdx });
    }
  });
  // offset → そのクラス列の左側がグループ境界か (true = thin で区切る)
  const isSpanBoundary = (offset: number): boolean =>
    headerSpans.some(s => s.start === offset);

  // 列レイアウト: A = 余白、B.. = 左段、gap、右段
  const halfWidth = 2 + classCount;
  const left = halfCols(2, classCount);
  const gapCol = 2 + halfWidth;
  const right = halfCols(gapCol + 1, classCount);

  // 時限ラベルの分解と回数連番 (①②…) はタブ単位で前計算
  const periodParts = group.periods.map(p => splitPeriodLabel(p));
  const orderMarks = group.tabs.map(tab =>
    makeSubjectOrderMarker(effectiveConfigForTab(project, tab), tab.schedule));
  // タブごとの使用日 id (使わない日はそのタブの列を空欄にする)
  const tabDateIds = group.tabs.map(tab =>
    new Set(effectiveConfigForTab(project, tab).dates.map(d => d.id)));

  // ── タイトル (行 2)。元紙面の先頭余白 (約 3cm) に載せる。不要なら
  // Excel 上で消すだけで紙面は元紙面と同じ全空白になる。
  const rangeText = group.dates.length > 0
    ? `期間 ${group.dates[0].label}〜${group.dates[group.dates.length - 1].label}`
    : '';
  const d0 = new Date();
  const titleCell = ws.getCell(2, 2);
  titleCell.value = [
    `${project.name || '講習時間割'} — ${group.tabs.map(t => t.name).join('・')}`,
    rangeText,
    `出力日 ${d0.getMonth() + 1}/${d0.getDate()}`,
  ].filter(Boolean).join(' / ');
  titleCell.font = { name: GOTHIC, size: 12, bold: true };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // ── ヘッダ行 ([学年] / クラス / 教室) を左右両段に描く
  const headerTop = 4;
  const headerRows = multiTab ? 3 : 2;
  const classRow = headerTop + (multiTab ? 1 : 0);
  const roomRow = classRow + 1;

  const drawHeader = (cols: HalfCols) => {
    // ラベル列
    const labels: Array<[number, string]> = multiTab
      ? [[headerTop, '学　年'], [classRow, 'クラス'], [roomRow, '教　室']]
      : [[classRow, 'クラス'], [roomRow, '教　室']];
    labels.forEach(([row, text]) => {
      const cell = ws.getCell(row, cols.labelCol);
      cell.value = text;
      cell.font = { name: GOTHIC, size: 9 };
      cell.fill = accentFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
    });

    // 学年行: タブ名をそのクラス列範囲に結合して表示
    if (multiTab) {
      group.tabs.forEach((tab, tabIdx) => {
        const offsets = classColumns.filter(cc => cc.tabIdx === tabIdx).map(cc => cc.offset);
        const c1 = cols.firstClassCol + offsets[0];
        const c2 = cols.firstClassCol + offsets[offsets.length - 1];
        if (c2 > c1) merge(headerTop, c1, headerTop, c2);
        const cell = ws.getCell(headerTop, c1);
        cell.value = tab.name;
        cell.font = { name: GOTHIC, size: 10 };
        cell.fill = accentFill;
        cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      });
    }

    // クラス行: 隣接同名は結合 (教室違いの同一クラス表現)
    headerSpans.forEach(span => {
      const c1 = cols.firstClassCol + span.start;
      const c2 = cols.firstClassCol + span.end;
      if (c2 > c1) merge(classRow, c1, classRow, c2);
      const cell = ws.getCell(classRow, c1);
      cell.value = span.label;
      cell.font = { name: GOTHIC, size: 9 };
      cell.fill = accentFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
    });

    // 教室行: モデルに教室情報が無いので空欄 (塗り + 罫線だけ用意して
    // Excel 上で番号を書き込む)。クラス列 1 本 = 教室 1 つ。
    for (let off = 0; off < classCount; off++) {
      const cell = ws.getCell(roomRow, cols.firstClassCol + off);
      cell.fill = accentFill;
      cell.font = { name: GOTHIC, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
    }

    // 罫線: 外周 thin、学年|クラス thin、クラス|教室 hair、縦は
    // ラベル列と span 境界が thin / span 内は hair
    painter.outline(headerTop, cols.labelCol, roomRow, cols.lastClassCol, 'thin');
    if (multiTab) {
      for (let c = cols.labelCol; c <= cols.lastClassCol; c++) {
        painter.set(headerTop, c, 'bottom', 'thin');
        painter.set(classRow, c, 'top', 'thin');
      }
    }
    for (let c = cols.labelCol; c <= cols.lastClassCol; c++) {
      painter.set(classRow, c, 'bottom', 'hair');
      painter.set(roomRow, c, 'top', 'hair');
    }
    for (let row = headerTop; row <= roomRow; row++) {
      painter.set(row, cols.labelCol, 'right', 'thin');
      painter.set(row, cols.firstClassCol, 'left', 'thin');
      for (let off = 1; off < classCount; off++) {
        const style: BorderStyle = isSpanBoundary(off) ? 'thin' : 'hair';
        painter.set(row, cols.firstClassCol + off - 1, 'right', style);
        painter.set(row, cols.firstClassCol + off, 'left', style);
      }
    }
  };

  // ── 日ブロック 1 個を描く。戻り値は消費した行数 (spacer 含まず)。
  const drawDayBlock = (cols: HalfCols, date: Entity, top: number): number => {
    const rows = group.periods.length * 2;
    const bottom = top + rows - 1;

    // 日付セル (ブロック全高に結合、"7/29\n(火)")
    if (bottom > top) merge(top, cols.dateCol, bottom, cols.dateCol);
    const dateCell = ws.getCell(top, cols.dateCol);
    dateCell.value = formatDateCell(date.label);
    dateCell.font = { name: GOTHIC, size: 12 };
    dateCell.fill = accentFill;
    dateCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    painter.outline(top, cols.dateCol, bottom, cols.dateCol, 'thin');

    // セル文言の前計算 (科目 + 連番 / 講師)。タブが使わない日は空欄。
    // rawSubjs は連番抜きの科目名 (結合判定用: 連番はクラスごとに違い得る)。
    const subjTexts: string[][] = [];
    const rawSubjs: string[][] = [];
    const teachTexts: string[][] = [];
    group.periods.forEach((p, pi) => {
      subjTexts[pi] = [];
      rawSubjs[pi] = [];
      teachTexts[pi] = [];
      classColumns.forEach(({ tabIdx, cls, offset }) => {
        const tab = group.tabs[tabIdx];
        let subj = '';
        let raw = '';
        let teach = '';
        if (tabDateIds[tabIdx].has(date.id)) {
          const key = makeKey(date.id, p.id, cls.id);
          const e: Schedule[string] | undefined = tab.schedule[key];
          if (e && e.subject) {
            raw = e.subject;
            subj = e.subject + orderMarks[tabIdx](key, e.subject, cls.id, date.id);
            const cg = findCombinedGroup(combinedGroups, e.subject, cls.label, date.label);
            if (cg && !isPrimaryCombinedClass(cg, cls.label)) {
              teach = '(合同)';
            } else if (e.teacher && e.teacher !== '未定') {
              teach = e.teacher;
            }
          }
        }
        subjTexts[pi][offset] = subj;
        rawSubjs[pi][offset] = raw;
        teachTexts[pi][offset] = teach;
      });
    });

    // 授業ゼロの日 (イベント日など): 時限欄ごと 1 つの空セルに結合して
    // 説明文の書き込み欄にする (元紙面のチャレンジテスト日と同じ扱い)
    const dayIsEmpty = subjTexts.every(row => row.every(t => t === ''));
    if (dayIsEmpty) {
      merge(top, cols.labelCol, bottom, cols.lastClassCol);
      const cell = ws.getCell(top, cols.labelCol);
      cell.font = { name: GOTHIC, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      painter.outline(top, cols.labelCol, bottom, cols.lastClassCol, 'thin');
      return rows;
    }

    group.periods.forEach((p, pi) => {
      const subjRow = top + pi * 2;
      const timeRow = subjRow + 1;

      // 時限ラベル (名称 / 時刻)
      const nameCell = ws.getCell(subjRow, cols.labelCol);
      nameCell.value = periodParts[pi].name;
      const timeCell = ws.getCell(timeRow, cols.labelCol);
      timeCell.value = periodParts[pi].time;
      [nameCell, timeCell].forEach(cell => {
        cell.font = { name: GOTHIC, size: 8.5 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      });

      // 「タブ内の全クラスが同一科目 + 講師なし」の時限 (確認テスト等) は
      // 2 行 × クラス列を 1 セルに結合する (元紙面の確認テスト行の表現)。
      // 判定は連番抜きの科目名で行い (回数連番はクラスごとにズレ得る)、
      // 連番は範囲内で一致するときだけ結合セルに残す。隣接タブ同士で文言が
      // 同じならさらに繋げる (元紙面: 学年をまたいで同一科目なら全幅 1 セル、
      // 学年ごとに違えば学年単位のセル)。
      const segments: Array<{ startOff: number; endOff: number; text: string }> = [];
      group.tabs.forEach((tab, tabIdx) => {
        const offs = classColumns.filter(cc => cc.tabIdx === tabIdx).map(cc => cc.offset);
        const raw0 = rawSubjs[pi][offs[0]];
        const tabUniform = raw0 !== ''
          && offs.every(off => rawSubjs[pi][off] === raw0)
          && offs.every(off => teachTexts[pi][off] === '');
        if (!tabUniform) return;
        const text = offs.every(off => subjTexts[pi][off] === subjTexts[pi][offs[0]])
          ? subjTexts[pi][offs[0]]
          : raw0;
        const last = segments[segments.length - 1];
        if (last && last.endOff === offs[0] - 1 && last.text === text) {
          last.endOff = offs[offs.length - 1];
        } else {
          segments.push({ startOff: offs[0], endOff: offs[offs.length - 1], text });
        }
      });
      const inSegment = new Set<number>();
      segments.forEach(seg => {
        for (let off = seg.startOff; off <= seg.endOff; off++) inSegment.add(off);
        merge(subjRow, cols.firstClassCol + seg.startOff, timeRow, cols.firstClassCol + seg.endOff);
        const cell = ws.getCell(subjRow, cols.firstClassCol + seg.startOff);
        cell.value = seg.text;
        cell.font = { name: GOTHIC, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      classColumns.forEach(({ offset }) => {
        if (inSegment.has(offset)) return;
        const subjCell = ws.getCell(subjRow, cols.firstClassCol + offset);
        subjCell.value = subjTexts[pi][offset];
        subjCell.font = { name: GOTHIC, size: 8 };
        subjCell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
        const teachCell = ws.getCell(timeRow, cols.firstClassCol + offset);
        teachCell.value = teachTexts[pi][offset];
        teachCell.font = { name: MINCHO, size: 8 };
        teachCell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // 時限ペア間の区切り: 通常 hair、テスト系時限の上だけ thin (元紙面の
      // 確認テスト前の区切り)。ブロック先頭は外周 thin が引かれる。
      if (pi > 0) {
        const style: BorderStyle = /テスト/.test(p.label) ? 'thin' : 'hair';
        for (let c = cols.labelCol; c <= cols.lastClassCol; c++) {
          painter.set(subjRow - 1, c, 'bottom', style);
          painter.set(subjRow, c, 'top', style);
        }
      }
    });

    // 縦罫線: ラベル列 thin、クラス列は span 境界 thin / span 内 hair
    for (let row = top; row <= bottom; row++) {
      painter.set(row, cols.labelCol, 'left', 'thin');
      painter.set(row, cols.labelCol, 'right', 'thin');
      painter.set(row, cols.firstClassCol, 'left', 'thin');
      for (let off = 1; off < classCount; off++) {
        const style: BorderStyle = isSpanBoundary(off) ? 'thin' : 'hair';
        painter.set(row, cols.firstClassCol + off - 1, 'right', style);
        painter.set(row, cols.firstClassCol + off, 'left', style);
      }
      painter.set(row, cols.lastClassCol, 'right', 'thin');
    }
    // 外周の上下 thin
    for (let c = cols.labelCol; c <= cols.lastClassCol; c++) {
      painter.set(top, c, 'top', 'thin');
      painter.set(bottom, c, 'bottom', 'thin');
    }

    return rows;
  };

  // ── 日ブロックを左右 2 段に流し込む (時限 0 のグループはヘッダのみ)
  const blockDates = group.periods.length > 0 ? group.dates : [];
  const { left: leftDates, right: rightDates } = splitDatesIntoColumns(blockDates);
  const blocksTop = headerTop + headerRows;
  drawHeader(left);
  if (rightDates.length > 0) drawHeader(right);

  let maxRow = roomRow;
  [{ cols: left, dates: leftDates }, { cols: right, dates: rightDates }].forEach(({ cols, dates }) => {
    let cursor = blocksTop;
    dates.forEach(date => {
      cursor += drawDayBlock(cols, date, cursor) + 1; // +1 = ブロック間の空行
    });
    maxRow = Math.max(maxRow, cursor - 2); // 最終ブロックの下端行
  });

  // 罫線を一括適用 (結合領域は外枠ボックスとして master に適用)
  painter.applyTo(ws, merges);

  // ── 列幅・行高・ページ設定
  ws.getColumn(1).width = WIDTH_MARGIN_COL;
  [left, right].forEach(cols => {
    ws.getColumn(cols.dateCol).width = WIDTH_DATE_COL;
    ws.getColumn(cols.labelCol).width = WIDTH_LABEL_COL;
    for (let c = cols.firstClassCol; c <= cols.lastClassCol; c++) {
      ws.getColumn(c).width = WIDTH_CLASS_COL;
    }
  });
  ws.getColumn(gapCol).width = WIDTH_GAP_COL;

  for (let r = 1; r <= maxRow; r++) {
    ws.getRow(r).height = r === 2 ? TITLE_ROW_HEIGHT : ROW_HEIGHT;
  }

  // A4 縦・1×1 ページに収める (元紙面の設定そのまま)。用紙 9 = A4。
  ws.pageSetup.paperSize = 9 as ExcelJS.PaperSize;
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 1;
  ws.pageSetup.margins = {
    left: 0.39, right: 0.2, top: 0.28, bottom: 0.16, header: 0.31, footer: 0.2,
  };
}

// ─── workbook 構築 (テストしやすいよう DL から分離) ────────────────

export function buildDistributionWorkbook(project: Project): ExcelJS.Workbook {
  const cleaned = cleanSchedule(project);
  const workbook = new ExcelJS.Workbook();

  groupTabsForDistribution(cleaned).forEach((group, i) => {
    buildDistributionSheet(workbook, cleaned, group, ACCENT_ARGBS[i % ACCENT_ARGBS.length]);
  });

  // シート 0 枚の workbook は Excel が開けないファイルになるため、
  // タブ未設定のプロジェクトでも空シートを 1 枚は入れておく
  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet('時間割');
  }
  return workbook;
}

// ─── 公開エントリ ──────────────────────────────────────────────────

export async function downloadDistributionExcel(project: Project) {
  const workbook = buildDistributionWorkbook(project);
  await downloadWorkbook(workbook, buildExcelFilename(project, '配布用'));
}
