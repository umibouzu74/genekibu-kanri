import { describe, expect, it } from 'vitest';
import { groupTeachersBySubject, MULTI_SUBJECT_GROUP_LABEL, OTHER_GROUP_LABEL } from './groupTeachersBySubject';

const T = (name, subjects = []) => ({ name, subjects, ngSlots: [], ngClasses: [], priorityClasses: [] });

describe('groupTeachersBySubject', () => {
  it('単一教科の講師はその教科グループに入る', () => {
    const teachers = [T('堀上', ['英語']), T('片岡', ['数学']), T('石原', ['英語'])];
    const groups = groupTeachersBySubject(teachers, ['英語', '数学']);
    expect(groups).toEqual([
      { label: '英語', teachers: [T('堀上', ['英語']), T('石原', ['英語'])] },
      { label: '数学', teachers: [T('片岡', ['数学'])] },
    ]);
  });

  it('複数教科の講師は「複数教科」に集約 (各教科に重複表示しない)', () => {
    const teachers = [T('未定', ['英語', '数学', '国語']), T('堀上', ['英語'])];
    const groups = groupTeachersBySubject(teachers, ['英語']);
    expect(groups).toEqual([
      { label: '英語', teachers: [T('堀上', ['英語'])] },
      { label: MULTI_SUBJECT_GROUP_LABEL, teachers: [T('未定', ['英語', '数学', '国語'])] },
    ]);
  });

  it('担当教科ゼロの講師は「その他」に分類', () => {
    const teachers = [T('堀上', ['英語']), T('新任', [])];
    const groups = groupTeachersBySubject(teachers, ['英語']);
    expect(groups).toEqual([
      { label: '英語', teachers: [T('堀上', ['英語'])] },
      { label: OTHER_GROUP_LABEL, teachers: [T('新任', [])] },
    ]);
  });

  it('subjectOrder の順番でグループが並ぶ', () => {
    const teachers = [T('a', ['数学']), T('b', ['英語']), T('c', ['国語'])];
    const groups = groupTeachersBySubject(teachers, ['英語', '数学', '国語']);
    expect(groups.map(g => g.label)).toEqual(['英語', '数学', '国語']);
  });

  it('subjectOrder にない教科はそれ以外の教科グループとして末尾 (複数教科/その他 の前)', () => {
    const teachers = [
      T('a', ['英語']),
      T('b', ['未登録']),
      T('c', ['英語', '数学']),
    ];
    const groups = groupTeachersBySubject(teachers, ['英語']);
    expect(groups.map(g => g.label)).toEqual(['英語', '未登録', MULTI_SUBJECT_GROUP_LABEL]);
  });

  it('空のグループは省く', () => {
    const teachers = [T('a', ['英語'])];
    const groups = groupTeachersBySubject(teachers, ['英語', '数学', '国語']);
    expect(groups.map(g => g.label)).toEqual(['英語']);
  });

  it('teachers が空 / undefined でも壊れない', () => {
    expect(groupTeachersBySubject([], ['英語'])).toEqual([]);
    expect(groupTeachersBySubject(undefined, ['英語'])).toEqual([]);
    expect(groupTeachersBySubject(null, ['英語'])).toEqual([]);
  });

  it('subjectOrder が無い場合は出現順 → 複数教科 → その他', () => {
    const teachers = [T('a', ['数学']), T('b', ['英語']), T('c', ['英語', '数学'])];
    const groups = groupTeachersBySubject(teachers);
    expect(groups.map(g => g.label)).toEqual(['数学', '英語', MULTI_SUBJECT_GROUP_LABEL]);
  });

  it('teachers の元の順序を各グループ内で保つ', () => {
    const teachers = [T('堀上', ['英語']), T('石原', ['英語']), T('高松', ['英語'])];
    const groups = groupTeachersBySubject(teachers, ['英語']);
    expect(groups[0].teachers.map(t => t.name)).toEqual(['堀上', '石原', '高松']);
  });
});
