import { describe, expect, it } from 'vitest';
import {
  renameNgDate,
  renameNgPeriod,
  renameExternalTeacher,
  renameExternalDate,
  dropExternalForTeacher,
  makeDateKeyDropMatcher,
  makePeriodKeyDropMatcher,
  renameClassInTeachers,
  cleanClassRefsInTeachers,
} from './labelRefs';

describe('renameNgDate / renameNgPeriod', () => {
  it('日付は prefix、時限は suffix を書き換える', () => {
    expect(renameNgDate(['7/1-1限', '7/2-1限'], '7/1', '7/3')).toEqual(['7/3-1限', '7/2-1限']);
    expect(renameNgPeriod(['7/1-1限', '7/1-2限'], '1限', '朝')).toEqual(['7/1-朝', '7/1-2限']);
  });

  it('ラベルに "-" を含んでも該当部分だけ置換する', () => {
    // 日付「8/1-補講」の prefix リネーム
    expect(renameNgDate(['8/1-補講-1限'], '8/1-補講', '8/2')).toEqual(['8/2-1限']);
    // 時限「1限-前半」の suffix リネーム
    expect(renameNgPeriod(['7/1-1限-前半'], '1限-前半', '朝')).toEqual(['7/1-朝']);
  });
});

describe('renameExternalTeacher (F2o)', () => {
  it('suffix の講師名だけを置換する', () => {
    expect(renameExternalTeacher({ '7/1-田中': 2 }, '田中', '佐藤')).toEqual({ '7/1-佐藤': 2 });
  });

  it('日付ラベルが「-旧名」を含んでも日付側を壊さない (F2o の再現ケース)', () => {
    // 旧実装 (replace の最初の一致) は '8/1-佐藤-田中' を返していた
    expect(renameExternalTeacher({ '8/1-田中-田中': 1 }, '田中', '佐藤'))
      .toEqual({ '8/1-田中-佐藤': 1 });
  });

  it('null / undefined は素通し', () => {
    expect(renameExternalTeacher(null, 'a', 'b')).toBeNull();
  });
});

describe('renameExternalDate / dropExternalForTeacher', () => {
  it('prefix の日付だけを置換する', () => {
    expect(renameExternalDate({ '7/1-田中': 2, '7/10-田中': 1 }, '7/1', '7/2'))
      .toEqual({ '7/2-田中': 2, '7/10-田中': 1 });
  });

  it('講師削除で末尾一致キーを drop する', () => {
    expect(dropExternalForTeacher({ '7/1-田中': 2, '7/1-佐藤': 1 }, '田中'))
      .toEqual({ '7/1-佐藤': 1 });
  });
});

describe('makeDateKeyDropMatcher / makePeriodKeyDropMatcher (最長一致)', () => {
  it('包含関係のラベル (「8/1」と「8/1-補講」) で誤射しない', () => {
    const drop = makeDateKeyDropMatcher(['8/1', '8/1-補講'], ['8/1']);
    expect(drop('8/1-1限')).toBe(true);
    expect(drop('8/1-補講-1限')).toBe(false); // 最長一致は 8/1-補講 (削除対象外)
  });

  it('時限側も最長一致 (「1限」と「番外-1限」)', () => {
    const drop = makePeriodKeyDropMatcher(['1限', '番外-1限'], ['1限']);
    expect(drop('7/1-1限')).toBe(true);
    expect(drop('7/1-番外-1限')).toBe(false);
  });
});

describe('renameClassInTeachers / cleanClassRefsInTeachers (H5)', () => {
  const teachers = [
    { name: 'A', subjects: [], ngSlots: [], ngClasses: ['３S'], priorityClasses: ['３A'] },
    { name: 'B', subjects: [], ngSlots: [], ngClasses: [], priorityClasses: [] },
  ];

  it('リネームに追従し、変更が無ければ同一参照を返す', () => {
    const renamed = renameClassInTeachers(teachers, '３S', '３S改');
    expect(renamed[0].ngClasses).toEqual(['３S改']);
    expect(renamed[0].priorityClasses).toEqual(['３A']);
    expect(renamed[1]).toBe(teachers[1]);
    expect(renameClassInTeachers(teachers, '無関係', 'X')).toBe(teachers);
  });

  it('リネーム先が既にある場合は dedupe する', () => {
    const t = [{ name: 'A', ngClasses: ['３S', '３A'], priorityClasses: [] }];
    expect(renameClassInTeachers(t, '３S', '３A')[0].ngClasses).toEqual(['３A']);
  });

  it('削除追従: 有効ラベル集合に無い参照を drop する', () => {
    const cleaned = cleanClassRefsInTeachers(teachers, new Set(['３A']));
    expect(cleaned[0].ngClasses).toEqual([]);
    expect(cleaned[0].priorityClasses).toEqual(['３A']);
    expect(cleanClassRefsInTeachers(teachers, new Set(['３S', '３A']))).toBe(teachers);
  });
});
