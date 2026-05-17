import { describe, expect, it } from 'vitest';
import { parseTeachersCsv } from './csvImport';

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
