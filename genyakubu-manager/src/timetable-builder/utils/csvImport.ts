// CSV インポートの parser。D6a (bulk import) の MVP として
// 講師マスタの CSV インポートを担当する。
//
// フォーマット (1 行目はヘッダ、必須カラム: name, subjects):
//   name,subjects
//   堀上,英語
//   未定,英語|数学|国語|理科|社会
//   山田 太郎,数学|理科
//
// - 区切り: カンマ ","
// - subjects 列は "|" 区切り (CSV 内のカンマ衝突を避けるため)
// - ダブルクォート囲み (RFC4180) は最小限のみサポート: "..." → 内側の "" は " に
// - 空行 / 全カラム空白の行は無視
// - 行末の \r は除去
//
// 返り値:
//   {
//     rows: [{ name, subjects: string[] }],   // 正常に parse できた行
//     errors: [{ line: number, message: string }],  // エラー行
//     unknownSubjects: string[],              // commonSubjects に無い subject (warning)
//   }
//
// commonSubjects を渡すと unknownSubjects を warning として返す。
// commonSubjects 自体は filter せず保持 (ユーザが新規追加したいケースを想定)。

export interface CsvError {
  line: number;
  message: string;
}

// N1j: CSV ファイルのバイト列をデコードする。日本語版 Excel の
// 「CSV (コンマ区切り)」既定保存は Shift-JIS (CP932) になることが多く、
// UTF-8 固定 (file.text()) で読むと講師名・ラベルが U+FFFD だらけになり、
// 全行が「未登録の講師/日付」warning に化けて原因に気づけない。
// 置換文字を検出したら shift_jis で再デコードを試す。
export function decodeCsvBytes(buffer: ArrayBuffer): { text: string; encoding: 'utf-8' | 'shift_jis' } {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return { text: utf8, encoding: 'utf-8' };
  try {
    const sjis = new TextDecoder('shift_jis').decode(buffer);
    if (!sjis.includes('�')) return { text: sjis, encoding: 'shift_jis' };
  } catch {
    // shift_jis 非対応の環境 (稀) では UTF-8 の結果をそのまま使う
  }
  return { text: utf8, encoding: 'utf-8' };
}

const REQUIRED_HEADERS = ['name', 'subjects'];

function parseLine(line: string): string[] {
  // RFC4180 風: ダブルクォート対応の最小実装。
  // フィールド内に "," を含めたい場合は "..." で囲み、内部の " は "" にエスケープ。
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else if (ch === '"' && cur === '') {
        inQuote = true;
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

// NG 日時 CSV のパーサ (E2a)。講師の不可時間を一括登録する。
//
// フォーマット (1 行目はヘッダ、必須カラム: name(または teacher), date, period):
//   name,date,period
//   田中,12/25,1限
//   田中,12/25,2限
//   未定,12/26,3限
//
// - date / period は config の「日付ラベル」「時限ラベル」と一致させる
//   (NG キーはラベルベースのため。タブ横断で同名ラベルに適用される)
// - 空行は無視、name/date/period のいずれかが空の行はエラー
// - 同一 (name,date,period) の重複行は 1 件に集約 (エラーにしない)
//
// 返り値:
//   {
//     rows: [{ name, date, period }],            // 正常に parse できた行 (重複除去済)
//     errors: [{ line, message }],               // エラー行
//     unknownTeachers: string[],                 // teacherNames に無い name (warning)
//     unknownDates: string[],                    // knownDates に無い date (warning)
//     unknownPeriods: string[],                  // knownPeriods に無い period (warning)
//   }
const NG_REQUIRED = ['date', 'period']; // name は teacher 別名を許すので別判定

export function parseNgCsv(
  text: string | null | undefined,
  { teacherNames, knownDates, knownPeriods }: {
    teacherNames?: string[];
    knownDates?: string[];
    knownPeriods?: string[];
  } = {},
): {
  rows: Array<{ name: string; date: string; period: string }>;
  errors: CsvError[];
  unknownTeachers: string[];
  unknownDates: string[];
  unknownPeriods: string[];
} {
  const rows: Array<{ name: string; date: string; period: string }> = [];
  const errors: CsvError[] = [];
  const unknownTeacherSet = new Set<string>();
  const unknownDateSet = new Set<string>();
  const unknownPeriodSet = new Set<string>();
  const teacherSet = new Set(teacherNames || []);
  const dateSet = new Set(knownDates || []);
  const periodSet = new Set(knownPeriods || []);

  const lines = (text || '').split(/\n/).map(l => l.replace(/\r$/, ''));
  if (lines.length === 0) {
    return { rows, errors: [{ line: 0, message: '空の入力です' }], unknownTeachers: [], unknownDates: [], unknownPeriods: [] };
  }

  const headerFields = parseLine(lines[0]).map(s => s.trim().toLowerCase());
  // name または teacher のどちらかが必須
  const nameIdx = headerFields.includes('name')
    ? headerFields.indexOf('name')
    : headerFields.indexOf('teacher');
  if (nameIdx < 0) {
    return {
      rows,
      errors: [{ line: 1, message: '必須カラム "name" (または "teacher") がヘッダに見つかりません' }],
      unknownTeachers: [], unknownDates: [], unknownPeriods: [],
    };
  }
  for (const required of NG_REQUIRED) {
    if (!headerFields.includes(required)) {
      return {
        rows,
        errors: [{ line: 1, message: `必須カラム "${required}" がヘッダに見つかりません (期待: name, date, period)` }],
        unknownTeachers: [], unknownDates: [], unknownPeriods: [],
      };
    }
  }
  const dateIdx = headerFields.indexOf('date');
  const periodIdx = headerFields.indexOf('period');

  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim() === '') continue;
    const fields = parseLine(raw);
    const lineNo = i + 1;

    const name = (fields[nameIdx] || '').trim();
    const date = (fields[dateIdx] || '').trim();
    const period = (fields[periodIdx] || '').trim();

    if (!name || !date || !period) {
      const missing = [!name && 'name', !date && 'date', !period && 'period'].filter(Boolean).join(', ');
      errors.push({ line: lineNo, message: `${missing} が空です` });
      continue;
    }

    // F2h: 空白結合だと空白を含む講師名で別の 3 つ組と同一キーに化けて
    // 重複扱いされうる (例: name「田中 太郎」/date「7/1」と name「田中」/
    // date「太郎 7/1」)。JSON 配列なら区切りが復元可能なので衝突しない。
    const dedupeKey = JSON.stringify([name, date, period]);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (teacherSet.size > 0 && !teacherSet.has(name)) unknownTeacherSet.add(name);
    if (dateSet.size > 0 && !dateSet.has(date)) unknownDateSet.add(date);
    if (periodSet.size > 0 && !periodSet.has(period)) unknownPeriodSet.add(period);

    rows.push({ name, date, period });
  }

  return {
    rows,
    errors,
    unknownTeachers: Array.from(unknownTeacherSet),
    unknownDates: Array.from(unknownDateSet),
    unknownPeriods: Array.from(unknownPeriodSet),
  };
}

export function parseTeachersCsv(
  text: string | null | undefined,
  { commonSubjects }: { commonSubjects?: string[] } = {},
): {
  rows: Array<{ name: string; subjects: string[] }>;
  errors: CsvError[];
  unknownSubjects: string[];
} {
  const rows: Array<{ name: string; subjects: string[] }> = [];
  const errors: CsvError[] = [];
  const unknownSet = new Set<string>();
  const knownSubjects = new Set(commonSubjects || []);

  const lines = (text || '').split(/\n/).map(l => l.replace(/\r$/, ''));
  if (lines.length === 0) {
    return { rows, errors: [{ line: 0, message: '空の入力です' }], unknownSubjects: [] };
  }

  // ヘッダ行
  const headerFields = parseLine(lines[0]).map(s => s.trim().toLowerCase());
  for (const required of REQUIRED_HEADERS) {
    if (!headerFields.includes(required)) {
      return {
        rows,
        errors: [{ line: 1, message: `必須カラム "${required}" がヘッダに見つかりません (期待: ${REQUIRED_HEADERS.join(', ')})` }],
        unknownSubjects: [],
      };
    }
  }
  const nameIdx = headerFields.indexOf('name');
  const subjectsIdx = headerFields.indexOf('subjects');

  const seenNames = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim() === '') continue;
    const fields = parseLine(raw);
    const lineNo = i + 1;

    const name = (fields[nameIdx] || '').trim();
    if (!name) {
      errors.push({ line: lineNo, message: 'name が空です' });
      continue;
    }
    if (seenNames.has(name)) {
      errors.push({ line: lineNo, message: `name "${name}" が重複しています` });
      continue;
    }
    seenNames.add(name);

    const subjectsCell = (fields[subjectsIdx] || '').trim();
    const subjects = subjectsCell
      ? subjectsCell.split('|').map(s => s.trim()).filter(Boolean)
      : [];

    if (knownSubjects.size > 0) {
      subjects.forEach(s => {
        if (!knownSubjects.has(s)) unknownSet.add(s);
      });
    }

    rows.push({ name, subjects });
  }

  return { rows, errors, unknownSubjects: Array.from(unknownSet) };
}
