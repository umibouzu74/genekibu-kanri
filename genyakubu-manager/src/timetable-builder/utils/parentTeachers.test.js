// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readParentTeachers } from './parentTeachers';
import { LS } from '../../constants/storageKeys';

const PARENT_SUBJECTS = [
  { id: 1, name: '英語' },
  { id: 4, name: '数学' },
];

beforeEach(() => {
  localStorage.clear();
});

describe('readParentTeachers (L5a)', () => {
  it('partTimeStaff の name と subjectIds → 科目名を解決して返す', () => {
    localStorage.setItem(LS.partTime, JSON.stringify([
      { name: '福武', subjectIds: [1, 4] },
      { name: '河野', subjectIds: [] },
    ]));
    localStorage.setItem(LS.subjects, JSON.stringify(PARENT_SUBJECTS));
    expect(readParentTeachers()).toEqual([
      { name: '福武', subjects: ['英語', '数学'] },
      { name: '河野', subjects: [] },
    ]);
  });

  it('旧形式 (string[]) の staff も migrate されて読める', () => {
    localStorage.setItem(LS.partTime, JSON.stringify(['福武', '河野']));
    expect(readParentTeachers()).toEqual([
      { name: '福武', subjects: [] },
      { name: '河野', subjects: [] },
    ]);
  });

  it('未知の subjectId は黙って落とす (名前解決できる分だけ)', () => {
    localStorage.setItem(LS.partTime, JSON.stringify([{ name: '福武', subjectIds: [1, 99] }]));
    localStorage.setItem(LS.subjects, JSON.stringify(PARENT_SUBJECTS));
    expect(readParentTeachers()).toEqual([{ name: '福武', subjects: ['英語'] }]);
  });

  it('subjects 側が壊れていても講師名は取り込める', () => {
    localStorage.setItem(LS.partTime, JSON.stringify([{ name: '福武', subjectIds: [1] }]));
    localStorage.setItem(LS.subjects, '{broken');
    expect(readParentTeachers()).toEqual([{ name: '福武', subjects: [] }]);
  });

  it('キーが無い / staff が壊れている / 空 name は安全に処理', () => {
    expect(readParentTeachers()).toEqual([]);
    localStorage.setItem(LS.partTime, '{broken');
    expect(readParentTeachers()).toEqual([]);
    localStorage.setItem(LS.partTime, JSON.stringify([{ name: '  ' }, { name: '福武' }, null]));
    expect(readParentTeachers()).toEqual([{ name: '福武', subjects: [] }]);
  });
});
