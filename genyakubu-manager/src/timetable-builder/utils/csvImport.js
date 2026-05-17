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

const REQUIRED_HEADERS = ['name', 'subjects'];

function parseLine(line) {
  // RFC4180 風: ダブルクォート対応の最小実装。
  // フィールド内に "," を含めたい場合は "..." で囲み、内部の " は "" にエスケープ。
  const fields = [];
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

export function parseTeachersCsv(text, { commonSubjects } = {}) {
  const rows = [];
  const errors = [];
  const unknownSet = new Set();
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

  const seenNames = new Set();

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
