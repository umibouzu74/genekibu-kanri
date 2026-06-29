import { describe, expect, it } from 'vitest';
import { parseTeachersCsv, parseNgCsv } from './csvImport';

describe('parseTeachersCsv', () => {
  it('正常な CSV を {name, subjects[]} 配列に parse する', () => {
    const csv = `name,subjects
堀上,英語
未定,英語|数学|国語|理科|社会
山田,数学|理科`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toEqual([
      { name: '堀上', subjects: ['英語'] },
      { name: '未定', subjects: ['英語', '数学', '国語', '理科', '社会'] },
      { name: '山田', subjects: ['数学', '理科'] },
    ]);
    expect(r.errors).toEqual([]);
  });

  it('ヘッダに name / subjects が無いと error 1 件 + rows 空', () => {
    const csv = `氏名,科目
堀上,英語`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/必須カラム/);
  });

  it('空行はスキップする', () => {
    const csv = `name,subjects
堀上,英語

未定,英語|数学
`;
    const r = parseTeachersCsv(csv);
    expect(r.rows.map(r => r.name)).toEqual(['堀上', '未定']);
    expect(r.errors).toEqual([]);
  });

  it('name が空の行は error として記録', () => {
    const csv = `name,subjects
,英語
堀上,英語`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ line: 2, message: 'name が空です' }]);
  });

  it('name 重複は error', () => {
    const csv = `name,subjects
堀上,英語
堀上,数学`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toEqual([{ name: '堀上', subjects: ['英語'] }]);
    expect(r.errors).toEqual([{ line: 3, message: 'name "堀上" が重複しています' }]);
  });

  it('subjects 列が空ならsubjects=[]', () => {
    const csv = `name,subjects
新規講師,`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toEqual([{ name: '新規講師', subjects: [] }]);
  });

  it('subjects の "|" 区切りで前後の空白を trim する', () => {
    const csv = `name,subjects
堀上, 英語 | 数学 `;
    const r = parseTeachersCsv(csv);
    expect(r.rows[0].subjects).toEqual(['英語', '数学']);
  });

  it('ダブルクォート囲みで "," を含む name を扱える', () => {
    const csv = `name,subjects
"山田, 太郎",数学`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toEqual([{ name: '山田, 太郎', subjects: ['数学'] }]);
  });

  it('ダブルクォート内のエスケープ "" → " を解釈する', () => {
    const csv = `name,subjects
"佐藤""次郎""",英語`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toEqual([{ name: '佐藤"次郎"', subjects: ['英語'] }]);
  });

  it('commonSubjects に含まれない subject は unknownSubjects に集約', () => {
    const csv = `name,subjects
堀上,英語|物理
田中,音楽`;
    const r = parseTeachersCsv(csv, { commonSubjects: ['英語', '数学'] });
    expect(r.rows).toHaveLength(2);
    expect(r.unknownSubjects.sort()).toEqual(['物理', '音楽'].sort());
  });

  it('カラム順がヘッダに従う (subjects, name の順でも OK)', () => {
    const csv = `subjects,name
英語|数学,堀上`;
    const r = parseTeachersCsv(csv);
    expect(r.rows).toEqual([{ name: '堀上', subjects: ['英語', '数学'] }]);
  });

  it('空文字 / null 入力で エラー 1 件を返す', () => {
    expect(parseTeachersCsv('').errors).toHaveLength(1);
    expect(parseTeachersCsv(null).errors).toHaveLength(1);
  });
});

describe('parseNgCsv (E2a)', () => {
  const ctx = {
    teacherNames: ['田中', '未定'],
    knownDates: ['12/25', '12/26'],
    knownPeriods: ['1限', '2限', '3限'],
  };

  it('基本: name,date,period をパースする', () => {
    const csv = `name,date,period
田中,12/25,1限
田中,12/25,2限`;
    const r = parseNgCsv(csv, ctx);
    expect(r.rows).toEqual([
      { name: '田中', date: '12/25', period: '1限' },
      { name: '田中', date: '12/25', period: '2限' },
    ]);
    expect(r.errors).toHaveLength(0);
  });

  it('teacher 列名も name の別名として使える', () => {
    const csv = `teacher,date,period
田中,12/25,1限`;
    const r = parseNgCsv(csv, ctx);
    expect(r.rows).toEqual([{ name: '田中', date: '12/25', period: '1限' }]);
  });

  it('name/date/period 必須ヘッダ欠落でエラー', () => {
    expect(parseNgCsv('date,period\n12/25,1限', ctx).errors[0].message).toMatch(/name/);
    expect(parseNgCsv('name,period\n田中,1限', ctx).errors[0].message).toMatch(/date/);
  });

  it('空フィールドはエラー行として集約', () => {
    const csv = `name,date,period
田中,,1限
,12/25,2限`;
    const r = parseNgCsv(csv, ctx);
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0].message).toMatch(/date/);
    expect(r.errors[1].message).toMatch(/name/);
  });

  it('同一 (name,date,period) の重複は 1 件に集約', () => {
    const csv = `name,date,period
田中,12/25,1限
田中,12/25,1限`;
    expect(parseNgCsv(csv, ctx).rows).toHaveLength(1);
  });

  it('未登録の講師 / 日付 / 時限を warning として返す', () => {
    const csv = `name,date,period
佐藤,12/31,4限`;
    const r = parseNgCsv(csv, ctx);
    expect(r.rows).toHaveLength(1); // row 自体は残す
    expect(r.unknownTeachers).toEqual(['佐藤']);
    expect(r.unknownDates).toEqual(['12/31']);
    expect(r.unknownPeriods).toEqual(['4限']);
  });

  it('ctx 未指定なら warning 判定をスキップ', () => {
    const r = parseNgCsv('name,date,period\n誰か,X,Y');
    expect(r.rows).toHaveLength(1);
    expect(r.unknownTeachers).toEqual([]);
    expect(r.unknownDates).toEqual([]);
  });

  it('空入力はエラー 1 件', () => {
    expect(parseNgCsv('', ctx).errors).toHaveLength(1);
  });
});
